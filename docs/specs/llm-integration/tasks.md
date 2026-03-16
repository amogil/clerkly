# Список задач: LLM Integration

## Обзор

Единый план незавершённых работ по LLM/runtime слою. Этот документ является единственным source of truth для оставшихся задач, связанных с:
- orchestration и loop contract `llm-integration`;
- runtime/prompt/renderer обработкой служебных metadata comments;
- оставшимися follow-up задачами после Issue #65 (`sandbox-http-request`) в части LLM/code_exec интеграции;
- миграцией `code_exec` renderer на стандартный AI Elements `Tool` contract.

**Текущий статус:** Фаза 4 — Tool Contract Migration

---

## CRITICAL RULES

- Не оставлять расхождение между `llm-integration` specs, runtime-кодом и tests.
- Не дублировать незавершённые task-plans в профильных подспеках; все открытые пункты фиксируются только здесь.
- Служебный comment `<!-- clerkly:title-meta: ... -->` должен существовать только в обычном текстовом ответе модели и не должен становиться пользовательским контентом.
- `code_exec` UI не должен расходиться с официальным AI Elements `Tool` contract без явно зафиксированной причины.
- Не запускать полный `npm run test:functional` без отдельного подтверждения пользователя.

---

## Текущее состояние

### Выполнено
- ✅ Выявлено расхождение между `llm-integration` specs и фактическим provider loop contract.
- ✅ Выявлено, что запрет на служебные metadata comments ещё не доведён до всех user-visible tool payloads.
- ✅ Добавлено prompt/spec правило: при завершении через `final_answer` модель не должна сначала дублировать тот же итог обычным markdown/text summary.
- ✅ Добавлен runtime guard: markdown/text summary, эквивалентный `final_answer.summary_points`, подавляется до персиста как duplicate completion output.
- ✅ Добавлены unit/functional regressions на duplicate markdown summary перед `final_answer`.
- ✅ Issue #65 реализован как sandbox helper `http_request` внутри экосистемы `code_exec`, а не как main-pipeline tool.
- ✅ Для `tool_call(code_exec)` добавлен отдельный renderer block `error` для structured `output.error`.
- ✅ Выявлено, что текущий локальный `Tool` wrapper разошёлся с официальным AI Elements `Tool` collapsible contract.
- ✅ Фаза 1 завершена: `llm-integration` requirements/design синхронизированы с текущим provider loop contract и явно фиксируют documented safety step cap вместо semantic stop по `final_answer`.
- ✅ Фаза 2 завершена: `MainPipeline` блокирует `<!-- clerkly:title-meta: ... -->` в string-полях аргументов tool_call до persist; минимум покрыт `code_exec.task_summary`, а unit-regressions добавлены.
- ✅ Фаза 3 завершена: renderer удаляет `<!-- clerkly:title-meta: ... -->` из persisted historical tool payload text перед отображением; добавлены unit-regressions для `code_exec` и `final_answer`.

### В работе
- 🔄 Фаза 4: миграция `code_exec` renderer на стандартный AI Elements `Tool` contract.

### Запланировано

#### Фаза 2: Runtime защита metadata comments

- [x] Довести runtime до правила про metadata comments во всех user-visible tool payloads.
  - [x] Расширить валидацию в `src/main/agents/MainPipeline.ts`.
  - [x] Блокировать служебный `<!-- clerkly:title-meta: ... -->` не только в `final_answer.summary_points`, но и в других tool payload fields, попадающих в чат.
  - [x] Минимум покрыть `code_exec.task_summary`, который сейчас рендерится напрямую.

#### Фаза 3: Renderer defense-in-depth

- [x] Добавить renderer-side защиту от служебных metadata comments.
  - [x] Обновить `src/renderer/components/agents/AgentMessage.tsx`.
  - [x] Скрывать/фильтровать `clerkly:title-meta` comments перед отображением user-visible tool text.
  - [x] Не полагаться только на renderer: использовать это как страховку для historical payloads и regressions.

#### Фаза 4: Tool Contract Migration

- [ ] Привести локальный vendored `Tool` к официальному AI Elements `Tool` contract.
  - [x] Обновить `Tool` через официальный AI Elements CLI (`npx ai-elements@latest add tool`), а не ручными правками vendored компонента.
  - [ ] Синхронизировать `src/renderer/components/ai-elements/tool.tsx` с upstream API.
  - [ ] Синхронизировать `src/components/ai-elements/tool.tsx` с тем же contract.
  - [ ] Зафиксировать policy для CLI-generated renderer vendor directories: `src/renderer/components/ui/**` и `src/renderer/components/ai-elements/**` не должны автоматически переписываться локальными ESLint/Prettier правилами репо.
  - [ ] Зафиксировать в `docs/specs/agents/design.md`, что `code_exec` использует стандартный `Tool` collapsible pattern, а не внешний ручной wrapper.

- [ ] Перевести `code_exec` renderer на стандартный `Tool` usage.
  - [ ] Убрать внешний ручной `Collapsible` вокруг `Tool` в `src/renderer/components/agents/AgentMessage.tsx`.
  - [ ] Использовать `Tool` как root, `ToolHeader` как trigger, `ToolContent` как content.
  - [ ] Удалить временные workaround-правки, ставшие ненужными после миграции.
  - [ ] Проверить, что hidden content больше не мешает toggle/header hit area в collapsed state.

- [ ] Синхронизировать tests под новый `Tool` contract.
  - [ ] Обновить `tests/unit/components/agents/AgentMessage.test.tsx`.
  - [ ] Обновить `tests/functional/code_exec.spec.ts`.
  - [ ] Проверить, что cycle `expand -> collapse -> reopen` стабильно работает без hidden interactive artifacts.

#### Фаза 5: Sandbox HTTP Request Follow-up

- [ ] Закрыть оставшийся follow-up по `sandbox-http-request`.
  - [ ] После завершения релевантных runtime/UI изменений запросить подтверждение пользователя на полный `npm run test:functional`.
  - [ ] При необходимости обновить traceability в `docs/specs/sandbox-http-request/requirements.md` и `docs/specs/sandbox-http-request/design.md`, не создавая отдельный `tasks.md`.

#### Фаза 6: Тесты

- [ ] Обновить unit tests для main/runtime слоя.
  - [ ] Добавить кейсы в `tests/unit/agents/MainPipeline.test.ts` не только для `final_answer`, но и для других tool payloads с embedded `title-meta`.
- [ ] Обновить renderer unit tests.
  - [ ] Добавить кейсы в `tests/unit/components/agents/AgentMessage.test.tsx`.
  - [ ] Проверить, что renderer не показывает служебный comment даже для уже persisted payload.
- [ ] При изменении loop contract обновить provider tests в `tests/unit/llm/*`.
- [ ] Добавить functional regression в `tests/functional/llm-chat.spec.ts`.
  - [ ] Сценарий, где metadata comment приходит внутри другого tool payload.
  - [ ] Проверить, что UI его не показывает или turn корректно валидируется по целевому контракту.

#### Фаза 7: Валидация

- [ ] Прогнать `npm run rebuild:node`.
- [ ] Прогнать релевантные unit tests по `MainPipeline`, `AgentMessage`, провайдерам при необходимости.
- [ ] Прогнать `npm run validate`.
- [ ] После завершения запросить подтверждение на functional tests.
