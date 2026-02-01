# Test Mocks Documentation

This directory contains mock implementations of external dependencies for testing the Clerkly application.

## Overview

The mocks provide test doubles for:
- **Electron API** - Main process, renderer process, IPC, and native modules
- **better-sqlite3** - SQLite database operations

## Electron Mocks (`electron.js`)

### Available Mocks

#### `app`
Mock of Electron's app module for application lifecycle management.

**Key Methods:**
- `whenReady()` - Returns a promise that resolves when app is ready
- `on(event, callback)` - Register event listener
- `quit()` - Quit the application
- `getPath(name)` - Get system paths (returns mock paths)
- `getName()` / `setName(name)` - Get/set app name

**Example:**
```javascript
const { app } = require('electron');

test('app lifecycle', async () => {
  app.isReady = true;
  await app.whenReady();
  expect(app.getName()).toBe('Clerkly');
});
```

#### `BrowserWindow`
Mock of Electron's BrowserWindow class for window management.

**Key Methods:**
- `constructor(options)` - Create window with options
- `loadFile(path)` - Load HTML file
- `loadURL(url)` - Load URL
- `on(event, callback)` - Register event listener
- `close()` - Close window
- `show()` / `hide()` - Show/hide window
- `setTitle(title)` / `getTitle()` - Get/set window title

**Example:**
```javascript
const { BrowserWindow } = require('electron');

test('window creation', () => {
  const win = new BrowserWindow({ width: 800, height: 600 });
  expect(win.options.width).toBe(800);
  win.setTitle('Test Window');
  expect(win.getTitle()).toBe('Test Window');
});
```

#### `ipcMain`
Mock of Electron's ipcMain for main process IPC.

**Key Methods:**
- `handle(channel, handler)` - Register IPC handler
- `on(channel, listener)` - Register event listener
- `removeHandler(channel)` - Remove handler
- `_invokeHandler(channel, event, ...args)` - **Test helper** to simulate IPC call

**Example:**
```javascript
const { ipcMain } = require('electron');

test('IPC handler', async () => {
  ipcMain.handle('test-channel', (event, data) => {
    return { success: true, data };
  });
  
  const mockEvent = { sender: { send: jest.fn() } };
  const result = await ipcMain._invokeHandler('test-channel', mockEvent, 'test');
  
  expect(result.success).toBe(true);
  expect(result.data).toBe('test');
});
```

#### `ipcRenderer`
Mock of Electron's ipcRenderer for renderer process IPC.

**Key Methods:**
- `send(channel, ...args)` - Send message to main process
- `invoke(channel, ...args)` - Invoke IPC handler (returns promise)
- `on(channel, listener)` - Register event listener
- `_simulateMessage(channel, event, ...args)` - **Test helper** to simulate receiving message

**Example:**
```javascript
const { ipcRenderer } = require('electron');

test('IPC renderer', () => {
  const listener = jest.fn();
  ipcRenderer.on('test-channel', listener);
  
  const mockEvent = { sender: { send: jest.fn() } };
  ipcRenderer._simulateMessage('test-channel', mockEvent, 'data');
  
  expect(listener).toHaveBeenCalledWith(mockEvent, 'data');
});
```

#### `shell`
Mock of Electron's shell module for external operations.

**Key Methods:**
- `openExternal(url)` - Open URL in external browser (jest.fn)
- `openPath(path)` - Open file path (jest.fn)
- `showItemInFolder(path)` - Show item in folder (jest.fn)
- `moveItemToTrash(path)` - Move to trash (jest.fn)

**Example:**
```javascript
const { shell } = require('electron');

test('open external URL', async () => {
  await shell.openExternal('https://example.com');
  expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
});
```

#### `dialog`
Mock of Electron's dialog module for user interactions.

**Key Methods:**
- `showOpenDialog(options)` - Show open file dialog (jest.fn)
- `showSaveDialog(options)` - Show save file dialog (jest.fn)
- `showMessageBox(options)` - Show message box (jest.fn)
- `showErrorBox(title, content)` - Show error box (jest.fn)

**Example:**
```javascript
const { dialog } = require('electron');

test('show dialog', async () => {
  dialog.showMessageBox.mockResolvedValue({ response: 0 });
  const result = await dialog.showMessageBox({ message: 'Test' });
  expect(result.response).toBe(0);
});
```

#### `Menu` and `MenuItem`
Mock of Electron's Menu and MenuItem classes.

**Example:**
```javascript
const { Menu, MenuItem } = require('electron');

test('create menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Quit' }] }
  ]);
  expect(menu.items).toHaveLength(1);
});
```

#### `Notification`
Mock of Electron's Notification class.

**Example:**
```javascript
const { Notification } = require('electron');

test('show notification', () => {
  const notif = new Notification({ title: 'Test', body: 'Message' });
  notif.show();
  expect(notif.isShown).toBe(true);
});
```

### Reset Function

**`resetAllMocks()`**
Resets all mock state between tests. This is automatically called in `beforeEach` by the test setup.

**Manual usage:**
```javascript
const { resetAllMocks } = require('electron');

afterEach(() => {
  resetAllMocks();
});
```

## better-sqlite3 Mocks (`better-sqlite3.js`)

### Database Mock

Mock implementation of better-sqlite3 Database class.

**Constructor:**
```javascript
const Database = require('better-sqlite3');
const db = new Database(':memory:'); // or filename
```

