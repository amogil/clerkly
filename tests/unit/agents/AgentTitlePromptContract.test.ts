// Requirements: llm-integration.16.8.4

import { buildAutoTitleMetadataContractPrompt } from '../../../src/main/agents/PromptBuilder';

describe('buildAutoTitleMetadataContractPrompt', () => {
  /* Preconditions: Auto-title prompt is built with any current title
     Action: Build the auto-title metadata contract prompt
     Assertions: The prompt output contains an instruction prohibiting paired punctuation in titles
     Requirements: llm-integration.16.8.4 */
  it('contains instruction prohibiting paired punctuation in titles', () => {
    const prompt = buildAutoTitleMetadataContractPrompt('New Agent');

    expect(prompt).toContain('quotes');
    expect(prompt).toContain('parentheses');
    expect(prompt).toContain('brackets');
    expect(prompt).toContain('braces');
    expect(prompt).toContain('backticks');
    expect(prompt).toContain('angle brackets');
    expect(prompt).toContain('plain text');
  });
});
