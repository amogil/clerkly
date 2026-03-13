// Requirements: agents.7.7, llm-integration.4.5, agents.4.11.3, agents.4.11.4, agents.4.11.5

/**
 * Normalize common LaTeX delimiters to KaTeX markdown delimiters expected by Streamdown math plugin.
 * Converts:
 * - \( ... \) -> $...$
 * - \[ ... \] -> $$...$$
 * while preserving fenced and inline code segments.
 */
export function normalizeMathDelimiters(content: string): string {
  if (
    !content ||
    (!content.includes('\\(') && !content.includes('\\[') && !content.includes('\\$'))
  ) {
    return content;
  }

  const fencedCodePattern = /(```[\s\S]*?```)/g;
  const inlineCodePattern = /(`[^`\n]*`)/g;

  const normalizeNonCodeSegment = (segment: string): string =>
    segment
      .replace(/\\\$\$([\s\S]*?)\\\$\$/g, (_match, inner: string) => `$$\n${inner}\n$$`)
      .replace(/\\\$([^\n]+?)\\\$/g, (_match, inner: string) => `$${inner}$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner: string) => `$$\n${inner}\n$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner: string) => `$${inner}$`);

  return content
    .split(fencedCodePattern)
    .map((fencedOrText) => {
      if (fencedOrText.startsWith('```')) {
        return fencedOrText;
      }

      return fencedOrText
        .split(inlineCodePattern)
        .map((inlineOrText) =>
          inlineOrText.startsWith('`') ? inlineOrText : normalizeNonCodeSegment(inlineOrText)
        )
        .join('');
    })
    .join('');
}

/**
 * Normalize markdown spacing for reasoning text.
 * For glued bold openers in reasoning (outside fenced/inline code):
 * - inserts paragraph break before heading-like bold section after sentence punctuation
 *   (`soon!**Resolving**` -> `soon!\n\n**Resolving**`);
 * - otherwise falls back to a single space (`token**bold**` -> `token **bold**`).
 */
export function normalizeReasoningMarkdownSpacing(content: string): string {
  if (!content || !content.includes('**')) {
    return content;
  }

  const fencedCodePattern = /(```[\s\S]*?```)/g;
  const inlineCodePattern = /(`[^`\n]*`)/g;

  const normalizeNonCodeSegment = (segment: string): string =>
    segment.replace(/([.!?:…])(\*\*)(?=\S)/g, '$1\n\n$2').replace(/([^\s])(\*\*)(?=\S)/g, '$1 $2');

  return content
    .split(fencedCodePattern)
    .map((fencedOrText) => {
      if (fencedOrText.startsWith('```')) {
        return fencedOrText;
      }

      return fencedOrText
        .split(inlineCodePattern)
        .map((inlineOrText) =>
          inlineOrText.startsWith('`') ? inlineOrText : normalizeNonCodeSegment(inlineOrText)
        )
        .join('');
    })
    .join('');
}
