// Requirements: testing-infrastructure.3.11, testing-infrastructure.8.3

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createFakeNpmBin(tempRoot: string): { binDir: string; logPath: string } {
  const binDir = path.join(tempRoot, 'bin');
  const logPath = path.join(tempRoot, 'npm-calls.log');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(logPath, '', 'utf8');

  const npmPath = path.join(binDir, 'npm');
  const npmScript = `#!/bin/sh
echo "$@" >> "${logPath}"
if [ "$1" = "run" ] && [ "$2" = "test:unit" ]; then
  echo "Test Suites: 1 passed, 1 total"
  echo "Tests:       1 passed, 1 total"
  echo "Time:        0.01 s"
fi
if [ "$1" = "run" ] && [ "$2" = "test:coverage" ]; then
  echo "--------------------------------|---------|----------|---------|---------|"
  echo "All files                       |     100 |      100 |     100 |     100 |"
fi
exit 0
`;
  fs.writeFileSync(npmPath, npmScript, { encoding: 'utf8', mode: 0o755 });
  return { binDir, logPath };
}

describe('validate.sh argument flags', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/validate.sh');
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-script-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const runValidate = (args: string[]) => {
    const { binDir, logPath } = createFakeNpmBin(tempRoot);
    const result = spawnSync('bash', [scriptPath, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
    });
    const npmCalls = fs.readFileSync(logPath, 'utf8');
    return { result, npmCalls };
  };

  /* Preconditions: validation script is executed without dependency-check flag
     Action: run validate.sh with fake npm
     Assertions: dependency check is skipped and npm outdated is not called
     Requirements: testing-infrastructure.3.11 */
  it('skips dependency check by default', () => {
    const { result, npmCalls } = runValidate([]);

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Dependency check skipped by default');
    expect(npmCalls).not.toContain('outdated');
  });

  /* Preconditions: validation script is executed with dependency-check flag
     Action: run validate.sh --with-dependency-check with fake npm
     Assertions: dependency check branch is enabled and npm outdated is called
     Requirements: testing-infrastructure.3.11 */
  it('enables dependency check with --with-dependency-check', () => {
    const { result, npmCalls } = runValidate(['--with-dependency-check']);

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Checking for outdated dependencies');
    expect(npmCalls).toContain('outdated');
  });

  /* Preconditions: validation script is executed in verbose mode with dependency check
     Action: run validate.sh --verbose --with-dependency-check with fake npm
     Assertions: verbose run path is used and summary marks dependency check as enabled
     Requirements: testing-infrastructure.3.11 */
  it('supports combined --verbose and --with-dependency-check flags', () => {
    const { result } = runValidate(['--verbose', '--with-dependency-check']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain('Running in verbose mode');
    expect(output).toContain('Running: npm run test:unit');
    expect(output).toContain('Dependency check (informational, enabled)');
  });
});
