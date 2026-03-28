# Agent Guide

This document describes all rules, workflows, and work formats. These rules are mandatory.

---

## 1. Workflow

Task execution is handled by the agent system: **solver** -> **planner** -> **coder** -> **reviewer**. Each agent follows its own workflow defined in `.forge/agents/`. See `.forge/agents/solver.md` for the full workflow diagram and label transitions.

---

## 2. Working with Specifications

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

## 3. Testing Strategy

This section defines test principles and constraints. Exact commands and run order are in the coder agent definition (`.forge/agents/coder.md`).

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

## 4. Code Writing Rules

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

## 5. Documentation Rules

### Language

| File | Language |
|------|----------|
| requirements.md | Russian |
| design.md | Russian |
| plan-*.md | English |
| Agent definitions (.forge/agents/) | English |
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

## 6. Critical Prohibitions

### Creating reports and summary files

**FORBIDDEN** to create files like `VALIDATION_REPORT.md`, `SUMMARY.md`, `WORK_REPORT.md` without explicit user request.

Correct approach: provide a short verbal summary at the end (2-3 sentences).

### Git history

**NEVER** rewrite git history — no `--force`, `--amend`, `rebase`.

---

## 7. Priority in Case of Conflicts

1. **Data safety** - do not lose user data
2. **Explicit user instructions** - if the user explicitly requested, execute
3. **Do not disrupt user** - do not open windows without warning
4. **Efficiency** - do not run all tests when one test is enough
5. **Code quality** - do not disable tests, fix problems


