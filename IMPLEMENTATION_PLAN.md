# План Реализации Оставшихся Задач

**Дата создания:** 2026-02-10  
**Всего задач:** 22 (UI: 9, Google OAuth: 13)

**ВАЖНО:** После завершения каждого шага отмечайте его как выполненный (❌ → ✅) и обновляйте соответствующие задачи в `.kiro/specs/*/tasks.md`.

---

## Анализ Текущего Состояния

### ✅ Уже Реализовано

**ВАЖНО:** Отдельной страницы с лоадером НЕ СУЩЕСТВУЕТ. Loader будет показываться **на странице логина** (LoginScreen), а не на отдельной странице. Это соответствует требованиям google-oauth-auth.15.7: "Обеспечить видимость всех элементов Login Screen во время отображения loader".

1. **UI 10.4** - `fetchProfileSynchronously()` в UserProfileManager
   - ✅ Метод существует в `src/main/auth/UserProfileManager.ts` (строки 371-447)
   - ✅ Реализует синхронную загрузку профиля
   - ✅ Очищает токены при ошибке
   - ✅ Сохраняет профиль в базу данных
   - **Статус:** ЗАВЕРШЕНО

2. **UI 12.4** - Обработка 'profile_fetch_failed' в LoginError
   - ✅ Обработчик существует в `src/renderer/components/auth/LoginError.tsx` (строки 104-110)
   - ✅ Показывает сообщение: "Unable to load your Google profile information"
   - ✅ Предлагает повторить попытку
   - **Статус:** ЗАВЕРШЕНО

### ❌ Требуют Реализации

#### Группа 1: UI Components - Loader Support (7 задач)

**OAuth 6.1** - LoginScreen: добавить isLoading и isDisabled props
- ✅ Добавлены props `isLoading` и `isDisabled` в интерфейс
- ✅ Добавлен loader (spinner) с текстом "Signing in..."
- ✅ Кнопка деактивируется при isDisabled
- ✅ Все элементы остаются видимыми во время loader
- **Файл:** `src/renderer/components/auth/LoginScreen.tsx`
- **Статус:** ЗАВЕРШЕНО

**OAuth 6.2** - LoginError: добавить isLoading и isDisabled props
- ✅ Добавлены props `isLoading` и `isDisabled` в интерфейс
- ✅ Кнопка деактивируется при isDisabled
- ✅ Добавлен loader при isLoading
- **Файл:** `src/renderer/components/auth/LoginError.tsx`
- **Статус:** ЗАВЕРШЕНО

**OAuth 6.3** - Тесты для LoginScreen loader (3 подзадачи)
- ❌ Нет теста для отображения loader при isLoading=true
- ❌ Нет теста для деактивации кнопки при isDisabled=true
- ❌ Нет теста для видимости элементов во время loader
- **Файл:** `tests/unit/auth/LoginScreen.test.tsx`

**OAuth 6.3** - Тесты для LoginError loader (2 подзадачи)
- ❌ Нет теста для отображения loader при isLoading=true
- ❌ Нет теста для деактивации кнопки при isDisabled=true
- **Файл:** `tests/unit/auth/LoginError.test.tsx`

#### Группа 2: Auth Window Manager - Loader Methods (6 задач)

**OAuth 7.1** - AuthWindowManager: showLoader() и hideLoader() (4 подзадачи)
- ✅ Добавлен метод `showLoader()` - отправляет IPC событие 'auth:show-loader'
- ✅ Добавлен метод `hideLoader()` - отправляет IPC событие 'auth:hide-loader'
- ✅ `handleAuthSuccess()` вызывает hideLoader()
- ✅ `handleAuthError()` вызывает hideLoader()
- **Файл:** `src/main/auth/AuthWindowManager.ts`
- **Статус:** ЗАВЕРШЕНО

