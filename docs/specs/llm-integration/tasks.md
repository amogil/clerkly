# План реализации: вложенные изображения (Structured Output)

## Контекст и цель

В приложении ответ модели приходит как Structured Output и сохраняется в `kind: llm` сообщение. Сейчас модель возвращает только текст `action.content`, который рендерится через `MessageResponse` (Streamdown). Для поддержки встроенных изображений нужен отдельный поток: модель помечает места вставки плейсхолдерами, а список картинок отдаёт отдельно; клиент загружает изображения, сохраняет их в БД и подставляет в UI асинхронно.

Цели:
- сделать вставку изображений в тексте через плейсхолдеры;
- хранить изображения в SQLite как BLOB с привязкой к agent/message/image;
- обеспечить асинхронную подстановку изображений после первичного рендера;
- обновить системный промпт, чтобы модель возвращала правильный формат;
- покрыть решение модульными и функциональными тестами.

## Текущее устройство (важно для нового агента)

### Где создаётся `kind: llm`
- `src/main/agents/MainPipeline.ts` формирует финальный payload с `data.action.content` и сохраняет/обновляет `kind: llm` сообщения.
- Structured Output приходит от провайдера через `ILLMProvider.chat()`, но сохраняется в payload целиком уже на стороне MainPipeline.

### Где строится системный промпт
- `src/main/index.ts` создаёт `PromptBuilder` и задаёт базовый системный промпт.

### Где рендерится сообщение
- `src/renderer/components/agents/AgentMessage.tsx` показывает `MessageResponse` для `llmAction.content`.
- `MessageResponse` — это Streamdown (Markdown → HTML).

## Контроль формата Structured Output и повтор запроса

- **Ответственный:** `MainPipeline`.
- **Проверка формата:** после получения ответа LLM валидируем соответствие контракту (наличие `action.content`, корректные `images[]`, корректные плейсхолдеры).
- **При нарушении формата:** повторяем запрос, добавляя системное сообщение с требованием строго следовать формату.
- **Ограничение:** 1–2 повторных попытки, чтобы избежать бесконечных циклов.
- **Если формат не исправлен:** создаётся `kind: error` с типом `provider` и сообщением
  `"Invalid response format. Please try again later."`.
- **Отображение:** `AgentMessage` рендерит стандартный диалог ошибки (как и другие `kind: error`).
- **Повтор:** диалог содержит кнопку `Retry` для повторного запроса.

## История для модели: человеко-читаемый replay

- **Реплей:** `reply_to_message_id` — это внутренний ID сообщения в БД, его **не нужно добавлять в историю для LLM**.
- **Формат передачи истории:** в модель передаётся **последовательность отдельных сообщений** (`system` + history), а не единый агрегированный YAML/JSON-блок.
- **Маппинг ролей:** `kind:user` → `role:user`, `kind:llm` → `role:assistant`.
- **Фильтры истории:** сообщения `kind:error` и сообщения с `hidden: true` исключаются.
- **Санитизация:** служебные поля (`kind`, `reply_to_message_id`, `model`, ветка `reasoning*`) не передаются в replay.
- **Replay для `kind:llm`:**
  - основной текст: `action.content`;
  - при наличии `images[]` добавляется человеко-читаемый блок ссылок/метаданных изображений (`id`, `url`, `link`, опционально `alt`) для контекста следующих запросов.

### Пример входных сообщений для модели

```json
[
  { "role": "system", "content": "System instruction..." },
  { "role": "user", "content": "Привет" },
  {
    "role": "assistant",
    "content": "Вот схема:\n[[image:1]]\n\nImages:\n- id=1; url=https://example.com/a.png; link=https://example.com; alt=Схема 1"
  }
]
```

## Новый контракт Structured Output

### Текст
В `action.content` модель вставляет плейсхолдеры:

```
[[image:<id>]]
```

Пример:

```
Вот схема:
[[image:1]]
И ещё одна:
[[image:2]]
```

#### Кликабельные изображения

Расширенный формат плейсхолдера для ссылки:

```
[[image:<id>|link:<url>]]
```

Пример:

```
[[image:1|link:https://example.com]]
```

#### Размеры изображений

Расширенный формат плейсхолдера для размера:

```
[[image:<id>|size:<width>x<height>]]
```

