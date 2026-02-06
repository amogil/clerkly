# Google OAuth Setup Instructions for Desktop App

## Обзор

Приложение использует **Custom URI Scheme** с **OAuth 2.0 PKCE flow** согласно RFC 8252 для безопасной авторизации без использования localhost.

## Формат Custom URI

Google рекомендует использовать формат: `com.googleusercontent.apps.CLIENT_ID:/oauth2redirect`

Где `CLIENT_ID` - это числовая часть вашего Client ID (без `.apps.googleusercontent.com`).

**Пример**: Если ваш Client ID `1234567890-abcdef.apps.googleusercontent.com`, то redirect URI будет:
```
com.googleusercontent.apps.1234567890-abcdef:/oauth2redirect
```

## Шаги настройки

### 1. Создайте проект в Google Cloud Console

1. Перейдите на https://console.cloud.google.com/
2. Создайте новый проект или выберите существующий
3. Включите Google+ API (или People API) для проекта

### 2. Настройте OAuth Consent Screen

1. Перейдите в **APIs & Services** → **OAuth consent screen**
2. Выберите **External** (для тестирования) или **Internal** (для организации)
3. Заполните обязательные поля:
   - **App name**: Clerkly
   - **User support email**: ваш email
   - **Developer contact information**: ваш email
4. Добавьте scopes:
   - `openid`
   - `email`
   - `profile`
5. Сохраните изменения

### 3. Создайте OAuth Client ID для Desktop App

**КРИТИЧЕСКИ ВАЖНО**: Тип приложения должен быть **Desktop app**!

1. Перейдите в **APIs & Services** → **Credentials**
2. Нажмите **Create Credentials** → **OAuth client ID**
3. Выберите **Application type**: **Desktop app**
4. **Name**: Clerkly Desktop
5. Нажмите **Create**
6. Скопируйте **Client ID** (например: `1234567890-abcdef.apps.googleusercontent.com`)

### 4. Определите ваш Redirect URI

Google автоматически принимает redirect URI в формате:
```
com.googleusercontent.apps.ЧИСЛОВАЯ_ЧАСТЬ_CLIENT_ID:/oauth2redirect
```

**Пример**: Если Client ID = `1234567890-abcdef.apps.googleusercontent.com`, то:
- Числовая часть: `1234567890-abcdef`
- Redirect URI: `com.googleusercontent.apps.1234567890-abcdef:/oauth2redirect`

**ВАЖНО**: Для Desktop app OAuth client **НЕ НУЖНО** вручную добавлять redirect URI в консоли - Google автоматически принимает этот формат!

### 5. Обновите конфигурацию в коде

Откройте `src/main/auth/OAuthConfig.ts` и обновите:

```typescript
export const OAUTH_CONFIG = {
  clientId: 'ВАШ_CLIENT_ID.apps.googleusercontent.com', // Полный Client ID
  redirectUri: 'com.googleusercontent.apps.ЧИСЛОВАЯ_ЧАСТЬ:/oauth2redirect', // Замените ЧИСЛОВАЯ_ЧАСТЬ
  scopes: ['openid', 'email', 'profile'],
} as const;
```

**Пример**:
```typescript
export const OAUTH_CONFIG = {
  clientId: '1234567890-abcdef.apps.googleusercontent.com',
  redirectUri: 'com.googleusercontent.apps.1234567890-abcdef:/oauth2redirect',
  scopes: ['openid', 'email', 'profile'],
} as const;
```

### 6. Обновите Protocol Handler

Откройте `src/main/index.ts` и обновите строку с `protocolScheme`:

```typescript
const protocolScheme = 'com.googleusercontent.apps.ЧИСЛОВАЯ_ЧАСТЬ';
```

**Пример**:
```typescript
const protocolScheme = 'com.googleusercontent.apps.1234567890-abcdef';
```

### 7. Перебилдите приложение

```bash
npm run build
```

### 8. Запустите приложение

```bash
npm start
```

## Как это работает

1. **Регистрация Protocol**: Приложение регистрирует custom URI scheme при запуске
2. **Открытие браузера**: При нажатии "Login" открывается системный браузер с Google OAuth
3. **Авторизация**: Пользователь авторизуется в браузере
4. **Redirect**: Google перенаправляет на `com.googleusercontent.apps.XXX:/oauth2redirect?code=...`
5. **Deep Link**: ОС перехватывает этот URL и активирует приложение
6. **Обмен токенов**: Приложение обменивает `code` на access token используя PKCE

## Проверка конфигурации

После настройки проверьте:

1. ✅ OAuth Consent Screen настроен
2. ✅ Client ID создан для **Desktop app**
3. ✅ Client ID обновлен в `OAuthConfig.ts`
4. ✅ Protocol scheme обновлен в `index.ts`
5. ✅ Redirect URI использует формат `com.googleusercontent.apps.XXX:/oauth2redirect`
6. ✅ Приложение перебилдено

## Текущая конфигурация (пример)

```typescript
// src/main/auth/OAuthConfig.ts
export const OAUTH_CONFIG = {
  clientId: '100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa.apps.googleusercontent.com',
  redirectUri: 'com.googleusercontent.apps.100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa:/oauth2redirect',
  scopes: ['openid', 'email', 'profile'],
} as const;

// src/main/index.ts
const protocolScheme = 'com.googleusercontent.apps.100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa';
```

## Почему не нужно добавлять Redirect URI вручную

Для **Desktop app** OAuth clients Google автоматически принимает redirect URI в формате:
- `com.googleusercontent.apps.CLIENT_ID:/oauth2redirect`
- `http://127.0.0.1:PORT` (loopback)
- `http://localhost:PORT` (loopback)

Поэтому в консоли Google Cloud вы **не увидите** поле "Authorized redirect URIs" для Desktop apps - это нормально!

## Дополнительные ресурсы

- [Google OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [RFC 8252 - OAuth 2.0 for Native Apps](https://tools.ietf.org/html/rfc8252)
- [OAuth 2.0 PKCE Flow](https://oauth.net/2/pkce/)
- [Google Cloud Console](https://console.cloud.google.com/)

## Troubleshooting

### Ошибка "invalid_request" с redirect_uri

Убедитесь что:
1. Используете формат `com.googleusercontent.apps.CLIENT_ID:/oauth2redirect`
2. CLIENT_ID в redirect URI совпадает с вашим Client ID
3. OAuth client создан как **Desktop app**, а не Web application

### Приложение не активируется после авторизации

1. Проверьте, что protocol scheme зарегистрирован в `index.ts`
2. Убедитесь, что приложение перебилдено после изменений
3. На macOS может потребоваться перезапуск системы для регистрации protocol