**OAuth 7.2** - Интеграция loader с OAuthClientManager
- ✅ Добавлено поле `authWindowManager` в OAuthClientManager
- ✅ Добавлен метод `setAuthWindowManager()`
- ✅ В `handleDeepLink()` вызывается `showLoader()` после получения authorization code
- ✅ В `handleDeepLink()` вызывается `hideLoader()` при успехе/ошибке
- ✅ Обновлен `main/index.ts` для передачи AuthWindowManager
- ✅ Добавлены IPC слушатели в App.tsx
- ✅ Обновлены типы в `src/types/index.ts` и `src/preload/index.ts`
- **Файлы:** `src/main/auth/OAuthClientManager.ts`, `src/main/index.ts`, `src/renderer/App.tsx`, `src/preload/index.ts`, `src/types/index.ts`
- **Статус:** ЗАВЕРШЕНО

**OAuth 7.2** - Тесты для AuthWindowManager loader (3 подзадачи)
- ❌ Нет теста для вызова showLoader() при получении authorization code
- ❌ Нет теста для вызова hideLoader() при успешной авторизации
- ❌ Нет теста для вызова hideLoader() при ошибке авторизации
- **Файл:** `tests/unit/auth/AuthWindowManager.test.ts`

**UI 12.3** - Интеграция loader с синхронной загрузкой
- ✅ Loader интегрирован с fetchProfileSynchronously()
- ✅ Loader показывается во время загрузки профиля
- **Файлы:** Renderer components + AuthWindowManager
- **Статус:** ЗАВЕРШЕНО

#### Группа 3: Централизованная Обработка API (4 задачи)

**UI 37.1** - Создать handleAPIRequest()
- ❌ Функция не существует
- ❌ Нет проверки HTTP 401
- ❌ Нет очистки токенов при 401
- ❌ Нет показа LoginError при 401
- **Файл:** `src/renderer/utils/api-request-handler.ts` (новый)

**UI 37.2** - Интегрировать с UserProfileManager
- ❌ UserProfileManager использует прямые вызовы fetch()
- ❌ Нет централизованной обработки 401
- **Файл:** `src/main/auth/UserProfileManager.ts`

**UI 37.3** - Интегрировать с другими API клиентами
- ❌ Нужно найти все API клиенты в проекте
- ❌ Заменить fetch() на handleAPIRequest()
- **Файлы:** Все API клиенты

**UI 39.1** - Защита от race conditions
- ❌ Нет флага/mutex для предотвращения множественных очисток
- ❌ clearTokens() может вызываться несколько раз
- **Файл:** `src/renderer/utils/api-request-handler.ts`

**UI 39.2** - Тесты для одновременных 401
- ❌ Нет тестов для множественных одновременных запросов
- ❌ Нет проверки race conditions
- **Файл:** `tests/unit/utils/api-request-handler.test.ts` (новый)

#### Группа 4: Автоматическое Обновление Токенов (2 задачи)

**UI 38.1** - Проверить refreshAccessToken()
- ⚠️ Нужно проверить существующую реализацию
- ⚠️ Убедиться в фоновой работе
- ⚠️ Проверить отсутствие уведомлений пользователю
- **Файл:** `src/main/auth/OAuthClientManager.ts`

**UI 38.2** - Автоматический триггер refresh
- ⚠️ Нужно проверить getAuthStatus()
- ⚠️ Убедиться в автоматическом обновлении при истечении
- ⚠️ Проверить обновление профиля после refresh
- **Файл:** `src/main/auth/OAuthClientManager.ts`

---

## Рекомендуемый Порядок Выполнения

### Фаза 1: UI Components - Loader Support (Приоритет: ВЫСОКИЙ)

**Причина:** Критическая функциональность для UX, все задачи взаимосвязаны

#### Шаг 1: LoginScreen - добавить loader props
**Задача:** OAuth 6.1 (4 подзадачи)
**Время:** ~30 минут
**Файл:** `src/renderer/components/auth/LoginScreen.tsx`
**Статус:** ✅ ЗАВЕРШЕНО

**ВАЖНО:** Loader показывается **НА СТРАНИЦЕ ЛОГИНА**, а не на отдельной странице. Все элементы Login Screen остаются видимыми, добавляется только spinner и текст "Signing in...".

**Зависимости:** Нет

---