**Key Methods:**
- `prepare(sql)` - Prepare SQL statement
- `exec(sql)` - Execute SQL directly
- `close()` - Close database
- `transaction(fn)` - Create transaction function
- `pragma(name, simple)` - Get/set pragma

**Properties:**
- `open` - Boolean indicating if database is open
- `inTransaction` - Boolean indicating if in transaction
- `name` - Database filename
- `memory` - Boolean indicating if in-memory database

### Statement Mock

Mock implementation of prepared statements.

**Key Methods:**
- `run(...params)` - Execute statement (INSERT, UPDATE, DELETE)
- `get(...params)` - Get single row (SELECT)
- `all(...params)` - Get all rows (SELECT)
- `iterate(...params)` - Iterate over rows

**Example:**
```javascript
const Database = require('better-sqlite3');

test('database operations', () => {
  const db = new Database(':memory:');
  
  // Prepare and run INSERT
  const insert = db.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
  const result = insert.run('test-key', 'test-value');
  expect(result.changes).toBe(1);
  
  // Prepare and run SELECT
  const select = db.prepare('SELECT * FROM data WHERE key = ?');
  const row = select.get('test-key');
  expect(row.value).toBe('test-value');
  
  db.close();
});
```

### Helper Functions

**`createInMemoryDatabase()`**
Creates a new in-memory database for testing.

**`resetDatabase(db)`**
Resets all data in a database instance.

**Example:**
```javascript
const { createInMemoryDatabase, resetDatabase } = require('better-sqlite3');

let db;

beforeEach(() => {
  db = createInMemoryDatabase();
});

afterEach(() => {
  resetDatabase(db);
  db.close();
});
```

## Test Setup (`setup.js`)

The test setup file runs before each test suite and provides:

### Global Configuration
- Resets all Electron mocks before each test
- Sets `process.platform` to 'darwin' (Mac OS X)
- Sets `process.env.NODE_ENV` to 'test'
- Configures 10-second test timeout

### Custom Matchers

**`toBeValidTimestamp()`**
Checks if a value is a valid timestamp.

```javascript
test('timestamp validation', () => {
  const timestamp = Date.now();
  expect(timestamp).toBeValidTimestamp();
});
```

**`toBeValidPath()`**
Checks if a value is a valid path string.

```javascript
test('path validation', () => {
  expect('/some/path').toBeValidPath();
});
```

### Global Test Utilities

Available via `global.testUtils`:

**`waitFor(condition, timeout, interval)`**
Wait for a condition to become true.

```javascript
test('async condition', async () => {
  let ready = false;
  setTimeout(() => { ready = true; }, 100);
  
  await global.testUtils.waitFor(() => ready, 5000, 50);
  expect(ready).toBe(true);
});
```

**`createMockEvent()`**
Create a mock IPC event object.

```javascript
test('IPC event', () => {
  const event = global.testUtils.createMockEvent();
  expect(event.sender.send).toBeDefined();
});
```

**`sleep(ms)`**
Sleep for specified milliseconds.

```javascript
test('delayed operation', async () => {
  const start = Date.now();
  await global.testUtils.sleep(100);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeGreaterThanOrEqual(100);
});
```

## Best Practices

### 1. Always Reset Mocks
The setup file automatically resets mocks before each test, but you can manually reset if needed:

```javascript
const { resetAllMocks } = require('electron');

afterEach(() => {
  resetAllMocks();
});
```

### 2. Use Test Helpers
Use the provided test helper methods (prefixed with `_`) for simulating IPC calls:

```javascript
// Good
const result = await ipcMain._invokeHandler('channel', mockEvent, data);

// Avoid - doesn't actually test the handler
const result = await ipcRenderer.invoke('channel', data);
```

### 3. Mock Return Values
Configure mock return values for your specific test cases:

```javascript
const { dialog } = require('electron');

dialog.showOpenDialog.mockResolvedValue({
  canceled: false,
  filePaths: ['/path/to/file']
});
```

### 4. Verify Mock Calls
Always verify that mocks were called correctly:

```javascript
const { shell } = require('electron');

await shell.openExternal('https://example.com');
expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
expect(shell.openExternal).toHaveBeenCalledTimes(1);
```

### 5. Use In-Memory Database
For database tests, always use in-memory databases:

```javascript
const Database = require('better-sqlite3');

let db;

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});
```

## Troubleshooting

### Mock Not Working
If a mock isn't working, check:
1. The module name in `jest.config.js` `moduleNameMapper`
2. The import/require statement in your test
3. That you're using the correct mock method names

### IPC Handler Not Found
When testing IPC handlers, make sure to:
1. Register the handler with `ipcMain.handle()`
2. Use `ipcMain._invokeHandler()` to test it
3. Provide a mock event object

### Database Mock Not Persisting Data
The database mock uses an in-memory Map. Make sure:
1. You're using the same database instance
2. You're not calling `resetDatabase()` between operations
3. Your SQL statements match the expected format

## Requirements Coverage

These mocks satisfy the following requirements:
- **clerkly.2.1** - Модульные тесты для всех компонентов бизнес-логики
- **clerkly.2.5** - Все тесты автоматизированы и запускаются через npm test

The mocks enable comprehensive testing of:
- Application lifecycle management
- Window management
- IPC communication
- Data storage operations
- Native module interactions
