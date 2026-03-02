// Requirements: llm-integration.1
// Repository for message images with access control through AgentsRepository

import { and, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { images, Image } from '../schema';
import { AgentsRepository } from './AgentsRepository';

export type ImageStatus = 'pending' | 'error' | 'success';

export interface ImageRecordInput {
  agentId: string;
  messageId: string;
  imageId: number;
  url: string;
  status: ImageStatus;
  hash?: string | null;
  contentType?: string | null;
  size?: number | null;
  bytes?: Buffer | null;
}

// Requirements: llm-integration.1, llm-integration.9.6
export class ImagesRepository {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private agentsRepo: AgentsRepository
  ) {}

  /**
   * Check if the current user has access to the agent
   * Throws "Access denied" if not
   * Requirements: user-data-isolation.7.6
   */
  private checkAccess(agentId: string): void {
    const agent = this.agentsRepo.findById(agentId);
    if (!agent) {
      throw new Error('Access denied');
    }
  }

  /**
   * Get image record by agent/message/image
   * Requirements: llm-integration.1
   */
  // Requirements: llm-integration.1, llm-integration.9.8
  get(agentId: string, messageId: string, imageId: number): Image | null {
    this.checkAccess(agentId);
    const result = this.db
      .select()
      .from(images)
      .where(
        and(
          eq(images.agentId, agentId),
          eq(images.messageId, messageId),
          eq(images.imageId, imageId)
        )
      )
      .limit(1)
      .all();
    return result[0] ?? null;
  }

  /**
   * Upsert image record
   * Requirements: llm-integration.1
   */
  // Requirements: llm-integration.1, llm-integration.9.8
  upsert(input: ImageRecordInput): Image {
    this.checkAccess(input.agentId);
    const now = new Date().toISOString();
    const record = this.db
      .insert(images)
      .values({
        agentId: input.agentId,
        messageId: input.messageId,
        imageId: input.imageId,
        url: input.url,
        status: input.status,
        hash: input.hash ?? null,
        contentType: input.contentType ?? null,
        size: input.size ?? null,
        bytes: input.bytes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [images.agentId, images.messageId, images.imageId],
        set: {
          url: input.url,
          status: input.status,
          hash: input.hash ?? null,
          contentType: input.contentType ?? null,
          size: input.size ?? null,
          bytes: input.bytes ?? null,
          updatedAt: now,
        },
      })
      .returning()
      .get();
    return record;
  }
}
