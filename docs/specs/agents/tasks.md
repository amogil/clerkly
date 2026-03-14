# Список задач: Agents — Issue #57 (`Auto-generate agent name`)

## Обзор

Цель (фокус Issue #57): реализовать автоматическое именование агента через LLM в рамках обычного ответа модели (без отдельного LLM-запроса) с потоковым парсингом markdown-комментария и anti-flapping guard.

**Scope PR:**
- Основной: auto-title pipeline по Issue #57.
- Сопутствующий (ограниченный): UI-fix рендера Markdown/KaTeX в `tool_call(final_answer)` checklist (`summary_points`).

**Почему сопутствующий scope включён в этот PR (согласовано):**
- использует тот же LLM chat-flow и те же prompt-контракты;
- потребовал синхронных изменений в prompt, тестах и спеках;
- локализован в `Final Answer`-рендере и не меняет бизнес-логику auto-title.

**Текущий статус:** Фаза 5 — финальная синхронизация и ревью-фиксы

---

## CRITICAL RULES

- Не менять поведение, уже зафиксированное в `agents`/`llm-integration`, без обновления спецификаций.
- Не блокировать отправку/обработку сообщений при ошибках генерации имени.
- Не добавлять ручное переименование в рамках этой задачи.
- Соблюдать изоляцию данных по пользователю при любых rename-операциях.
- Не запускать функциональные тесты без отдельного подтверждения пользователя (они открывают окна).
- Не модифицировать output-stream для пользователя: комментарий остаётся в потоке, rename-логика только читает его.
- В `agents` фиксировать только UI-контракты и отображение persisted-состояния.
- Всю runtime-логику обработки LLM-ответа фиксировать только в `llm-integration`.

---

## Граница Спек

- `docs/specs/agents/*`:
  - только интерфейсное поведение (где и когда пользователь видит новое имя);
  - только реакция UI на существующие persisted/event-обновления (`agent.updated`);
  - без описания parser/state-machine/similarity/cooldown алгоритмов.
- `docs/specs/llm-integration/*`:
  - полный контракт извлечения title из LLM markdown-ответа;
  - parser-логика, лимиты, валидация, anti-flapping, fallback;
  - orchestration в `MainPipeline` и условия применения rename.

---

## Текущее состояние

### Выполнено
- ✅ Получен контекст задачи из GitHub: issue #57 `Auto-generate agent name`.
- ✅ Определены профильные спецификации: `agents`, `llm-integration`, `realtime-events`, `testing-infrastructure`.
- ✅ Обновлены спеки по UI-части (`agents`) и LLM-логике (`llm-integration`) под:
  - ✅ markdown-рендер пунктов `Final Answer`;
  - ✅ unified metadata-tag для auto-title (`title + rename_need_score` в одном теге);
  - ✅ score-based guard (`rename_need_score >= 80`) вместо similarity-guard.
- ✅ Синхронизированы сценарии тестирования в требованиях/дизайне.
- ✅ Реализован runtime unified metadata-tag (`title + rename_need_score`) в `MainPipeline`.
- ✅ Добавлены/обновлены unit-тесты и functional-тесты по auto-title flow.
- ✅ Реализован рендер markdown в `tool_call(final_answer)` checklist (`summary_points`) и покрыт тестами.
- ✅ Добавлена явная prompt-инструкция для `final_answer.summary_points`:
  - Markdown (GFM) разрешён;
  - математические выражения опциональны, но при использовании требуют `$...$`/`$$...$$`.
- ✅ Добавлен functional-тест: `should render math inside tool_call(final_answer) checklist item`.

### В работе
- 🔄 Обработка замечаний ревью в PR.

### Запланировано

#### Фаза 1: Обновление спецификаций

- [x] Обновить `docs/specs/agents/requirements.md`.
- [x] Обновить `docs/specs/agents/design.md`.
- [x] Обновить `docs/specs/llm-integration/requirements.md`.
- [x] Обновить `docs/specs/llm-integration/design.md`.
- [x] Актуализировать `docs/specs/agents/tasks.md`.

#### Фаза 2: Алгоритм (runtime)

- [x] Зафиксировать и реализовать алгоритм обработки unified metadata-тега в `MainPipeline`:
  - [x] Инкрементальный parser по префиксу `<!-- clerkly:title-meta:`.
  - [x] Захват payload до `-->` или `TITLE_META_PAYLOAD_MAX_LENGTH = 260`.
  - [x] JSON-парсинг payload (`title`, `rename_need_score`) и валидация.
  - [x] Применение rename только при `rename_need_score >= 80` и прохождении guard-ов.
  - [x] Отказоустойчивость: ошибки не ломают основной turn.

#### Фаза 3: Реализация (по модулям)

- [x] Обновить runtime-модули (`MainPipeline`, `AgentTitleRuntime`, prompt builder) под unified tag.
- [x] Обновить рендер `Final Answer`: markdown в `summary_points`.
- [x] Проверить публикацию `agent.updated` и отражение в UI.

#### Фаза 4: Тесты

- [x] Добавить/обновить unit-тесты:
  - [x] parser unified metadata-тега;
  - [x] валидация `rename_need_score`;
  - [x] integration для rename-flow с новым контрактом.
- [x] Добавить/обновить functional-тесты:
  - [x] markdown в `Final Answer`;
  - [x] math в `Final Answer`;
  - [x] single-tag extraction (`title + score`);
  - [x] порог `rename_need_score` и invalid score.

#### Фаза 5: Валидация и завершение

- [x] Прогнать релевантные unit-тесты по затронутым модулям.
- [ ] Прогнать `npm run validate`.
- [x] Запустить релевантные functional-тесты по `final_answer`/markdown/math сценариям.

---

## Критерии готовности к завершению PR

- Спеки синхронизированы с кодом и тестами: **YES**.
- Открытые замечания ревью обработаны: **IN PROGRESS**.
