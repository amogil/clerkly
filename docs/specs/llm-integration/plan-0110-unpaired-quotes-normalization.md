# Plan: Strip unpaired paired punctuation from auto-title candidates (#110)

## Context

GitHub issue: https://github.com/amogil/clerkly/issues/110

Chat renaming sometimes produces titles with unpaired punctuation marks (e.g. `"Some title`, `Plan (for Q3`, `Code [review`). The LLM model returns a title string inside JSON metadata `{"title":"...","rename_need_score":NN}`, and the title value itself may contain stray paired punctuation characters. The current `normalizeAgentTitleCandidate` function strips edge punctuation which handles leading/trailing marks, but does not handle unpaired punctuation that remains after edge stripping.

**Scope expansion:** The problem is NOT only about unpaired double quotes -- it applies to ALL paired punctuation marks: double quotes, typographic single quotes, parentheses, square brackets, curly braces, backticks, and angle brackets. Additionally, the LLM prompt for title generation should be updated to instruct the model not to produce titles with paired punctuation in the first place (defense in depth: prompt + post-processing normalization).

PR: https://github.com/amogil/clerkly/pull/113

## Analysis

### Root cause

The `normalizeAgentTitleCandidate` function at `src/main/agents/AgentTitleRuntime.ts:162-175` performs:
1. Whitespace collapse (newlines/tabs to spaces, multiple spaces to one, trim)
2. Edge punctuation removal via regex `^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$`
3. Length validation

Step 2 handles punctuation at the very start/end of the string. However, it does NOT handle unpaired punctuation that survives edge stripping. Examples:

| Model output title | After edge strip | Problem |
|---|---|---|
| `"Some title"` | `Some title` | OK - both quotes stripped as edge punctuation |
| `"Some title` | `Some title` | OK - leading quote stripped |
| `Some "title` | `Some "title` | BUG - unpaired `"` persists in the middle |
| `Plan for (Q3` | `Plan for (Q3` | BUG - unpaired `(` persists |
| `Code [review` | `Code [review` | BUG - unpaired `[` persists |
| `Data {model` | `Data {model` | BUG - unpaired `{` persists |
| `` Deploy `fix `` | `` Deploy `fix `` | BUG - unpaired backtick persists |
| `Compare <values` | `Compare <values` | BUG - unpaired `<` persists |

The fix requires two layers of defense:
1. **Prompt update:** Instruct the model not to use paired punctuation in generated titles (`buildAutoTitleMetadataContractPrompt` at `src/main/agents/PromptBuilder.ts:38-51`)
2. **Post-processing normalization:** Add a step in `normalizeAgentTitleCandidate` that detects and removes all types of unpaired paired punctuation

The relevant paired punctuation characters to handle:
- **ASCII double quote:** `"` (U+0022) -- symmetric, odd count means unpaired
- **Typographic double quotes:** `\u201C` / `\u201D` -- asymmetric pair
- **Typographic single quotes:** `\u2018` / `\u2019` -- asymmetric pair (distinct from ASCII apostrophe)
- **Parentheses:** `(` / `)` -- asymmetric pair
- **Square brackets:** `[` / `]` -- asymmetric pair
- **Curly braces:** `{` / `}` -- asymmetric pair
- **Backticks:** `` ` `` -- symmetric, odd count means unpaired
- **Angle brackets:** `<` / `>` -- asymmetric pair

**Decision on ASCII apostrophes:** ASCII single quote `'` (U+0027) is used ubiquitously in English contractions (`it's`, `don't`, `user's`). Stripping unpaired ASCII single quotes would damage valid titles. It MUST NOT be touched.

### Affected requirements

- `llm-integration.16.8.3` - Expanded from "unpaired double quotes" to cover ALL paired punctuation types
- `llm-integration.16.8.4` - NEW: prompt must instruct model not to use paired punctuation in titles (defense in depth)

### Affected specifications

- `docs/specs/llm-integration/requirements.md` - Update `llm-integration.16.8.3` to cover all paired punctuation; add `llm-integration.16.8.4` for prompt defense-in-depth
- `docs/specs/llm-integration/design.md` - Update normalization description for all paired punctuation; add prompt instruction detail; add coverage row for `16.8.4`; add unit test entry for prompt contract

## Action plan

### Phase 1: Specifications

- [x] Update `requirements.md` - Expand requirement `llm-integration.16.8.3` to cover all paired punctuation types (double quotes, typographic single quotes, parentheses, square brackets, curly braces, backticks, angle brackets). Add requirement `llm-integration.16.8.4` for prompt defense-in-depth.
- [x] Update `design.md` - Update normalization description to list all paired punctuation types and their balance rules. Add prompt instruction detail for defense-in-depth. Add coverage row for `16.8.4`. Add unit test entry for prompt contract test.

### Phase 2: Code

- [x] Modify `src/main/agents/AgentTitleRuntime.ts` - In `normalizeAgentTitleCandidate`, after edge punctuation removal, add a step that:
  1. For each symmetric type (ASCII `"`, backtick `` ` ``): count occurrences; if odd, remove all.
  2. For each asymmetric pair (typographic `""`/`''`, parentheses, brackets, braces, angle brackets): count open and close separately; if counts differ, remove all of that type.
  3. After removal, re-trim to handle any resulting edge whitespace.

