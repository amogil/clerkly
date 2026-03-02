// Requirements: llm-integration.1
// Resolves image placeholders in rendered message DOM

import {
  parseImagePlaceholders,
  type ImagePlaceholder,
} from '../../shared/utils/imagePlaceholders';

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;
const POLL_TIMEOUT_MS = 60_000;

const SKIP_TAGS = new Set(['CODE', 'PRE', 'A', 'TEXTAREA', 'INPUT']);

interface DomNodeLike {
  nodeType?: number;
  tagName?: string;
  nodeValue?: string;
  parentNode?: DomNodeLike | null;
  removeChild?: (node: unknown) => void;
  appendChild?: (node: unknown) => void;
  replaceWith?: (node: unknown) => void;
}

interface DomElementLike extends DomNodeLike {
  dataset?: Record<string, string>;
  className?: string;
  style?: { width?: string; height?: string };
  src?: string;
  alt?: string;
  onload?: () => void;
  width?: number;
  height?: number;
  href?: string;
  target?: string;
  rel?: string;
  attributes?: ArrayLike<{ name: string }>;
  setAttribute?: (name: string, value: string) => void;
  appendChild?: (node: unknown) => void;
  removeChild?: (node: unknown) => void;
  removeAttribute?: (name: string) => void;
  replaceChildren?: (...nodes: unknown[]) => void;
  remove?: () => void;
  querySelectorAll?: (selector: string) => DomElementLike[];
  innerHTML?: string;
}

interface DomDocumentLike {
  createTreeWalker: (root: unknown, whatToShow: number) => { nextNode: () => unknown | null };
  createDocumentFragment: () => { appendChild: (node: unknown) => void };
  createTextNode: (text: string) => unknown;
  createElement: (tag: string) => DomElementLike;
}

interface SvgDocumentLike {
  querySelectorAll: (selector: string) => DomElementLike[];
}

declare const window: {
  api?: {
    images?: {
      get: (
        agentId: string,
        messageId: string,
        imageId: number
      ) => Promise<{
        found: boolean;
        status: 'pending' | 'error' | 'success';
        bytes?: Uint8Array;
        contentType?: string | null;
        size?: number | null;
      }>;
    };
  };
  document?: DomDocumentLike;
  setTimeout?: (handler: () => void, timeout: number) => number;
  clearTimeout?: (handle: number) => void;
  NodeFilter?: { SHOW_TEXT: number };
  Node?: { ELEMENT_NODE: number };
  DOMParser?: new () => { parseFromString: (text: string, type: string) => SvgDocumentLike };
  XMLSerializer?: new () => { serializeToString: (node: unknown) => string };
};

export interface ImageDescriptor {
  id: number;
  url?: string;
  alt?: string;
  link?: string;
}

export interface MessageImageResolverOptions {
  agentId: string;
  messageId: number;
  content: string;
  descriptors: ImageDescriptor[];
}

// Requirements: llm-integration.9.2, llm-integration.9.3, llm-integration.9.5
export function resolveMessageImages(
  container: unknown,
  options: MessageImageResolverOptions
): () => void {
  const getImage = window?.api?.images?.get;
  if (!getImage) {
    return () => {};
  }
  const { placeholders } = parseImagePlaceholders(options.content);
  if (placeholders.length === 0) {
    return () => {};
  }

  const descriptorMap = new Map<string, ImageDescriptor>();
  for (const desc of options.descriptors) {
    if (desc?.id) descriptorMap.set(String(desc.id), desc);
  }

  const placeholderNodes = replacePlaceholders(container, placeholders, descriptorMap);
  const cancels = placeholderNodes.map((node) =>
    startPolling(
      node,
      options.agentId,
      String(options.messageId),
      descriptorMap.get(String(node.id)),
      getImage
    )
  );

  return () => {
    cancels.forEach((cancel) => cancel());
  };
}

interface PlaceholderNode {
  id: number;
  element: DomElementLike;
  placeholder: ImagePlaceholder;
}

