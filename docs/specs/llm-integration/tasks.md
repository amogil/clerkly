# Список задач: LLM Integration

## Обзор

Единый план незавершённых работ по LLM/runtime слою. Этот документ является единственным source of truth для оставшихся задач, связанных с:
- orchestration и loop contract `llm-integration`;
- runtime/prompt/renderer обработкой служебных metadata comments;
- оставшимися follow-up задачами после Issue #65 (`sandbox-http-request`) в части LLM/code_exec интеграции;
- миграцией `code_exec` renderer на стандартный AI Elements `Tool` contract.

**Текущий статус:** Фаза 5 — Awaiting full functional suite approval

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
- ✅ Обновлённые AI Elements загружены через каноническую команду `npm run ai-elements:update-all`.
- ✅ Generic `tool_call` renderer переведён на новый AI Elements `Tool` contract (`Tool` / `ToolHeader` / `ToolContent` / `ToolInput` / `ToolOutput`).
- ✅ `code_exec` renderer переведён на композицию `Tool` / custom `code_exec` header trigger / `ToolContent` с сохранением стандартной toggle hit-area.
- ✅ `PromptInput` интегрирован с текущим renderer-конфигом: test JSX runtime и unit tests адаптированы под свежую CLI-версию без ручной правки vendored файла.
- ✅ В renderer root добавлен единый `TooltipProvider` для обновлённых AI Elements.
- ✅ CLI-generated vendor scope (`src/renderer/components/ui/**`, `src/renderer/components/ai-elements/**`) исключён из локального ESLint/Prettier auto-rewrite.
- ✅ User-facing contract textarea sizing возвращён на уровень требований без хрупких пиксельных значений; targeted functional regressions на current behavior обновлены.
- ✅ Prompt input area приведена к итоговому UI-контракту: внешний horizontal/vertical inset задаётся wrapper `agent-chat-input-area`, hint `Press Enter to send, Shift+Enter for new line` живёт внутри `PromptInputFooter`, выровнен по колонке текста textarea и использует уменьшенную менее акцентную типографику.
- ✅ Prompt input submit/reset contract доведён до целевого состояния: controlled textarea очищается сразу после успешного старта submit-path и восстанавливает исходный текст только если отправка не передана в чат.
- ✅ `code_exec` header использует status-icon-first contract без `wrench`: иконка берётся напрямую из persisted source status (`running`, `success`, `error`, `timeout`, `cancelled`), при этом `running` использует тот же фиолетовый акцент, что и action buttons prompt area.
- ✅ `code_exec` content renderer частично возвращён к целевому app-owned виду поверх standard `Tool`: секция исходного кода отображается как один `JavaScript` code block с видимой JS-подсветкой, а `Output`/`Error` секции используют standard text code-block control с внутренними заголовками.

### В работе
- 🔄 Фаза 5: содержательные работы завершены; ожидается только отдельное подтверждение пользователя на полный `npm run test:functional`.

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

- [x] Привести локальный vendored `Tool` к официальному AI Elements `Tool` contract.
  - [x] Обновлять AI Elements только через каноническую команду полного обновления `npm run ai-elements:update-all`, а не ручными правками vendored компонентов.
  - [x] После каждого CLI-обновления AI Elements проверять обязательные app-level интеграции, которые сообщает CLI/output (например, необходимость обернуть приложение в `TooltipProvider`).
  - [x] Синхронизировать `src/renderer/components/ai-elements/tool.tsx` с upstream API.
  - [x] Синхронизировать `src/components/ai-elements/tool.tsx` с тем же contract.
  - [x] Зафиксировать policy для CLI-generated renderer vendor directories: `src/renderer/components/ui/**` и `src/renderer/components/ai-elements/**` не должны автоматически переписываться локальными ESLint/Prettier правилами репо.
  - [x] Зафиксировать в `docs/specs/agents/design.md`, что `code_exec` использует стандартный `Tool` collapsible pattern, а не внешний ручной wrapper.
  - [x] После массового CLI-обновления проверить build-интеграцию обновлённого `Tool` с текущим renderer usage и устранить contract drift до зелёного `npm run typecheck`.

- [x] Перевести `code_exec` renderer на стандартный `Tool` usage.
  - [x] Убрать внешний ручной `Collapsible` вокруг `Tool` в `src/renderer/components/agents/AgentMessage.tsx`.
  - [x] Использовать `Tool` как root и `ToolContent` как content, сохранив стандартную toggle hit-area для `code_exec`.
  - [x] Адаптировать generic `ToolHeader` на новый contract `type/state/toolName/title`.
  - [x] Адаптировать generic `ToolInput` на новый contract `input=...`.
  - [x] Адаптировать generic `ToolOutput` на новый contract `output=...` и `errorText=...`.
  - [x] Сохранить текущее UI-поведение `code_exec`: fallback title `"Code"`, отдельные секции `stdout` / `stderr` / `error`, прозрачные surfaces и historical compatibility.
  - [x] Перевести generic `tool_call` renderer на тот же новый `Tool` contract.
  - [x] Удалить временные workaround-правки, ставшие ненужными после миграции.
  - [x] Упростить `code_exec` header до custom status-icon composition без внешнего overlay, сохранив стандартную toggle hit area.

