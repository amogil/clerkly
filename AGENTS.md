# Agent Guide

This document describes all rules, workflows, and work formats. These rules are mandatory.

---

## 1. Quick Command Reference

### Validation
```bash
npm run validate          # full validation (TypeScript, ESLint, Prettier, unit tests)
npm run validate:verbose  # same, with verbose output
npm run validate:deps     # validate + optional dependency check (npm outdated)
npm run validate:verbose:deps  # verbose validate + optional dependency check
```

### Tests
```bash
npm test                    # unit tests
npm run test:unit           # unit tests only
npm run test:functional     # functional tests (they open windows!)
npm run test:coverage       # tests with coverage report
```

### Debugging
```bash
npm run test:unit -- path/to/test.ts -t "test name"   # specific test
npm run test:functional:debug -- test.spec.ts          # functional tests, stop on first failure
npx playwright show-report                             # functional test HTML report
```

### Build
```bash
npm run rebuild:node      # rebuild native modules for Node.js
npm run rebuild:electron  # rebuild native modules for Electron
npm run build             # build the application
```

---

## 2. Mandatory Workflow

Every task MUST be executed using the following workflow:

### Step 1: Gather Context

1. Read the plan file for the current task (located in the relevant spec folder as `plan-<NNNN>-<desc>.md`)
2. Read the specifications referenced in the plan:
   - `requirements.md`
   - `design.md`
3. Review existing code and tests related to the task

### Step 2: Execute the Plan

- Execute the plan step by step
- After each significant change, run relevant unit tests according to sections 4 and 5
- Write code with requirement comments
- Write tests with the correct structure (see section 6)
- **Prohibition:** Do not remove or change behavior defined in requirements without user approval

### Step 3: Complete

1. Ensure specs and design are complete, consistent, and non-redundant
2. Ensure all code changes match the requirements and design
3. Run `npm run validate`
4. Ensure all checks pass:
   - ✅ TypeScript compilation
   - ✅ ESLint
   - ✅ Prettier
   - ✅ Unit tests
   - ✅ Code coverage
5. Ask the user: *"Task completed. Run functional tests? (they will open windows on screen)"*

### Step 4: Report

Provide a short summary at the end (without creating separate files):

```
Task completed.

Implemented:
- [item 1]

Files changed:
- [file 1]

Tests added/updated:
- [test 1]

Remaining work:
- [item 1] (if any)
```

---

## 3. Working with Specifications

### Specification Structure

All specifications are located in `docs/specs/<feature-name>/`.
Required files for a feature:

```
docs/specs/
  <feature-name>/
    requirements.md   # What needs to be built (requirements)
    design.md         # How it is built (architecture and design)
```

### Before Starting Work on a Feature

You MUST read:

```
docs/specs/<feature>/requirements.md
docs/specs/<feature>/design.md
```

For test-related work, also read:
```
docs/specs/testing-infrastructure/requirements.md
docs/specs/testing-infrastructure/design.md
```

These documents describe: mocking strategy, helper function rules (testing.10), element wait rules (testing.11), and toast error checks (testing.12).

---

### requirements.md Format

The requirements file describes **what** should be implemented from the user's perspective.

**File structure:**

```markdown
# Requirements Document: <Feature Name>

## Introduction

Short description of the feature and its purpose.

## Glossary

- **Term** - definition

## Requirements

### 1. <Requirement Group Name>

**ID:** <feature-id>.1

**User Story:** As a [role], I want [action], so that [goal].

#### Acceptance Criteria

1.1. [Requirement]
1.2. [Requirement]
1.2.1. WHEN [condition], THEN [result]

#### Functional Tests

- `tests/functional/<file>.spec.ts` - "test name"
```

**Rules:**
- Requirement IDs: `<feature-id>.<group>.<item>` (for example, `agents.1.3`)
- Every User Story MUST have a "Functional Tests" section
- Language: Russian
- Acceptance criteria are written in **EARS** (Easy Approach to Requirements Syntax)

---

### Requirement/Design Separation (mandatory)

- `requirements.md` describes ONLY what the user should see/get
- `requirements.md` MUST NOT include implementation details: component names, props, classes, DOM structure, specific utility class values, sizes/tokens, or references to specific files/components
- All implementation details (components, props, layout, classes, DOM structure, JSX examples) MUST be in `design.md`