- [x] Modify `src/main/agents/PromptBuilder.ts` - In `buildAutoTitleMetadataContractPrompt`, add a prompt line instructing the model: `- Do not use quotes, parentheses, brackets, braces, backticks, or angle brackets in <short title>; use plain text only.`

### Phase 3: Tests

- [x] Update unit tests in `tests/unit/agents/AgentTitleNormalization.test.ts`:
  - Test: title with single unpaired ASCII `"` in the middle is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired ASCII `"` around a word preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired typographic `"` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired typographic `"` `"` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired typographic single quote `'` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired typographic single quotes `'` `'` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired `(` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired `()` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired `[` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired `[]` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired `{` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired `{}` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired backtick is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired backticks preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired `<` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired `<>` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with apostrophe (e.g., `it's a plan`) is NOT modified -> covers `llm-integration.16.8.3`
  - Test: title with mixed unpaired punctuation from different types -> covers `llm-integration.16.8.3`
  - Test: edge-only quotes are already handled by edge stripping and unpaired logic does not interfere -> covers `llm-integration.16.8, llm-integration.16.8.3`

- [x] Add unit test in `tests/unit/agents/AgentTitlePromptContract.test.ts`:
  - Test: `buildAutoTitleMetadataContractPrompt` output contains instruction prohibiting paired punctuation in titles -> covers `llm-integration.16.8.4`

### Phase 4: Finalization

- [x] Update coverage table in `design.md` (already done in Phase 1)
- [x] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Expand `16.8.3` for all paired punctuation; add `16.8.4` for prompt defense-in-depth |
| `docs/specs/llm-integration/design.md` | Update normalization description for all paired punctuation; add prompt instruction; add `16.8.4` coverage row; add test entries |
| `src/main/agents/AgentTitleRuntime.ts` | Add unpaired paired punctuation removal step in `normalizeAgentTitleCandidate` after edge punctuation removal |
| `src/main/agents/PromptBuilder.ts` | Add prompt instruction prohibiting paired punctuation in `buildAutoTitleMetadataContractPrompt` |
| `tests/unit/agents/AgentTitleNormalization.test.ts` | Add ~19 unit tests covering all paired punctuation types for `llm-integration.16.8.3` |
| `tests/unit/agents/AgentTitlePromptContract.test.ts` | Add unit test verifying prompt contains paired punctuation prohibition for `llm-integration.16.8.4` |

## Expected result

After implementation:
1. `normalizeAgentTitleCandidate` will strip ALL types of unpaired paired punctuation from model-generated titles before they are persisted. Titles like `Some "title` become `Some title`, `Plan (for Q3` becomes `Plan for Q3`, while legitimately paired punctuation like `The "Plan"` or `Project (Alpha)` is preserved. ASCII apostrophes are unaffected.
2. The LLM prompt for title generation will explicitly instruct the model not to use paired punctuation in titles, reducing the frequency of unpaired punctuation in model output (defense in depth).
3. All existing normalization behavior (edge punctuation, whitespace, length limits) continues to work unchanged.

## Risks

- **Risk: False positive on intentional paired punctuation** - A title like `Project (Alpha)` has balanced parentheses and should be preserved. The algorithm counts open/close pairs, so this is safe. Mitigation: explicit test cases for each paired type with balanced input.
- **Risk: Apostrophe damage** - If ASCII single quote handling were added, titles like `it's` would break. Mitigation: only typographic single quotes are handled; ASCII apostrophes are explicitly excluded.
- **Risk: Edge case with mixed punctuation types** - A title like `"word(test` has unpaired `"` and unpaired `(`. The algorithm treats each type independently, so the lone `"` and lone `(` would both be stripped, leaving `wordtest`. After re-trim this is `wordtest`. This is acceptable behavior since such titles are clearly malformed. Mitigation: explicit test case for mixed types.
- **Risk: Prompt instruction ignored by model** - The model may still produce titles with paired punctuation despite the prompt instruction. Mitigation: post-processing normalization (`16.8.3`) serves as the actual safety net; the prompt instruction is purely best-effort.
- **Risk: Angle brackets interfere with HTML-like content** - Model might produce `<title>` as an actual title attempt. The algorithm would strip unbalanced `<`/`>`, which is correct since raw angle brackets in UI display can cause rendering issues. Balanced `<word>` would be preserved.
