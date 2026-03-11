// Requirements: code_exec.2.1-2.2, code_exec.2.7-2.8.2, code_exec.3.4-3.5

export const POLICY_DENIED_TOOL_MESSAGE = 'Tool is not allowed in sandbox allowlist.';
export const POLICY_DENIED_MAIN_PIPELINE_TOOL_MESSAGE =
  'Main-pipeline-only tool is denied in sandbox runtime.';

export const MAIN_PIPELINE_ONLY_TOOL_NAMES = ['final_answer', 'code_exec'] as const;
export const SANDBOX_TOOLS_ALLOWLIST: readonly string[] = [];

const MAIN_PIPELINE_ONLY_TOOLS = new Set<string>(MAIN_PIPELINE_ONLY_TOOL_NAMES);
const SANDBOX_TOOLS_ALLOWLIST_SET = new Set<string>(SANDBOX_TOOLS_ALLOWLIST);

export interface SandboxToolPolicyResult {
  ok: boolean;
  reason?: string;
}

// Requirements: code_exec.2.7-2.8.2, code_exec.3.4
export function validateSandboxToolPolicy(toolName: unknown): SandboxToolPolicyResult {
  if (typeof toolName !== 'string' || toolName.trim().length === 0) {
    return { ok: false, reason: POLICY_DENIED_TOOL_MESSAGE };
  }

  if (MAIN_PIPELINE_ONLY_TOOLS.has(toolName)) {
    return { ok: false, reason: POLICY_DENIED_MAIN_PIPELINE_TOOL_MESSAGE };
  }

  if (!SANDBOX_TOOLS_ALLOWLIST_SET.has(toolName)) {
    return { ok: false, reason: POLICY_DENIED_TOOL_MESSAGE };
  }

  return { ok: true };
}

// Requirements: code_exec.2.2, code_exec.2.8.1
export function createSandboxToolsProxy(
  denyPolicy: (message: string) => never
): Record<string, (...args: unknown[]) => unknown> {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        const policy = validateSandboxToolPolicy(prop);
        if (!policy.ok) {
          return () => denyPolicy(policy.reason ?? POLICY_DENIED_TOOL_MESSAGE);
        }
        return () => denyPolicy(POLICY_DENIED_TOOL_MESSAGE);
      },
    }
  ) as Record<string, (...args: unknown[]) => unknown>;
}