#### Шаг 2: LoginError - добавить loader props
**Задача:** OAuth 6.2 (3 подзадачи)
**Время:** ~20 минут
**Файл:** `src/renderer/components/auth/LoginError.tsx`
**Статус:** ✅ ЗАВЕРШЕНО

**Зависимости:** Нет

---

#### Шаг 3: AuthWindowManager - добавить loader методы
**Задача:** OAuth 7.1 (4 подзадачи)
**Время:** ~40 минут
**Файл:** `src/main/auth/AuthWindowManager.ts`
**Статус:** ✅ ЗАВЕРШЕНО

**ВАЖНО:** Методы showLoader/hideLoader НЕ создают отдельную страницу. Они отправляют IPC события в renderer, чтобы показать/скрыть loader **на существующей странице логина**.

**Зависимости:** Шаги 1-2 (нужны обновленные компоненты)

---

#### Шаг 4: Интеграция loader с синхронной загрузкой
**Задача:** UI 12.3, OAuth 7.2
**Время:** ~30 минут
**Файлы:** 
- `src/main/auth/OAuthClientManager.ts` (вызов showLoader)
- `src/main/index.ts` (передача AuthWindowManager)
- `src/renderer/App.tsx` (IPC слушатели)
- `src/preload/index.ts` (IPC методы)
- `src/types/index.ts` (типы)
**Статус:** ✅ ЗАВЕРШЕНО

**Зависимости:** Шаг 3 (нужны методы showLoader/hideLoader)

---

#### Шаг 5: Тесты для LoginScreen loader
**Задача:** OAuth 6.3 (3 подзадачи)
**Время:** ~30 минут
**Файл:** `tests/unit/auth/LoginScreen.test.tsx`
**Статус:** ✅ ЗАВЕРШЕНО

**Тесты:**
1. should show loader when isLoading=true
2. should disable button when isDisabled=true
3. should keep all elements visible during loader

**Зависимости:** Шаг 1

---

#### Шаг 6: Тесты для LoginError loader
**Задача:** OAuth 6.3 (2 подзадачи)
**Время:** ~20 минут
**Файл:** `tests/unit/auth/LoginError.test.tsx`
**Статус:** ✅ ЗАВЕРШЕНО

**Тесты:**
1. should show loader when isLoading=true
2. should disable button when isDisabled=true

**Зависимости:** Шаг 2

---

#### Шаг 7: Тесты для AuthWindowManager loader
**Задача:** OAuth 7.2 (3 подзадачи)
**Время:** ~30 минут
**Файл:** `tests/unit/auth/AuthWindowManager.test.ts`
**Статус:** ✅ ЗАВЕРШЕНО

**Тесты:**
1. should call showLoader() when authorization code received
2. should call hideLoader() on successful authentication
3. should call hideLoader() on authentication error

**Зависимости:** Шаг 3

---

**Checkpoint 1:** Запустить `npm run validate`
- Убедиться, что все тесты проходят
- Проверить TypeScript компиляцию
- Проверить ESLint/Prettier

**Статус:** ⏭️ СЛЕДУЮЩИЙ ШАГ

---

### Фаза 1.5: Property-Based Тесты для Loader (Приоритет: НИЗКИЙ, ОПЦИОНАЛЬНО)

#### Шаг 7.5: Property-based тесты для loader
**Задача:** OAuth 8.4 (3 property теста)
**Время:** ~1 час
**Файл:** `tests/property/auth/LoaderState.property.test.ts` (новый)
**Статус:** ⏭️ ОПЦИОНАЛЬНО

**Property тесты:**
1. Property 20: Loader State Consistency - button state and loader visibility must be consistent
2. Property 21: Loader Visibility Invariant - isLoaderVisible should match the last action
3. Property 22: Button State Invariant - button disabled state should be (isLoading || isDisabled)

**Примечание:** Эти тесты не являются обязательными для завершения задачи. Они рекомендуются для повышения уверенности в корректности реализации, но могут быть пропущены если времени недостаточно.

**Зависимости:** Шаги 5-7 (все модульные тесты завершены)

---

**Checkpoint 1.5:** Запустить `npm run test:property` (если property тесты добавлены)

---

### Фаза 2: Централизованная Обработка API (Приоритет: СРЕДНИЙ)

