# План Рефакторинга: Замена waitForTimeout в Функциональных Тестах

**Дата создания:** 2026-02-18  
**Требование:** testing.11  
**Статус:** В ожидании

## Обзор

Найдено 53 использования `waitForTimeout` в 9 функциональных тестах. Согласно требованию testing.11, все безусловные `waitForTimeout` должны быть заменены на ожидание локаторов с встроенным ожиданием.

## Общая Статистика

| Файл | Количество waitForTimeout | Приоритет |
|------|---------------------------|-----------|
| agent-status-indicators.spec.ts | 15 | Высокий |
| agent-realtime-events.spec.ts | 12 | Высокий |
| empty-state-placeholder.spec.ts | 9 | Средний |
| agent-messaging.spec.ts | 7 | Высокий |
| error-notifications.spec.ts | 5 | Средний |
| agent-list-initial-animation.spec.ts | 3 | Низкий |
| oauth-complete-flow.spec.ts | 3 | Средний |
| login-ui.spec.ts | 1 | Низкий |
| app-lifecycle.spec.ts | 1 | Низкий |
| **ИТОГО** | **53** | |

## Чеклист Файлов

- [ ] agent-messaging.spec.ts (7 occurrences)
- [ ] agent-status-indicators.spec.ts (15 occurrences)
- [ ] agent-realtime-events.spec.ts (12 occurrences)
- [ ] empty-state-placeholder.spec.ts (9 occurrences)
- [ ] agent-list-initial-animation.spec.ts (3 occurrences)
- [ ] oauth-complete-flow.spec.ts (3 occurrences)
- [ ] error-notifications.spec.ts (5 occurrences)
- [ ] login-ui.spec.ts (1 occurrence)
- [ ] app-lifecycle.spec.ts (1 occurrence)

---

## 1. agent-messaging.spec.ts

**Статус:** План готов  
**Количество изменений:** 7 waitForTimeout

### Тест 1.1: "should add new line on Shift+Enter"

**Строка:** 95  
**Текущий код:**
```typescript
await messageInput.press('Shift+Enter');
await window.waitForTimeout(100);
```

**Проблема:** Ожидание не нужно - `inputValue()` синхронно читает значение из DOM.

**Решение:** Удалить `waitForTimeout(100)` полностью.

**Обоснование:** Значение textarea обновляется синхронно после нажатия клавиши.

---

### Тест 1.2: "should display messages in chronological order"

**Строки:** 126, 130, 134  
**Текущий код:**
```typescript
await messageInput.fill('First message');
await messageInput.press('Enter');
await window.waitForTimeout(500);

await messageInput.fill('Second message');
await messageInput.press('Enter');
await window.waitForTimeout(500);

await messageInput.fill('Third message');
await messageInput.press('Enter');
await window.waitForTimeout(500);
```

**Проблема:** Безусловное ожидание 500ms после каждого сообщения (итого 1.5 секунды).

**Решение:**
```typescript
const messages = window.locator('[data-testid="message"]');

await messageInput.fill('First message');
await messageInput.press('Enter');
await expect(messages).toHaveCount(1, { timeout: 2000 });

await messageInput.fill('Second message');
await messageInput.press('Enter');
await expect(messages).toHaveCount(2, { timeout: 2000 });

await messageInput.fill('Third message');
await messageInput.press('Enter');
await expect(messages).toHaveCount(3, { timeout: 2000 });
```

**Обоснование:** Ждем появления каждого сообщения в DOM вместо фиксированного таймаута.

---

### Тест 1.3: "should autoscroll to last message"

**Строка:** 162 (в цикле)  
**Текущий код:**
```typescript
for (let i = 1; i <= 10; i++) {
  await messageInput.fill(`Message ${i}`);
  await messageInput.press('Enter');
  await window.waitForTimeout(300);
}
```

**Проблема:** Безусловное ожидание 300ms после каждого сообщения (итого 3 секунды).

**Решение:**
```typescript
const messages = window.locator('[data-testid="message"]');

for (let i = 1; i <= 10; i++) {
  await messageInput.fill(`Message ${i}`);
  await messageInput.press('Enter');
  await expect(messages).toHaveCount(i, { timeout: 2000 });
}
```

