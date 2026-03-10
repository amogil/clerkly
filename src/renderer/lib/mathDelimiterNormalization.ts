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
