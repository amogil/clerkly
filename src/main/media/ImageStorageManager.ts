// Requirements: llm-integration.1, llm-integration.9.6, llm-integration.9.8
// Manages image download/storage and IPC access

import { ipcMain } from 'electron';
import { createHash } from 'crypto';
import { Logger } from '../Logger';
import type { IDatabaseManager } from '../DatabaseManager';
import type { ImageStatus } from '../db/repositories/ImagesRepository';

const MAX_IMAGE_BYTES = 50 * 1024 * 1024 * 1024; // 50GB
const DOWNLOAD_TIMEOUT_MS = 60_000;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export interface ImageGetResult {
  found: boolean;
  status: ImageStatus;
  bytes?: Buffer;
  contentType?: string | null;
  size?: number | null;
}

// Requirements: llm-integration.1, llm-integration.9.6
export class ImageStorageManager {
  private logger = Logger.create('ImageStorageManager');

  constructor(private dbManager: IDatabaseManager) {}

  /**
   * Register IPC handlers
   * Requirements: llm-integration.1
   */
  registerHandlers(): void {
    ipcMain.handle(
      'images:get',
      (_event, args: { agentId: string; messageId: string; imageId: number }) =>
        this.getImage(args.agentId, args.messageId, args.imageId)
    );
  }

  /**
   * Download image and store in DB
   * Requirements: llm-integration.1
   */
  // Requirements: llm-integration.1, llm-integration.9.6, llm-integration.9.8
  async downloadAndStore(
    agentId: string,
    messageId: string,
    imageId: number,
    url: string
  ): Promise<void> {
    // Create/update pending record first
    this.dbManager.images.upsert({
      agentId,
      messageId,
      imageId,
      url,
      status: 'pending',
    });

    if (!this.isValidUrl(url)) {
      this.markError(agentId, messageId, imageId, url, 'Invalid URL');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        this.markError(agentId, messageId, imageId, url, `HTTP ${response.status}`);
        return;
      }

      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!contentType) {
        this.markError(agentId, messageId, imageId, url, 'Missing content-type');
        return;
      }
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        this.markError(
          agentId,
          messageId,
          imageId,
          url,
          `Unsupported content-type: ${contentType}`
        );
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = Buffer.from(arrayBuffer);
      if (bytes.length === 0) {
        this.markError(agentId, messageId, imageId, url, 'Empty response body');
        return;
      }
      if (bytes.length > MAX_IMAGE_BYTES) {
        this.markError(agentId, messageId, imageId, url, 'Image exceeds size limit');
        return;
      }

      const hash = createHash('sha256').update(bytes).digest('hex');

      this.dbManager.images.upsert({
        agentId,
        messageId,
        imageId,
        url,
        status: 'success',
        hash,
        contentType,
        size: bytes.length,
        bytes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.markError(agentId, messageId, imageId, url, message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Mark image as missing descriptor
   * Requirements: llm-integration.1
   */
  // Requirements: llm-integration.1, llm-integration.9.4, llm-integration.9.8
  markMissingDescriptor(agentId: string, messageId: string, imageId: number): void {
    this.dbManager.images.upsert({
      agentId,
      messageId,
      imageId,
      url: 'missing',
      status: 'error',
    });
  }

  /**
   * IPC handler: get image status/data
   * Requirements: llm-integration.1
   */
  // Requirements: llm-integration.1, llm-integration.9.8
  getImage(agentId: string, messageId: string, imageId: number): ImageGetResult {
    try {
      const record = this.dbManager.images.get(agentId, messageId, imageId);
      if (!record) {
        return { found: false, status: 'error' };
      }

      if (record.status === 'pending') {
        return { found: true, status: 'pending' };
      }

      if (record.status === 'error') {
        return { found: true, status: 'error' };
      }

      return {
        found: true,
        status: 'success',
        bytes: (record.bytes as Buffer | null) ?? undefined,
        contentType: record.contentType,
        size: record.size,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Image lookup failed (${imageId}): ${message}`);
      return { found: false, status: 'error' };
    }
  }

  // Requirements: llm-integration.1
  private markError(
    agentId: string,
    messageId: string,
    imageId: number,
    url: string,
    reason: string
  ): void {
    this.logger.warn(`Image download failed (${imageId}): ${reason}`);
    this.dbManager.images.upsert({
      agentId,
      messageId,
      imageId,
      url,
      status: 'error',
    });
  }

  // Requirements: llm-integration.9.8
  private isValidUrl(url: string): boolean {
    if (!url || url.length > 2048) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
