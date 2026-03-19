export function createMathPlugin(options?: { singleDollarTextMath?: boolean }) {
  return { name: 'katex', singleDollarTextMath: options?.singleDollarTextMath ?? false };
}

export const math = createMathPlugin();