Комбинация ссылки и размера:

```
[[image:<id>|link:<url>|size:<width>x<height>]]
```

Пример:

```
[[image:1|size:640x180]]
```

### Список изображений
В `images[]` модель возвращает список:

```json
{
  "action": { "type": "text", "content": "..." },
  "images": [
    { "id": 1, "url": "https://example.com/a.png", "alt": "Схема 1", "link": "https://example.com" },
    { "id": 2, "url": "https://example.com/b.png" }
  ]
}
```

Правила:
- `id` должен совпадать с `[[image:<id>]]` в тексте и быть натуральным числом.
- `url` допустим только `http/https`.
- `alt` необязателен.
- `link` необязателен; при наличии изображение кликабельно.
- `alt` используется как `alt` для `<img>`.
- `size` является опциональным атрибутом плейсхолдера; при наличии используется для размеров заглушки.
- если `size` не указан, заглушка всё равно показывается — размер определяется автоматически (дефолтные значения).
- изображения без плейсхолдеров игнорируются для рендера, но всё равно скачиваются и сохраняются в БД.
- логика плейсхолдеров реализуется в renderer: при первичном рендере ставится placeholder+loader, далее он заменяется при успешном получении изображения или удаляется при ошибке/таймауте.
- если изображение есть в тексте, но отсутствует в `images[]`, `MainPipeline` вызывает `ImageStorageManager.markMissingDescriptor(...)`. Renderer получает `status=error` и сразу снимает placeholder/loader.

## Хранение в БД

### Таблица
`images`:

- `agent_id TEXT NOT NULL`
- `message_id TEXT NOT NULL`
- `image_id INTEGER NOT NULL`
- `url TEXT NOT NULL`
- `status TEXT NOT NULL` (`pending` | `error` | `success`)
- `hash TEXT` (nullable, только при `success`)
- `content_type TEXT` (nullable)
- `size INTEGER` (nullable)
- `bytes BLOB` (nullable, только при `success`)
- `created_at TIMESTAMP NOT NULL`
- `updated_at TIMESTAMP NOT NULL`

Индексы/ограничения:
- UNIQUE (`agent_id`, `message_id`, `image_id`)

### Мотивация
- Одна таблица хранит и связь `agent/message/image`, и бинарные данные.
- Статус хранится рядом с данными и используется для polling.

## Классы и ответственность

### Main process

**`ImageStorageManager`** (`src/main/media/ImageStorageManager.ts`)
- **Назначение:** единственная точка работы с бинарными данными и БД изображений.
- **Поведение:**
  - `downloadAndStore(agentId, messageId, imageId, url)`:
    - если записи нет — создаёт её со `status=pending`;
    - валидирует URL (только http/https);
    - скачивает данные (лимит 50GB);
    - таймаут загрузки: 60 секунд (по таймауту → `status=error`);
    - проверяет content-type (разрешённые форматы);
    - считает SHA-256 hash;
    - сохраняет bytes+метаданные в `images` для `(agentId, messageId, imageId)` и ставит `status=success`;
    - при ошибке/таймауте обновляет запись → `status=error`.
  - `markMissingDescriptor(agentId, messageId, imageId)`:
    - создаёт (или обновляет) запись в `images` со `status=error`, если плейсхолдер есть, а `images[]` не содержит `id`.
- `images:get(agentId, messageId, imageId)` (IPC):
  - читает `images` по `(agentId, messageId, imageId)`;
  - если записи нет — `{ found: false, status: 'error' }` (нештатная ситуация, запись должна создаваться `ImageStorageManager` при `downloadAndStore`/`markMissingDescriptor`);
  - если `status = pending` — `{ found: true, status: 'pending' }`;
  - если `status = error` — `{ found: true, status: 'error' }`;
  - если `status = success` — возвращает `{ found: true, status: 'success', bytes, contentType, size }`.
- **Ответственность:** хранение, валидация, безопасность.
- **Ошибки:** не показываются пользователю, только логируются.

**`MainPipeline`**
- **Назначение:** оркестратор ответа LLM и запуск фоновой загрузки изображений.
- **Поведение:**
  - получает Structured Output;
  - валидирует формат и делает retry при ошибке;
  - сохраняет `kind: llm` с полным Structured Output;
  - извлекает плейсхолдеры из `action.content`;
  - сопоставляет их с `images[]`;
  - запускает `ImageStorageManager.downloadAndStore` для каждого изображения.
