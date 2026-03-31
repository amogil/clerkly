# Plan: Strip unpaired quotes from auto-title candidates (#110)

## Context

GitHub issue: https://github.com/amogil/clerkly/issues/110

Chat renaming sometimes produces titles with unpaired quotes (e.g. `"Some title` or `Some title"`). The LLM model returns a title string inside JSON metadata `{"title":"...","rename_need_score":NN}`, and the title value itself may contain stray quote characters. The current `normalizeAgentTitleCandidate` function strips edge punctuation which handles leading/trailing quotes, but does not handle unpaired quotes that remain after edge stripping (e.g. `Some "title` where a single `"` sits in the middle of the title).

## Analysis

### Root cause

The `normalizeAgentTitleCandidate` function at `src/main/agents/AgentTitleRuntime.ts:162-175` performs:
1. Whitespace collapse (newlines/tabs to spaces, multiple spaces to one, trim)
2. Edge punctuation removal via regex `^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$`
3. Length validation

Step 2 handles quotes at the very start/end of the string. However, it does NOT handle unpaired quotes that survive edge stripping. Examples:

| Model output title | After edge strip | Problem |
|---|---|---|
| `"Some title"` | `Some title` | OK - both quotes stripped as edge punctuation |
| `"Some title` | `Some title` | OK - leading quote stripped |
| `Some title"` | `Some title` | OK - trailing quote stripped |
| `Some "title` | `Some "title` | BUG - unpaired `"` persists in the middle |
| `He said "hello` | `He said "hello` | BUG - unpaired `"` persists |
| `Plan for "Q3` | `Plan for "Q3` | BUG - unpaired `"` persists |

The fix must add a normalization step that detects and removes unpaired quotation marks from the title. "Unpaired" means a quote character that does not have a matching opening/closing counterpart.

The relevant quote characters to handle are:
- ASCII double quote: `"` (U+0022)
- ASCII single quote / apostrophe: `'` (U+0027) - BUT must NOT strip apostrophes used in contractions (e.g. `it's`, `don't`)
- Typographic double quotes: `\u201C` (`"`), `\u201D` (`"`)
- Typographic single quotes: `\u2018` (`'`), `\u2019` (`'`) - these also serve as apostrophes

**Decision on apostrophes:** Single quotes / apostrophes are commonly used in English contractions and possessives (`it's`, `user's`). Stripping unpaired single ASCII quotes would damage valid titles. The safest approach is to handle only double quote characters (ASCII `"`, typographic `"` `"`), treating left/right typographic quotes as a pair. Single quotes (`'`, `'`, `'`) should be left as-is since they are far more commonly used as apostrophes than as wrapping quotes in model output.

### Affected requirements

- `llm-integration.16.8` - Title normalization currently specifies "trim, single-line, collapse spaces, edge punctuation removal". Needs to be extended to include "removal of unpaired double quotes".
- `llm-integration.16.9` - No change needed (already covers empty/over-limit rejection).

### Affected specifications

- `docs/specs/llm-integration/requirements.md` - Add sub-requirement `llm-integration.16.8.3` for unpaired double quote removal
- `docs/specs/llm-integration/design.md` - Update normalization description to include unpaired quote stripping; add coverage row for `16.8.3`

## Action plan

### Phase 1: Specifications

- [x] Update `requirements.md` - Add requirement `llm-integration.16.8.3`: candidate title normalization MUST remove unpaired double quotes (ASCII `"`, typographic `\u201C`/`\u201D`). Paired double quotes (matching open/close) MUST be preserved. Single quotes/apostrophes MUST NOT be affected.
- [x] Update `design.md` - Add description of unpaired quote removal step in the normalization pipeline (section "Auto-title extraction"). Add coverage row for `16.8.3`. Add new unit test entry for unpaired quote normalization.

### Phase 2: Code

- [ ] Modify `src/main/agents/AgentTitleRuntime.ts` - In `normalizeAgentTitleCandidate`, after edge punctuation removal, add a step that:
  1. Counts occurrences of each double quote type (ASCII `"`, left `"`, right `"`)
  2. For ASCII `"`: if count is odd, removes all occurrences (since we cannot determine which is the "unpaired" one reliably)
  3. For typographic quotes: removes unmatched `"` or `"` (i.e., if left count != right count, removes all of whichever has excess; if one type is present without the other and count is odd, removes all)
  4. After removal, re-trims to handle any resulting edge whitespace

  **Simpler alternative (recommended):** After edge punctuation removal, scan for all double-quote characters (`"`, `"`, `"`). Group `"` and `"` as a typographic pair. If ASCII `"` count is odd, remove all ASCII `"`. If typographic left count != typographic right count, remove all typographic quotes. This is simple, predictable, and covers all model output patterns.

### Phase 3: Tests

- [ ] Add unit tests in `tests/unit/agents/AgentTitleNormalization.test.ts`:
  - Test: title with single unpaired ASCII `"` in the middle is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired ASCII `"` around a word preserves them -> covers `llm-integration.16.8.3`
  - Test: title with unpaired typographic `"` is stripped -> covers `llm-integration.16.8.3`
  - Test: title with paired typographic `"` `"` preserves them -> covers `llm-integration.16.8.3`
  - Test: title with mixed unpaired quotes (e.g., `"word"`) strips the unpaired one -> covers `llm-integration.16.8.3`
  - Test: title with apostrophe (e.g., `it's a plan`) is NOT modified -> covers `llm-integration.16.8.3`
  - Test: edge-only quotes are already handled by edge stripping and unpaired logic does not interfere -> covers `llm-integration.16.8, llm-integration.16.8.3`

### Phase 4: Finalization

- [ ] Update coverage table in `design.md` (already planned in Phase 1)
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Add requirement `16.8.3` for unpaired double quote removal |
| `docs/specs/llm-integration/design.md` | Update normalization description; add `16.8.3` coverage row; add unit test entry |
| `src/main/agents/AgentTitleRuntime.ts` | Add unpaired double quote removal step in `normalizeAgentTitleCandidate` after edge punctuation removal |
| `tests/unit/agents/AgentTitleNormalization.test.ts` | Add 7 unit tests covering unpaired quote normalization for `llm-integration.16.8.3` |

## Expected result

After implementation, `normalizeAgentTitleCandidate` will strip unpaired double quotes from model-generated titles before they are persisted. Titles like `Some "title` become `Some title`, while legitimately paired quotes like `The "Plan"` are preserved. Single quotes and apostrophes are unaffected. All existing normalization behavior (edge punctuation, whitespace, length limits) continues to work unchanged.

## Risks

- **Risk: False positive on intentional quotes** - A title like `Project "Alpha"` has paired quotes and should be preserved. The algorithm counts quote pairs, so this is safe. Mitigation: explicit test cases for paired quotes.
- **Risk: Apostrophe damage** - If single quote handling were added, titles like `it's` would break. Mitigation: only double quotes are handled; single quotes are explicitly excluded.
- **Risk: Edge case with multiple quote types** - A title like `"word"` mixes ASCII and typographic quotes. The algorithm treats each quote type independently, so the lone ASCII `"` would be stripped and the lone typographic `"` would also be stripped, leaving `word`. This is acceptable behavior. Mitigation: explicit test case.