#### Шаг 8: Создать handleAPIRequest()
**Задача:** UI 37.1
**Время:** ~45 минут
**Файл:** `src/renderer/utils/api-request-handler.ts` (новый)

**Реализация:**
```typescript
// Создать новый файл с функцией handleAPIRequest()
// 1. Обертка над fetch()
// 2. Проверка HTTP 401
// 3. При 401: clearTokens() + показать LoginError
// 4. Логирование с контекстом
```

**Зависимости:** Нет

---

#### Шаг 9: Добавить защиту от race conditions
**Задача:** UI 39.1
**Время:** ~20 минут
**Файл:** `src/renderer/utils/api-request-handler.ts`

**Изменения:**
```typescript
// Добавить флаг isClearing401 для предотвращения множественных очисток
let isClearing401 = false;

// В handleAPIRequest():
if (response.status === 401 && !isClearing401) {
  isClearing401 = true;
  await clearTokens();
  isClearing401 = false;
}
```

**Зависимости:** Шаг 8

---

#### Шаг 10: Интегрировать с UserProfileManager
**Задача:** UI 37.2
**Время:** ~30 минут
**Файл:** `src/main/auth/UserProfileManager.ts`

**Изменения:**
```typescript
// Заменить прямые вызовы fetch() на handleAPIRequest()
// В методах: fetchProfile(), fetchProfileSynchronously()
```

**Зависимости:** Шаги 8-9

---

#### Шаг 11: Интегрировать с другими API клиентами
**Задача:** UI 37.3
**Время:** ~40 минут (зависит от количества клиентов)
**Файлы:** Все API клиенты в проекте

**Действия:**
1. Найти все файлы с fetch() к Google APIs
2. Заменить на handleAPIRequest()
3. Проверить обработку ошибок

**Зависимости:** Шаги 8-9

---

#### Шаг 12: Тесты для handleAPIRequest()
**Задача:** UI 39.2
**Время:** ~40 минут
**Файл:** `tests/unit/utils/api-request-handler.test.ts` (новый)

**Тесты:**
1. should return response on success
2. should clear tokens on 401
3. should show LoginError on 401
4. should log error with context
5. should not clear tokens on other errors
6. should handle multiple simultaneous 401 (race condition)

**Зависимости:** Шаги 8-9

---

**Checkpoint 2:** Запустить `npm run validate`

---

### Фаза 3: Автоматическое Обновление Токенов (Приоритет: НИЗКИЙ)

#### Шаг 13: Проверить refreshAccessToken()
**Задача:** UI 38.1
**Время:** ~30 минут
**Файл:** `src/main/auth/OAuthClientManager.ts`

**Действия:**
1. Прочитать существующую реализацию
2. Проверить фоновую работу
3. Убедиться в отсутствии уведомлений
4. Добавить улучшения если нужно

**Зависимости:** Нет

---

#### Шаг 14: Автоматический триггер refresh
**Задача:** UI 38.2
**Время:** ~30 минут
**Файл:** `src/main/auth/OAuthClientManager.ts`

**Действия:**
1. Проверить getAuthStatus()
2. Убедиться в автоматическом refresh при истечении
3. Проверить обновление профиля после refresh
4. Добавить улучшения если нужно

**Зависимости:** Шаг 13

---

**Checkpoint 3:** Запустить `npm run validate` - финальная проверка

---

## Оценка Времени

| Фаза | Задач | Время |
|------|-------|-------|
| Фаза 1: UI Components - Loader Support | 7 | ~2.5 часа |
| Фаза 2: Централизованная Обработка API | 4 | ~2.5 часа |
| Фаза 3: Автоматическое Обновление Токенов | 2 | ~1 час |
| **ИТОГО** | **13** | **~6 часов** |

*Примечание: 9 задач уже завершены (UI 10.4, UI 12.4). Property-based тесты (Фаза 1.5) опциональны и не включены в оценку.*

---

## Критические Зависимости