- для плейсхолдеров без `images[]` вызывает `ImageStorageManager.markMissingDescriptor`.
- **Ответственность:** запись сообщения и запуск загрузок (без управления статусами).

### Renderer

**`MessageImageResolver` (helper)** (`src/renderer/lib/MessageImageResolver.ts`)
- **Назначение:** визуальная подстановка изображений в UI.
- **Поведение:**
  - находит плейсхолдеры;
  - вставляет заглушки нужного размера;
  - вызывает `images:get(agentId, messageId, imageId)`:
    - первые 10 секунд — раз в 0.5 секунды;
    - следующие 10 секунд — раз в 1 секунду;
    - затем — раз в 5 секунд;
  - при `status=success` создаёт `blob:` URL и заменяет заглушку;
  - при `status=error` или ошибке IPC снимает заглушку сразу;
  - по таймауту 60 секунд удаляет заглушку.
- при обновлении сообщения рендерит заново (полный re-render, как обычно).
- **Ответственность:** отображение, polling, замена заглушек.

**`AgentMessage`**
- **Назначение:** интеграция рендеринга сообщения и `MessageImageResolver`.
- **Поведение:** передаёт `action.content`, запускает резолвер после первичного рендера.
- **Ответственность:** связка между данными сообщения и UI-подстановкой изображений.

## Поток рендера (после первичного Markdown)

1. `MessageResponse` рендерит Markdown.
2. Рендерер находит плейсхолдеры `[[image:<id>]]` в DOM и заменяет их на заглушки.
3. По `id` сразу обращается к `images:get(agentId, messageId, imageId)` и получает текущее состояние изображения.
4. Renderer опрашивает `images:get(agentId, messageId, imageId)` только для изображений, у которых на шаге 3 получен `status=pending`:
   - первые 10 секунд — раз в 0.5 секунды;
   - следующие 10 секунд — раз в 1 секунду;
   - затем — раз в 5 секунд.
5. Пока ожидание идёт (`status=pending`) — рендерится заглушка нужного размера с лоадером.
6. При `status=success` получает bytes + contentType → подмена заглушки на `<img>` (alt из `images[]`) или `<a><img></a>` если `link` указан в плейсхолдере.
7. При `status=error` или ошибке IPC — снимает заглушку/placeholder сразу.
8. По таймауту 60 секунд — удаляет заглушку/placeholder.

## Полный pipeline обработки сообщения (события и реакции)

### 1. Main process: получение ответа LLM
1) `MainPipeline` получает Structured Output от провайдера.
2) Валидирует формат (`action.content`, `images[]`, плейсхолдеры).
3) При ошибке формата — делает retry с системным сообщением.
4) Сохраняет `kind: llm` сообщение в БД (payload целиком).
5) Запускает фоновую загрузку изображений внутри `MainPipeline`.
6) Эмитит `message.created`/`message.updated` как обычно (отдельных событий для изображений нет).

### 2. Main process: загрузка изображений
1) `MainPipeline` извлекает плейсхолдеры из `action.content`.
2) Сопоставляет плейсхолдеры с `images[]`.
3) Для каждого изображения запускает загрузку через `ImageStorageManager`.
4) `ImageStorageManager` сам создаёт запись `images` со `status=pending`, затем по результату загрузки обновляет запись:
   - успех → `status=success` + `hash/bytes/content_type/size`;
   - ошибка/таймаут → `status=error`.
5) Если `imageId` нет в `images[]`:
   - `MainPipeline` вызывает `ImageStorageManager.markMissingDescriptor(...)`.

### 3. Renderer: первичный рендер
1) Получает `message.created`/`message.updated`.
2) `AgentMessage` рендерит `MessageResponse`.
3) `MessageImageResolver` ищет плейсхолдеры, заменяет их на заглушки.
4) Для каждого `imageId`:
   - polling: первые 10 секунд — раз в 0.5 секунды, следующие 10 секунд — раз в 1 секунду, затем — раз в 5 секунд, до готовности или таймаута 60 секунд.

