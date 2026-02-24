Design: Isolated JS Agents in Electron (no external runtime)

> **📚 РЕФЕРЕНС-ДОКУМЕНТАЦИЯ**: Это справочный документ, описывающий архитектуру системы агентов. По данному документу не нужно реализовывать код напрямую — он служит источником истины для схемы БД и архитектурных решений.

Scope

Cross-platform Electron app (Windows/macOS/Linux) running LLM-driven agents that can generate and execute JS in a sandbox, call a small set of tools, and persist full chat history in SQL.

Key constraints:
	•	No separate runtime (containers/VMs) — only Electron/Chromium isolation
	•	Sandbox cannot directly access filesystem, DB, or network
	•	All privileged operations happen in main via policy-enforced tools

⸻

1. High-level Architecture

1.1 Execution model
	•	Main process owns orchestration and the LLM loop.
	•	Sandbox (renderer) executes generated JS and may call tools via a minimal IPC bridge.

Supported LLM actions (structured output):
	•	text — show to user and pause
	•	code_exec — execute JS in sandbox, then continue
	•	request_scope — ask user for OAuth scopes, then continue
	•	final_answer — finish current task

Multi-tool per LLM response: not supported (single action per step).

⸻

1.2 Core Components

A) AgentManager (Main)

Lifecycle + routing for agents.
	•	Create/lookup per-agent sandbox window (session partition)
	•	Enforce one active execution per agent
	•	Queue user messages while busy (batching/coalescing)
	•	Archive/unarchive agents (hide from default chat list)

B) MainPipeline (Main)

The orchestrator implementing the step loop.
	•	Load history
	•	Build YAML prompt
	•	Call LLM
	•	Interpret action
	•	Dispatch code_exec to SandboxRuntime
	•	Execute tool calls via ToolGateway (originating from sandbox)
	•	Persist all messages

C) AgentEngine (Main)

Structured output validation + internal retry.
	•	Validates model output
	•	Retries internally if invalid (not visible externally)
	•	Produces one final action or error

D) SandboxRuntime (Renderer, per-agent)

Executes generated JS.
	•	Hidden sandboxed renderer window
	•	Executes code_exec
	•	Can call window.tools.*

E) ToolsBridge (Preload)

Minimal surface area IPC.
	•	Exposes window.tools.httpFetch, window.tools.googleApi, window.tools.artifacts.*
	•	Adds agent_id automatically (from owning window)

F) ToolGateway (Main)

Policy-enforced tool dispatcher.
	•	Validates caller webContents/session
	•	Applies caps, allowlists, rate limits
	•	Routes to tool handlers

G) HttpFetchHandler (Main)

Public, no-auth HTTP.
	•	Allowlist domain + URL prefix
	•	SSRF + DNS rebinding defense
	•	Redirect checks, size/time caps
	•	No OAuth injection

H) GoogleApiHandler (Main)

Authenticated Google APIs.
	•	Tokens only in main
	•	Requires request_scope
	•	Allowlist of (service, method)
	•	Pinned base URLs

I) ArtifactManager (Main)

Artifacts implemented via messages (no separate artifacts table).
	•	Stores bytes under app data dir
	•	Appends artifact messages

J) MessageStore (Main)

SQL persistence.
	•	Appends messages
	•	Updates long-running messages (tool_call, code_exec) start→finish
	•	Builds YAML history for the LLM

K) PolicyManager (Main)

Per-agent policy (caps/allowlists).

L) ConsentManager (Main)

request_scope UI + token storage.

M) Watchdog (Main)

Timeouts/crash handling.

⸻

1.3 Naming conventions
	•	agent_id: TEXT (10-character alphanumeric string)
	•	user_id: TEXT (10-character alphanumeric string, FK to users.user_id)
	•	message_id: INTEGER (messages.id)
	•	tool_call_id: TEXT derived from tool_name + timestamp (with optional random suffix)

⸻

1.4 Correlation model (reply_to_message_id)

We removed run_id. Instead we correlate all agent work to a specific user message.

