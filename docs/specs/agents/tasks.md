# Список задач: Agents — Issue #57 (`Auto-generate agent name`)

## Обзор

Цель: реализовать автоматическое именование агента через LLM в рамках обычного ответа модели (без отдельного LLM-запроса) с потоковым парсингом markdown-комментария и anti-flapping guard.

**Текущий статус:** Фаза 5 — В работе

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
- ✅ Проверены текущие точки расширения в коде: `AgentIPCHandlers`, `AgentManager`, `MessageManager`, `MainPipeline`, `ILLMProvider`.
- ✅ Согласован целевой протокол в ответе LLM: `<!-- clerkly:title: ... -->`.
- ✅ Согласованы лимиты: max payload comment = 200, max agent title = 200.
- ✅ Реализован runtime-модуль `AgentTitleRuntime` (parser `search/capture`, normalizer, Jaccard/cooldown guards).
- ✅ Интегрирован auto-title в `MainPipeline` без отдельного LLM-вызова и без модификации output-stream.
- ✅ Подключено переименование через существующий путь `AgentManager.update(...)` в `src/main/index.ts`.
- ✅ Добавлены модульные тесты:
  - ✅ `tests/unit/agents/AgentTitleCommentParser.test.ts`
  - ✅ `tests/unit/agents/AgentTitleNormalization.test.ts`
  - ✅ `tests/unit/agents/AgentTitleAntiFlap.test.ts`
  - ✅ расширение `tests/unit/agents/MainPipeline.test.ts` для rename-flow.
- ✅ Добавлены функциональные сценарии в `tests/functional/llm-chat.spec.ts`:
  - ✅ извлечение title из markdown-comment в том же turn;
  - ✅ игнорирование незакрытого comment при payload > 200;
  - ✅ anti-flap для семантически близкого названия.
- ✅ Прогнаны релевантные unit-тесты по новым модулям.
- ✅ Прогнан `npm run validate` (успешно).

### В работе
- 🔄 Подготовка к запуску функциональных тестов после отдельного подтверждения пользователя.

### Запланировано

#### Фаза 1: Обновление спецификаций (до кода)

- [x] Обновить `docs/specs/agents/requirements.md`:
  - [x] Добавить/уточнить только UI-требования для auto-title (без описания внутреннего LLM-парсинга).
  - [x] Зафиксировать EARS-критерии для:
    - [x] где именно в UI отображается новое имя (header/list/all-agents);
    - [x] что при отсутствии/ошибке авто-именования UI остаётся стабильным и чат не блокируется;
    - [x] что название не должно часто "дребезжать" в UI при близких ответах.
  - [x] Добавить ссылки на функциональные тесты для новых сценариев.
- [x] Обновить `docs/specs/agents/design.md`:
  - [x] Описать только UI data-flow: как `agent.updated` отражается во всех местах интерфейса.
  - [x] Описать отсутствие дополнительных UI-событий/видимых артефактов от meta-comment.
  - [x] Обновить Testing Strategy и Requirements Coverage.
- [x] Обновить `docs/specs/llm-integration/{requirements,design}.md`:
  - [x] Зафиксировать контракт title-метаданных в markdown-stream (`<!-- clerkly:title: ... -->`).
  - [x] Зафиксировать, что отдельный LLM-вызов для title не выполняется (встроенная обработка в обычном turn).
  - [x] Зафиксировать parser-правила: первое вхождение, `capture` до `-->` или лимита 200.
  - [x] Зафиксировать валидацию title (max 200) и anti-flapping правила.
- [x] При необходимости обновить `docs/specs/realtime-events/design.md`:
  - [x] Подтверждено, что rename использует существующий `agent.updated` snapshot flow без новых UI-событий; изменений спецификации не требуется.

#### Фаза 2: Алгоритм (runtime)

- [x] Зафиксировать и реализовать целевой алгоритм (в `llm-integration` спеках и runtime-коде):
  - [x] `MainPipeline` запускается по обычному `messages:create(kind:user)` (без отдельного title-run).
  - [x] В ассистент-stream ищется первое вхождение `<!-- clerkly:title:`.
  - [x] После обнаружения parser входит в `capture` и читает payload до:
    - [x] закрывающего `-->`, ИЛИ
    - [x] `TITLE_COMMENT_PAYLOAD_MAX_LENGTH = 200`.
  - [x] Если `-->` найден до лимита:
    - [x] извлечь candidate title,
    - [x] не изменять output-stream для пользователя,
    - [x] продолжить обычный stream.
  - [x] Если достигнут лимит 200 без `-->`:
    - [x] считать мета-блок невалидным,
    - [x] не выполнять rename,
    - [x] продолжить обычный stream.
  - [x] Применять только первое валидное title-вхождение за turn.
  - [x] Ошибки парсинга/валидации/rename не прерывают turn и не создают блокирующий UI-error.

