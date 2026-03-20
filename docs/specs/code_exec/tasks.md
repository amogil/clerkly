# Task List: code_exec

## Overview

План исправления для issue #75: корректная классификация ошибок sandbox policy и явная подсказка модели о недоступности Node.js globals в `code_exec`.

**Current status:** Phase 1 - Планирование фикса issue #75

---

## CRITICAL RULES

- Не расширять sandbox-права и не открывать доступ к Node.js API.
- Сохранить границу классификации ошибок:
  - `policy_denied` только для нарушений sandbox policy.
  - `sandbox_runtime_error` для обычных ошибок пользовательского JavaScript-кода.
- Не менять существующий persisted/runtime контракт `tool_call(code_exec)` вне области issue #75.

---

## Current State

### Completed
- ✅ Актуализировано описание issue #75 в GitHub под согласованный scope.
- ✅ Создана рабочая ветка от свежего `main`: `fix/issue-75-code-exec-policy-denied-node-globals`.

### In Progress
- 🔄 Подготовка плана реализации и тестового покрытия для issue #75.

### Planned

#### Phase 1: Prompt Guidance

- [ ] Обновить системную инструкцию `CodeExecFeature`:
  - [ ] Добавить единое явное правило: `Node.js globals are unavailable in sandbox: process, require, module, Buffer, __dirname, __filename.`
  - [ ] Не добавлять избыточные частные правила по отдельным методам (например, `process.exit`).

#### Phase 2: Runtime Error Normalization

- [ ] Обновить нормализацию ошибок sandbox runtime:
  - [ ] Для распознаваемых нарушений sandbox policy (включая Node.js globals) возвращать контролируемый `error.code = policy_denied`.
  - [ ] Для остальных runtime-сбоев сохранять `error.code = sandbox_runtime_error`.
  - [ ] Обеспечить понятные `error.message` без раскрытия чувствительных деталей среды.

#### Phase 3: Tests

- [ ] Обновить/добавить модульные тесты `PromptBuilder`:
  - [ ] Проверка наличия Node.js globals правила в system prompt.
- [ ] Обновить/добавить модульные тесты `SandboxSessionManager`:
  - [ ] Попытка использования `process`/`process.exit` приводит к `policy_denied`.
  - [ ] Обычная runtime-ошибка (не policy) остаётся `sandbox_runtime_error`.

#### Phase 4: Specs Sync

- [ ] Обновить `docs/specs/code_exec/requirements.md` при изменении формулировок модельной инструкции/классификации.
- [ ] Обновить `docs/specs/code_exec/design.md` по механике runtime mapping.
- [ ] Обновить таблицу покрытия требований в `design.md` при добавлении тестов.

#### Phase 5: Validation

- [ ] Выполнить целевую проверку:
  - [ ] `npm run test:unit -- tests/unit/agents/PromptBuilder.test.ts`
  - [ ] `npm run test:unit -- tests/unit/code_exec/SandboxSessionManager.test.ts`
- [ ] Выполнить полный `npm run validate` после завершения изменений.

---

## Action Plan (for approval)

1. Modify prompt policy in `src/main/agents/PromptBuilder.ts`.
2. Implement sandbox policy error mapping in `src/main/code_exec/SandboxSessionManager.ts`.
3. Add/update unit tests for prompt and runtime classification.
4. Sync `docs/specs/code_exec/*` and run validation.

Expected result: `code_exec` перестаёт давать ложный “сыро-ошибочный” сигнал для Node.js-policy нарушений; модель получает более предсказуемые инструкции и диагностику.

Risks: слишком агрессивный mapping может ошибочно пометить обычные JS ошибки как `policy_denied`; нужен строгий и тестируемый набор сигнатур.