Rules:
	•	For kind=user: data.reply_to_message_id MUST exist and be null.
	•	For all non-user kinds: data.reply_to_message_id MUST exist and point to the messages.id of the user message being answered.

This enables:
	•	UI grouping (all tool/code/answers under the user message)
	•	Correlation for logging and debugging

Busy agent + multiple user messages (coalescing)

If the agent is busy and the user sends multiple messages:
	1.	Each user message is appended immediately as its own kind=user message (reply_to_message_id=null).
	2.	AgentManager pushes their message_id to a FIFO pending queue for that agent.
	3.	When current work finishes (pause/finish/error-recovered), the pipeline processes the queue:
	•	It takes all queued user messages and sends them to the model in one LLM step as a combined input (preserving order).
	•	Correlation: all resulting non-user messages from that step MUST set
data.reply_to_message_id = <id of the LAST user message in the batch>.

Rationale:
	•	Preserves full user history
	•	Avoids repeated LLM loops for rapid-fire user input
	•	Predictable UI: the batch is answered under the last message

⸻

2. Storage Model

2.0 Table: users

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_users_email ON users(email);

Note: user_id is a randomly generated 10-character alphanumeric string.

2.1 Table: agents

CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_agents_user_archived_updated
  ON agents(user_id, archived_at, updated_at DESC);

2.2 Table: messages

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL, -- ISO 8601 with offset in user's timezone
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_agent_timestamp ON messages(agent_id, timestamp);

Ordering:
	•	Replay uses ORDER BY id ASC.

⸻

3. Timestamp normalization

All persisted timestamps MUST:
	•	include timezone offset (ISO 8601 with offset)
	•	be stored in the user’s timezone

Example:
	•	2026-02-13T18:42:11+01:00

Applies to:
	•	messages.timestamp
	•	any timing.started_at / timing.finished_at

⸻

4. Canonical message JSON

Base shape:

{
  "kind": "user | llm | tool_call | code_exec | final_answer | request_scope | artifact",
  "timing": { "started_at": "ISO+offset", "finished_at": "ISO+offset" },
  "data": {}
}

Timing rules:
	•	timing required only for: tool_call, code_exec, request_scope

⸻

5. Message kinds

5.1 user

{ "kind": "user", "data": { "reply_to_message_id": null, "text": "string" } }

5.2 llm

Exactly one per step (internal retry is recorded only in validation).

{
  "kind": "llm",
  "data": {
    "reply_to_message_id": 123,
    "model": "string",
    "structured_output": true,
    "action": {
      "type": "text | final_answer | request_scope | code_exec",
      "content": "string",
      "scopes": ["string"],
      "reason": "string",
      "code_id": "string",
      "language": "javascript",
      "code": "string",
      "timeout_ms": 15000
    },
    "reasoning": { "text": "string", "excluded_from_replay": true },
    "validation": { "attempts": 1, "max_attempts": 3, "ok": true, "last_error": null },
    "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
  }
}

5.3 tool_call

{
  "kind": "tool_call",
  "timing": { "started_at": "ISO", "finished_at": "ISO" },
  "data": {
    "reply_to_message_id": 123,
    "tool": "httpFetch | googleApi | artifacts.save | artifacts.read | artifacts.list | artifacts.delete",
    "tool_call_id": "<tool_name>:<timestamp>[:<rand>]",
    "timeout": { "model_timeout_ms": 12000, "effective_timeout_ms": 12000 },
    "args": {},
    "result": {
      "status": "running | ok | error | timeout | policy_denied | crash",
      "content": {},
      "error": { "code": "string", "message": "string" }
    }
  }
}

5.4 code_exec

{
  "kind": "code_exec",
  "timing": { "started_at": "ISO", "finished_at": "ISO" },
  "data": {
    "reply_to_message_id": 123,
    "code_id": "string",
    "language": "javascript",
    "code": "string",
    "timeout": { "model_timeout_ms": 20000, "effective_timeout_ms": 20000 },
    "result": {
      "status": "running | ok | error | timeout | crash",
      "stdout": "string",
      "stderr": "string",
      "return_value": {},
      "error": { "message": "string", "stack": "string" }
    }
  }
}

