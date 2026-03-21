# Task List: sandbox-web-search

## Overview

Реализовать helper `web_search` как sandbox capability внутри `code_exec` (через `tools.web_search(...)`) с provider-native контрактом активного LLM-провайдера.

**Current status:** Phase 1 - Spec Realignment (Provider-native Contract)

---

## CRITICAL RULES

- Не регистрировать `web_search` как отдельный main-pipeline tool.
- Не вводить единый cross-provider schema web search результата.
- Использовать provider-native contract активного провайдера.
- Persisted lifecycle должен оставаться в рамках `tool_call(code_exec)`.

---

## Current State

### Completed
- ✅ Переписаны `requirements.md` и `design.md` под provider-native концепцию.
- ✅ Зафиксирован provider routing (OpenAI / Anthropic / Gemini) и capability-gated публикация helper-а в registry.
- ✅ Зафиксировано отсутствие отдельного persisted `tool_call(web_search)`.

### In Progress
- 🔄 Подготовка runtime-плана реализации provider adapters.

### Planned

#### Phase 2: Runtime

- [ ] Добавить `web_search` в sandbox allowlist/bridge
- [ ] Реализовать `SandboxWebSearchHandler` с routing по активному провайдеру
- [ ] Реализовать provider adapters для OpenAI/Anthropic/Gemini
- [ ] Добавить prompt guidance о provider-native контракте в `CodeExecFeature`

#### Phase 3: Tests

- [ ] Добавить unit-тесты (`SandboxBridge`, `SandboxWebSearchHandler`, provider adapters, `PromptBuilder`)
- [ ] Добавить functional тесты в `tests/functional/code_exec.spec.ts`
- [ ] Прогнать `npm run validate`
