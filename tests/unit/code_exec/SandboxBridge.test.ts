// Requirements: code_exec.2.7-2.8.2, code_exec.3.4-3.5

import {
  createSandboxToolsProxy,
  validateSandboxToolPolicy,
} from '../../../src/main/code_exec/SandboxBridge';

describe('validateSandboxToolPolicy', () => {
  /* Preconditions: tool policy validator receives unknown or empty tool names
     Action: validate undefined and empty names
     Assertions: policy denies both inputs
     Requirements: code_exec.2.7 */
  it('denies unknown and empty tool names', () => {
    expect(validateSandboxToolPolicy(undefined).ok).toBe(false);
    expect(validateSandboxToolPolicy('').ok).toBe(false);
  });

  /* Preconditions: tool policy validator receives tools reserved for the main pipeline
     Action: validate final_answer and code_exec as sandbox tools
     Assertions: policy denies both as main-pipeline-only tools
     Requirements: code_exec.2.7, code_exec.2.8 */
  it('denies main-pipeline-only tools', () => {
    const finalAnswer = validateSandboxToolPolicy('final_answer');
    const codeExec = validateSandboxToolPolicy('code_exec');

    expect(finalAnswer.ok).toBe(false);
    expect(finalAnswer.reason).toContain('Main-pipeline-only');
    expect(codeExec.ok).toBe(false);
  });

  /* Preconditions: tool policy validator receives a sandbox tool name outside the allowlist
     Action: validate a non-whitelisted helper name
     Assertions: policy denies the helper
     Requirements: code_exec.2.8 */
  it('denies non-whitelisted sandbox tools', () => {
    const result = validateSandboxToolPolicy('search_docs');
    expect(result.ok).toBe(false);
  });

  /* Preconditions: http_request is registered as an allowlisted sandbox helper
     Action: validate the http_request tool name
     Assertions: policy allows the helper
     Requirements: code_exec.2.8, sandbox-http-request.1.1, sandbox-http-request.1.2 */
  it('allows http_request sandbox helper', () => {
    const result = validateSandboxToolPolicy('http_request');
    expect(result.ok).toBe(true);
  });

  /* Preconditions: web_search is registered as an allowlisted sandbox helper
     Action: validate the web_search tool name
     Assertions: policy allows the helper
     Requirements: code_exec.2.8, sandbox-web-search.1.1 */
  it('allows web_search sandbox helper', () => {
    const result = validateSandboxToolPolicy('web_search');
    expect(result.ok).toBe(true);
  });
});

describe('createSandboxToolsProxy', () => {
  /* Preconditions: sandbox tools proxy receives an unknown helper call
     Action: invoke a missing tool through the proxy
     Assertions: the deny callback raises a policy_denied error
     Requirements: code_exec.2.7, code_exec.2.8 */
  it('throws policy_denied through deny callback for unknown tool', () => {
    const proxy = createSandboxToolsProxy((message: string) => {
      throw new Error(`policy_denied::${message}`);
    });

    expect(() => proxy.anyTool()).toThrow('policy_denied::');
  });
});