// Requirements: llm-integration.9.2
function replacePlaceholders(
  container: unknown,
  placeholders: ImagePlaceholder[],
  descriptorMap: Map<string, ImageDescriptor>
): PlaceholderNode[] {
  const result: PlaceholderNode[] = [];
  const doc = window.document;
  if (!doc) return [];
  const showText = window.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = doc.createTreeWalker(container, showText);
  let node: unknown | null;
  const placeholderRegex = /\[\[image:[^\]]+\]\]/g;

  while ((node = walker.nextNode())) {
    const textNode = node as DomNodeLike;
    if (!textNode.nodeValue) continue;
    if (shouldSkipNode(textNode)) continue;

    const text = textNode.nodeValue;
    if (!placeholderRegex.test(text)) {
      placeholderRegex.lastIndex = 0;
      continue;
    }
    // RegExp#test with /g advances lastIndex; reset before matchAll to avoid skipping first match.
    placeholderRegex.lastIndex = 0;

    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;
    const matches = Array.from(text.matchAll(placeholderRegex)) as RegExpMatchArray[];
    for (const match of matches) {
      const matchText = match[0];
      const start = match.index ?? 0;
      const end = start + matchText.length;

      if (start > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, start)));
      }

      const placeholder = parseImagePlaceholders(matchText).placeholders[0];
      if (placeholder) {
        const placeholderElement = createPlaceholderElement(placeholder, descriptorMap);
        fragment.appendChild(placeholderElement);
        result.push({ id: placeholder.id, element: placeholderElement, placeholder });
      } else {
        fragment.appendChild(doc.createTextNode(matchText));
      }

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }

    textNode.replaceWith?.(fragment);
  }

  return result;
}

// Requirements: llm-integration.9.2
function createPlaceholderElement(
  placeholder: ImagePlaceholder,
  descriptorMap: Map<string, ImageDescriptor>
): DomElementLike {
  const descriptor = descriptorMap.get(String(placeholder.id));
  const width = placeholder.size?.width ?? DEFAULT_WIDTH;
  const height = placeholder.size?.height ?? DEFAULT_HEIGHT;

  const doc = window.document;
  if (!doc) {
    return {};
  }
  const wrapper = doc.createElement('span');
  if (wrapper.dataset) {
    wrapper.dataset.imageId = String(placeholder.id);
  } else {
    wrapper.setAttribute?.('data-image-id', String(placeholder.id));
  }
  wrapper.className = 'inline-block align-middle';

  const skeleton = doc.createElement('span');
  skeleton.className = 'inline-block bg-muted/40 animate-pulse rounded-md';
  skeleton.style = skeleton.style ?? {};
  skeleton.style.width = `${width}px`;
  skeleton.style.height = `${height}px`;
  skeleton.setAttribute?.('role', 'img');
  skeleton.setAttribute?.('aria-label', descriptor?.alt ?? 'Image loading');

  wrapper.appendChild?.(skeleton);
  return wrapper;
}

// Requirements: llm-integration.9.3, llm-integration.9.5
function startPolling(
  node: PlaceholderNode,
  agentId: string,
  messageId: string,
  descriptor: ImageDescriptor | undefined,
  getImage: (
    agentId: string,
    messageId: string,
    imageId: number
  ) => Promise<{
    found: boolean;
    status: 'pending' | 'error' | 'success';
    bytes?: Uint8Array;
    contentType?: string | null;
    size?: number | null;
  }>
): () => void {
  let cancelled = false;
  let timeoutId: number | null = null;
  const startTime = Date.now();

  const poll = async (): Promise<void> => {
    if (cancelled) return;
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      removeElement(node.element);
      return;
    }

    try {
      const result = await getImage(agentId, messageId, node.id);
      if (cancelled) return;

      if (!result.found || result.status === 'error') {
        removeElement(node.element);
        return;
      }

      if (result.status === 'success' && result.bytes && result.contentType) {
        const url = await createObjectUrl(result.bytes, result.contentType);
        if (!url) {
          removeElement(node.element);
          return;
        }
        const imageElement = buildImageElement(url, descriptor, node.placeholder);
        replaceElementChildren(node.element, imageElement);
        return;
      }
    } catch {
      if (!cancelled) {
        removeElement(node.element);
      }
      return;
    }

    const delay = nextDelay(startTime);
    const setTimeoutFn = window.setTimeout ?? ((handler: () => void) => (handler(), 0));
    timeoutId = setTimeoutFn(poll, delay);
  };

  void poll();
  return () => {
    cancelled = true;
    if (timeoutId !== null) {
      const clearTimeoutFn = window.clearTimeout ?? (() => {});
      clearTimeoutFn(timeoutId);
    }
  };
}

