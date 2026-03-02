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

  /* Preconditions: Input text is empty
     Action: Parse placeholders
     Assertions: Returns empty placeholder list and invalid=false
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should return empty result for empty text', () => {
    const result = parseImagePlaceholders('');
    expect(result).toEqual({ placeholders: [], invalid: false });
  });

  /* Preconditions: Placeholder contains non-http link
     Action: Parse placeholders
     Assertions: Keeps placeholder id and ignores invalid link
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should ignore non-http link while keeping placeholder', () => {
    const result = parseImagePlaceholders('[[image:4|link:ftp://example.com]]');
    expect(result.invalid).toBe(false);
    expect(result.placeholders).toEqual([{ id: 4 }]);
  });

  /* Preconditions: Placeholder has oversized dimensions
     Action: Parse placeholders
     Assertions: Ignores size when dimensions exceed max limit
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should ignore too large size values', () => {
    const result = parseImagePlaceholders('[[image:5|size:10001x200]]');
    expect(result.invalid).toBe(false);
    expect(result.placeholders).toEqual([{ id: 5 }]);
  });

  /* Preconditions: Placeholder has zero id
     Action: Parse placeholders
     Assertions: Marks input invalid and skips placeholder
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark zero id as invalid', () => {
    const result = parseImagePlaceholders('[[image:0]]');
    expect(result.invalid).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  /* Preconditions: Text contains mixed valid and invalid placeholders
     Action: Parse placeholders
     Assertions: Returns valid placeholders and sets invalid=true
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should parse valid placeholders and flag invalid ones in the same input', () => {
    const result = parseImagePlaceholders('[[image:6]] [[image:bad]] [[image:7|size:10x20]]');
    expect(result.invalid).toBe(true);
    expect(result.placeholders).toEqual([{ id: 6 }, { id: 7, size: { width: 10, height: 20 } }]);
  });

  /* Preconditions: Placeholder parts contain extra spaces and reordered params
     Action: Parse placeholders
     Assertions: Trims parts and parses link/size correctly
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should parse placeholder with spaces and reordered params', () => {
    const result = parseImagePlaceholders(
      '[[image: 8 | size: 320x180 | link: https://example.com ]]'
    );
    expect(result.invalid).toBe(false);
    expect(result.placeholders).toEqual([
      { id: 8, size: { width: 320, height: 180 }, link: 'https://example.com' },
    ]);
  });
});