```
LoginScreen props (OAuth 6.1)
    ↓
LoginError props (OAuth 6.2)
    ↓
AuthWindowManager loader methods (OAuth 7.1)
    ↓
Интеграция loader (UI 12.3)
    ↓
Тесты (OAuth 6.3, 7.2)

---

handleAPIRequest() (UI 37.1) + race conditions (UI 39.1)
    ↓
Интеграция с UserProfileManager (UI 37.2)
    ↓
Интеграция с другими клиентами (UI 37.3)
    ↓
Тесты (UI 39.2)

---

Проверка refreshAccessToken() (UI 38.1)
    ↓
Автоматический триггер (UI 38.2)
```

---

## Риски и Митигация

### Риск 1: Конфликты с существующим кодом
**Вероятность:** Средняя  
**Митигация:** Запускать `npm run validate` после каждой фазы

### Риск 2: Недостаточное покрытие тестами
**Вероятность:** Низкая  
**Митигация:** Писать тесты сразу после реализации функциональности

### Риск 3: Race conditions в handleAPIRequest()
**Вероятность:** Средняя  
**Митигация:** Реализовать защиту от race conditions сразу (UI 39.1)

---

## Следующие Шаги

1. ✅ Прочитать этот план
2. ⏭️ Начать с Фазы 1, Шаг 1: LoginScreen loader props
3. ⏭️ Выполнять задачи последовательно
4. ⏭️ Запускать валидацию после каждой фазы
5. ⏭️ **ОБЯЗАТЕЛЬНО:** Обновлять tasks.md после завершения каждой задачи

---

## Инструкция: Обновление tasks.md После Завершения Задачи

**КРИТИЧЕСКИ ВАЖНО:** После завершения каждой задачи необходимо пометить её выполненной в соответствующем файле tasks.md.

### Формат Обновления

**Было:**
```markdown
- [ ] 6.1 Создать Login Screen Component
  - Добавить props `isLoading` и `isDisabled` в интерфейс LoginScreenProps
  - Добавить loader (spinner) с текстом "Signing in..." когда isLoading=true
```

**Стало:**
```markdown
- [x] 6.1 Создать Login Screen Component
  - Добавить props `isLoading` и `isDisabled` в интерфейс LoginScreenProps
  - Добавить loader (spinner) с текстом "Signing in..." когда isLoading=true
```

### Какие Файлы Обновлять

| Задача | Файл tasks.md |
|--------|---------------|
| OAuth 6.1, 6.2, 6.3, 7.1, 7.2 | `.kiro/specs/google-oauth-auth/tasks.md` |
| UI 12.3, 37.1, 37.2, 37.3, 38.1, 38.2, 39.1, 39.2 | `.kiro/specs/ui/tasks.md` |

### Процесс Обновления

**После завершения каждого шага:**

1. Открыть соответствующий файл tasks.md
2. Найти задачу по номеру (например, "6.1" или "37.1")
3. Изменить `- [ ]` на `- [x]`
4. Если задача имеет подзадачи (bullets), пометить их тоже
5. Сохранить файл
6. Продолжить следующую задачу

### Пример: Обновление После Шага 1

**Шаг 1 завершен:** LoginScreen loader props (OAuth 6.1)

**Действие:**
1. Открыть `.kiro/specs/google-oauth-auth/tasks.md`
2. Найти секцию "6.1 Создать Login Screen Component"
3. Изменить:
   ```markdown
   - [ ] 6.1 Создать Login Screen Component
   ```
   на:
   ```markdown
   - [x] 6.1 Создать Login Screen Component
   ```
4. Изменить все подпункты с `- [ ]` на `- [x]`
5. Сохранить файл

### Автоматизация (Опционально)

Можно использовать команду для быстрого поиска задачи:
```bash
# Найти задачу в файле
grep -n "6.1" .kiro/specs/google-oauth-auth/tasks.md

# Или использовать редактор для поиска
```

### Проверка Прогресса

После обновления можно проверить прогресс:
```bash
# Подсчитать выполненные задачи
grep -c "\- \[x\]" .kiro/specs/google-oauth-auth/tasks.md

# Подсчитать невыполненные задачи
grep -c "\- \[ \]" .kiro/specs/google-oauth-auth/tasks.md
```

---

**Конец плана**
