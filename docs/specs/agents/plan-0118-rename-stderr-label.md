# Plan: Rename code_exec stderr block label from "Output" to "Error" (#118)

## Context

Issue [#118](https://github.com/nicoyash/clerkly3/issues/118) reports that in the `code_exec` UI, both `stdout` and `stderr` blocks are rendered with the same label `Output` via `buildCodeFence`. This makes them visually indistinguishable. The `stderr` block should use the label `Error` instead of `Output`.

## Analysis

### Root cause

At `src/renderer/components/agents/AgentMessage.tsx:502`, the `stderr` section calls `buildCodeFence(stripAutoTitleMetadataComments(stderr), 'Output')` which renders a markdown code fence with `Output` as the language label. This is identical to the `stdout` section at line 493. The user cannot visually distinguish between `stdout` and `stderr` output.

The current code complies with the existing requirement `agents.7.4.6.5.4` which states both `stdout` and `stderr` should display the `Output` label. The requirement itself is the root cause -- it needs to be updated to specify that `stderr` uses `Error` while `stdout` keeps `Output`.

### Affected requirements

- `agents.7.4.6.5.4` -- currently says both `stdout` and `stderr` use label `Output`; needs to be split so `stderr` uses `Error`

### Affected specifications

- `docs/specs/agents/requirements.md` -- update requirement `7.4.6.5.4` to separate `stdout` and `stderr` labels
- `docs/specs/agents/design.md` -- update design description at line 1616

## Action plan

### Phase 1: Specifications

- [x] Update `requirements.md` -- split `7.4.6.5.4` so `stdout` keeps label `Output` and `stderr` gets label `Error`
- [x] Update `design.md` -- update the rendering description at line 1616 to reflect the new label for `stderr`

### Phase 2: Code

- [x] Modify `src/renderer/components/agents/AgentMessage.tsx:502` -- change `buildCodeFence(stripAutoTitleMetadataComments(stderr), 'Output')` to `buildCodeFence(stripAutoTitleMetadataComments(stderr), 'Error')`

### Phase 3: Tests

- [x] Update unit test `tests/unit/components/agents/AgentMessage.test.tsx:188` -- change assertion from `toHaveTextContent('```Output')` to `toHaveTextContent('```Error')` for the `message-code-exec-stderr` testid. Covers requirement `agents.7.4.6.5.4`.

### Phase 4: Finalization

- [x] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/agents/requirements.md` | Update `7.4.6.5.4` to say `stdout` uses `Output`, `stderr` uses `Error` |
| `docs/specs/agents/design.md` | Update line 1616 to reflect separate labels for `stdout` vs `stderr` |
| `src/renderer/components/agents/AgentMessage.tsx` | Line 502: change second argument of `buildCodeFence` from `'Output'` to `'Error'` |
| `tests/unit/components/agents/AgentMessage.test.tsx` | Line 188: change assertion from `'```Output'` to `'```Error'` for stderr block |

## Expected result

After implementation, the `code_exec` block in the UI will show:
- `stdout` section with label `Output` (unchanged)
- `stderr` section with label `Error` (changed from `Output`)
- `error` section (structured `output.error`) with label `Error` (unchanged)

This allows users to visually distinguish between standard output and error output in `code_exec` results.

## Risks

- **Risk: Functional test breakage** -- The functional test `tests/functional/code_exec.spec.ts` covers `agents.7.4.5-7.4.9` and may assert the old `Output` label for `stderr`. Mitigation: search and update any such assertions during Phase 3.
