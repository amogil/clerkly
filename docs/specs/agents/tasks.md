# Список Задач: Reasoning Component Streaming (Issue #39)

## Обзор

Задача: обеспечить корректное использование компонента `Reasoning` в приложении с рабочим streaming-режимом размышлений модели, и в последнюю очередь заменить иконку мозга в trigger на анимированное лого приложения.

Связанная issue: `#39`  
Ссылка: `https://github.com/amogil/clerkly/issues/39`

**Текущий статус:** Фаза 6 — стабилизация runtime streaming reasoning

---

## КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА

- В приложении должен использоваться существующий компонент `Reasoning` из `src/renderer/components/ai-elements/reasoning.tsx`.
- Streaming reasoning должен работать по документации AI Elements: корректное управление `isStreaming` и авто-поведение блока.
- Логика стриминга должна быть привязана к активному LLM-сообщению без побочных эффектов на старые сообщения.
- Замена `BrainIcon` на `Logo` выполняется только после приведения streaming-поведения к целевой картине.
- Не добавлять новые `process.env.*` без отдельного согласования.

### Обязательные ограничения из llm-integration

- `llm-integration.2`: на каждый reasoning-чанк должны сохраняться/доходить события `message.llm.reasoning.updated` и `message.updated`; renderer обязан корректно обновлять reasoning в реальном времени.
- `llm-integration.7.2`: reasoning должен отображаться первым в `kind: llm` сообщении и стримиться в UI до финального action.
- `llm-integration.7.3`: `action.content` отображается после reasoning без нарушения порядка блоков в сообщении.
- `llm-integration.8.5`: сообщения `hidden: true` не отображаются в UI.
- `llm-integration.8.7`: штатная отмена стриминга не создаёт `kind:error`.

### Обязательные требования из документации AI Elements Reasoning

- Использовать компонентный паттерн `Reasoning` + `ReasoningTrigger` + `ReasoningContent` без кастомной замены на другой UI.
- Передавать в `Reasoning` проп `isStreaming` для включения штатного поведения компонента.
- Во время активного стриминга reasoning блок должен автоматически открываться (`auto-open`).
- После завершения стриминга reasoning блок должен автоматически закрываться (`auto-close`) с сохранением возможности ручного раскрытия пользователем.
- Streaming-флаг должен вычисляться по активному сообщению/активному reasoning-part (аналогично документации AI Elements: last message + streaming + last part is reasoning).
- `ReasoningContent` должен рендерить accumulated reasoning-текст модели (не финальный action).

---

## Текущее Состояние

### Выполнено
- ✅ Issue #39 проанализирована.
- ✅ Определена профильная спецификация: `docs/specs/agents/`.
- ✅ Зафиксирован план реализации в отдельном файле задач.
- ✅ Обновлён `docs/specs/agents/design.md` до кодовых изменений (streaming-контракт `Reasoning`, trigger c `Logo`, покрытие тестами).
- ✅ Проверено, что изменений в `docs/specs/agents/requirements.md` не требуется (изменения носят implementation/UI-detail характер, пользовательский контракт сохраняется).
- ✅ Реализован streaming-флаг для активного reasoning-сообщения в `AgentChat`/`AgentMessage`.
- ✅ `Reasoning` получает `isStreaming` в runtime, порядок reasoning/action сохранён.
- ✅ `ReasoningTrigger` переведён с `BrainIcon` на `Logo`.
- ✅ Расширены unit-тесты (`AgentMessage`, `AgentChat`) и существующие regression-тесты transport/hook прогнаны.
- ✅ Добавлен и пройден функциональный тест `llm-chat.spec.ts`: иконка приложения в reasoning trigger + toggle.
- ✅ Запущен `npm run validate` — успешно.

### В Работе
- 🔄 Ожидание подтверждения пользователя на реальном окружении после runtime-правки стриминга reasoning.
- 🔄 Исправление регрессии: reasoning-дельты дублируются в реальном OpenAI stream.
- 🔄 Удаление лишнего нижнего `...`-индикатора, когда reasoning уже отображается в стриминге.
- 🔄 Полное отключение верхнего Message Avatar в сообщениях чата.

### Запланировано

#### Фаза 1: Обновление спецификаций (до кода)

- [x] Сначала обновить `docs/specs/agents/design.md` под целевое поведение `Reasoning` в streaming-режиме.
- [x] Проверить необходимость изменений в `docs/specs/agents/requirements.md` и обновить при изменении пользовательского поведения.
- [x] Обновить карту покрытия требований тестами в `design.md`.
- [x] Получить явное подтверждение, что спецификации согласованы, и только после этого переходить к коду.

#### Фаза 2: Streaming-поведение Reasoning в чате (код)

- [x] Прокинуть состояние стриминга из `useAgentChat` в рендер сообщений чата.
- [x] Передавать `isStreaming` в `Reasoning` для корректного авто-open/auto-close поведения по документации.
- [x] Ограничить streaming-флаг активным LLM-сообщением, чтобы не затрагивать исторические reasoning-блоки.
- [x] Проверить, что порядок блоков в `kind: llm` не нарушен: reasoning сверху, action ниже (соответствие `llm-integration.7.2-7.3`).
- [x] Проверить, что `hidden` сообщения по-прежнему не попадают в UI при стриминге/отмене (`llm-integration.8.5`).

#### Фаза 3: Визуальный trigger (последний шаг)

