// Requirements: llm-integration.1
// tests/unit/utils/imagePlaceholders.test.ts

import { parseImagePlaceholders } from '../../../src/shared/utils/imagePlaceholders';

describe('parseImagePlaceholders', () => {
  /* Preconditions: Text contains a basic placeholder
     Action: Parse placeholders
     Assertions: Returns id and no invalid flag
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should parse basic placeholder', () => {
    const result = parseImagePlaceholders('Here [[image:1]]');
    expect(result.invalid).toBe(false);
    expect(result.placeholders).toEqual([{ id: 1 }]);
  });

  /* Preconditions: Placeholder includes link and size
     Action: Parse placeholders
     Assertions: Extracts link and size values
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should parse link and size', () => {
    const result = parseImagePlaceholders('[[image:2|link:https://example.com|size:640x180]]');
    expect(result.invalid).toBe(false);
    expect(result.placeholders[0]).toEqual({
      id: 2,
      link: 'https://example.com',
      size: { width: 640, height: 180 },
    });
  });

  /* Preconditions: Placeholder has invalid id
     Action: Parse placeholders
     Assertions: Marks invalid format
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark invalid id', () => {
    const result = parseImagePlaceholders('[[image:abc]]');
    expect(result.invalid).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  /* Preconditions: Placeholder has invalid size
     Action: Parse placeholders
     Assertions: Ignores size but keeps placeholder
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should ignore invalid size', () => {
    const result = parseImagePlaceholders('[[image:3|size:0x-1]]');
    expect(result.invalid).toBe(false);
    expect(result.placeholders[0]).toEqual({ id: 3 });
  });
});
