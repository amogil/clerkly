# Plan: Preserve original HTTP status code in provider error records (#105)

## Context

When the LLM provider returns HTTP 500, 502, or 503, the error is normalized to a generic
user-facing message (`"Provider service unavailable. Please try again later."`) and saved to
the database. The original HTTP status code is lost -- it is extracted during normalization
but never included in `NormalizedLLMError` or in the persisted `kind:error` payload.

This makes post-hoc diagnosis impossible because there are no file logs and terminal output
is lost on restart.

Issue: https://github.com/nickareel/clerkly/issues/105

## Analysis

### Root cause

`normalizeLLMError()` (`src/main/llm/ErrorNormalizer.ts:97-237`) reads `statusCode` from the
incoming error object to decide the domain error type, but the `NormalizedLLMError` interface
(`src/main/llm/ErrorNormalizer.ts:14-18`) does not carry `statusCode` in its output.

`MainPipeline.handleRunError()` (`src/main/agents/MainPipeline.ts:2211-2229`) builds the
`kind:error` payload from `normalizedError.type` and `normalizedError.message` only, so the
HTTP status code is not persisted.

**Flow today:**
```
APICallError { statusCode: 503 }
  -> normalizeLLMError() -> { type: 'provider', message: 'Provider service unavailable...' }
  -> handleRunError()    -> kind:error { data.error.type, data.error.message }
                            ^^^ statusCode is lost here
```

**Desired flow:**
```
APICallError { statusCode: 503 }
  -> normalizeLLMError() -> { type: 'provider', message: '...', statusCode: 503 }
  -> handleRunError()    -> kind:error { data.error.type, data.error.message, data.error.statusCode: 503 }
```

### Affected requirements

- `llm-integration.3.3` -- error payload structure (`data.error.type`, `data.error.message`)
- `llm-integration.3.4.1` -- standardized error contract (`type`, `message`, optional `action_link`)
- `llm-integration.3.5` -- error type list and their messages
- `llm-integration.3.10` -- normalization into domain format

### Affected specifications

- `docs/specs/llm-integration/requirements.md` -- add requirement for optional `statusCode` in error payload
- `docs/specs/llm-integration/design.md` -- update `NormalizedLLMError` interface, `kind:error` payload format, coverage table

## Action plan

### Phase 1: Specifications

- [x] Update `requirements.md` -- add `llm-integration.3.11`: WHEN the original error carries an HTTP status code, the `kind:error` payload SHALL include it in `data.error.statusCode`
- [x] Update `design.md` -- extend `NormalizedLLMError` interface with optional `statusCode`, update `kind:error` payload examples, update `handleRunError` pseudocode, add coverage row

### Phase 2: Code

- [ ] Modify `src/main/llm/ErrorNormalizer.ts` -- add `statusCode?: number` to `NormalizedLLMError` interface; populate it in `normalizeLLMError()` whenever `statusCode` is available from the error or its cause chain
- [ ] Modify `src/main/agents/MainPipeline.ts` -- in `handleRunError()`, include `normalizedError.statusCode` in the error payload when it is defined (both in the general error path at line ~2211 and in the `InvalidToolCallRetryExhaustedError` path at line ~2129)

### Phase 3: Tests

- [ ] Add unit test `tests/unit/llm/ErrorNormalizer.test.ts` -- "should include statusCode in normalized error for APICallError 5xx" (verifies `llm-integration.3.11`)
- [ ] Add unit test `tests/unit/llm/ErrorNormalizer.test.ts` -- "should include statusCode in normalized error for APICallError 401/403" (verifies `llm-integration.3.11`)
- [ ] Add unit test `tests/unit/llm/ErrorNormalizer.test.ts` -- "should include statusCode in normalized error for APICallError 429" (verifies `llm-integration.3.11`)
- [ ] Add unit test `tests/unit/llm/ErrorNormalizer.test.ts` -- "should not include statusCode when original error has no HTTP status" (verifies `llm-integration.3.11`)
- [ ] Add unit test `tests/unit/agents/MainPipeline.test.ts` -- "should persist statusCode in kind:error payload when provider returns 5xx" (verifies `llm-integration.3.11`)
- [ ] Add/update functional test `tests/functional/llm-chat.spec.ts` -- "should show provider error message on 500" -- verify `statusCode` is present in persisted error payload (verifies `llm-integration.3.11`)

### Phase 4: Finalization

- [ ] Update coverage table in `design.md` (already done in Phase 1 for the new requirement row)
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Add requirement `llm-integration.3.11` for optional `statusCode` in error payload |
| `docs/specs/llm-integration/design.md` | Extend `NormalizedLLMError` interface, update `kind:error` payload examples, add coverage row |
| `src/main/llm/ErrorNormalizer.ts` | Add `statusCode?: number` to `NormalizedLLMError`; populate it in all code paths of `normalizeLLMError()` |
| `src/main/agents/MainPipeline.ts` | Include `statusCode` in error payload construction inside `handleRunError()` |
| `tests/unit/llm/ErrorNormalizer.test.ts` | Add tests verifying `statusCode` presence/absence in normalized errors |
| `tests/unit/agents/MainPipeline.test.ts` | Add test verifying `statusCode` in persisted `kind:error` payload |
| `tests/functional/llm-chat.spec.ts` | Update existing 500 test to verify `statusCode` in payload |

## Expected result

After implementation, every `kind:error` record created from an HTTP error will include the
original HTTP status code in `data.error.statusCode`. For example:

```json
{
  "data": {
    "error": {
      "type": "provider",
      "message": "Provider service unavailable. Please try again later.",
      "statusCode": 503
    }
  }
}
```

The user-facing message remains unchanged. The `statusCode` field is optional and only present
when the original error carried an HTTP status code (not present for timeout, network, tool, or
protocol errors that have no HTTP status).

## Risks

- **Risk: Renderer reads `statusCode` unexpectedly** -- Mitigation: `statusCode` is purely
  informational/diagnostic and is not consumed by any renderer component. The field is optional
  so existing code ignoring it is unaffected.
- **Risk: Payload size increase** -- Mitigation: Adding one numeric field per error message is
  negligible.
- **Risk: RetryError cause chain statusCode** -- Mitigation: The `unwrapCauseChain` function in
  `ErrorNormalizer.ts` already traverses the cause chain; we will extract `statusCode` from the
  deepest relevant cause alongside the error type.