---

### EARS Format for Acceptance Criteria

EARS is a standard way to write unambiguous requirements. Every requirement uses one of these templates:

#### EARS Templates

**Ubiquitous (always true)**
```
<subject> SHALL <action>
```
Example: `Agent list SHALL be displayed in the header`

**Event-driven (reaction to an event)**
```
WHEN <trigger>, <subject> SHALL <action>
```
Example: `WHEN user presses Enter, message SHALL be sent`

**Unwanted behavior (handling undesired behavior)**
```
IF <undesired condition>, <subject> SHALL <action>
```
Example: `IF connection is lost, application SHALL show an error notification`

**State-driven (active in a specific state)**
```
WHILE <state>, <subject> SHALL <action>
```
Example: `WHILE the agent is working, indicator SHALL animate`

**Optional feature**
```
WHERE <support condition>, <subject> SHALL <action>
```
Example: `WHERE OAuth is enabled, sign-in button SHALL be visible`

**Combined templates** - templates can be combined:
```
WHEN <trigger>, IF <condition>, <subject> SHALL <action>
```
Example: `WHEN user archives an agent, IF it is the last agent, system SHALL create a new agent automatically`

#### Keywords

- `SHALL` - mandatory requirement
- `SHOULD` - recommended (not mandatory)
- `MAY` - optional
- `SHALL NOT` - prohibition

#### Usage in this project

Existing specs use a Russian adaptation of EARS:
- `КОГДА` = WHEN
- `ЕСЛИ` = IF
- `ПОКА` = WHILE
- `ТО ... ДОЛЖЕН` = SHALL

Both variants are allowed. The key is consistency within one file.

**Examples from real specs:**
```
1.4.1. КОГДА updatedAt агента обновляется, ТО агент ДОЛЖЕН автоматически перемещаться в начало списка
2.8. КОГДА список агентов пуст, ТО ДОЛЖЕН автоматически создаваться новый агент
4.3. КОГДА пользователь нажимает Enter (без Shift), ТО сообщение ДОЛЖНО отправляться
```

**What to avoid:**
- ❌ "System should be fast" - no measurable criterion
- ❌ "Agent list is displayed" - no subject and modality
- ❌ "An agent can be created" - ambiguous, use SHALL/MAY explicitly
- ✅ "WHEN user clicks '+', system SHALL create a new agent and make it active"

---

### design.md Format

The design file describes **how** the feature is implemented: architecture, components, data flows.

Structure may vary by feature, but it MUST include:

```markdown
# Design: <Feature Name>

## Overview

Short description of the architectural approach.

## [Architecture Sections]

For example: "Database Schema", "Main Process Architecture", "Renderer Architecture",
"Real-time Events", "Algorithms", "UI Components" - depending on the feature.

## Testing Strategy

### Unit Tests

- `tests/unit/<path>/<File>.test.ts` - what it validates

### Functional Tests

- `tests/functional/<file>.spec.ts` - what it validates

### Requirements Coverage

| Requirement  | Unit Tests | Functional Tests |
|--------------|------------|------------------|
| feature.1.1  | ✓          | -                |
| feature.1.2  | ✓          | ✓                |
```

**Rules:**
- Coverage table MUST exist and include ALL requirements from requirements.md
- Component names must be in English and enclosed in quotes when mentioned
- Language: Russian

---

### Creating a New Specification

When creating a new feature:

1. Create folder `docs/specs/<feature-name>/`
2. Create `requirements.md` - describe User Stories and acceptance criteria
3. Create `design.md` - describe architecture and components
4. Get user approval before implementation

**Feature naming:** lowercase letters with hyphens (for example, `token-management-ui`)

---

### Updating Specifications

When code changes, you MUST update the corresponding specs:

- Behavior changed -> update `requirements.md`
- Architecture changed -> update `design.md`
- Test added -> update coverage table in `design.md`

Specifications MUST be:
- **Complete** - cover all aspects of functionality
- **Consistent** - contain no conflicting requirements
- **Up to date** - reflect current code state

---

## 4. Testing Strategy

