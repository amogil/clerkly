# Документ Требований: Request Scope (Запрос Дополнительных Разрешений)

## Введение

Данная спецификация описывает функциональность запроса дополнительных Google OAuth scopes и app-level capabilities агентом во время выполнения. Функция `request_scope` позволяет агенту приостановить выполнение, запросить у пользователя дополнительные разрешения через Google re-авторизацию и app-level consent dialog, дождаться решения пользователя и продолжить работу.

Функция реализуется независимо от конкретных интеграций с Google продуктами (Gmail, Calendar и т.д.), чтобы её можно было разработать, протестировать и валидировать изолированно. Для тестирования используется минимальный `dummy_tool`, требующий выделенный dummy capability.

## Глоссарий

- **Scope** — разрешение Google OAuth API (например, `https://www.googleapis.com/auth/gmail.readonly`)
- **Capability** — app-level разрешение, которое агент может запрашивать и которое пользователь может одобрить или отклонить
- **ScopeManager** — компонент main process, управляющий персистентным хранением granted Google scopes и app-level capabilities
- **Incremental Re-Authorization** — повторная авторизация через Google OAuth с расширенным набором scopes, без потери существующей сессии
- **Consent Dialog** — диалог в приложении, объясняющий пользователю, какой доступ запрашивает агент и зачем
- **Structured Domain Error** — структурированная ошибка с машиночитаемым кодом и описанием, возвращаемая инструментом вместо текстовой ошибки
- **dummy_tool** — минимальный тестовый инструмент для валидации полного workflow request_scope

## Требования

### 1. Управление Разрешениями (Scope Persistence)

**ID:** request-scope.1

**User Story:** Как система, я хочу хранить информацию о предоставленных Google scopes и app-level capabilities, чтобы не запрашивать их повторно при каждом вызове инструмента.

#### Критерии Приемки

1.1. КОГДА Google re-авторизация завершается успешно, ТО "ScopeManager" ДОЛЖЕН сохранить полученные Google scopes в персистентном хранилище, привязанном к текущему пользователю

1.2. КОГДА пользователь одобряет app-level consent, ТО "ScopeManager" ДОЛЖЕН сохранить granted capability в персистентном хранилище, привязанном к текущему пользователю

1.3. КОГДА инструмент запрашивает capability, ТО "ScopeManager" ДОЛЖЕН вернуть `true` ЕСЛИ capability уже предоставлен для текущего пользователя, И `false` в противном случае

1.4. КОГДА пользователь выходит из системы (logout), ТО "ScopeManager" ДОЛЖЕН очистить все сохранённые scopes и capabilities

1.5. КОГДА приложение запрашивает список granted Google scopes, ТО "ScopeManager" ДОЛЖЕН вернуть актуальный список из персистентного хранилища

1.6. КОГДА приложение запрашивает список granted capabilities, ТО "ScopeManager" ДОЛЖЕН вернуть актуальный список из персистентного хранилища

1.7. "ScopeManager" ДОЛЖЕН использовать существующий key-value store (`UserSettingsManager`) для хранения данных, НЕ создавая новых таблиц в БД

#### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — "should persist granted capability after approval"

### 2. Инструмент request_scope

**ID:** request-scope.2

**User Story:** Как агент, я хочу вызвать инструмент `request_scope`, чтобы запросить у пользователя дополнительные разрешения для выполнения задачи.

#### Критерии Приемки

2.1. КОГДА агент вызывает `request_scope` с параметрами `{ service, scopes, reason }`, ТО система ДОЛЖНА проверить, покрывает ли текущая Google авторизация запрошенные scopes

2.2. ЕСЛИ Google авторизация НЕ покрывает запрошенные scopes, ТО система ДОЛЖНА:
- Уведомить пользователя о необходимости дополнительной авторизации
- Запустить Google re-авторизацию с недостающими scopes
- Дождаться завершения re-авторизации

2.3. ПОСЛЕ успешной Google re-авторизации (ИЛИ если scopes уже покрыты), система ДОЛЖНА показать app-level consent dialog с описанием запрашиваемого доступа и причиной

2.4. ЕСЛИ пользователь одобряет consent, ТО `request_scope` ДОЛЖЕН вернуть `{ status: 'approved', scopes: [...] }` И сохранить capability через "ScopeManager"

2.5. ЕСЛИ пользователь отклоняет consent, отменяет re-авторизацию, ИЛИ re-авторизация завершается ошибкой, ТО `request_scope` ДОЛЖЕН вернуть `{ status: 'denied' | 'cancelled' | 'error', scopes: [] }`

2.6. `request_scope` ДОЛЖЕН поддерживать отмену через `AbortSignal` на всех этапах (re-авторизация, consent dialog)

#### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — "should complete full request_scope flow with dummy_tool using mock OAuth"
- `tests/functional/request-scope-flow.spec.ts` — "should handle user denial of scope consent"

### 3. Тестовый Инструмент dummy_tool

**ID:** request-scope.3

**User Story:** Как разработчик, я хочу иметь минимальный инструмент `dummy_tool`, чтобы тестировать полный workflow запроса разрешений в изоляции от реальных Google API интеграций.

#### Критерии Приемки

