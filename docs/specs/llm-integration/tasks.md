# Список задач: LLM Integration

## Обзор

Цель текущего пакета работ: привести фактическое runtime-поведение LLM loop и обработку служебного auto-title metadata comment в соответствие с обновлёнными спецификациями `llm-integration`.

**Текущий статус:** Фаза 1 — частично выполнены prompt/spec guards для `final_answer`

---

## CRITICAL RULES

- Не менять пользовательский chat-flow без синхронизации `requirements.md` и `design.md`.
- Не оставлять расхождение между provider loop contract в спецификациях и фактическим runtime-кодом.
- Служебный comment `<!-- clerkly:title-meta: ... -->` должен существовать только в обычном текстовом ответе модели и не должен становиться пользовательским контентом.
- Не запускать functional tests без отдельного подтверждения пользователя.

---

## Текущее состояние

### Выполнено
- ✅ Выявлено расхождение между `llm-integration` specs и фактическим provider loop contract.
- ✅ Выявлено, что новый UI/spec запрет на служебные metadata comments ещё не доведён до всех user-visible tool payloads.
- ✅ Сформирован согласованный план приведения runtime в соответствие спекам.
- ✅ Добавлено prompt/spec правило: при завершении через `final_answer` модель не должна сначала дублировать тот же итог обычным markdown/text summary.
- ✅ Добавлен runtime guard: markdown/text summary, эквивалентный `final_answer.summary_points`, подавляется до персиста как duplicate completion output.
- ✅ Добавлены unit/functional regressions на duplicate markdown summary перед `final_answer`.

### В работе
- 🔄 Подготовлен профильный checklist-план для последующей реализации.
- 🔄 Остальные runtime/UI расхождения из checklist пока не реализованы.

### Запланировано

#### Фаза 1: Синхронизация loop contract

- [ ] Привести `llm-integration` loop contract к фактическому runtime.
  - [ ] Обновить `docs/specs/llm-integration/design.md`.
  - [ ] При необходимости обновить `docs/specs/llm-integration/requirements.md`.
  - [ ] Зафиксировать текущую реализацию честно: provider-layer использует большой safety step cap, а не semantic stop по `final_answer`.
  - [ ] Либо, если сохраняется semantic contract, отдельно изменить код провайдеров под этот контракт.

#### Фаза 2: Runtime защита metadata comments

- [ ] Довести runtime до нового правила про metadata comments во всех user-visible tool payloads.
  - [ ] Расширить валидацию в `src/main/agents/MainPipeline.ts`.
  - [ ] Блокировать служебный `<!-- clerkly:title-meta: ... -->` не только в `final_answer.summary_points`, но и в других tool payload fields, попадающих в чат.
  - [ ] Минимум покрыть `code_exec.task_summary`, который сейчас рендерится напрямую.

#### Фаза 3: Renderer defense-in-depth

- [ ] Добавить renderer-side защиту от служебных metadata comments.
  - [ ] Обновить `src/renderer/components/agents/AgentMessage.tsx`.
  - [ ] Скрывать/фильтровать `clerkly:title-meta` comments перед отображением user-visible tool text.
  - [ ] Не полагаться только на renderer: использовать это как страховку для historical payloads и regressions.

#### Фаза 4: Тесты

- [ ] Обновить unit tests для main/runtime слоя.
  - [ ] Добавить кейсы в `tests/unit/agents/MainPipeline.test.ts` не только для `final_answer`, но и для других tool payloads с embedded `title-meta`.
- [ ] Обновить renderer unit tests.
  - [ ] Добавить кейсы в `tests/unit/components/agents/AgentMessage.test.tsx`.
  - [ ] Проверить, что renderer не показывает служебный comment даже для уже persisted payload.
- [ ] При изменении loop contract обновить provider tests в `tests/unit/llm/*`.
- [ ] Добавить functional regression в `tests/functional/llm-chat.spec.ts`.
  - [ ] Сценарий, где metadata comment приходит внутри другого tool payload.
  - [ ] Проверить, что UI его не показывает или turn корректно валидируется по целевому контракту.

#### Фаза 5: Валидация

- [ ] Прогнать `npm run rebuild:node`.
- [ ] Прогнать релевантные unit tests по `MainPipeline`, `AgentMessage`, провайдерам при необходимости.
- [ ] Прогнать `npm run validate`.
- [ ] После завершения запросить подтверждение на functional tests.