This section defines test principles and constraints. Exact commands and run order are described in section 5.

### Test Types

| Type | Location | Mocks | Goal |
|-----|----------|-------|------|
| Unit | `tests/unit/**/*.test.ts` | ✅ All external dependencies | Isolated logic |
| Functional | `tests/functional/**/*.spec.ts` | ❌ Real Electron | End-to-end scenarios |

**Functional tests** use Playwright, display real windows, and do NOT mock Electron API.

**Terminology:** in this document, `unit` and `functional` are equivalent to their Russian counterparts `модульные` and `функциональные`.

### Rules for Functional Tests

**testing.10 - Helper functions:** Always use `createMockOAuthServer(port)` from `tests/functional/helpers/electron.ts`. Do NOT instantiate `MockOAuthServer` directly via `new`.

**testing.11 - Waiting for elements:** Do NOT use `waitForTimeout` to wait for elements. Use locators with built-in waiting:

```typescript
// ❌ WRONG
await window.waitForTimeout(500);
await expect(messages).toHaveCount(1);

// ✅ CORRECT
await expect(messages.first()).toBeVisible({ timeout: 2000 });
await expect(messages).toHaveCount(1);
```

`waitForTimeout` is allowed ONLY for animations without DOM indicators or debounce with known timing - with a mandatory comment.

**testing.12 - Toast errors:** After key actions, verify there are no toast errors. If a toast of type `error` exists in DOM, the test must fail with that toast text.

### Code Coverage Rules

Minimum requirements:
- Statements: 85%
- Branches: 80%
- Functions: 85%
- Lines: 85%

Exceptions: database migration files, config files, types without logic.

### Definitions

- **Edge cases** - boundary values, empty data, null/undefined, max/min values
- **Exceptional situations** - network failures, unavailable resources, timeouts, invalid inputs

---

## 5. Running Tests

This section defines commands, run order, and debugging for tests.

### Preparation

Before running tests, you MUST rebuild native modules:

```bash
npm run rebuild:node
```

When needed:
- After switching Node.js version
- After `npm install`
- On `ERR_DLOPEN_FAILED` or `MODULE_NOT_FOUND` errors
- Before first run after cloning repository

`npm test` runs rebuild automatically. For separate test types, do it manually:

```bash
npm run rebuild:node && npm run test:unit
```

### Unit Tests

```bash
# Specific file
npm run test:unit -- tests/unit/auth/UserProfileManager.test.ts

# Specific test by name
npm run test:unit -- -t "should validate token expiration"

# Directory
npm run test:unit -- tests/unit/auth/

# Verbose output
npm run test:unit -- tests/unit/auth/UserProfileManager.test.ts --verbose

# Stop on first failure
npm run test:unit -- tests/unit/auth/UserProfileManager.test.ts --bail
```

**CRITICALLY IMPORTANT**: If tests fail, run ONLY failed tests, not all tests.

### Functional Tests

**IMPORTANT**: They open real Electron windows on screen!

```bash
npm run test:functional                                          # all tests
npm run test:functional:verbose                                  # verbose output
npm run test:functional:debug                                    # stop on first failure
npm run test:functional:single -- navigation.spec.ts             # specific file
npm run test:functional:single -- --grep "should show login"     # by test name
```

#### When to run functional tests

- "Run all tests" -> ✅ run, after warning about windows
- "Run functional tests" -> ✅ run, after warning about windows
- Task completion by agent -> ❌ DO NOT run automatically, ASK user (see Step 3 workflow)
- Automatic validation -> ❌ DO NOT run

#### Running functional tests in background

Functional tests are long (~30 minutes). Use background execution via available tools in the current agent environment and follow these rules:

1. Verify `npm run test:functional` is not already running.
2. Start exactly one instance in background.
3. Monitor output and status until completion.
4. Stop the process if needed via available environment mechanisms.

### Run order for "run all tests"

1. `npm run validate` - fast checks (TypeScript, ESLint, Prettier, unit)
2. `npm run test:functional` - only if step 1 passed

If any step fails, stop and report to user.

### Debugging failed tests

#### Unit tests