### 4. Renderer: обработка ожидания (polling)
1) Вызывает IPC `images:get(agentId, messageId, imageId)` (интервалы: 0.5с → 1с → 5с) и получает:
   - `status: 'pending'` → продолжает ждать (loader остаётся);
   - `status: 'error'` → снимает заглушку/placeholder сразу (для "нет записи" это нештатно, можно игнорировать без UI-ошибки);
   - `status: 'success'` + bytes → подменяет заглушку на `<img>`.
2) Таймаут ожидания 60 секунд → удаляет заглушку/лоадер.
3) Ошибка IPC/исключение → снимает заглушку/лоадер сразу (без UI-ошибки).

### 5. Гонки и порядок событий
- Гонки решаются polling-механизмом: renderer опрашивает main до готовности или таймаута.

## Обновление системного промпта

В базовом промпте указать:
- использовать плейсхолдеры `[[image:<id>]]` в тексте;
- передавать список изображений в `images[]`;
- не вставлять обычные Markdown-картинки `![alt](url)`.
- перечислить поддерживаемые форматы изображений (`png/jpeg/webp/gif/svg`).
- формат `id`: натуральные числа (1, 2, 3...).

## Крайние случаи

- Плейсхолдер есть, `images[]` не содержит `id`:
  - main создаёт запись в `images` со `status=error`;
  - `images:get` возвращает `status: error`, renderer снимает заглушку/лоадер сразу.
- Изображение есть, плейсхолдера нет → игнорировать для рендера, но скачивать и сохранять в БД.
- URL недоступен / ошибка сети → снять placeholder/loader (без UI-ошибки) и записать в лог.
- content-type не `image/*` → снять placeholder/loader (без UI-ошибки) и записать в лог.
- размер > лимита → снять placeholder/loader (без UI-ошибки) и записать в лог.
- повторные плейсхолдеры одного `id` → повторно опрашивать `images:get` без отдельного кэша.
- `link` невалидный/не http(s) → игнорировать ссылку, оставить `<img>`.
- неверный `size` (не `<width>x<height>`) → игнорировать размер.
- `size` отсутствует → использовать дефолтный размер заглушки.
- **Гонки событий:** решаются polling-механизмом; pending-кэш не используется.

## Дополнительные параметры (выбраны по умолчанию)

