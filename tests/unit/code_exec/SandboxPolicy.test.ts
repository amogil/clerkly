// Requirements: code_exec.2.3.1-2.3.2

import {
  SANDBOX_DOCUMENT_CSP,
  attachSandboxNavigationGuards,
  attachSandboxSessionPolicies,
  isBlockedEgressUrl,
} from '../../../src/main/code_exec/SandboxPolicy';

describe('SandboxPolicy', () => {
  it('blocks egress protocols and allows local/file protocols', () => {
    expect(isBlockedEgressUrl('https://example.com')).toBe(true);
    expect(isBlockedEgressUrl('http://example.com')).toBe(true);
    expect(isBlockedEgressUrl('wss://example.com')).toBe(true);
    expect(isBlockedEgressUrl('ws://example.com')).toBe(true);
    expect(isBlockedEgressUrl('file:///tmp/a')).toBe(false);
  });

  it('defines sandbox CSP with connect-src none', () => {
    expect(SANDBOX_DOCUMENT_CSP).toContain("connect-src 'none'");
  });

  it('attaches deny handlers for session permissions and network', () => {
    const onBeforeRequest = jest.fn();
    const setPermissionRequestHandler = jest.fn();
    const setPermissionCheckHandler = jest.fn();
    const session = {
      webRequest: {
        onBeforeRequest,
      },
      setPermissionRequestHandler,
      setPermissionCheckHandler,
    } as unknown as Parameters<typeof attachSandboxSessionPolicies>[0];

    attachSandboxSessionPolicies(session);

    expect(onBeforeRequest).toHaveBeenCalled();
    expect(setPermissionRequestHandler).toHaveBeenCalled();
    expect(setPermissionCheckHandler).toHaveBeenCalled();
  });

  it('attaches navigation deny handlers', () => {
    const setWindowOpenHandler = jest.fn();
    const on = jest.fn();
    const webContents = {
      setWindowOpenHandler,
      on,
    } as unknown as Parameters<typeof attachSandboxNavigationGuards>[0];

    attachSandboxNavigationGuards(webContents);

    expect(setWindowOpenHandler).toHaveBeenCalled();
    expect(on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    expect(on).toHaveBeenCalledWith('will-redirect', expect.any(Function));
  });
});
