# Список задач: Agents — Issue #57 (`Auto-generate agent name`)

## Обзор

Цель: реализовать автоматическое именование агента через LLM в рамках обычного ответа модели (без отдельного LLM-запроса) с потоковым парсингом markdown-комментария и anti-flapping guard.

**Текущий статус:** Фаза 1 завершена (спеки), ожидание согласования кода

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
- ✅ Синхронизированы сценарии тестирования в требованиях/дизайне (без реализации тестов в коде).

### В работе
- 🔄 Ожидание согласования перед переходом к реализации в коде.

### Запланировано

#### Фаза 1: Обновление спецификаций (до кода)

- [x] Обновить `docs/specs/agents/requirements.md`.
- [x] Обновить `docs/specs/agents/design.md`.
- [x] Обновить `docs/specs/llm-integration/requirements.md`.
- [x] Обновить `docs/specs/llm-integration/design.md`.
- [x] Актуализировать `docs/specs/agents/tasks.md`.

#### Фаза 2: Алгоритм (runtime)

- [ ] Зафиксировать и реализовать алгоритм обработки unified metadata-тега в `MainPipeline`:
  - [ ] Инкрементальный parser по префиксу `<!-- clerkly:title-meta:`.
  - [ ] Захват payload до `-->` или `TITLE_META_PAYLOAD_MAX_LENGTH = 260`.
  - [ ] JSON-парсинг payload (`title`, `rename_need_score`) и валидация.
  - [ ] Применение rename только при `rename_need_score >= 80` и прохождении guard-ов.
  - [ ] Отказоустойчивость: ошибки не ломают основной turn.

#### Фаза 3: Реализация (по модулям)

- [ ] Обновить runtime-модули (`MainPipeline`, `AgentTitleRuntime`, prompt builder) под unified tag.
- [ ] Обновить рендер `Final Answer`: markdown в `summary_points`.
- [ ] Проверить публикацию `agent.updated` и отражение в UI.

#### Фаза 4: Тесты

- [ ] Добавить/обновить unit-тесты:
  - [ ] parser unified metadata-тега;
  - [ ] валидация `rename_need_score`;
  - [ ] integration для rename-flow с новым контрактом.
- [ ] Добавить/обновить functional-тесты:
  - [ ] markdown в `Final Answer`;
  - [ ] single-tag extraction (`title + score`);
  - [ ] порог `rename_need_score` и invalid score.

#### Фаза 5: Валидация и завершение

- [ ] Прогнать релевантные unit-тесты по затронутым модулям.
- [ ] Прогнать `npm run validate`.
- [ ] После подтверждения пользователя запустить функциональные тесты.

---

## Критерии готовности к переходу в код

- Plan approved: **YES**.