5.5 final_answer

{ "kind": "final_answer", "data": { "reply_to_message_id": 123, "text": "string", "format": "markdown|text" } }

5.6 request_scope

{
  "kind": "request_scope",
  "timing": { "started_at": "ISO", "finished_at": "ISO" },
  "data": {
    "reply_to_message_id": 123,
    "requested_scopes": ["string"],
    "reason": "string",
    "user_decision": "approved | denied",
    "result_status": "ok | denied | error"
  }
}

5.7 artifact

Artifacts are messages; there is no artifacts table.

{
  "kind": "artifact",
  "data": {
    "reply_to_message_id": 123,
    "artifact_id": "string",
    "name": "string",
    "mime": "string",
    "path": "string",
    "size_bytes": 123,
    "sha256": "string",
    "state": "created | deleted",
    "source": "artifacts.save | httpFetch | googleApi | code_exec"
  }
}


⸻

6. Tools

Sandbox-accessible tools:
	•	httpFetch (public endpoints only)
	•	googleApi
	•	artifacts.save
	•	artifacts.read
	•	artifacts.list
	•	artifacts.delete

Control actions (LLM-only, not tools):
	•	request_scope
	•	final_answer

6.1 artifacts.list / artifacts.delete without a table

Because artifacts are represented as messages:
	•	artifacts.list scans messages for kind=artifact and computes latest state per artifact_id.
	•	artifacts.delete:
	1.	main deletes the file (or tombstones it)
	2.	appends kind=artifact with state=deleted
	•	artifacts.read resolves artifact_id to the latest non-deleted artifact message and reads bytes from path.

⸻

7. File storage policy

All artifact files are stored under the app data directory.

Path policy:
	•	Sandbox cannot enumerate app data directories.
	•	Only main generates paths.
	•	No user-controlled paths are accepted.

Suggested layout:
	•	Base: appData/agents/<agent_id>/artifacts/
	•	Filename: artifact_<artifact_id>

Main MUST prevent path traversal and enforce resolved paths remain within the base dir.

⸻

8. Main pipeline: detailed behavior

This section describes exactly what main does on user input, LLM outputs, tool calls, code execution, and errors.

8.1 Entry points

A) User sends message
	1.	UI -> main: onUserMessage(agent_id, text)
	2.	main appends a user message:
	•	data.reply_to_message_id = null
	3.	main updates agents.updated_at.
	4.	If agent is idle:
	•	start processing immediately using this new message_id as the active root.
Else (busy):
	•	enqueue this message_id in pending queue and return.

B) User clicks Retry
	1.	UI -> main: onRetry(agent_id)
	2.	main starts processing pending queue (or re-process last failed root) per UX policy.

⸻

8.2 Selecting the next root to process

When starting work for an agent:
	•	If there are queued user messages, take all of them as a batch.
	•	Let root_id = last(queued_ids).
	•	The combined runtime input is the concatenation of those user messages.

All messages created by the pipeline while handling this batch MUST set:
	•	data.reply_to_message_id = root_id.

⸻

8.3 One step of the pipeline

Step 1: Build history
	•	Load all messages for agent_id ordered by id.
	•	Serialize to YAML messages for the LLM.
	•	Exclude llm.data.reasoning.text from replay.

Step 2: Call LLM
	•	Create prompt that includes:
	•	serialized history
	•	the new combined user input batch
	•	tool descriptions
	•	required structured output schema
	•	Call the model.

Step 3: Validate structured output
	•	AgentEngine validates response against schema.
	•	If invalid: retry internally up to structured_output_max_attempts.
	•	Persist exactly one llm message:
	•	contains final valid action (or failure)
	•	includes validation metadata

If validation ultimately fails:
	•	Append one llm message with validation.ok=false.
	•	Emit UI error and pause.

Step 4: Interpret action

Action = text
	•	Append nothing else.
	•	Emit UI event text.
	•	Pause (agent idle).

