# Clerkly - AI Agent

An Electron app for Mac OS X with local data storage and comprehensive test coverage.

## System Requirements

- **Node.js**: 18.0.0 or higher
- **Mac OS X**: 10.13 (High Sierra) or higher
- **Free disk space**: at least 500 MB

## Quick Start

```bash
# Install dependencies
npm install

# Run the app (production build with full functionality)
npm start

# Validate the project
npm run validate
```

## Google OAuth Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Configure the OAuth consent screen (External, scopes: openid, email, profile)
3. Create an OAuth 2.0 Client ID (type: Desktop app)
4. Update `src/main/auth/OAuthConfig.ts`:
   ```typescript
   export const OAUTH_CONFIG = {
     clientId: 'your-client-id.apps.googleusercontent.com',
     clientSecret: 'your-client-secret',
     redirectUri: 'com.googleusercontent.apps.YOUR_CLIENT_ID:/oauth2redirect',
     // ...
   };
   ```

## Main Commands

### Development
```bash
npm start                # Run the app (production build with DMG, 60-90 sec)
npm run dev              # Fast development WITHOUT deep links (10-15 sec)
npm run dev:app          # Development WITH OAuth deep links (20-30 sec)
npm run build            # Build the project
npm run typecheck        # Type checking
```

**Choosing a development mode:**
- `npm run dev` - for regular UI/logic development (fast)
- `npm run dev:app` - for testing Google OAuth flow (medium)
- `npm start` - for final pre-release testing (slow)

### Testing
```bash
npm test                 # Unit tests
npm run test:unit        # Unit tests
npm run test:functional  # Functional tests (Playwright, opens windows)
npm run test:coverage    # Coverage report
```

### Code Quality
```bash
npm run validate         # Full validation (recommended before commit)
npm run lint             # ESLint check
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier formatting
```

### Packaging
```bash
npm run package          # Create distribution build (DMG + ZIP)
```

## Test Types

1. **Unit tests** (`tests/unit/`)
   - Isolated testing with mocks
   - Speed: < 100ms per test

2. **Functional tests** (`tests/functional/`)
   - End-to-end with real Electron via Playwright
   - ⚠️ Open windows on screen

## Project Structure

```
clerkly/
├── src/
│   ├── main/           # Main process (Electron)
│   ├── renderer/       # Renderer process (React UI)
│   ├── preload/        # Preload script (IPC bridge)
│   └── types/          # TypeScript types
├── tests/
│   ├── unit/           # Unit tests
│   └── functional/     # Functional tests (Playwright)
├── migrations/         # SQLite migrations
├── docs/specs/         # Project specifications
└── dist/               # Compiled files
```

## Tech Stack

- **Electron** 28+ - Desktop application
- **TypeScript** 5+ - Programming language
- **React** 18+ - UI library
- **Tailwind CSS** 4+ - CSS framework
- **SQLite** (better-sqlite3) - Local storage
- **Vite** 6+ - Bundler
- **Jest** + **Playwright** - Testing

## Development Workflow

**Before commit:**
```bash
npm run validate
```

**Before release:**
```bash
npm run validate
npm run test:functional
npm run package
```

## Documentation

Full documentation is in `docs/specs/`:

**Core specifications:**
- `clerkly/` - General requirements and app architecture
- `testing-infrastructure/` - Testing strategy

**Authentication:**
- `google-oauth-auth/` - Google OAuth authentication

**UI components:**
- `window-management/` - App window management
- `navigation/` - Navigation and routing
- `account-profile/` - User profile
- `error-notifications/` - Error handling and display
- `token-management-ui/` - Token management UI
- `settings/` - Application settings
- `user-data-isolation/` - User data isolation

## Troubleshooting

**better-sqlite3 compilation error:**
```bash
npm rebuild better-sqlite3
```

**App does not start:**
```bash
npm run build
node --version  # Check version >= 18.0.0
```

**Tests are failing:**
```bash
npm test -- --clearCache
npm test -- --verbose
```

## License

MIT

---

**Version**: 1.0.0  
**Platform**: Mac OS X 10.13+