- **Дефолтный размер заглушки:** `320x180` (16:9).
- **Стиль лоадера:** неброский серый скелетон + лёгкая пульсация (`bg-muted/40`, `animate-pulse`, скругление `rounded-md`).
- **Лимиты загрузки:**
  - max size: `50GB`
  - content types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`
- **SVG:** санитизировать перед рендером.
- **Формат IPC (обслуживает `ImageStorageManager`):**
  - `images:get(agentId, messageId, imageId)` → `{ found: boolean, status: 'pending'|'error'|'success', bytes?, contentType?, size? }`
- **Polling:** первые 10 секунд — 0.5с, следующие 10 секунд — 1с, далее — 5с, максимум 60 секунд.

## Дополнение: hidden не должны попадать в историю

- **Правило:** сообщения с флагом `hidden` не включаются в историю промпта.
- **Где исправить:** фильтрация в `MessageManager.listForModelHistory()`.
- **Тесты:** модульный тест для истории и функциональный тест, который проверяет, что скрытое сообщение не попадает в историю при втором запросе LLM.

## Актуальный статус и задачи

**Текущий статус:** Фаза 3 — Планирование дозакрытия тестового покрытия

### Выполнено
- ✅ Базовый LLM pipeline и история.
- ✅ Embedded images (Structured Output + DB + UI).
- ✅ Таблица `images` + миграции.
- ✅ `ImageStorageManager` и IPC `images:get`.
- ✅ `MainPipeline` (валидация, retry, загрузки).
- ✅ `MessageImageResolver` в renderer.

### В работе
- 🔄 Подготовка дозакрытия тестов для `llm-integration.11`, `llm-integration.12`, `llm-integration.13.5`.

### Запланировано (дозакрытие)
- См. разделы `Чек-лист работ` и `Чек-лист тестов` ниже.

## Тестирование

### Unit tests
- парсер плейсхолдеров и замена в DOM/HTML.
- `ImageStorageManager` (ограничения размера, фильтр типов).
- обработка отсутствующего id/URL.

### Functional tests
- LLM ответ с `[[image:1]]` и `images[]` → `<img>` появляется после загрузки.
- Ошибка: неизвестный id → снять placeholder/loader (без UI-ошибки) и записать в лог.
- Повторная перерисовка не вызывает повторной загрузки.
- Кликабельная картинка: `[[image:1|link:https://...]]` → `<a>` вокруг `<img>`.
- Асинхронность: рендер без картинки → после `status=success` картинка вставляется.
- Заглушка: размер из `size` используется до загрузки, затем заменяется на изображение.

## Чек-лист работ

### Фаза 2: Embedded Images (реализация)
- [x] Уточнить формат `[[image:<id>]]` и правила валидации `id`.
- [x] Зафиксировать формат `images[]` (id, url, alt).
- [x] Добавить таблицу `images` (agent/message/image/status/hash/bytes) + миграцию.
- [x] Реализовать `ImageStorageManager`.
- [x] Реализовать загрузку изображений внутри `MainPipeline` (без отдельного класса).
- [x] Реализовать IPC `images:get` в `ImageStorageManager` с чтением `images`.
- [x] Реализовать `MessageImageResolver` в renderer.
- [x] Добавить обработку ошибок: неизвестный id, не найден URL, неподдерживаемый тип, превышение лимита.
- [x] Добавить поддержку `link` и валидацию URL (http/https) для кликов.
- [x] Добавить поддержку `size` и заглушку с неброским лоадером.
- [x] Определить дефолтный размер заглушки, если `size` не указан.
- [x] Добавить в коде единое описание схемы Structured Output (поля, автоматически передаваемые в модель).
- [x] Обновить системный промпт.

### Фаза 3: Дозакрытие тестового покрытия
- [x] Добавить unit-тесты (парсер/хранилище/ошибки).
- [ ] Добавить functional-тесты (рендер/ошибки/кэш).
- [x] Исключить hidden из истории и покрыть модульным и функциональным тестом.
- [x] Обсудить и согласовать формат replay-истории: в историю передаётся человеко-читаемый текст и информация о ссылках/метаданных изображений из прошлых `images[]` (без сырого JSON-дампа как единственного источника смысла).
- [x] Реализовать согласованный replay-формат истории: передавать текст ответа и информацию по изображениям (минимум `id`, `url`, `link`, опционально `alt`) в сообщениях для модели.
- [x] Добавить unit/functional-тесты на replay-историю: проверить, что в историю попадают и текст, и данные по ссылкам изображений.
- [ ] Добавить functional-тест: invalid structured output → retry (до 2 повторов) → ошибка `"Invalid response format. Please try again later."` + действие `Retry`.
- [ ] Добавить unit-тест в `MainPipeline`: проверить, что при retry отправляется инструкция `"Your previous response did not match the required JSON schema. Reply again using the exact required format only."`.
- [ ] Добавить unit-тесты провайдеров/контракта: проверить, что описание Structured Output (схема + форматы + семантика) передаётся из единого декларативного контракта.
- [ ] Добавить unit-тест: `messages.usage_json` не дублирует `provider`, `model`, `timestamp`.
- [ ] Выровнять requirement-ссылки в комментариях тестов под `llm-integration.10/11/12/13`.

## Чек-лист тестов

### Модульные тесты
- [x] Парсер плейсхолдеров: `[[image:id]]` валиден.
- [x] Парсер плейсхолдеров: `[[image:id|link:https://...]]` извлекает `link`.
- [x] Парсер плейсхолдеров: `[[image:id|size:640x180]]` извлекает размеры.
- [x] Парсер плейсхолдеров: комбинация `link+size`.
- [ ] Парсер плейсхолдеров: невалидный формат игнорируется.
- [x] Парсер плейсхолдеров: лишние пробелы/порядок параметров обрабатываются корректно.
- [ ] Парсер плейсхолдеров: дубликаты `id` в тексте → корректный список.
- [ ] Парсер плейсхолдеров: вложенные плейсхолдеры в одном параграфе.
- [ ] Парсер плейсхолдеров: плейсхолдер внутри ссылок/кода не обрабатывается.
- [ ] Парсер плейсхолдеров: кириллица/юникод в `id` запрещена.
- [x] Валидация `id`: запрещённые символы → ошибка.
- [x] Валидация URL: не http/https → `status=error`.
- [x] Валидация URL: слишком длинный URL → `status=error`.
- [x] Валидация `size`: некорректный формат → игнор, дефолт.
- [x] Валидация `size`: нулевые/отрицательные значения → игнор.
- [x] Валидация `size`: слишком большие значения → игнор/ограничить.
- [x] `ImageStorageManager`: успешная загрузка → запись в БД.
- [ ] `ImageStorageManager`: повторный запрос для того же `(agentId, messageId, imageId)` → обновляет запись.
- [ ] `ImageStorageManager`: превышение 50GB → ошибка.
- [x] `ImageStorageManager`: неподдерживаемый content-type → ошибка.
- [x] `ImageStorageManager`: `images:get` → `status=error` при отсутствии записи (нештатно).
- [ ] `ImageStorageManager`: `images:get` → `status=error` при ошибке/таймауте.
- [x] `ImageStorageManager`: `images:get` → `status=success` и bytes при успехе.
- [ ] `MainPipeline`: вызывает `downloadAndStore` для всех изображений из `images[]`.
- [ ] `ImageStorageManager`: сетевой/timeout → ошибка.
- [x] `ImageStorageManager`: пустой ответ/0 bytes → ошибка.
- [x] `ImageStorageManager`: отсутствует content-type → ошибка.
- [ ] `ImageStorageManager`: корректная обработка `image/svg+xml`.
- [ ] SVG: санитизация перед рендером удаляет опасные теги/атрибуты (script/foreignObject/on*).
- [ ] `ImageStorageManager`: корректно логирует ошибки без UI-показа.
- [x] `ImageStorageManager`: ставит `status=success` при успехе.
- [x] `ImageStorageManager`: ставит `status=error` при ошибке/таймауте.
- [ ] `MainPipeline`: `missing_image_descriptor` если id нет в `images[]` (через `ImageStorageManager.markMissingDescriptor`).
- [ ] `MainPipeline`: не запускает повторную загрузку для того же `(agentId, messageId, imageId)` в рамках одного сообщения.
- [ ] `MainPipeline`: несколько изображений в одном сообщении.
- [ ] `MainPipeline`: одинаковые `id` → один запрос на загрузку.
- [ ] `MainPipeline`: изображения без плейсхолдеров → всё равно скачиваются.
- [ ] `MainPipeline`: частичный успех (1 ok, 1 fail).
- [x] Polling: пока `status=pending` → placeholder остаётся.
- [x] Polling: при `status=success` → изображение вставляется.
- [ ] Polling: таймаут 60 секунд → placeholder удаляется.
- [x] История: hidden исключаются из replay.
- [x] История: в replay передаются текст ответа и данные изображений (`id/url/link/alt`).
- [x] История: плейсхолдеры остаются в истории (не удаляются).
- [ ] MainPipeline: invalid response format → retry с системным сообщением.
- [ ] MainPipeline: после 1–2 retry создаётся `kind: error` с `Retry`.
- [ ] MainPipeline: retry не зацикливается (счётчик попыток).
- [ ] Добавить functional test: invalid structured output → 2 retry → `kind:error` в чате с кнопкой `Retry`.
- [ ] Renderer: отмена polling при unmount сообщения.

### Функциональные тесты
- [x] Базовый рендер: `[[image:1]]` + `images[]` → `<img>` появляется.
- [ ] Кликабельность: `link` оборачивает `<img>` в `<a>`.
- [ ] Размер: `size:640x180` задаёт размер заглушки до загрузки.
- [ ] Без размера: дефолтная заглушка.
- [ ] Ошибка: неизвестный `id` → placeholder удаляется.
- [ ] Ошибка: невалидный URL → placeholder удаляется.
- [ ] Ошибка: неподдерживаемый тип → placeholder удаляется.
- [x] Polling вместо событий: изображение вставляется после готовности в main.
- [ ] Повторный рендер не вызывает повторных загрузок (кэш).
- [ ] Кликабельная картинка с `size` → правильная заглушка и `<a><img></a>`.

## Definition of Done (Фаза 3)

- [ ] реализация не противоречит `design.md` и `requirements.md`.