Action = final_answer
	•	Append final_answer message (with reply_to_message_id = root_id).
	•	Emit UI event final_answer.
	•	Mark idle.

Action = request_scope
	•	Append request_scope message (start timing).
	•	Show consent UI.
	•	On user decision:
	•	update request_scope message (finished timing + decision)
	•	Continue the loop (LLM sees approval/denial in history).

Action = code_exec
	•	Append code_exec message with result.status="running" and started_at.
	•	Execute JS in sandbox.
	•	Update the same code_exec message with finished_at and result.
	•	Continue the loop (LLM sees result in history).

⸻

8.4 Tool calls from code

Tool calls happen inside sandbox code via window.tools.*.

Lifecycle for each tool call:
	1.	Sandbox invokes tool over IPC with:
	•	tool name
	•	payload
	•	main derives tool_call_id = tool_name + timestamp (+rand)
	•	main sets reply_to_message_id = current root_id
	2.	main appends a tool_call message (started_at, status=running).
	3.	ToolGateway validates:
	•	caller webContents belongs to the agent
	•	agent policy allows tool
	•	payload size caps
	•	rate limits / concurrency caps
	4.	Tool handler executes and returns.
	5.	main updates the same tool_call message with finished_at and result.
	6.	Tool result is returned to sandbox JS.

If the tool times out:
	•	Watchdog aborts it, updates message with status=timeout, and returns timeout error to JS.

⸻

8.5 Errors and recovery

Tool policy_denied
	•	Update tool_call message with status=policy_denied.
	•	Continue loop (LLM sees denial and may adjust).

Network errors
	•	Update tool_call message with status=error and error payload.
	•	Continue loop.

Sandbox crash / timeout
	•	Update code_exec message with status=crash|timeout.
	•	Emit UI error with Retry.
	•	Pause.

LLM validation failure
	•	Emit UI error with Retry.
	•	Pause.

⸻

9. Electron Isolation
	•	Per-agent session partition
	•	webRequest blocks all external network except tool gateway traffic
	•	CSP locked down
	•	Node disabled
	•	contextIsolation enabled
	•	WebAssembly allowed
	•	Worker disallowed
	•	eval/new Function allowed

⸻

10. Production Hardening

10.1 Hard caps (large but finite)
	•	llm_max_output_bytes: 5 MB
	•	llm_max_reasoning_bytes (stored only): 10 MB
	•	structured_output_max_attempts: 3
	•	message_payload_max_bytes: 10 MB per message
	•	http_max_response_bytes_compressed: 200 MB
	•	http_max_response_bytes_decompressed: 500 MB
	•	http_timeout_ms_policy_cap: 180000 ms
	•	http_max_redirect_hops: 10
	•	http_max_in_flight_per_agent: 10
	•	code_exec_timeout_ms_policy_cap: 300000 ms
	•	artifact_max_bytes: 500 MB
	•	artifact_max_total_bytes_per_agent: 50 GB

Timeout rule:
	•	effective_timeout_ms = min(model_timeout_ms, policy_cap_ms)

10.2 Long-running message lifecycle (INSERT/UPDATE)

For tool_call and code_exec:
	•	INSERT at start with status=running + started_at
	•	UPDATE at finish with finished_at + final status/result

10.3 IPC security
	•	Validate caller webContents/session partition
	•	Validate agent_id belongs to the window
	•	Payload size checks
	•	Rate limit tool calls: 200 per 10 seconds per agent
	•	Concurrency caps (httpFetch, googleApi)

10.4 Network hardening
	•	HTTPS-only
	•	Scheme allowlist
	•	Port allowlist (default 443)
	•	Block localhost/private/link-local/multicast
	•	DNS rebinding defense
	•	Redirect hop cap
	•	Streamed size caps

⸻

11. Edge cases
	•	Busy agent + multiple user messages → batch + reply_to last
	•	Hanging tool → abort + timeout
	•	Huge responses → capped by policy; bytes saved as artifacts
	•	Tool spam → rate limits + concurrency caps
	•	Redirect tricks → validate each hop