**Обоснование:** Ждем появления каждого сообщения в DOM вместо фиксированного таймаута.

---

## 2. agent-status-indicators.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 15 waitForTimeout

### Предварительный анализ:

- Строка 74: После отправки сообщения - заменить на `await expect(messages.first()).toBeVisible()`
- Строка 117, 119: После создания агентов - заменить на `await expect(agentIcons).toHaveCount(n)`
- Строка 131: После переключения агента - заменить на ожидание активного состояния
- Строка 137: После отправки сообщения - заменить на `await expect(messages).toHaveCount(n)`
- Строка 161, 166: После отправки сообщений - заменить на ожидание сообщений
- Строка 184: После создания агента - заменить на ожидание количества агентов
- Строка 192, 202: После переключения агента - заменить на ожидание активного состояния
- Строка 198, 207: После отправки сообщения - заменить на ожидание сообщений

**Требуется:** Детальный анализ каждого теста.

---

## 3. agent-realtime-events.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 12 waitForTimeout

### Предварительный анализ:

- Строка 50: После создания агента - заменить на `await expect(agentIcon).toBeVisible()`
- Строка 72, 108, 110: После создания агентов - заменить на ожидание количества
- Строка 85, 192: После переключения агента - заменить на ожидание активного состояния
- Строка 91, 164, 196: После отправки сообщения - заменить на ожидание сообщений
- Строка 143: После создания сообщения - заменить на ожидание появления сообщения

**Требуется:** Детальный анализ каждого теста.

---

## 4. empty-state-placeholder.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 9 waitForTimeout

### Предварительный анализ:

- Строка 84, 115, 145, 181, 214, 239, 267: После загрузки страницы - возможно заменить на ожидание конкретного элемента
- Строка 157, 161: После отправки сообщения - заменить на ожидание сообщения
- Строка 192: После создания агента - заменить на ожидание количества агентов
- Строка 278: После отправки сообщения - заменить на ожидание исчезновения placeholder

**Требуется:** Детальный анализ каждого теста.

---

## 5. agent-list-initial-animation.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 3 waitForTimeout

### Предварительный анализ:

- Строка 89: После создания агента - заменить на `await expect(agentIcons).toHaveCount(n)`
- Строка 118: В цикле создания агентов - заменить на ожидание количества
- Строка 141: После переключения агента - заменить на ожидание активного состояния

**Требуется:** Детальный анализ каждого теста.

---

## 6. oauth-complete-flow.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 3 waitForTimeout

### Предварительный анализ:

- Строка 103: После OAuth flow - возможно заменить на ожидание конкретного элемента
- Строка 148: После reload - возможно заменить на ожидание конкретного элемента
- Строка 189: После ошибки - возможно заменить на ожидание error notification

**Требуется:** Детальный анализ каждого теста.

---

## 7. error-notifications.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 5 waitForTimeout

### Предварительный анализ:

- Строка 15: После загрузки - возможно заменить на ожидание конкретного элемента
- Строка 31, 85: Ожидание инициализации App - возможно заменить на ожидание конкретного элемента
- Строка 72: Ожидание auto-dismiss (15 секунд) - **ИСКЛЮЧЕНИЕ**: это тест таймера, нужен комментарий
- Строка 128: После console.log - возможно удалить или заменить

**Требуется:** Детальный анализ каждого теста.

---

## 8. login-ui.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 1 waitForTimeout

### Предварительный анализ:

- Строка 104: Ожидание появления ошибки - заменить на `await expect(errorBlock).toBeVisible()` или `await expect(errorBlock).toHaveCount(0)`

**Требуется:** Детальный анализ теста.

---

## 9. app-lifecycle.spec.ts

**Статус:** Требуется анализ  
**Количество изменений:** 1 waitForTimeout

### Предварительный анализ:

- Строка 83: Ожидание 5 секунд для проверки стабильности - **ВОЗМОЖНОЕ ИСКЛЮЧЕНИЕ**: тест стабильности окна, может потребоваться комментарий

**Требуется:** Детальный анализ теста.

