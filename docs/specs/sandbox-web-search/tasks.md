# Task List: sandbox-web-search

## Overview

Реализовать helper `web_search` как sandbox capability внутри `code_exec` (через `tools.web_search(...)`) с provider-native контрактом активного LLM-провайдера.

**Current status:** Phase 3 - Testing & Validation

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
- ✅ Реализована runtime-инфраструктура helper-а `web_search` (allowlist, контракты ошибок, handler, интеграция в сессию, provider-aware prompt).
- ✅ Обновлён `MainPipeline` для прокидывания активного провайдера в `code_exec` execute path.
- ✅ Добавлены и стабилизированы unit-тесты для `SandboxWebSearchHandler`, `SandboxSessionManager`, `PromptBuilder` и `MainPipeline`.
- ✅ Прогнан `npm run validate` (TypeScript, ESLint, Prettier, unit, coverage).
- ✅ Добавлены functional-сценарии для `web_search`: success, `invalid_input`, `provider_error`, persisted lifecycle, capability fallback.
- ✅ Прогнан точечный functional-набор `code_exec.spec.ts --grep web_search` (4/4).

### In Progress
- 🔄 Полный запуск всего функционального набора (`npm run test:functional`) остаётся отдельным шагом.

### Planned

#### Phase 2: Runtime Implementation

- [x] **Инфраструктура песочницы**
  - [x] Добавить `'web_search'` в `SANDBOX_TOOLS_ALLOWLIST` в `src/main/code_exec/SandboxBridge.ts`.
  - [x] Добавить типы ошибок для поиска (`invalid_input`, `provider_error`, `timeout`, `internal_error`) в `src/main/code_exec/contracts.ts`.
- [x] **Реализация `SandboxWebSearchHandler`**
  - [x] Создать `src/main/code_exec/SandboxWebSearchHandler.ts`.
  - [x] Реализовать роутинг по активному провайдеру (`openai`, `anthropic`, `google`).
  - [x] Реализовать схемы валидации и адаптеры для OpenAI, Gemini, Anthropic.
  - [x] Внедрить базовую реализацию поиска (заглушка/плагин).
- [x] **Интеграция в Runtime**
  - [x] Обновить `SandboxSessionManager.ts` для поддержки передачи провайдера и регистрации `web_search`.
  - [x] Обновить `MainPipeline.ts` для передачи активного провайдера в сессию.
- [x] **Динамические промпты**
  - [x] Обновить `PromptBuilder.ts` (`CodeExecFeature`), добавив динамическую секцию документации `web_search` в зависимости от провайдера.

#### Phase 3: Testing & Validation

- [x] **Unit-тесты**
  - [x] Создать \`tests/unit/code_exec/SandboxWebSearchHandler.test.ts\`.
  - [x] Проверить роутинг, валидацию контрактов и маппинг ошибок.
- [ ] **Functional-тесты**
  - [x] Добавить e2e сценарий успешного вызова helper-а `web_search`.
  - [x] Добавить e2e сценарий structured `invalid_input` для helper-а `web_search`.
  - [x] Расширить матрицу кейсов (provider-error path, capability fallback, persisted lifecycle assertions).
  - [x] Прогнать точечный functional-прогон `tests/functional/code_exec.spec.ts --grep web_search`.
  - [ ] Прогнать полный functional-набор `npm run test:functional` (не выполнялось в рамках текущего запроса).

- [x] **Финальная проверка**
  - [x] Запустить `npm run validate`.
