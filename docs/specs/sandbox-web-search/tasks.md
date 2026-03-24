# Task List: sandbox-web-search

## Overview

Реализовать helper `web_search` как sandbox capability внутри `code_exec` (через `tools.web_search(...)`) с provider-native контрактом активного LLM-провайдера.

**Current status:** Phase 8 - Test Strategy Refinement

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
- ✅ Убран OpenAI stub-path в `SandboxWebSearchHandler`: helper использует реальный OpenAI Responses API c `web_search_preview`.
- ✅ Убраны stub-path для Anthropic и Google в `SandboxWebSearchHandler`: helper использует реальные provider API вызовы.
- ✅ Добавлен real-provider functional тест `code_exec-real.spec.ts` с `CLERKLY_OPENAI_API_KEY` для проверки не-stub web_search результата.
- ✅ Расширен `code_exec-real.spec.ts` сценариями для `CLERKLY_ANTHROPIC_API_KEY` и `CLERKLY_GOOGLE_API_KEY`.
- ✅ Прогнан real-provider functional тест `tests/functional/code_exec-real.spec.ts` (1/1 passed).
- ✅ Добавлены mock-provider functional сценарии для Anthropic и Google в `tests/functional/code_exec.spec.ts`.
- ✅ Прогнан точечный functional-прогон `tests/functional/code_exec.spec.ts --grep "mocked provider endpoint"` (2/2).
- ✅ Внедрена расширяемая архитектура provider-method adapters (`ProviderMethodTypes`, `WebSearchProviderMethodAdapters`, `ProviderMethodRegistry`) с lookup по `(provider, method)`.
- ✅ `SandboxWebSearchHandler` переведён на registry routing вместо provider-specific методов.
- ✅ Добавлена fail-fast проверка consistency capability ↔ adapter registration при инициализации runtime.
- ✅ Зафиксирован onboarding checklist для нового provider method в `design.md`.
- ✅ Добавлены unit-тесты реестра и контрактные тесты provider adapters.

#### Phase 2: Runtime Implementation (done)

- ✅ Инфраструктура песочницы: `web_search` в allowlist, типы ошибок в contracts.
- ✅ Реализация `SandboxWebSearchHandler`: роутинг, валидация, реальные provider API вызовы.
- ✅ Интеграция в Runtime: `SandboxSessionManager` и `MainPipeline`.
- ✅ Динамические промпты: `PromptBuilder.ts` (`CodeExecFeature`), секция `web_search`.

#### Phase 3: Testing & Validation (done)

- ✅ Unit-тесты: `SandboxWebSearchHandler.test.ts`, роутинг, валидация, маппинг ошибок.
- ✅ Functional-тесты: success, `invalid_input`, provider-error, capability fallback, persisted lifecycle, mock-provider Anthropic/Google, real-provider OpenAI/Anthropic/Google.
- ✅ Финальная проверка: `npm run validate`.

#### Phase 4: Provider Method Extensibility (done)

- ✅ Расширяемая архитектура provider-method adapters с lookup по `(provider, method)`.
- ✅ Fail-fast consistency check capability ↔ adapter registration.
- ✅ Onboarding checklist, unit-тесты реестра, contract тесты адаптеров.

#### Phase 5: Code Review Fixes (done)

- ✅ 5.1. Рефактор apiKey routing — closure вместо протаскивания через `LLMTool.execute`.
- ✅ 5.2. Убран тестовый backdoor `shouldSimulateProviderError`.
- ✅ 5.3. Убрана env variable `CLERKLY_DISABLE_WEB_SEARCH_PROVIDERS`.
- ✅ 5.4. Зафиксирован timeout 120s, синхронизирован prompt.
- ✅ 5.5. Убран мёртвый код и cosmetic issues.
- ✅ 5.6. Финальная проверка: `npm run validate`, точечные тесты.

#### Phase 6: Second Code Review Fixes

- ✅ Унифицирована валидация пустых/пробельных запросов для OpenAI/Google (возврат `invalid_input` как у Anthropic).
- ✅ Убрана фантомная ссылка на несуществующий functional тест capability fallback.
- ✅ Документировано отсутствие env override в design.md.
- ✅ Исправлен маппинг покрытия `SandboxBridge.test.ts` в design.md.
- ✅ Убран обход private-поля `PromptBuilder.features` — добавлен публичный метод `forEachFeature`.
- ✅ Документировано ограничение `max_tokens: 512` для Anthropic (константа + design.md).
- ✅ Документирован `policy_denied` при вызове незарегистрированного helper-а.
- ✅ Извлечена общая утилита `isTimeoutLikeError` в contracts.ts.
- ✅ Прогнан `npm run validate`.

#### Phase 7: Third & Fourth Code Review Fixes (done)

- ✅ Добавлен `policy_denied` в тип `SandboxWebSearchErrorCode` в contracts.ts.
- ✅ Документирована sequential fail-fast execution для OpenAI/Google multi-query.
- ✅ Уточнён `policy_denied` code path: sandbox allowlist = primary, `handleSandboxToolInvocation` = defense-in-depth.
- ✅ Добавлен unit-тест для defense-in-depth `policy_denied` guard.
- ✅ Добавлен `sandbox-web-search.2.8` requirement для fail-fast multi-query.
- ✅ Добавлен `sandbox-web-search.2.7` в requirement-комментарии тестов.
- ✅ Разбита таблица покрытия на 31 индивидуальную строку sub-requirements.
- ✅ Документирована Google API key-in-URL security consideration + unit-тест redaction.
- ✅ Добавлены unit-тесты для `PromptBuilder.forEachFeature`.
- ✅ Исправлена ссылка `11.5.1 → 11.5.4` в MainPipeline.ts и тестах.
- ✅ Убрана фантомная ссылка на несуществующий functional тест в design.md.
- ✅ Исправлена структура tasks.md: unchecked items из Phase 6 отмечены как done.
- ✅ Прогнан `npm run validate`.

**Текущий статус:** Phase 8 — Test strategy refinement (done)

---

#### Phase 8: Test Strategy Refinement (done)

- ✅ Anthropic и Google real-API тесты удалены из `code_exec-real.spec.ts`; покрытие обеспечено mock-тестами в `code_exec.spec.ts`.
- ✅ `code_exec-real.spec.ts` содержит только OpenAI real-API тест (требует `CLERKLY_OPENAI_API_KEY`).
- ✅ Обновлена таблица покрытия в design.md: убраны ссылки на Anthropic/Google real-API тесты.
- ✅ Прогнан `npm run validate`.

### In Progress

_Нет задач в работе._

### Planned

- [ ] Прогнать полный functional-набор `npm run test:functional` (не выполнялось в рамках текущего запроса).