- [x] В `ReasoningTrigger` заменить `BrainIcon` на `Logo` из `src/renderer/components/logo.tsx`.
- [x] Сохранить читаемость trigger (иконка + текст + chevron) и текущую доступность.
- [x] Сохранить штатную логику trigger (раскрытие/сворачивание reasoning) без изменений API компонента.

#### Фаза 4: Тесты

- [x] Обновить unit-тесты для `AgentMessage` под streaming/non-streaming сценарии reasoning.
- [x] Проверить, что тесты транспорта/рендера не имеют регрессий.
- [x] Проверить в unit-тестах, что отмена стриминга не порождает `kind:error` в UI-флоу (`llm-integration.8.7`).
- [x] Проверить, что reasoning остаётся первым блоком относительно action при наличии обоих (`llm-integration.7.2-7.3`).
- [x] Добавить функциональный тест для trigger UI (иконка приложения + toggle reasoning).

### План плотного покрытия тестами

#### Модульные тесты (обязательно)

- [ ] `tests/unit/components/agents/AgentMessage.test.tsx`
  - [x] `Reasoning` рендерится при наличии `data.reasoning.text`.
  - [x] `Reasoning` получает `isStreaming=true` только для активного streaming-сценария.
  - [x] `Reasoning` получает `isStreaming=false` для завершённых/исторических сообщений.
  - [x] Порядок блоков: `message-llm-reasoning` выше `message-llm-action`.
  - [x] При отсутствии reasoning рендерится только `action.content` (без отдельного loading-блока).

- [ ] `tests/unit/renderer/IPCChatTransport.test.ts`
  - [x] `reasoning-start/delta/end` приходят в корректном порядке до `text-start`.
  - [x] При отсутствии reasoning не создаются reasoning chunks.
  - [x] При скрытии `hidden: true` поток корректно завершается без лишних чанков.

- [ ] `tests/unit/hooks/useAgentChat.test.ts`
  - [x] `isStreaming` корректно отражает `submitted/streaming`.
  - [x] `cancelCurrentRequest()` останавливает поток и не эскалирует ошибку как toast/error.

#### Функциональные тесты (обязательно)

- [ ] `tests/functional/llm-chat.spec.ts`
  - [x] streaming reasoning отображается в UI до финального action.
  - [x] reasoning визуально расположен выше action (уже есть, при необходимости усилить assertions).
  - [x] при отмене через stop не появляется `kind:error`.
  - [x] hidden `llm` после отмены не отображается в чате.
  - [x] после завершения reasoning/action не возникает toast-ошибок (`testing.12`).

- [ ] Новый/дополнительный функциональный сценарий для trigger UI
  - [x] в reasoning trigger отображается иконка приложения (не brain).
  - [x] trigger раскрывает/сворачивает reasoning контент при клике.

#### Критерий полноты покрытия

- [x] Покрыты позитивные, негативные и пограничные сценарии стриминга reasoning.
- [x] Каждый сценарий сопоставлен с требованиями `llm-integration.2`, `7.2`, `7.3`, `8.5`, `8.7`.
- [x] Все новые тесты соответствуют правилам `testing.10`, `testing.11`, `testing.12`.

#### Фаза 5: Валидация и завершение

- [x] Запустить релевантные unit-тесты.
- [x] Запустить `npm run validate`.
- [ ] После завершения спросить пользователя о запуске functional-тестов (окна на экране).

#### Фаза 6: Стабилизация runtime reasoning streaming (после обратной связи)

- [x] Зафиксировать в design.md требование к устойчивому парсингу reasoning-событий OpenAI.
- [x] Расширить парсинг reasoning в `OpenAIProvider` для альтернативных event-shape без привязки к одному типу delta.
- [x] Добавить unit-тесты на дополнительные SSE-форматы reasoning (включая nested part/item).
- [x] Прогнать таргетные unit-тесты и `npm run validate`.
- [x] Добавить нормализацию/dedup reasoning-чанков (delta + snapshot) на входе `OpenAIProvider`.
- [x] Добавить unit-тесты на отсутствие дублирования reasoning при повторных snapshot-событиях.
- [x] Уточнить рендер `AgentMessage`: не показывать `message-llm-loading`, если reasoning уже присутствует и action ещё не пришёл.
- [x] Добавить unit-тест на отсутствие нижнего loading-индикатора при streaming reasoning.
- [x] Уточнить рендер `AgentMessage`: не показывать верхний `Message Avatar` в сообщениях чата.
- [x] Обновить requirements/design под правило "верхний Message Avatar отключён, маркер reasoning — только в `ReasoningTrigger`".
- [x] Удалить устаревший контракт `showAvatar/agentStatus` из `AgentMessage` и вызовов.
- [x] Добавить тесты на состав trigger по `agents.4.11` (иконка приложения + текст + chevron).

---

## Критерии Готовности

- [x] В чате используется компонент `Reasoning` с корректным streaming-поведением.
- [x] Размышления модели стримятся в `Reasoning` без регрессий.
- [x] `ReasoningTrigger` использует анимированное лого приложения вместо `BrainIcon`.
- [x] Поведение UI соответствует `llm-integration.2`, `llm-integration.7.2`, `llm-integration.7.3`, `llm-integration.8.5`, `llm-integration.8.7`.
- [x] Поведение `Reasoning` соответствует документации AI Elements (`isStreaming`, auto-open, auto-close, ручной toggle).
- [x] Релевантные тесты и `npm run validate` проходят успешно.
