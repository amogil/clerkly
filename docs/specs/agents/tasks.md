# Список Задач: Reasoning Component Streaming (Issue #39)

## Обзор

Задача: обеспечить корректное использование компонента `Reasoning` в приложении с рабочим streaming-режимом размышлений модели, и в последнюю очередь заменить иконку мозга в trigger на анимированное лого приложения.

Связанная issue: `#39`  
Ссылка: `https://github.com/amogil/clerkly/issues/39`

**Текущий статус:** Планирование

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

### В Работе
- Нет активных задач.

### Запланировано

#### Фаза 1: Обновление спецификаций (до кода)

- [ ] Сначала обновить `docs/specs/agents/design.md` под целевое поведение `Reasoning` в streaming-режиме.
- [ ] Проверить необходимость изменений в `docs/specs/agents/requirements.md` и обновить при изменении пользовательского поведения.
- [ ] Обновить карту покрытия требований тестами в `design.md`.
- [ ] Получить явное подтверждение, что спецификации согласованы, и только после этого переходить к коду.

#### Фаза 2: Streaming-поведение Reasoning в чате (код)

- [ ] Прокинуть состояние стриминга из `useAgentChat` в рендер сообщений чата.
- [ ] Передавать `isStreaming` в `Reasoning` для корректного авто-open/auto-close поведения по документации.
- [ ] Ограничить streaming-флаг активным LLM-сообщением, чтобы не затрагивать исторические reasoning-блоки.
- [ ] Проверить, что порядок блоков в `kind: llm` не нарушен: reasoning сверху, action ниже (соответствие `llm-integration.7.2-7.3`).
- [ ] Проверить, что `hidden` сообщения по-прежнему не попадают в UI при стриминге/отмене (`llm-integration.8.5`).

#### Фаза 3: Визуальный trigger (последний шаг)

- [ ] В `ReasoningTrigger` заменить `BrainIcon` на `Logo` из `src/renderer/components/logo.tsx`.
- [ ] Сохранить читаемость trigger (иконка + текст + chevron) и текущую доступность.
- [ ] Сохранить штатную логику trigger (раскрытие/сворачивание reasoning) без изменений API компонента.

#### Фаза 4: Тесты

- [ ] Обновить unit-тесты для `AgentMessage` под streaming/non-streaming сценарии reasoning.
- [ ] При необходимости добавить unit-тест для `ReasoningTrigger` (рендер иконки/базовое поведение).
- [ ] Проверить, что тесты транспорта/рендера не имеют регрессий.
- [ ] Проверить в unit-тестах, что отмена стриминга не порождает `kind:error` в UI-флоу (`llm-integration.8.7`).
- [ ] Проверить, что reasoning остаётся первым блоком относительно action при наличии обоих (`llm-integration.7.2-7.3`).

### План плотного покрытия тестами

#### Модульные тесты (обязательно)

- [ ] `tests/unit/components/agents/AgentMessage.test.tsx`
  - [ ] `Reasoning` рендерится при наличии `data.reasoning.text`.
  - [ ] `Reasoning` получает `isStreaming=true` только для активного streaming-сценария.
  - [ ] `Reasoning` получает `isStreaming=false` для завершённых/исторических сообщений.
  - [ ] Порядок блоков: `message-llm-reasoning` выше `message-llm-action`.
  - [ ] При отсутствии reasoning рендерится только action/loading.

- [ ] `tests/unit/components/ai-elements/reasoning*.test.tsx` (новый или расширение существующего)
  - [ ] `ReasoningTrigger` рендерит `Logo` вместо `BrainIcon`.
  - [ ] При `isStreaming=true` блок автоматически открыт.
  - [ ] После перехода `isStreaming: true -> false` блок автоматически закрывается.
  - [ ] Ручное раскрытие/сворачивание не ломается.

- [ ] `tests/unit/renderer/IPCChatTransport.test.ts`
  - [ ] `reasoning-start/delta/end` приходят в корректном порядке до `text-start`.
  - [ ] При отсутствии reasoning не создаются reasoning chunks.
  - [ ] При скрытии `hidden: true` поток корректно завершается без лишних чанков.

- [ ] `tests/unit/hooks/useAgentChat.test.ts`
  - [ ] `isStreaming` корректно отражает `submitted/streaming`.
  - [ ] `cancelCurrentRequest()` останавливает поток и не эскалирует ошибку как toast/error.

#### Функциональные тесты (обязательно)

- [ ] `tests/functional/llm-chat.spec.ts`
  - [ ] streaming reasoning отображается в UI до финального action.
  - [ ] reasoning визуально расположен выше action (уже есть, при необходимости усилить assertions).
  - [ ] при отмене через stop не появляется `kind:error`.
  - [ ] hidden `llm` после отмены не отображается в чате.
  - [ ] после завершения reasoning/action не возникает toast-ошибок (`testing.12`).

- [ ] Новый/дополнительный функциональный сценарий для trigger UI
  - [ ] в reasoning trigger отображается иконка приложения (не brain).
  - [ ] trigger раскрывает/сворачивает reasoning контент при клике.

#### Критерий полноты покрытия

- [ ] Покрыты позитивные, негативные и пограничные сценарии стриминга reasoning.
- [ ] Каждый сценарий сопоставлен с требованиями `llm-integration.2`, `7.2`, `7.3`, `8.5`, `8.7`.
- [ ] Все новые тесты соответствуют правилам `testing.10`, `testing.11`, `testing.12`.

#### Фаза 5: Валидация и завершение

- [ ] Запустить релевантные unit-тесты.
- [ ] Запустить `npm run validate`.
- [ ] После завершения спросить пользователя о запуске functional-тестов (окна на экране).

---

## Критерии Готовности

- [ ] В чате используется компонент `Reasoning` с корректным streaming-поведением.
- [ ] Размышления модели стримятся в `Reasoning` без регрессий.
- [ ] `ReasoningTrigger` использует анимированное лого приложения вместо `BrainIcon`.
- [ ] Поведение UI соответствует `llm-integration.2`, `llm-integration.7.2`, `llm-integration.7.3`, `llm-integration.8.5`, `llm-integration.8.7`.
- [ ] Поведение `Reasoning` соответствует документации AI Elements (`isStreaming`, auto-open, auto-close, ручной toggle).
- [ ] Релевантные тесты и `npm run validate` проходят успешно.
