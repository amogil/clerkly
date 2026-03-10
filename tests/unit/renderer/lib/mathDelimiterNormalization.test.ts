// Requirements: agents.7.7, llm-integration.4.5

import { normalizeMathDelimiters } from '../../../../src/renderer/lib/mathDelimiterNormalization';

describe('normalizeMathDelimiters', () => {
  /* Preconditions: inline and block LaTeX delimiters are present in plain text
     Action: normalize content
     Assertions: delimiters are converted to $...$ and $$...$$
     Requirements: agents.7.7, llm-integration.4.5 */
  it('should convert inline and block LaTeX delimiters in text', () => {
    const input = 'Inline \\(E=mc^2\\)\n\nBlock:\n\\[\\sum_{i=1}^{n} i\\]';
    const output = normalizeMathDelimiters(input);

    expect(output).toContain('Inline $E=mc^2$');
    expect(output).toContain('Block:\n$$\n\\sum_{i=1}^{n} i\n$$');
  });

  /* Preconditions: content contains fenced and inline code with LaTeX-like text
     Action: normalize content
     Assertions: code segments remain unchanged
     Requirements: agents.7.7 */
  it('should not rewrite fenced and inline code segments', () => {
    const input = [
      'Text \\(a+b\\)',
      '',
      '```tex',
      '\\(code\\)',
      '\\[code\\]',
      '```',
      '',
      '`\\(inline code\\)`',
    ].join('\n');

    const output = normalizeMathDelimiters(input);

    expect(output).toContain('Text $a+b$');
    expect(output).toContain('```tex\n\\(code\\)\n\\[code\\]\n```');
    expect(output).toContain('`\\(inline code\\)`');
  });

  /* Preconditions: model returns escaped dollar math delimiters in plain text
     Action: normalize content
     Assertions: escaped delimiters are converted to KaTeX-compatible delimiters
     Requirements: agents.7.7, llm-integration.4.5 */
  it('should convert escaped dollar math delimiters in text', () => {
    const input = 'where \\$v\\$ is Higgs VEV and \\$y_f\\$ is Yukawa coupling';
    const output = normalizeMathDelimiters(input);

    expect(output).toContain('where $v$ is Higgs VEV and $y_f$ is Yukawa coupling');
  });

  /* Preconditions: escaped dollar delimiters appear inside fenced and inline code
     Action: normalize content
     Assertions: code segments remain unchanged
     Requirements: agents.7.7 */
  it('should not rewrite escaped dollar delimiters inside code segments', () => {
    const input = [
      'Text \\$a+b\\$',
      '',
      '```md',
      '\\$code\\$',
      '```',
      '',
      '`\\$inline code\\$`',
    ].join('\n');

    const output = normalizeMathDelimiters(input);

    expect(output).toContain('Text $a+b$');
    expect(output).toContain('```md\n\\$code\\$\n```');
    expect(output).toContain('`\\$inline code\\$`');
  });
});
