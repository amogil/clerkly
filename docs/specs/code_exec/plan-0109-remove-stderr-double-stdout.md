# Plan: Remove stderr from code_exec output and double stdout limit (#109)

## Context

GitHub issue [#109](https://github.com/user/clerkly3/issues/109) requests two changes to the `code_exec` tool:
1. Remove `stderr` from `code_exec` output entirely (stop capturing, persisting, returning to model).
2. Double the `stdout` limit from 10 KiB (`10 * 1024`) to 20 KiB (`20 * 1024`).

Rationale: stderr is rarely useful for model reasoning and wastes token budget; 10 KiB stdout is often insufficient for complex computation results.

## Analysis

### Root cause

The current code_exec output contract includes `stderr` and `stderr_truncated` fields alongside `stdout` and `stdout_truncated`. Stderr is collected from `console.warn`/`console.error` in the sandbox execution script, stored in persisted `tool_call` messages, returned to the model, and rendered in the UI. Additionally, degraded-mode diagnostics are appended to stderr. Removing stderr requires changes across the full stack: contracts, sandbox execution, output limiting, persistence mapping, pipeline error handling, prompt instructions, UI rendering, and all associated tests.

### Key code locations

- **Constants & contract**: `src/main/code_exec/contracts.ts:8-9` (limits), `src/main/code_exec/contracts.ts:60-67` (CodeExecToolOutput interface), `src/main/code_exec/contracts.ts:185-194` (makeCodeExecError)
- **Output limiter**: `src/main/code_exec/OutputLimiter.ts:33-50` (applyStdStreamLimits with stderr param)
- **Sandbox execution**: `src/main/code_exec/SandboxSessionManager.ts:231` (stderrChunks), `src/main/code_exec/SandboxSessionManager.ts:536-538` (console.warn/error -> stderrChunks), `src/main/code_exec/SandboxSessionManager.ts:626-655` (stderr in returned results), `src/main/code_exec/SandboxSessionManager.ts:771-792` (appendDegradedDiagnostic writing to stderr), `src/main/code_exec/SandboxSessionManager.ts:794-807` (finalizeOutput with stderrChunks), `src/main/code_exec/SandboxSessionManager.ts:833-840` (normalizeCodeExecOutput)
- **Persistence**: `src/main/code_exec/CodeExecPersistenceMapper.ts:14-16` (stderr in running payload)
- **Pipeline**: `src/main/agents/MainPipeline.ts:1430-1432`, `src/main/agents/MainPipeline.ts:2278-2280`, `src/main/agents/MainPipeline.ts:2285-2287` (stderr in inline code_exec output construction)
- **MessageManager**: `src/main/agents/MessageManager.ts:377-379`, `src/main/agents/MessageManager.ts:437-439` (stderr in stale tool_call finalization)
- **Prompt**: `src/main/agents/PromptBuilder.ts:505` (output fields mention), `src/main/agents/PromptBuilder.ts:513` (limits mention), `src/main/agents/PromptBuilder.ts:524` (stderr throttling guidance)
- **UI**: `src/renderer/components/agents/AgentMessage.tsx:423` (stderr variable extraction), `src/renderer/components/agents/AgentMessage.tsx:489-497` (stderr rendering block)

### Affected requirements

- `code_exec.3.1` / `code_exec.3.1.2` -- output contract includes stderr/stderr_truncated (remove)
- `code_exec.3.7` / `code_exec.3.7.1` -- console output returned in stdout/stderr separately (change to stdout-only)
- `code_exec.5.2` / `code_exec.5.2.1` -- truncation rules mention stdout/stderr (change to stdout-only)
- `code_exec.5.2.2` -- stdout limit 10240 bytes (change to 20480)
- `code_exec.5.2.3` -- stderr limit 10240 bytes (remove)
- `code_exec.5.2.4` -- limits communicated to model (update for stdout-only)
- `code_exec.5.7` -- stdout/stderr persisted (change to stdout-only)
- `code_exec.1.1.2` -- prompt mentions stderr throttling (remove/rewrite)
- `code_exec.2.11.4` -- degraded diagnostic in stderr (change to stdout)

### Affected specifications

- `docs/specs/code_exec/requirements.md` -- update requirements 3.1, 3.1.2, 3.6, 3.7, 3.7.1, 5.2.x, 2.11.4, 1.1.2
- `docs/specs/code_exec/design.md` -- update contract, limits, truncation rules, degraded-mode channel, prompt description, coverage table

## Action plan

### Phase 1: Specifications

- [x] Update `docs/specs/code_exec/requirements.md`:
  - 3.1: Remove `stderr`, `stderr_truncated` from expected output fields
  - 3.1.2: Remove `stderr` and `stderr_truncated` from output contract structure
  - 3.6: Update to clarify console output goes to `stdout` only
  - 3.7: Update to return console output in `stdout` only
  - 3.7.1: Remove requirement for separate stdout/stderr streams (replace with stdout-only)
  - 5.2: Update to stdout-only truncation
  - 5.2.1: Update truncation rule to stdout-only, remove stderr_truncated flag reference
  - 5.2.2: Change stdout limit from `10240` to `20480` bytes (`20 KiB`)
  - 5.2.3: Remove (stderr limit no longer applies)
  - 5.2.4: Update to stdout-only limits communicated to model
  - 5.7: Update to stdout-only persistence
  - 1.1.2: Remove stderr throttling warning reference in prompt rule
  - 2.11.4: Change degraded diagnostic from stderr to stdout
  - Update functional and unit test references where test names change
- [x] Update `docs/specs/code_exec/design.md`:
  - Update persisted message payload example (remove stderr, stderr_truncated)
  - Update operational limits section (remove `code_exec_max_stderr_bytes`, change `code_exec_max_stdout_bytes` to 20480)
  - Update truncation rules (stdout-only)
  - Update prompt description for limits (stdout-only, new value)
  - Update degraded-mode channel description (Channel 2 uses stdout instead of stderr)
  - Update coverage table rows that reference stderr-related tests
  - Update test file descriptions for affected tests

### Phase 2: Code

- [ ] Modify `src/main/code_exec/contracts.ts`:
  - Remove `maxStderrBytes` from `CODE_EXEC_LIMITS`
  - Change `maxStdoutBytes` from `10 * 1024` to `20 * 1024`
  - Remove `stderr` and `stderr_truncated` fields from `CodeExecToolOutput` interface
  - Remove `stderr` and `stderr_truncated` from `makeCodeExecError` return
- [ ] Modify `src/main/code_exec/OutputLimiter.ts`:
  - Change `applyStdStreamLimits` to accept only `stdout` param, return only `stdout`/`stdout_truncated`
  - Remove stderr processing from the function
- [ ] Modify `src/main/code_exec/SandboxSessionManager.ts`:
  - Remove `stderrChunks` array from `executeInOneSandbox`
  - Remove `DEGRADED_MODE_STDERR_MESSAGE` constant (replace with stdout-based diagnostic)
  - Update `buildSandboxExecutionScript`: redirect `console.warn`/`console.error` to `stdoutChunks` instead of `stderrChunks`; remove `stderrChunks` array; remove `stderr`/`stderr_truncated` from returned result objects
  - Update `appendDegradedDiagnostic`: append diagnostic to `stdout` instead of `stderr`
  - Update `finalizeOutput`: remove `stderrChunks` param; return stdout-only fields
  - Update `normalizeCodeExecOutput`: remove `stderr`/`stderr_truncated` from normalized output
  - Update all catch/error blocks: remove stderr fields from output construction
- [ ] Modify `src/main/code_exec/CodeExecPersistenceMapper.ts`:
  - Remove `stderr` and `stderr_truncated` from `buildRunningToolPayload`
- [ ] Modify `src/main/agents/MainPipeline.ts`:
  - Remove `stderr` and `stderr_truncated` from all inline code_exec output constructions (3 locations at lines ~1430, ~2278, ~2285)
- [ ] Modify `src/main/agents/MessageManager.ts`:
  - Remove `stderr` and `stderr_truncated` from stale tool_call finalization outputs (2 locations at lines ~377, ~437)
- [ ] Modify `src/main/agents/PromptBuilder.ts`:
  - Update output fields description (line 505): remove `stderr`, `stderr_truncated`
  - Update limits description (line 513): remove stderr limit, update stdout limit to 20 KiB
  - Update throttling guidance (line 524): change "stderr warns about throttling" to "stdout warns about throttling"
- [ ] Modify `src/renderer/components/agents/AgentMessage.tsx`:
  - Remove `stderr` variable extraction (line 423)
  - Remove stderr rendering block (lines 489-497)

### Phase 3: Tests

- [ ] Update `tests/unit/code_exec/OutputLimiter.test.ts`:
  - Update `applyStdStreamLimits` test: change to stdout-only test, remove stderr assertions (requirement `code_exec.5.2`)
- [ ] Update `tests/unit/code_exec/SandboxSessionManager.test.ts`:
  - Update "captures stderr from console.warn and console.error" test: verify console.warn/error output goes to stdout instead (requirement `code_exec.3.7`)
  - Update "adds degraded-mode diagnostic to stderr" test: verify diagnostic appears in stdout (requirement `code_exec.2.11.4`)
  - Update `normalizeCodeExecOutput` tests: remove stderr assertions (requirement `code_exec.3.1.2`)
  - Remove all stderr-related assertions from other tests
- [ ] Update `tests/unit/code_exec/CodeExecToolSchema.test.ts`:
  - Remove stderr/stderr_truncated from `makeCodeExecError` assertion (requirement `code_exec.3.1.2`)
- [ ] Update `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts`:
  - Remove stderr/stderr_truncated from payload assertions (requirement `code_exec.4.1`)
- [ ] Update `tests/unit/agents/MainPipeline.test.ts`:
  - Remove stderr fields from all code_exec output assertions (~6 locations) (requirement `code_exec.4`)
  - Update finalization test assertions (requirement `code_exec.4`)
- [ ] Update `tests/unit/agents/PromptBuilder.test.ts`:
  - Update tool_call replay test data: remove stderr from output objects (requirement `llm-integration.10`)
- [ ] Update `tests/unit/agents/PromptModelContract.test.ts`:
  - Remove stderr from code_exec output test data (requirement `code_exec.3`)
- [ ] Update `tests/unit/agents/MessageManager.test.ts`:
  - Remove stderr/stderr_truncated from stale tool_call finalization assertions (requirement `llm-integration.11.6`)
- [ ] Update `tests/unit/components/agents/AgentMessage.test.tsx`:
  - Remove stderr-related test assertions and data (requirement `agents.7.4`)
  - Remove all `message-code-exec-stderr` testid assertions
- [ ] Update `tests/functional/code_exec.spec.ts`:
  - Update truncation test: remove stderr generation and assertions, verify stdout-only with 20 KiB limit (requirement `code_exec.5.2`)
  - Remove all `message-code-exec-stderr` locator assertions
  - Remove stderr fields from all injected tool_call payloads
  - Update degraded-mode test: check stdout instead of stderr for diagnostic
- [ ] Update `tests/functional/agent-status-calculation.spec.ts`:
  - Remove stderr fields from injected code_exec output payloads

### Phase 4: Finalization

- [ ] Update coverage table in `design.md`
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/code_exec/requirements.md` | Remove stderr from output contract, update stdout limit, update degraded mode channel |
| `docs/specs/code_exec/design.md` | Remove stderr from contract/limits/truncation, update stdout limit, update degraded-mode channel |
| `src/main/code_exec/contracts.ts` | Remove `maxStderrBytes`, change `maxStdoutBytes` to `20*1024`, remove `stderr`/`stderr_truncated` from interface and helpers |
| `src/main/code_exec/OutputLimiter.ts` | Change `applyStdStreamLimits` to stdout-only |
| `src/main/code_exec/SandboxSessionManager.ts` | Remove stderrChunks, redirect console.warn/error to stdout, update finalizeOutput/appendDegradedDiagnostic/normalizeCodeExecOutput |
| `src/main/code_exec/CodeExecPersistenceMapper.ts` | Remove stderr/stderr_truncated from running payload |
| `src/main/agents/MainPipeline.ts` | Remove stderr/stderr_truncated from 3 inline code_exec output constructions |
| `src/main/agents/MessageManager.ts` | Remove stderr/stderr_truncated from 2 stale finalization outputs |
| `src/main/agents/PromptBuilder.ts` | Remove stderr from output fields/limits/guidance, update stdout limit text |
| `src/renderer/components/agents/AgentMessage.tsx` | Remove stderr variable and rendering block |
| `tests/unit/code_exec/OutputLimiter.test.ts` | Update to stdout-only test |
| `tests/unit/code_exec/SandboxSessionManager.test.ts` | Update stderr->stdout tests, remove stderr assertions |
| `tests/unit/code_exec/CodeExecToolSchema.test.ts` | Remove stderr from makeCodeExecError assertion |
| `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` | Remove stderr from payload assertions |
| `tests/unit/agents/MainPipeline.test.ts` | Remove stderr from ~6 code_exec output assertions |
| `tests/unit/agents/PromptBuilder.test.ts` | Remove stderr from test data |
| `tests/unit/agents/PromptModelContract.test.ts` | Remove stderr from test data |
| `tests/unit/agents/MessageManager.test.ts` | Remove stderr from finalization assertions |
| `tests/unit/components/agents/AgentMessage.test.tsx` | Remove stderr rendering assertions |
| `tests/functional/code_exec.spec.ts` | Update truncation test, remove stderr assertions/payloads |
| `tests/functional/agent-status-calculation.spec.ts` | Remove stderr from injected payloads |

## Expected result

After implementation:
- The `code_exec` output contract has no `stderr` or `stderr_truncated` fields.
- All `console.*` methods (log, info, warn, error) write to `stdout`.
- The stdout limit is 20 KiB (20480 bytes).
- Degraded-mode diagnostics appear in `stdout` instead of `stderr`.
- The model prompt no longer mentions stderr or its limit.
- The UI no longer renders a stderr section for code_exec blocks.
- All tests pass with updated assertions reflecting the new contract.

## Risks

- **Backward compatibility of persisted data**: Old persisted `tool_call(code_exec)` messages may still contain `stderr` and `stderr_truncated` fields. Mitigation: The code ignores unknown fields during rendering/normalization; old messages with stderr simply won't display that section since the rendering block is removed. No migration needed.
- **Degraded-mode diagnostic visibility**: Moving the diagnostic from stderr to stdout means it mixes with user code output. Mitigation: The diagnostic has a clear `[code_exec]` prefix and is appended at the end of output, making it distinguishable.
- **Loss of console.warn/error distinction**: All console methods now write to stdout. Mitigation: This is the intended behavior per the issue; the model does not benefit from the distinction and the user can still see all output in a single stream.