// Requirements: llm-integration.9.5
function nextDelay(startTime: number): number {
  const elapsed = Date.now() - startTime;
  if (elapsed < 10_000) return 500;
  if (elapsed < 20_000) return 1000;
  return 5000;
}

// Requirements: llm-integration.9.3
function buildImageElement(
  url: string,
  descriptor: ImageDescriptor | undefined,
  placeholder: ImagePlaceholder
): DomElementLike {
  const doc = window.document;
  if (!doc) {
    return {};
  }
  const img = doc.createElement('img');
  img.src = url;
  img.alt = descriptor?.alt ?? '';
  img.className = 'max-w-full rounded-md';
  img.onload = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  if (placeholder.size) {
    img.width = placeholder.size.width;
    img.height = placeholder.size.height;
  }

  const link =
    placeholder.link && isValidHttpUrl(placeholder.link) ? placeholder.link : descriptor?.link;
  if (link && isValidHttpUrl(link)) {
    const anchor = doc.createElement('a');
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.appendChild?.(img);
    return anchor;
  }

  return img;
}

// Requirements: llm-integration.9.5
function removeElement(element: DomElementLike): void {
  if (element.parentNode?.removeChild) {
    element.parentNode.removeChild(element);
  }
}

// Requirements: llm-integration.9.3
function replaceElementChildren(element: DomElementLike, child: DomElementLike): void {
  if (element.replaceChildren) {
    element.replaceChildren(child);
    return;
  }
  element.innerHTML = '';
  element.appendChild?.(child);
}

// Requirements: llm-integration.9.3
async function createObjectUrl(bytes: Uint8Array, contentType: string): Promise<string | null> {
  try {
    const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const arrayBuffer = new Uint8Array(normalized).buffer;
    let blob: Blob;
    if (contentType === 'image/svg+xml') {
      const text = new TextDecoder().decode(normalized);
      const sanitized = sanitizeSvg(text);
      blob = new Blob([sanitized], { type: contentType });
    } else {
      blob = new Blob([arrayBuffer], { type: contentType });
    }
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// Requirements: llm-integration.9.3
function sanitizeSvg(svg: string): string {
  const Parser = window.DOMParser;
  if (!Parser) return svg;
  const parser = new Parser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const scripts = doc.querySelectorAll('script, foreignObject');
  scripts.forEach((node: DomElementLike) => node.remove?.());

  const elements = doc.querySelectorAll('*');
  elements.forEach((el: DomElementLike) => {
    Array.from(el.attributes ?? []).forEach((attr: { name: string }) => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute?.(attr.name);
      }
    });
  });

  const Serializer = window.XMLSerializer;
  if (!Serializer) return svg;
  return new Serializer().serializeToString(doc);
}

// Requirements: llm-integration.9.2
function shouldSkipNode(node: DomNodeLike): boolean {
  let current: DomNodeLike | null = node.parentNode ?? null;
  while (current) {
    if (current.nodeType === (window.Node?.ELEMENT_NODE ?? 1)) {
      const tag = current.tagName ?? '';
      if (SKIP_TAGS.has(tag)) return true;
    }
    current = current.parentNode ?? null;
  }
  return false;
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