---

## Общие Паттерны Замены

### Паттерн 1: Ожидание появления сообщения
```typescript
// ❌ БЫЛО
await messageInput.press('Enter');
await window.waitForTimeout(500);

// ✅ СТАЛО
await messageInput.press('Enter');
const messages = window.locator('[data-testid="message"]');
await expect(messages.first()).toBeVisible({ timeout: 2000 });
```

### Паттерн 2: Ожидание количества элементов
```typescript
// ❌ БЫЛО
await createButton.click();
await window.waitForTimeout(500);
const agents = window.locator('[data-testid="agent-icon"]');
expect(await agents.count()).toBe(2);

// ✅ СТАЛО
await createButton.click();
const agents = window.locator('[data-testid="agent-icon"]');
await expect(agents).toHaveCount(2, { timeout: 2000 });
```

### Паттерн 3: Ожидание текста в элементе
```typescript
// ❌ БЫЛО
await button.click();
await window.waitForTimeout(1000);
const text = await element.textContent();
expect(text).toContain('Success');

// ✅ СТАЛО
await button.click();
await expect(element).toContainText('Success', { timeout: 2000 });
```

### Паттерн 4: Ненужное ожидание (синхронные операции)
```typescript
// ❌ БЫЛО
await input.fill('value');
await window.waitForTimeout(100);
const value = await input.inputValue();

// ✅ СТАЛО
await input.fill('value');
const value = await input.inputValue();
```

---

## Исключения (Допустимые случаи)

### Исключение 1: Тестирование таймеров
```typescript
// ✅ ДОПУСТИМО - тест auto-dismiss через 15 секунд
await context.window.waitForTimeout(16000);
// ТРЕБУЕТСЯ КОММЕНТАРИЙ: Testing auto-dismiss timer (15s requirement)
```

### Исключение 2: Тестирование стабильности
```typescript
// ✅ ДОПУСТИМО - проверка стабильности окна
await context.window.waitForTimeout(5000);
// ТРЕБУЕТСЯ КОММЕНТАРИЙ: Testing window stability over 5 seconds
```

### Исключение 3: Анимации без DOM-индикатора
```typescript
// ✅ ДОПУСТИМО - ожидание CSS анимации
await element.click();
await window.waitForTimeout(250);
// ТРЕБУЕТСЯ КОММЕНТАРИЙ: Waiting for 200ms CSS animation to complete
```

---

## Процесс Выполнения

1. **Для каждого файла:**
   - [ ] Прочитать полный код теста
   - [ ] Проанализировать каждое использование `waitForTimeout`
   - [ ] Определить, что должно появиться/измениться
   - [ ] Составить детальный план замены
   - [ ] Получить одобрение пользователя
   - [ ] Выполнить изменения
   - [ ] Запустить тесты для проверки
   - [ ] Отметить файл как завершенный

2. **После каждого файла:**
   - [ ] Запустить конкретный тест: `npm run test:functional:single -- filename.spec.ts`
   - [ ] Убедиться, что все тесты проходят
   - [ ] Закоммитить изменения

3. **После всех файлов:**
   - [ ] Запустить все функциональные тесты: `npm run test:functional`
   - [ ] Убедиться, что все 90+ тестов проходят
   - [ ] Обновить документацию (если нужно)

---

## Метрики Успеха

- [ ] Все 53 `waitForTimeout` проанализированы
- [ ] Безусловные `waitForTimeout` заменены на ожидание локаторов
- [ ] Допустимые `waitForTimeout` имеют комментарии с объяснением
- [ ] Все функциональные тесты проходят
- [ ] Тесты стали быстрее (меньше фиксированных ожиданий)
- [ ] Тесты стали стабильнее (нет race conditions)

---

## Примечания

- **Не торопиться:** Каждый файл требует детального анализа
- **Согласовывать:** Получать одобрение пользователя перед изменениями
- **Тестировать:** Запускать тесты после каждого изменения
- **Документировать:** Добавлять комментарии для исключений

---

**Последнее обновление:** 2026-02-18  
**Следующий шаг:** Детальный анализ agent-status-indicators.spec.ts
