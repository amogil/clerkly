// Requirements: testing.3.9

import type { MockLLMServer } from './mock-llm-server';

export function resetMockLLMServerState(mockLLMServer: MockLLMServer): void {
  mockLLMServer.setSuccess(true);
  mockLLMServer.setError(401, 'Invalid API key');
  mockLLMServer.setDelay(0);
  mockLLMServer.setRateLimitMode(false);
  mockLLMServer.setStreamingMode(false, {
    reasoning: '',
    content: 'Hello! How can I help?',
    errorStatus: 0,
    errorMessage: 'Invalid API key',
    chunkDelayMs: 0,
  });
  mockLLMServer.setOpenAIStreamScripts([]);
  mockLLMServer.setWebSearchErrorMode(0);
  mockLLMServer.clearRequestLogs();
}