```bash
# Step 1: run only failed test
npm run test:unit -- tests/unit/auth/UserProfileManager.test.ts -t "specific test name"

# Step 2: with verbose output
npm run test:unit -- tests/unit/auth/UserProfileManager.test.ts -t "specific test name" --verbose
```

### Parallel execution

- ✅ Jest already parallelizes tests inside `test:unit`
- ❌ Do NOT run functional tests in parallel with anything

---

## 6. Code Writing Rules

### Requirement comments

Every function, class, and method MUST have a requirements comment:

```typescript
// Requirements: feature-id.1.1, feature-id.1.2
function implementFeature() {
  // implementation
}
```

### Test structure

Every test MUST include a structured comment:

```typescript
/* Preconditions: description of initial system state
   Action: description of the action performed
   Assertions: description of expected results
   Requirements: feature-id.1.1, feature-id.1.2 */
it("should perform expected behavior", () => {
  // test implementation
});
```

### Logger

Every class creates its own logger instance with class name:

```typescript
// ✅ CORRECT
this.logger = new Logger('UserProfileManager');
this.logger.info('User ID set: abc123');
// Output: [UserProfileManager] User ID set: abc123

// ❌ WRONG - class name duplication
this.logger.info('[UserProfileManager] User ID set: abc123');
// Output: [UserProfileManager] [UserProfileManager] User ID set: abc123
```

### ErrorHandler

For errors in background processes, use `ErrorHandler.handleBackgroundError`:

```typescript
// ✅ CORRECT
async fetchProfile(): Promise<UserProfile | null> {
  try {
    // ...
  } catch (error) {
    ErrorHandler.handleBackgroundError(error, 'Profile Loading');
    return null;
  }
}

// ❌ WRONG - local logging
catch (error) {
  this.logger.error('Failed to fetch profile:', error);
}
```

ErrorHandler automatically filters race condition errors (does not show them to user), but always logs them for debugging.

---

## 7. Documentation Rules

### Language

| File | Language |
|------|----------|
| requirements.md | Russian |
| design.md | Russian |
| Code comments | English |
| GitHub (issues, PR descriptions, review comments/replies, commit messages) | English |
| File and variable names | English |

### Language in GitHub

- All GitHub communication MUST be in English:
  - issues
  - pull request descriptions
  - review comments and replies
  - commit messages related to PRs

### Language in code comments

- All code comments MUST be in English.

### Component naming

- Component names must be in English
- No underscores
- Use quotes when mentioning them

✅ "Main Process", "OAuth Flow", "Sidebar State"  
❌ Главный_Процесс, OAuth_Flow

---

## 8. Critical Prohibitions

### Disabling tests

**ABSOLUTE PROHIBITION** - do not use `.skip()`, `.only()`, or comment out tests without explicit user permission.

Before disabling a test, you MUST:
1. Explain to the user why the test cannot be fixed
2. Propose alternatives (move to functional tests, simplify, fix code)
3. Obtain explicit confirmation

### Creating reports and summary files

**FORBIDDEN** to create files like `VALIDATION_REPORT.md`, `SUMMARY.md`, `WORK_REPORT.md` without explicit user request.

Correct approach: provide a short verbal summary at the end (2-3 sentences).

### Environment variables

**FORBIDDEN** to add new `process.env.VARIABLE_NAME` without explicit user agreement.

Exceptions: variable already exists in code, user explicitly asked, standard variables (`NODE_ENV`, `PATH`).

### AI Elements and UI vendor components

**ABSOLUTE PROHIBITION** - do not manually edit library-managed components in:
- `src/renderer/components/ai-elements/**`
- `src/renderer/components/ui/**`

These files are vendor scope and will be overwritten by library updates.

Allowed update path:
1. Update components only via the official CLI flow (`npm run ai-elements:update-all`).
2. Apply product customizations only in app-owned layers outside those directories.
3. If a change appears to require editing vendor files, stop and request explicit user approval first.

---

## 9. Priority in Case of Conflicts

1. **Data safety** - do not lose user data
2. **Explicit user instructions** - if the user explicitly requested, execute
3. **Do not disrupt user** - do not open windows without warning
4. **Efficiency** - do not run all tests when one test is enough
5. **Code quality** - do not disable tests, fix problems


