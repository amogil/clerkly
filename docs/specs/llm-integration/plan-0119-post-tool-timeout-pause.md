# Plan: Pause CHAT_TIMEOUT_MS during tool execution (#119)

## Context

Issue: https://github.com/amogil/clerkly/issues/119

`CHAT_TIMEOUT_MS` (120s) fires during tool execution within a single AI SDK step, killing long-running `code_exec` calls even though the code comments state "tool execution time doesn't count toward model timeout".

The timeout resets only on step boundaries (`onStepFinish`, `experimental_onStepStart`), but within a single step, when a tool like `code_exec` executes for longer than 120s, the provider-level timeout fires and aborts the entire stream with a misleading "Model response timeout" error.

## Analysis

### Root cause

The Vercel AI SDK `streamText` function invokes tool executors (bound via `bindToolExecutors` in `MainPipeline.ts:2335`) **within** a single step. The step lifecycle is:

1. `experimental_onStepStart` fires (timeout reset)
2. Model generates response including `tool-call` in `fullStream`
3. AI SDK invokes `tool.execute(...)` internally
4. Tool runs for N seconds (can be 360s for `code_exec`)
5. AI SDK emits `tool-result` in `fullStream`
6. `onStepFinish` fires (timeout reset)

The problem: between steps 2 and 5, the `CHAT_TIMEOUT_MS` timer is running. If the tool execution (step 3-4) exceeds 120s, the timer fires `controller.abort()` before `onStepFinish` can reset it.

The current code in all three providers (`OpenAIProvider.ts:94-99`, `AnthropicProvider.ts:87-91`, `GoogleProvider.ts:81-85`) is identical:

```typescript
let timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
const resetTimeout = () => {
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
};
```

`resetTimeout()` is called only in `onStepFinish` and `experimental_onStepStart`, not when tool execution starts/finishes within a step.

### Solution approach

Modify the `resetTimeout` function to support **pausing** (clearing the timer without starting a new one) and **resuming** (starting a fresh timer). The `buildToolSet` method in each provider wraps tool executors, and should call `pauseTimeout()` before tool execution and `resumeTimeout()` after tool execution completes (success or error).

This approach:
- Keeps the timeout active during model response latency (before tool-call, after tool-result within step)
- Pauses the timeout during actual tool execution
- Is self-contained within each provider file -- no changes to `MainPipeline`, `ILLMProvider`, or `ChatOptions` needed
- Handles the existing `onStepFinish`/`experimental_onStepStart` resets correctly (they will also resume/reset the timer)

### Affected requirements

- `llm-integration.3.6` -- Each individual LLM API request limited to 2min timeout
- `llm-integration.3.6.1` -- Timeout per request individually; tool execution time NOT counted
- `llm-integration.3.6.2` -- Timeout protects against hanging LLM API; tools have own timeouts

### Affected specifications

- `docs/specs/llm-integration/requirements.md` -- Clarify 3.6.1 to explicitly state intra-step tool execution time is excluded
- `docs/specs/llm-integration/design.md` -- Update timeout design pseudocode, add pause/resume mechanism description, update test lists

## Action plan

### Phase 1: Specifications

- [x] Update `requirements.md` -- Clarify `llm-integration.3.6.1` to explicitly state that tool execution time within a single AI SDK step is also excluded from the timeout budget, not just tool execution between steps
- [x] Update `design.md` -- Update the timeout pseudocode to show pause/resume pattern, add description of `pauseTimeout`/`resumeTimeout` in `buildToolSet`, add new unit test entries for tool-execution timeout pause

### Phase 2: Code

- [x] Modify `src/main/llm/OpenAIProvider.ts` -- In `chat()`: refactor `resetTimeout` into `pauseTimeout()` and `resumeTimeout()` functions. In `buildToolSet()`: wrap `execute` to call `pauseTimeout` before and `resumeTimeout` after tool execution. `onStepFinish`/`experimental_onStepStart` continue to call `resetTimeout` (which is effectively `resumeTimeout`).
- [x] Modify `src/main/llm/AnthropicProvider.ts` -- Same changes as OpenAIProvider
- [x] Modify `src/main/llm/GoogleProvider.ts` -- Same changes as OpenAIProvider

