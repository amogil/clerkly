// Requirements: agents.7.7, llm-integration.4.5

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

// Requirements: agents.4.11
/**
 * Normalize markdown spacing for reasoning text.
 * Inserts a single space before bold opener `**` when it is glued to previous plain text
 * (outside fenced and inline code), e.g. `soon!**Resolving**` -> `soon! **Resolving**`.
 */
export function normalizeReasoningMarkdownSpacing(content: string): string {
  if (!content || !content.includes('**')) {
    return content;
  }

  const fencedCodePattern = /(```[\s\S]*?```)/g;
  const inlineCodePattern = /(`[^`\n]*`)/g;

  const normalizeNonCodeSegment = (segment: string): string =>
    segment.replace(/([^\s])(\*\*)(?=\S)/g, '$1 $2');

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