#### Фаза 3: Реализация (по модулям)

- [x] Добавить утилиту парсинга title-комментария (новый модуль):
  - [x] state machine `search`/`capture`;
  - [x] инкрементальная обработка stream-chunks;
  - [x] возвращает `titleCandidate` + parser-state без модификации текста.
- [x] Добавить утилиту нормализации/валидации title:
  - [x] trim/single-line/collapse spaces/remove edge punctuation;
  - [x] `AGENT_TITLE_MAX_LENGTH = 200`;
  - [x] reject empty/invalid.
- [x] Интегрировать parser в `MainPipeline`:
  - [x] читать text-delta события и кормить parser;
  - [x] фиксировать первое валидное вхождение за turn;
  - [x] вызывать rename-кандидат только после guard-проверок.
- [x] Добавить сервис anti-flap решения:
  - [x] нормализация текущего и нового имени;
  - [x] exact-equality guard;
  - [x] Jaccard similarity по токенам, threshold `0.7`;
  - [x] cooldown: не чаще 1 rename на агента за 5 user-turns.
- [x] Использовать существующий путь обновления:
  - [x] `AgentManager.update(agentId, { name })`;
  - [x] существующее событие `agent.updated`.
- [x] Гарантировать user-data isolation:
  - [x] rename применяется только к агенту текущего пользователя;
  - [x] никакие cross-user данные не читаются и не сравниваются.

#### Фаза 4: Тесты

- [x] Добавить/обновить unit-тесты (расширенное покрытие):
  - [x] parser state-machine:
    - [x] префикс целиком в одном chunk;
    - [x] префикс разбит по нескольким chunk;
    - [x] закрытие `-->` в том же chunk;
    - [x] закрытие `-->` в следующем chunk;
    - [x] достижение лимита 200 без `-->`;
    - [x] несколько комментариев в одном ответе (берётся первый валидный);
    - [x] noise перед/после комментария;
    - [x] неполный комментарий до конца стрима.
  - [x] title normalization/validation:
    - [x] trim + collapse spaces;
    - [x] удаление краевой пунктуации;
    - [x] преобразование в single-line;
    - [x] пустой результат после normalizer;
    - [x] длина ровно 200;
    - [x] длина > 200.
  - [x] anti-flap decision logic:
    - [x] exact-equal после нормализации;
    - [x] similarity выше порога (skip);
    - [x] similarity ниже порога (allow);
    - [x] cooldown по числу turn (5).
  - [x] integration-level unit для `MainPipeline`:
    - [x] rename срабатывает при валидном комментарии;
    - [x] output-stream и persisted llm-текст не искажаются;
    - [x] при invalid comment rename не вызывается;
    - [x] при ошибке rename chat-flow продолжается.
  - [x] unit для `AgentManager` / `AgentIPCHandlers`:
    - [x] rename только для текущего user-agent;
    - [x] `agent.updated` публикуется штатно.
- [x] Добавить/обновить functional-тесты (необходимый минимум):
  - [x] первое осмысленное сообщение переименовывает `New Agent` в UI (header + list + all-agents);
  - [x] whitespace/неосмысленное первое сообщение не переименовывает;
  - [x] комментарий с незакрытым `-->` и payload > 200 не приводит к rename;
  - [x] anti-flap: близкое по смыслу имя не триггерит повторный rename;
  - [x] anti-flap: при заметно новом intent rename происходит после cooldown.
- [x] Во всех новых functional-сценариях соблюдать `testing.10`, `testing.11`, `testing.12`.

#### Фаза 5: Валидация и завершение

- [x] Прогнать релевантные unit-тесты по затронутым модулям.
- [x] Прогнать `npm run validate`.
- [ ] После подтверждения пользователя запустить функциональные тесты.
- [x] Обновить этот `tasks.md` по факту выполнения (Completed/In Progress/Current status).

---

## Критерии готовности к переходу в код

- Plan approved: **YES**.
