# GitHub CLI Skill

Этот skill описывает работу с GitHub через CLI инструмент `gh`.

## Установка

```bash
# Проверить установлен ли gh
gh --version

# Если не установлен, установить через Homebrew (macOS)
brew install gh

# Авторизация
gh auth login
```

## Работа с Issues

### Просмотр Issues

```bash
# Список всех открытых issues в текущем репозитории
gh issue list

# Список issues с фильтрами
gh issue list --state open          # Только открытые
gh issue list --state closed        # Только закрытые
gh issue list --state all           # Все issues
gh issue list --assignee @me        # Назначенные на меня
gh issue list --label bug           # С меткой "bug"
gh issue list --author username     # Созданные пользователем

# Просмотр конкретного issue
gh issue view 123                   # По номеру
gh issue view 123 --web             # Открыть в браузере

# Просмотр с комментариями
gh issue view 123 --comments
```

### Создание Issues

```bash
# Интерактивное создание
gh issue create

# Создание с параметрами
gh issue create --title "Bug title" --body "Description"

# С метками и назначением
gh issue create --title "Feature" --label enhancement --assignee username

# Из файла
gh issue create --title "Title" --body-file description.md
```

### Управление Issues

```bash
# Закрыть issue
gh issue close 123

# Открыть заново
gh issue reopen 123

# Добавить комментарий
gh issue comment 123 --body "Comment text"

# Редактировать issue
gh issue edit 123 --title "New title"
gh issue edit 123 --add-label bug
gh issue edit 123 --remove-label enhancement
gh issue edit 123 --add-assignee username
```

## Работа с Pull Requests

### Просмотр PR

```bash
# Список PR
gh pr list
gh pr list --state open
gh pr list --state merged
gh pr list --author @me

# Просмотр конкретного PR
gh pr view 456
gh pr view 456 --web
gh pr view 456 --comments

# Проверить статус CI/CD
gh pr checks 456
```

### Создание PR

```bash
# Интерактивное создание
gh pr create

# С параметрами
gh pr create --title "PR title" --body "Description"
gh pr create --draft                # Создать как draft
gh pr create --base main            # Указать базовую ветку
```

### Управление PR

```bash
# Checkout PR локально
gh pr checkout 456

# Merge PR
gh pr merge 456
gh pr merge 456 --squash            # Squash merge
gh pr merge 456 --rebase            # Rebase merge

# Закрыть без merge
gh pr close 456

# Review PR
gh pr review 456 --approve
gh pr review 456 --request-changes --body "Comments"
gh pr review 456 --comment --body "General comment"
```

## Работа с Репозиториями

```bash
# Просмотр информации о репозитории
gh repo view
gh repo view owner/repo

# Клонирование
gh repo clone owner/repo

# Создание репозитория
gh repo create my-repo --public
gh repo create my-repo --private

# Fork репозитория
gh repo fork owner/repo
```

## Работа с Releases

```bash
# Список релизов
gh release list

# Просмотр релиза
gh release view v1.0.0

# Создание релиза
gh release create v1.0.0 --title "Version 1.0.0" --notes "Release notes"

# Загрузка файлов в релиз
gh release upload v1.0.0 dist/*.zip
```

## Работа с Gists

```bash
# Список gists
gh gist list

# Создание gist
gh gist create file.txt
gh gist create file.txt --public

# Просмотр gist
gh gist view gist-id
```

## Полезные Команды

```bash
# Открыть репозиторий в браузере
gh repo view --web

# Открыть issue/PR в браузере
gh issue view 123 --web
gh pr view 456 --web

# Поиск issues
gh issue list --search "bug in:title"

# Статус текущей ветки
gh pr status

# Просмотр workflow runs (GitHub Actions)
gh run list
gh run view run-id
gh run watch run-id              # Следить за выполнением
```

## Форматирование Вывода

```bash
# JSON формат
gh issue list --json number,title,state

# Кастомный формат с jq
gh issue list --json number,title | jq '.[] | "\(.number): \(.title)"'

# Ограничение количества результатов
gh issue list --limit 10
```

## Алиасы

Создание алиасов для частых команд:

```bash
# Создать алиас
gh alias set issues 'issue list --assignee @me'

# Использовать
gh issues

# Список алиасов
gh alias list
```

## Конфигурация

```bash
# Просмотр конфигурации
gh config list

# Установка редактора по умолчанию
gh config set editor vim

# Установка браузера
gh config set browser firefox

# Установка протокола (https/ssh)
gh config set git_protocol ssh
```

## Примеры Workflow

### Работа с Issue

```bash
# 1. Посмотреть список issues
gh issue list --label bug

# 2. Открыть конкретный issue
gh issue view 123

# 3. Назначить на себя
gh issue edit 123 --add-assignee @me

# 4. Добавить комментарий
gh issue comment 123 --body "Working on this"

# 5. Закрыть после исправления
gh issue close 123 --comment "Fixed in PR #456"
```

### Создание PR из Issue

```bash
# 1. Создать ветку для issue
git checkout -b fix-issue-123

# 2. Сделать изменения и commit
git add .
git commit -m "Fix issue #123"

# 3. Push ветки
git push -u origin fix-issue-123

# 4. Создать PR, связанный с issue
gh pr create --title "Fix: Issue #123" --body "Closes #123"
```

## Автоматизация

### Скрипт для просмотра своих задач

```bash
#!/bin/bash
echo "=== My Open Issues ==="
gh issue list --assignee @me --state open

echo -e "\n=== My Open PRs ==="
gh pr list --author @me --state open

echo -e "\n=== PRs Waiting for My Review ==="
gh pr list --search "review-requested:@me"
```

### Скрипт для создания issue из шаблона

```bash
#!/bin/bash
TITLE="$1"
BODY="$2"

gh issue create \
  --title "$TITLE" \
  --body "$BODY" \
  --label bug \
  --assignee @me
```

## Интеграция с Kiro

При работе с GitHub issues через Kiro:

1. Используй `gh issue list` для просмотра списка задач
2. Используй `gh issue view <number>` для детального просмотра
3. Создавай issues через `gh issue create` с понятными заголовками
4. Связывай PR с issues через "Closes #123" в описании PR
5. Используй метки для категоризации (bug, enhancement, documentation)

## Troubleshooting

```bash
# Проблемы с авторизацией
gh auth status
gh auth refresh

# Переавторизация
gh auth logout
gh auth login

# Проверка версии
gh --version

# Обновление gh
brew upgrade gh
```
