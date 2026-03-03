/** @jest-environment jsdom */
// Requirements: llm-integration.9.2, llm-integration.9.3, llm-integration.9.5
// tests/unit/renderer/lib/MessageImageResolver.test.ts

import { resolveMessageImages } from '../../../../src/renderer/lib/MessageImageResolver';
import { TextDecoder as NodeTextDecoder } from 'util';

type ImagesGet = (
  agentId: string,
  messageId: string,
  imageId: number
) => Promise<{
  found: boolean;
  status: 'pending' | 'error' | 'success';
  bytes?: Uint8Array;
  contentType?: string | null;
}>;

function setImagesApi(get: ImagesGet | undefined): void {
  const w = window as unknown as { api?: { images?: { get: ImagesGet } } };
  if (!get) {
    w.api = undefined;
    return;
  }
  w.api = { images: { get } };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('resolveMessageImages', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let activeCleanups: Array<() => void> = [];

  function resolveWithTracking(
    root: HTMLElement,
    options: Parameters<typeof resolveMessageImages>[1]
  ): void {
    const cleanup = resolveMessageImages(root, options);
    activeCleanups.push(cleanup);
  }

  beforeEach(() => {
    jest.useRealTimers();
    (global as unknown as { TextDecoder?: typeof NodeTextDecoder }).TextDecoder = NodeTextDecoder;
    URL.createObjectURL = jest.fn().mockReturnValue('blob:test');
    URL.revokeObjectURL = jest.fn();
    document.body.innerHTML = '';
    activeCleanups = [];
  });

  afterEach(() => {
    activeCleanups.forEach((cleanup) => cleanup());
    activeCleanups = [];
    jest.clearAllTimers();
    jest.useRealTimers();
    setImagesApi(undefined);
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    jest.restoreAllMocks();
  });

  /* Preconditions: window.api.images.get is unavailable
     Action: resolveMessageImages() is called
     Assertions: Returns noop cleanup and does not throw
     Requirements: llm-integration.9.2 */
  it('should return noop when images API is unavailable', () => {
    const root = document.createElement('div');
    root.textContent = '[[image:1]]';
    setImagesApi(undefined);

    const cleanup = resolveMessageImages(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 1,
      content: '[[image:1]]',
      descriptors: [{ id: 1, url: 'https://example.com/a.png' }],
    });
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  /* Preconditions: Text has no image placeholders
     Action: resolveMessageImages() is called
     Assertions: No polling is started
     Requirements: llm-integration.9.2 */
  it('should return noop when no placeholders exist', () => {
    const getImage = jest.fn();
    setImagesApi(getImage);
    const root = document.createElement('div');
    root.textContent = 'no placeholders';

    resolveWithTracking(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 1,
      content: 'plain text',
      descriptors: [],
    });

    expect(getImage).not.toHaveBeenCalled();
  });

  /* Preconditions: Placeholder exists and image becomes available after pending status
     Action: resolveMessageImages() starts polling
     Assertions: Placeholder is replaced with clickable image element
     Requirements: llm-integration.9.2, llm-integration.9.3, llm-integration.9.5 */
  it('should poll pending image and then render anchor with image', async () => {
    const getImage = jest
      .fn()
      .mockResolvedValueOnce({ found: true, status: 'pending' })
      .mockResolvedValueOnce({
        found: true,
        status: 'success',
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
      });
    setImagesApi(getImage);
    jest.useFakeTimers();

    const root = document.createElement('div');
    root.textContent = 'prefix [[image:1|link:https://placeholder.link|size:120x40]] suffix';
    resolveWithTracking(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 2,
      content: 'prefix [[image:1|link:https://placeholder.link|size:120x40]] suffix',
      descriptors: [{ id: 1, url: 'https://example.com/a.png', alt: 'chart' }],
    });

    await flush();
    jest.runOnlyPendingTimers();
    await flush();

    expect(getImage).toHaveBeenCalledTimes(2);
    const anchor = root.querySelector('span[data-image-id="1"] a') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://placeholder.link');
    const img = anchor?.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.width).toBe(120);
    expect(img?.height).toBe(40);
    jest.useRealTimers();
  });

  /* Preconditions: Placeholder node is nested inside link/code block
     Action: resolveMessageImages() processes nodes
     Assertions: Nested placeholder is skipped and not transformed
     Requirements: llm-integration.9.2 */
  it('should skip placeholders inside unsupported tags', () => {
    const getImage = jest.fn();
    setImagesApi(getImage);
    const root = document.createElement('div');
    root.innerHTML = '<a>[[image:2]]</a>';

    resolveWithTracking(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 3,
      content: '[[image:2]]',
      descriptors: [{ id: 2, url: 'https://example.com/b.png' }],
    });

    expect(getImage).not.toHaveBeenCalled();
    expect(root.querySelector('a')?.textContent).toContain('[[image:2]]');
  });

  /* Preconditions: Polling result is found=false or throws
     Action: resolveMessageImages() polls image status
     Assertions: Placeholder is removed without UI error
     Requirements: llm-integration.9.4 */
  it('should remove placeholder on missing image and on polling exception', async () => {
    const missingGet = jest.fn().mockResolvedValue({ found: false, status: 'error' });
    setImagesApi(missingGet);
    const rootMissing = document.createElement('div');
    rootMissing.textContent = '[[image:3]]';
    resolveWithTracking(rootMissing as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 4,
      content: '[[image:3]]',
      descriptors: [{ id: 3, url: 'https://example.com/c.png' }],
    });
    await flush();
    expect(rootMissing.querySelector('span[data-image-id="3"]')).toBeNull();

    const errorGet = jest.fn().mockRejectedValue(new Error('poll failure'));
    setImagesApi(errorGet);
    const rootError = document.createElement('div');
    rootError.textContent = '[[image:4]]';
    resolveWithTracking(rootError as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 5,
      content: '[[image:4]]',
      descriptors: [{ id: 4, url: 'https://example.com/d.png' }],
    });
    await flush();
    expect(rootError.querySelector('span[data-image-id="4"]')).toBeNull();
  });

  /* Preconditions: Successful image response and link fallback to descriptor
     Action: resolveMessageImages() processes success result
     Assertions: Descriptor link is used when placeholder link is invalid
     Requirements: llm-integration.9.3, llm-integration.9.5 */
  it('should use descriptor link fallback when placeholder link is invalid', async () => {
    const getImage = jest.fn().mockResolvedValue({
      found: true,
      status: 'success',
      bytes: new Uint8Array([60, 115, 118, 103, 62]), // <svg>
      contentType: 'image/png',
    });
    setImagesApi(getImage);
    const root = document.createElement('div');
    root.textContent = '[[image:98]] [[image:5|link:not-a-url]]';
    resolveWithTracking(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 6,
      content: '[[image:98]] [[image:5|link:not-a-url]]',
      descriptors: [
        { id: 5, url: 'https://example.com/e.svg', link: 'https://example.com/fallback' },
      ],
    });

    await flush();

    const anchor = root.querySelector('span[data-image-id="5"] a') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com/fallback');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  /* Preconditions: Image status remains pending longer than resolver timeout
     Action: resolveMessageImages() keeps polling with fake timers
     Assertions: Placeholder is removed after 60s timeout
     Requirements: llm-integration.9.5 */
  it('should remove placeholder after 60s polling timeout', async () => {
    const getImage = jest.fn().mockResolvedValue({ found: true, status: 'pending' });
    setImagesApi(getImage);
    jest.useFakeTimers();

    const root = document.createElement('div');
    root.textContent = '[[image:6]]';
    resolveWithTracking(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 7,
      content: '[[image:6]]',
      descriptors: [{ id: 6, url: 'https://example.com/f.png' }],
    });

    await flush();
    expect(root.querySelector('span[data-image-id="6"]')).not.toBeNull();

    // Drive staged polling (0.5s -> 1s -> 5s) past 60s timeout boundary.
    for (let i = 0; i < 40; i++) {
      jest.advanceTimersByTime(2000);
      await flush();
    }

    expect(root.querySelector('span[data-image-id="6"]')).toBeNull();
    expect(getImage).toHaveBeenCalled();
    jest.useRealTimers();
  });

  /* Preconditions: Polling started for pending image
     Action: Cleanup callback is invoked (message unmount)
     Assertions: Further polling is cancelled and no new image requests are made
     Requirements: llm-integration.9.5 */
  it('should cancel polling on cleanup (unmount)', async () => {
    const getImage = jest.fn().mockResolvedValue({ found: true, status: 'pending' });
    setImagesApi(getImage);
    jest.useFakeTimers();

    const root = document.createElement('div');
    root.textContent = '[[image:7]]';
    const cleanup = resolveMessageImages(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 8,
      content: '[[image:7]]',
      descriptors: [{ id: 7, url: 'https://example.com/g.png' }],
    });
    activeCleanups.push(cleanup);

    await flush();
    expect(getImage).toHaveBeenCalledTimes(1);

    cleanup();
    jest.advanceTimersByTime(10_000);
    await flush();

    expect(getImage).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  /* Preconditions: Successful SVG image contains unsafe tags/attributes
     Action: resolveMessageImages() creates blob URL for SVG
     Assertions: SVG content is sanitized before rendering
     Requirements: llm-integration.9.3 */
  it('should sanitize svg content before rendering', async () => {
    const rawSvg =
      '<svg onload="alert(1)"><script>alert(2)</script><foreignObject>x</foreignObject><g id="ok"/></svg>';
    const bytes = Uint8Array.from(Buffer.from(rawSvg, 'utf-8'));
    const getImage = jest.fn().mockResolvedValue({
      found: true,
      status: 'success',
      bytes,
      contentType: 'image/svg+xml',
    });
    setImagesApi(getImage);

    let capturedBlob: Blob | null = null;
    URL.createObjectURL = jest.fn().mockImplementation((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:test';
    });

    const root = document.createElement('div');
    root.textContent = '[[image:8]]';
    resolveWithTracking(root as unknown as HTMLElement, {
      agentId: 'agent-1',
      messageId: 9,
      content: '[[image:8]]',
      descriptors: [{ id: 8, url: 'https://example.com/h.svg' }],
    });

    await flush();

    expect(root.querySelector('span[data-image-id="8"] img')).not.toBeNull();
    expect(capturedBlob).not.toBeNull();
    if (!capturedBlob) {
      throw new Error('Expected SVG blob to be captured');
    }
    const sanitized = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsText(capturedBlob as Blob);
    });
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('foreignObject');
    expect(sanitized).not.toContain('onload=');
  });
});
