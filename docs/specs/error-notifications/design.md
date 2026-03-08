# Документ Дизайна: Error Notifications

## Обзор

Система ошибок использует два независимых UI-канала:

- chat-flow ошибки: только через сообщения/баннеры в чате;
- фоновые ошибки: через toast.

Цель — исключить дублирование одного и того же сбоя одновременно в чате и в toast.

## Архитектура

### 1. Chat-flow ошибки (LLM)

- Источник: `MainPipeline` + `ErrorNormalizer`.
- Нормализованный тип ошибки сохраняется в `kind:error` payload (кроме `rate_limit`).
- Для `rate_limit` создаётся transient событие `agent.rate_limit` (countdown banner) без записи `kind:error`.
- Renderer рендерит `kind:error` через `AgentDialog` (intent `error`).
- При новом `kind:user` предыдущие видимые `kind:error` помечаются `hidden: true`.

### 2. Фоновые ошибки (non-chat)

- Источник: IPC wrapper `callApi()` и global unhandled rejection handler.
- Для non-chat операций показывается toast (если `silent !== true`).
- Для chat-flow операций toast не показывается.

### 3. Логирование и фильтрация

- Все ошибки логируются через `Logger`.
- Отфильтрованные race/cancelled ошибки остаются в логах, но не отображаются пользователю.

## Контракт нормализации ошибок

| Источник | Доменный тип | Канал UI |
|---|---|---|
| `APICallError` 401/403 | `auth` | chat error dialog |
| `APICallError` 429 | `rate_limit` | countdown banner |
| `APICallError` 5xx | `provider` | chat error dialog |
| timeout/abort | `timeout` | chat error dialog |
| network/transport | `network` | chat error dialog |
| tool execution errors | `tool` | chat error dialog |
| stream protocol errors | `protocol` | chat error dialog |
| IPC/background runtime errors | `background` | toast |

## Поток данных

```text
MainPipeline/IPC
  -> ErrorNormalizer
  -> if chat-flow:
       -> create kind:error OR emit agent.rate_limit
       -> renderer AgentDialog/bannner
     else:
       -> callApi/global handler
       -> toast
```

## Стратегия тестирования

### Модульные тесты

- `tests/unit/utils/apiWrapper.test.ts` — правила toast/silent/chat suppression
- `tests/unit/agents/MainPipeline.test.ts` — маппинг ошибок в `kind:error` и `agent.rate_limit`
- `tests/unit/renderer/AgentChat.test.tsx` — рендер `kind:error` и отсутствие toast-дубликатов для chat-flow

### Функциональные тесты

- `tests/functional/llm-chat.spec.ts` — auth/network/provider/timeout/rate_limit сценарии в чате
- `tests/functional/llm-chat.spec.ts` — скрытие error-dialog при следующем сообщении

### Покрытие требований

| Требование | Модульные тесты | Функциональные тесты |
|---|---|---|
| error-notifications.1.1 | ✓ | ✓ |
| error-notifications.1.2 | ✓ | ✓ |
| error-notifications.1.3 | ✓ | - |
| error-notifications.1.4 | ✓ | ✓ |
| error-notifications.1.5 | ✓ | - |
| error-notifications.1.6 | ✓ | - |
| error-notifications.2.1 | ✓ | - |
| error-notifications.2.2 | ✓ | - |
| error-notifications.2.3 | ✓ | - |
| error-notifications.2.4 | ✓ | - |
| error-notifications.2.5 | ✓ | - |