3.1. КОГДА агент вызывает `dummy_tool` с параметром `{ message: string }`, ТО инструмент ДОЛЖЕН проверить наличие capability `dummy_tool` через "ScopeManager"

3.2. ЕСЛИ capability `dummy_tool` НЕ предоставлен, ТО `dummy_tool` ДОЛЖЕН вернуть structured domain error `{ code: 'missing_scope', scopes: ['dummy_tool'], message: 'dummy_tool capability not granted. Use request_scope to request it.' }`

3.3. ЕСЛИ capability `dummy_tool` предоставлен, ТО `dummy_tool` ДОЛЖЕН вернуть `{ status: 'success', echo: message }`

3.4. Structured domain error `missing_scope` ДОЛЖЕН быть машиночитаемым, чтобы агент мог автоматически вызвать `request_scope` для получения недостающего разрешения

#### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — "should show missing_scope error when dummy_tool called without capability"
- `tests/functional/request-scope-flow.spec.ts` — "should allow dummy_tool to succeed after scope is granted"

### 4. Инкрементальная Re-Авторизация

**ID:** request-scope.4

**User Story:** Как система, я хочу запрашивать дополнительные Google scopes без потери существующей сессии пользователя, чтобы не прерывать рабочий процесс.

#### Критерии Приемки

4.1. КОГДА `request_scope` определяет, что нужны дополнительные Google scopes, ТО "OAuth Client" ДОЛЖЕН построить authorization URL с объединением текущих и запрошенных scopes И параметром `include_granted_scopes=true`

4.2. КОГДА Google re-авторизация завершается успешно, ТО система ДОЛЖНА обновить access token и refresh token в хранилище И сохранить полный список granted scopes через "ScopeManager"

4.3. КОГДА Google re-авторизация завершается ошибкой (user cancels, network error, etc.), ТО система НЕ ДОЛЖНА терять существующие токены и scopes

#### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — "should complete full request_scope flow with dummy_tool using mock OAuth"

### 5. App-Level Consent Dialog

**ID:** request-scope.5

**User Story:** Как пользователь, я хочу видеть понятный диалог с описанием того, какой доступ запрашивает агент и зачем, чтобы принять осознанное решение.

#### Критерии Приемки

5.1. КОГДА показывается consent dialog, ТО он ДОЛЖЕН содержать:
- Название сервиса (service), к которому запрашивается доступ
- Список запрашиваемых разрешений (scopes) в человекочитаемом формате
- Причину запроса (reason), предоставленную агентом
- Кнопки "Allow" и "Deny"

5.2. КОГДА пользователь нажимает "Allow", ТО диалог ДОЛЖЕН вернуть `{ approved: true }` в main process

5.3. КОГДА пользователь нажимает "Deny", ТО диалог ДОЛЖЕН вернуть `{ approved: false }` в main process

5.4. Consent dialog НЕ ДОЛЖЕН получать или отображать никаких токенов или секретов

5.5. КОГДА consent dialog показан, ТО все остальные действия агента ДОЛЖНЫ быть заблокированы до решения пользователя (request_scope ожидает)

#### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — "should complete full request_scope flow with dummy_tool using mock OAuth"
- `tests/functional/request-scope-flow.spec.ts` — "should handle user denial of scope consent"

### 6. Безопасность

**ID:** request-scope.6

**User Story:** Как пользователь, я хочу быть уверен, что мои токены и разрешения защищены и не утекают в небезопасные контексты.

#### Критерии Приемки

6.1. Токены доступа (access token, refresh token) НЕ ДОЛЖНЫ передаваться в renderer process или sandbox

6.2. IPC контракт для consent dialog ДОЛЖЕН содержать ТОЛЬКО `{ service, scopes, reason }` (к renderer) и `{ approved: boolean }` (от renderer)

6.3. Все операции с токенами ДОЛЖНЫ выполняться ИСКЛЮЧИТЕЛЬНО в main process

6.4. Granted capabilities ДОЛЖНЫ быть аудируемы — каждое предоставление и отзыв ДОЛЖНЫ логироваться через "Logger"

6.5. Granted capabilities ДОЛЖНЫ быть изолированы по пользователям (привязаны к user_id)

#### Функциональные Тесты

- Безопасность покрывается unit-тестами (IPC контракт, изоляция данных)

### 7. Интеграция с LLM Agent Runtime

**ID:** request-scope.7

**User Story:** Как система, я хочу чтобы `request_scope` и `dummy_tool` были зарегистрированы как полноценные инструменты агента, чтобы LLM мог их вызывать в рамках стандартного цикла tool call.

#### Критерии Приемки

7.1. `request_scope` и `dummy_tool` ДОЛЖНЫ быть зарегистрированы через `AgentFeature` интерфейс

7.2. System prompt ДОЛЖЕН содержать инструкции по использованию `request_scope` при получении ошибки `missing_scope`

7.3. System prompt ДОЛЖЕН описывать контракт `request_scope`: входные параметры и возможные результаты

7.4. System prompt ДОЛЖЕН описывать `dummy_tool` и объяснять, что он требует capability `dummy_tool`

#### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — "should complete full request_scope flow with dummy_tool using mock OAuth"