- [x] Довести app-level интеграцию обновлённого `PromptInput` и shared providers.
  - [x] Устранить TS/JSX несовместимость свежего `src/renderer/components/ai-elements/prompt-input.tsx` с текущим renderer-конфигом TypeScript.
  - [x] Проверить и зафиксировать app-level setup, требуемый новым `PromptInput`/`Message` stack после CLI-обновления.
  - [x] Добавить единый `TooltipProvider` в renderer root приложения вместо локальных/дублирующих provider-обёрток.
  - [x] Убедиться, что после добавления глобального `TooltipProvider` существующие tooltip-потребители (включая sidebar и AI Elements) не конфликтуют между собой.
  - [x] Удалить кастомную runtime-логику автофокуса textarea при активации чата/переключении окна.
  - [x] Синхронизировать `docs/specs/agents/requirements.md` и `docs/specs/agents/design.md`, чтобы автофокус не оставался частью целевого UI-контракта.
  - [x] Обновить или удалить `tests/functional/input-autofocus.spec.ts` и связанные coverage-ссылки после удаления автофокуса.
  - [x] Выровнять input area по визуальной ширине контентной колонки сообщений и вынести shortcut hint под рамку поля ввода с симметричным вертикальным inset.
  - [x] Перенести shortcut hint внутрь `PromptInputFooter` и довести его итоговый layout: hint выровнен по левой текстовой колонке, визуально менее акцентен и использует footer-level positioning вместо внешней подписи под рамкой.
  - [x] Зафиксировать продуктовый textarea sizing contract: две видимые строки по умолчанию, поэтапный рост до пяти строк и внутренний scroll начиная с шестой строки.
  - [x] Реализовать app-owned textarea sizing в `AgentChat`, не вмешиваясь в keyboard contract, submit/reset flow и остальное поведение `PromptInput`.
  - [x] Очистить controlled `PromptInputTextarea` сразу после успешного старта submit-path и восстанавливать текст только при ошибке отправки до передачи запроса в чат.
  - [x] Завершить cleanup renderer-layer после миграции `PromptInput`: убрать legacy hooks/таймеры в `AgentChat`, оставив только финальный sizing/layout слой и текущий controlled text state.
  - [x] Вернуть prompt area видимый unfocused border и сохранить существующую фиолетовую focus-рамку без дополнительного фонового fill.

- [x] Синхронизировать tests под новый `Tool` contract.
  - [x] Обновить `tests/unit/components/agents/AgentMessage.test.tsx`.
  - [x] Обновить `tests/functional/code_exec.spec.ts`.
  - [x] Проверить, что cycle `expand -> collapse -> reopen` стабильно работает без hidden interactive artifacts.
  - [x] Обновить/починить `tests/unit/components/ai-elements/prompt-input.test.tsx` под свежую CLI-версию `PromptInput`.
  - [x] Добавить regression на app-level `TooltipProvider`, если это покрывается renderer unit tests.

#### Фаза 5: Sandbox HTTP Request Follow-up

- [ ] Закрыть оставшийся follow-up по `sandbox-http-request`.
  - [x] Синхронизировать traceability и prompt/spec contract по `http_request` после фактических runtime-изменений ветки.
  - [x] Зафиксировать SSRF boundary для `http_request` на уровне requirements/design/runtime/tests, включая direct target rejection, redirect hop rejection и connection-boundary address pinning для фактического outbound transport.
  - [ ] После завершения релевантных runtime/UI изменений запросить подтверждение пользователя на полный `npm run test:functional`.

#### Фаза 6: Тесты

- [x] Обновить unit tests для main/runtime слоя.
  - [x] Добавить кейсы в `tests/unit/agents/MainPipeline.test.ts` не только для `final_answer`, но и для других tool payloads с embedded `title-meta`.
- [x] Обновить renderer unit tests.
  - [x] Добавить кейсы в `tests/unit/components/agents/AgentMessage.test.tsx`.
  - [x] Проверить, что renderer не показывает служебный comment даже для уже persisted payload.
- [x] При изменении loop contract обновить provider tests в `tests/unit/llm/*`.
- [x] Добавить functional regression в `tests/functional/llm-chat.spec.ts`.
  - [x] Сценарий, где metadata comment приходит внутри другого tool payload.
  - [x] Проверить, что UI его не показывает или turn корректно валидируется по целевому контракту.

#### Фаза 7: Валидация

- [x] Прогнать `npm run rebuild:node`.
- [x] Прогнать `npm run typecheck`.
- [x] Прогнать релевантные unit tests по `MainPipeline`, `AgentMessage`, `PromptInput`, провайдерам при необходимости.
- [x] Прогнать `npm run validate`.
- [ ] После завершения запросить подтверждение на functional tests.