### Phase 3: Tests

- [x] Update unit test `tests/unit/llm/OpenAIProvider.chat.test.ts` -- Add test: "pauses timeout during tool execution and resumes after" (simulates tool execution that would exceed CHAT_TIMEOUT_MS, verifies timer cleared before execute and restarted after). Covers `llm-integration.3.6.1`
- [x] Update unit test `tests/unit/llm/AnthropicProvider.chat.test.ts` -- Same test as OpenAI. Covers `llm-integration.3.6.1`
- [x] Update unit test `tests/unit/llm/GoogleProvider.chat.test.ts` -- Same test as OpenAI. Covers `llm-integration.3.6.1`
- [x] Update unit test `tests/unit/llm/OpenAIProvider.chat.test.ts` -- Add test: "resumes timeout after tool execution failure" (tool throws, timeout still resumes). Covers `llm-integration.3.6.1`
- [x] Update unit test `tests/unit/llm/AnthropicProvider.chat.test.ts` -- Same error-case test. Covers `llm-integration.3.6.1`
- [x] Update unit test `tests/unit/llm/GoogleProvider.chat.test.ts` -- Same error-case test. Covers `llm-integration.3.6.1`

### Phase 4: Finalization

- [x] Update coverage table in `design.md`
- [x] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Clarify 3.6.1 wording for intra-step tool execution |
| `docs/specs/llm-integration/design.md` | Update timeout pseudocode with pause/resume, add test entries |
| `src/main/llm/OpenAIProvider.ts` | Add `pauseTimeout`/`resumeTimeout`, wrap tool executors in `buildToolSet` |
| `src/main/llm/AnthropicProvider.ts` | Same as OpenAIProvider |
| `src/main/llm/GoogleProvider.ts` | Same as OpenAIProvider |
| `tests/unit/llm/OpenAIProvider.chat.test.ts` | Add timeout pause/resume tests for tool execution |
| `tests/unit/llm/AnthropicProvider.chat.test.ts` | Add timeout pause/resume tests for tool execution |
| `tests/unit/llm/GoogleProvider.chat.test.ts` | Add timeout pause/resume tests for tool execution |

## Expected result

After this change:
1. `CHAT_TIMEOUT_MS` (120s) only applies to model response latency -- the time the LLM takes to generate tokens
2. Tool execution time (e.g., `code_exec` with `timeout_ms: 360000`) does not consume the provider timeout budget
3. If a tool-level timeout occurs (e.g., code_exec sandbox timeout), it produces a proper `status: timeout` with `error.code: limit_exceeded` -- not `internal_error` with a model timeout message
4. All three providers (OpenAI, Anthropic, Google) have consistent behavior
5. The timeout still fires correctly if the model hangs before or after tool execution

## Risks

- **Risk: AI SDK internal tool execution flow changes** -- The pause/resume mechanism depends on `buildToolSet` wrapping the `execute` callback. If AI SDK changes how tool executors are invoked, the wrapper might not fire. Mitigation: unit tests explicitly verify that `clearTimeout` is called before tool execution and `setTimeout` is called after.
- **Risk: Concurrent tool executions** -- If AI SDK ever invokes multiple tools in parallel within a single step, the pause/resume needs to handle overlapping executions. Mitigation: the current contract is `max 1 tool_call` per model response (`llm-integration.11`), so concurrent execution within a step is not expected. The pause counter could be made atomic if needed in future.
- **Risk: Tool execution errors bypass resume** -- If the tool executor throws, the timeout must still be resumed. Mitigation: use `try/finally` in the wrapper to guarantee `resumeTimeout` runs.
