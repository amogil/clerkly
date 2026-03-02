// Requirements: llm-integration.1
// Shared parser for image placeholders in LLM content

export interface ImagePlaceholder {
  id: number;
  link?: string;
  size?: { width: number; height: number };
}

const PLACEHOLDER_REGEX = /\[\[image:[^\]]+\]\]/g;
const ID_REGEX = /^\d+$/;

// Requirements: llm-integration.9.8
export function parseImagePlaceholders(text: string): {
  placeholders: ImagePlaceholder[];
  invalid: boolean;
} {
  const placeholders: ImagePlaceholder[] = [];
  let invalid = false;

  if (!text) return { placeholders, invalid: false };

  const matches = text.match(PLACEHOLDER_REGEX) ?? [];
  for (const match of matches) {
    const inner = match.slice(2, -2).trim(); // remove [[ ]]
    if (!inner.startsWith('image:')) {
      invalid = true;
      continue;
    }

    const parts = inner.split('|').map((part) => part.trim());
    const firstPart = parts[0] ?? '';
    const idPart = firstPart.slice('image:'.length).trim();
    if (!idPart || !ID_REGEX.test(idPart)) {
      invalid = true;
      continue;
    }

    const idValue = Number(idPart);
    if (!Number.isInteger(idValue) || idValue <= 0) {
      invalid = true;
      continue;
    }

    const placeholder: ImagePlaceholder = { id: idValue };

    for (const part of parts.slice(1)) {
      if (part.startsWith('link:')) {
        const link = part.slice('link:'.length).trim();
        if (isValidHttpUrl(link)) {
          placeholder.link = link;
        }
        continue;
      }
      if (part.startsWith('size:')) {
        const size = part.slice('size:'.length).trim();
        const parsed = parseSize(size);
        if (parsed) {
          placeholder.size = parsed;
        }
        continue;
      }
    }

    placeholders.push(placeholder);
  }

  return { placeholders, invalid };
}

// Requirements: llm-integration.9.2
function parseSize(value: string): { width: number; height: number } | null {
  const match = value.match(/^(\d{1,5})x(\d{1,5})$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (width > 10000 || height > 10000) return null;
  return { width, height };
}

// Requirements: llm-integration.9.2
function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
