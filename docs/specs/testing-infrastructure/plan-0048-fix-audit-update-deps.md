# Plan: Fix npm audit vulnerabilities and update outdated dependencies (#48)

## Context

Issue [#48](https://github.com/amogil/clerkly/issues/48) requests fixing npm audit vulnerabilities and updating outdated dependencies before the 0.1 release. The current `npm audit` reports **24 vulnerabilities** (4 low, 9 moderate, 10 high, 1 critical). Additionally, `npm outdated` lists **44 packages** with newer versions available.

The validate script (`scripts/validate.sh`) already has an informational security audit step (step 8) and optional dependency check (step 9), but neither blocks validation. This task is about actually resolving the issues, not changing the pipeline.

## Analysis

### Root cause

Dependencies have drifted since initial setup. Several transitive dependencies have known vulnerabilities. Direct dependencies have patch/minor updates available.

### Vulnerability breakdown

**Resolvable by `npm audit fix` (non-breaking, 15 vulnerabilities):**
- `@xmldom/xmldom` < 0.8.12 (high) -- XML injection
- `ajv` < 6.14.0 (moderate) -- ReDoS
- `brace-expansion` < 1.1.13 / < 2.0.3 (moderate) -- DoS
- `dompurify` <= 3.3.1 (moderate) -- XSS
- `flatted` <= 3.4.1 (high) -- DoS + prototype pollution
- `handlebars` 4.7.8 (critical) -- multiple injection/XSS/DoS
- `minimatch` multiple ranges (high) -- ReDoS
- `picomatch` <= 2.3.1 / <= 4.0.3 (high) -- method injection + ReDoS
- `rollup` 4.0.0-4.58.0 (high) -- path traversal
- `yaml` 1.x / 2.x (moderate) -- stack overflow

**Remaining after `npm audit fix` (9 vulnerabilities, require breaking changes):**

| Package | Severity | Root dependency | Fix |
|---------|----------|-----------------|-----|
| `@tootallnate/once` | low | `electron-builder@24.13.3` | Upgrade `electron-builder` to ^26.8.1 |
| `tar` (3 instances) | high | `electron-builder@24.13.3`, `@electron/rebuild`, `cacache`, `node-gyp` | Upgrade `electron-builder` to ^26.8.1 |
| `esbuild` <= 0.24.2 (2 instances) | moderate | `drizzle-kit@0.30.6` | Upgrade `drizzle-kit` to ^0.31.10 |
| `electron` < 35.7.5 | moderate | direct dependency | Evaluate major upgrade (28 -> 35+) |

### Outdated dependencies categorization

**Safe updates (patch/minor within semver range, `Wanted` column):**

| Package | Current | Wanted | Type |
|---------|---------|--------|------|
| `@ai-sdk/anthropic` | 3.0.58 | 3.0.64 | minor/patch |
| `@ai-sdk/google` | 3.0.43 | 3.0.55 | minor/patch |
| `@ai-sdk/openai` | 3.0.41 | 3.0.49 | minor/patch |
| `@ai-sdk/react` | 3.0.118 | 3.0.144 | minor/patch |
| `@mui/icons-material` | 7.3.7 | 7.3.9 | patch |
| `@mui/material` | 7.3.7 | 7.3.9 | patch |
| `@playwright/test` | 1.58.1 | 1.59.0 | minor |
| `@streamdown/cjk` | 1.0.2 | 1.0.3 | patch |
| `@streamdown/code` | 1.1.0 | 1.1.1 | patch |
| `@tailwindcss/postcss` | 4.1.18 | 4.2.2 | minor |
| `@tailwindcss/vite` | 4.1.18 | 4.2.2 | minor |
| `@types/node` | 20.19.30 | 20.19.37 | patch |
| `@typescript-eslint/eslint-plugin` | 8.54.0 | 8.58.0 | minor |
| `@typescript-eslint/parser` | 8.54.0 | 8.58.0 | minor |
| `ai` | 6.0.116 | 6.0.142 | minor/patch |
| `jest-environment-jsdom` | 30.2.0 | 30.3.0 | minor |
| `jest-util` | 30.2.0 | 30.3.0 | minor |
| `motion` | 12.36.0 | 12.38.0 | minor |
| `playwright` | 1.58.1 | 1.59.0 | minor |
| `postcss` | 8.5.6 | 8.5.8 | patch |
| `react-day-picker` | 9.13.2 | 9.14.0 | minor |
| `react-hook-form` | 7.71.1 | 7.72.0 | minor |
| `streamdown` | 2.4.0 | 2.5.0 | minor |
| `tailwind-merge` | 3.4.0 | 3.5.0 | minor |
| `tailwindcss` | 4.1.18 | 4.2.2 | minor |
| `yaml` | 2.8.2 | 2.8.3 | patch |
| `zod-to-json-schema` | 3.25.1 | 3.25.2 | patch |
| `typescript` | 5.9.3 | 5.9.3 | (already at wanted) |

**Major version updates (require evaluation):**

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `electron` | 28.3.3 | 41.1.0 | HIGH - Chromium/Node.js major leap, API changes. Impacts all main process code. |
| `electron-builder` | 24.13.3 | 26.8.1 | MEDIUM - Fixes `tar` and `@tootallnate/once` vulns. Build config may need changes. |
| `drizzle-kit` | 0.30.6 | 0.31.10 | MEDIUM - Fixes `esbuild` vuln. Migration generation tool, may change output format. |
| `drizzle-orm` | 0.38.4 | 0.45.2 | MEDIUM - ORM used throughout, API may have breaking changes. |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.1 | MEDIUM - Major version jump, may require vite config changes. |
| `vite` | 6.4.1 | 8.0.3 | HIGH - Two major versions ahead, bundler config and plugin compat. |
| `eslint` | 8.57.1 | 10.1.0 | HIGH - Flat config migration required. |
| `jest` | 29.7.0 | 30.3.0 | MEDIUM - Test runner, may need config adjustments. |
| `@types/jest` | 29.5.14 | 30.0.0 | MEDIUM - Must match jest version. |
| `date-fns` | 3.6.0 | 4.1.0 | LOW - Utility lib, API mostly stable. |
| `better-sqlite3` | 11.10.0 | 12.8.0 | MEDIUM - Native module, needs rebuild. |
| `lucide-react` | 0.487.0 | 1.7.0 | LOW - Icon library, likely non-breaking. |
| `react-resizable-panels` | 2.1.9 | 4.8.0 | MEDIUM - UI component, API may change. |
| `recharts` | 2.15.4 | 3.8.1 | MEDIUM - Chart library, API changes expected. |
| `eslint-config-prettier` | 9.1.2 | 10.1.8 | LOW - Config package. |
| `eslint-plugin-react-hooks` | 5.2.0 | 7.0.1 | MEDIUM - May require eslint 9+. |
| `typescript` | 5.9.3 | 6.0.2 | HIGH - Language version, may introduce type errors. |
| `zod` | 3.25.76 | 4.3.6 | HIGH - Validation library used everywhere, major rewrite. |

### Affected requirements

- `testing.4.1` -- validate pipeline must pass after all changes
- `testing.4.6` -- dependency check behavior unchanged (informational)

### Affected specifications

- `docs/specs/testing-infrastructure/requirements.md` -- no changes needed (requirements already cover dependency checks)
- `docs/specs/testing-infrastructure/design.md` -- no changes needed

## Action plan

### Phase 1: Specifications

No specification changes required. The existing `testing.4.6` and `testing.4.7` requirements already define how dependency checks work in the validate pipeline. This task is purely an operational dependency update, not a feature or behavior change.

- [x] Reviewed `testing-infrastructure/requirements.md` -- confirmed no changes needed
- [x] Reviewed `testing-infrastructure/design.md` -- confirmed no changes needed

### Phase 2: Code

#### Step 2.1: Run `npm audit fix` (non-breaking fixes)

- [x] Run `npm audit fix` to resolve 15 vulnerabilities automatically
- [x] Verify `npm audit` output shows reduced vulnerability count
- [x] Commit: `fix: resolve npm audit vulnerabilities via npm audit fix`

#### Step 2.2: Update safe dependencies (patch/minor within semver range)

- [x] Run `npm update` to update all packages to their `Wanted` versions
- [x] This covers all 27 packages listed in the "Safe updates" table above
- [x] Commit: `chore: update dependencies to latest compatible versions`

#### Step 2.3: Upgrade `electron-builder` 24.13.3 -> 26.8.1

- [ ] Update `package.json`: `"electron-builder": "^26.8.1"`
- [ ] Run `npm install`
- [ ] Verify `electron-builder.json` config is compatible with v26
- [ ] Verify `npm run package:mac` works (or at least `electron-builder --help`)
- [ ] This resolves `@tootallnate/once` and `tar` vulnerabilities (5 vulns)
- [ ] Commit: `fix: upgrade electron-builder to v26 to resolve tar/once vulnerabilities`

#### Step 2.4: Upgrade `drizzle-kit` 0.30.6 -> 0.31.10

- [ ] Update `package.json`: `"drizzle-kit": "^0.31.10"`
- [ ] Run `npm install`
- [ ] Verify `drizzle-kit` CLI still works: `npx drizzle-kit generate --help`
- [ ] This resolves `esbuild` vulnerability (2 vulns)
- [ ] Commit: `fix: upgrade drizzle-kit to v0.31 to resolve esbuild vulnerability`

#### Step 2.5: Evaluate `drizzle-orm` upgrade 0.38.4 -> 0.45.2

- [ ] Check drizzle-orm changelog for breaking changes between 0.38 and 0.45
- [ ] If safe, update `package.json`: `"drizzle-orm": "^0.45.2"`
- [ ] If breaking, document justification for deferral and add `overrides` if needed
- [ ] Run `npm install` and verify DB operations work
- [ ] Commit: `chore: upgrade drizzle-orm to v0.45` (if proceeding)

#### Step 2.6: Evaluate `electron` upgrade

- [ ] Electron 28 -> 35+ is a major undertaking (7 major versions)
- [ ] The vulnerability (ASAR Integrity Bypass, moderate) is dev-only and does not affect production runtime security since the app is not distributed via adversarial channels yet
- [ ] **Recommendation: Defer to a separate dedicated issue.** Document justification in PR description.
- [ ] If deferred, the `electron` vulnerability (1 moderate) remains as accepted risk

#### Step 2.7: Evaluate remaining major updates

- [ ] `vite` 6 -> 8, `@vitejs/plugin-react` 4 -> 6: Defer -- major bundler changes, separate issue
- [ ] `eslint` 8 -> 10: Defer -- requires flat config migration, separate issue
- [ ] `jest` 29 -> 30: Defer -- already have `jest-environment-jsdom@30` working, but core `jest` upgrade needs careful testing. Note: `@types/jest` should stay at 29 until `jest` is upgraded to 30.
- [ ] `typescript` 5 -> 6: Defer -- language-level change, separate issue
- [ ] `zod` 3 -> 4: Defer -- major rewrite, used throughout codebase, separate issue
- [ ] `date-fns` 3 -> 4, `lucide-react` 0.x -> 1.x, `react-resizable-panels` 2 -> 4, `recharts` 2 -> 3: Defer -- UI libs, test in isolation
- [ ] `better-sqlite3` 11 -> 12: Defer -- native module, needs rebuild testing
- [ ] `eslint-config-prettier` 9 -> 10, `eslint-plugin-react-hooks` 5 -> 7: Defer -- tied to eslint upgrade
- [ ] Document all deferred items in PR description with justification

### Phase 3: Tests

- [ ] Run `npm run validate` -- must pass fully (testing.4.1)
- [ ] Run `npm run test:functional` -- verify no regressions in Electron-based tests
- [ ] No new test files needed -- this is a dependency update, not a behavior change

### Phase 4: Finalization

- [ ] No coverage table changes needed (no new requirements)
- [ ] Run `npm run validate` one final time
- [ ] Document in PR description:
  - Full list of vulnerabilities fixed
  - Full list of packages updated
  - Remaining vulnerabilities with justification
  - Deferred major upgrades with links to future issues

## Files to change

| File | Change |
|------|--------|
| `package.json` | Update dependency versions for `electron-builder`, `drizzle-kit`, potentially `drizzle-orm`; all semver-compatible bumps via `npm update` |
| `package-lock.json` | Auto-regenerated by `npm audit fix`, `npm update`, and `npm install` |

## Expected result

After plan execution:
- Critical and high vulnerabilities are resolved (handlebars, tar, minimatch, picomatch, rollup, xmldom, flatted)
- Moderate vulnerabilities from `npm audit fix` are resolved (ajv, brace-expansion, dompurify, yaml)
- `electron-builder` upgraded to v26, resolving `@tootallnate/once` and `tar` chain
- `drizzle-kit` upgraded to v0.31, resolving `esbuild` chain
- All safe patch/minor dependencies updated to latest compatible versions
- `npm run validate` passes fully
- Remaining accepted risks:
  - `electron` ASAR integrity bypass (moderate, dev-only) -- deferred to separate issue
  - Major version upgrades for `vite`, `eslint`, `jest`, `typescript`, `zod` -- deferred to separate issues

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `electron-builder` v26 config incompatibility | Medium | Verify `electron-builder.json` against v26 migration guide; test `npm run package:mac` |
| `drizzle-kit` v0.31 migration format changes | Medium | Run `npx drizzle-kit generate --help` to verify CLI; compare generated migration output |
| `drizzle-orm` v0.45 API breaking changes | Medium | Check changelog carefully; run full test suite; defer if risky |
| `npm update` breaks a transitive dependency | Low | `npm run validate` catches regressions; can revert individual packages |
| Deferred `electron` vuln remains | Low | Moderate severity, dev-only impact, documented as accepted risk for 0.1 |
