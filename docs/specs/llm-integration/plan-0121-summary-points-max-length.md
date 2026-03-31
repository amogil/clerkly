# Plan: Prevent mid-word truncation in final_answer summary points (#121)

## Context

`final_answer.summary_points` items are currently limited to 200 characters. In practice, the model can produce checklist items that are cut off mid-word at exactly 200 chars, even though they pass schema validation. The fix increases the limit to 300 characters and adds prompt guidance requiring complete words/sentences.

GitHub issue: #121

## Analysis

### Root cause
The 200-character limit on `summary_points` items is enforced in three places:
1. **Tool JSON schema** (`PromptBuilder.ts`): `maxLength: 200` at `src/main/agents/PromptBuilder.ts:466`
2. **Runtime validation** (`MainPipeline.ts`): `point.length > 200` check at `src/main/agents/MainPipeline.ts:1870`
3. **Prompt guidance** (`PromptBuilder.ts`): text `"max 200 characters"` at `src/main/agents/PromptBuilder.ts:440` and `"max 200 chars each"` at `src/main/agents/PromptBuilder.ts:460`

The schema enforcement by Vercel AI SDK strict mode can cause the model to truncate mid-word to stay within the 200-char boundary. Increasing the limit to 300 gives the model room to finish sentences, while adding an explicit "must end on a complete word" instruction prevents mid-word cutoffs.

The `code_exec.task_summary` also uses `maxLength: 200` (`src/main/code_exec/contracts.ts:206`) but is out of scope -- it is a separate tool parameter with a separate contract.

### Affected requirements
- `llm-integration.9.5.3` -- max item length for `summary_points` (200 -> 300)
- `llm-integration.9.5.1.1` -- system instruction for `final_answer` (add complete-word rule)

### Affected specifications
- `docs/specs/llm-integration/requirements.md` -- update requirement 9.5.3 limit
- `docs/specs/llm-integration/design.md` -- update schema/validation/prompt sections

## Action plan

### Phase 1: Specifications
- [x] Update `requirements.md` -- change requirement `llm-integration.9.5.3` from 200 to 300 characters
- [x] Update `requirements.md` -- add new requirement `llm-integration.9.5.3.4` requiring summary_points items to end on complete words (no mid-word cutoffs)
- [x] Update `design.md` -- change `final_answer` schema `maxLength` from 200 to 300 in the persisted contract section
- [x] Update `design.md` -- update `FinalAnswerFeature` prompt guidance to reference 300 chars and include complete-word instruction
- [x] Update `design.md` -- update `PromptBuilder` tool schema snippet to reflect `maxLength: 300`

### Phase 2: Code
- [x] Modify `src/main/agents/PromptBuilder.ts` -- change `maxLength: 200` to `maxLength: 300` at line 466; update prompt text at lines 440 and 460 to say "max 300 characters" and add "Each point must end on a complete word — never cut off mid-word; rephrase if near the limit."
- [x] Modify `src/main/agents/MainPipeline.ts` -- change `point.length > 200` to `point.length > 300` and update error message at lines 1870-1873

### Phase 3: Tests
- [x] Update unit test `tests/unit/agents/PromptBuilder.test.ts` -- change `maxLength: 200` assertion to `maxLength: 300` (line 200); covers `llm-integration.9.5.3`
- [x] Update unit test `tests/unit/agents/MainPipeline.test.ts` -- `max 200 characters` assertion at line 552 is for auto-title contract (not summary_points), no change needed
- [x] Add unit test in `tests/unit/agents/MainPipeline.test.ts` -- validate runtime rejects items > 300 chars and accepts items <= 300 chars; covers `llm-integration.9.5.3`
- [x] Add unit test in `tests/unit/agents/PromptBuilder.test.ts` -- verify prompt text contains "complete word" / "never cut off mid-word" instruction; covers `llm-integration.9.5.3.4`
- [x] Update functional test `tests/functional/llm-chat.spec.ts` -- `max 200 characters` assertion at line 3197 is for auto-title contract (not summary_points), no change needed

### Phase 4: Finalization
- [x] Update coverage table in `design.md` -- add row for `llm-integration.9.5.3.4`
- [x] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Update 9.5.3 limit 200->300; add 9.5.3.4 complete-word rule |
| `docs/specs/llm-integration/design.md` | Update schema maxLength, prompt text, coverage table |
| `src/main/agents/PromptBuilder.ts` | `maxLength: 200` -> `300`; update prompt strings |
| `src/main/agents/MainPipeline.ts` | `point.length > 200` -> `> 300`; update error message |
| `tests/unit/agents/PromptBuilder.test.ts` | Update `maxLength` assertion; add complete-word prompt assertion |
| `tests/unit/agents/MainPipeline.test.ts` | Update prompt assertion; add 300-char boundary test |
| `tests/functional/llm-chat.spec.ts` | Update `max 200 characters` assertion |

## Expected result
After implementation:
- `final_answer.summary_points` items accept up to 300 characters (schema + runtime validation).
- Prompt guidance explicitly requires each checklist point to end on a complete word/sentence, forbidding mid-word cutoffs.
- All existing persisted messages with items <= 200 chars remain valid (backward compatible -- limit only increased).
- UI rendering is unaffected (no rendering-semantic changes).
- All unit and functional tests pass with updated assertions.

## Risks
- **Model behavior change** -- The model may produce slightly longer checklist items now. Mitigation: the new prompt instruction actively discourages verbose points and requires rephrasing near the limit.
- **Existing persisted data** -- No risk: the limit is being increased, so all existing valid data remains valid.
- **Cross-spec conflict** -- `agents` spec references `summary_points` for rendering but does not define a length limit; no conflict. `code_exec.task_summary` has its own independent `maxLength: 200` which is not changed.
