/**
 * Platform-side memory system.
 *
 * NOTE: This uses OpenAI embeddings directly for vector search. This is a
 * platform-level feature (not a user-facing AI interaction) so the direct
 * OpenAI call is acceptable for now. Embeddings are infrastructure, not chat.
 *
 * TODO: Migrate to container-side memory when OpenClaw supports it natively.
 */
import OpenAI from 'openai';
import db from '../lib/db';
import { Memory, MemoryType } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class MemorySystem {
  async remember(
    userId: string,
    content: string,
    type: MemoryType = 'fact',
    importance = 0.5,
    tags: string[] = []
  ): Promise<string> {
    const embedding = await this.embed(content);

    const result = await db.getOne<{ id: string }>(
      `INSERT INTO memories (user_id, content, type, importance, tags, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)
       RETURNING id`,
      [userId, content, type, importance, tags, JSON.stringify(embedding)]
    );

    return result!.id;
  }

  async recall(userId: string, query: string, limit = 5): Promise<Memory[]> {
    const embedding = await this.embed(query);

    const memories = await db.getMany<Memory>(
      `SELECT id, user_id, content, type, importance, tags, created_at, accessed_at
       FROM memories
       WHERE user_id = $1
       ORDER BY embedding <-> $2::vector
       LIMIT $3`,
      [userId, JSON.stringify(embedding), limit]
    );

    // Update accessed_at for retrieved memories
    if (memories.length) {
      const ids = memories.map((m) => m.id);
      await db.query(
        `UPDATE memories SET accessed_at = NOW() WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [ids, userId]
      );
    }

    return memories;
  }

  async embed(text: string): Promise<number[]> {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    });
    return res.data[0].embedding;
  }

  async compress(memories: Memory[]): Promise<string> {
    if (!memories.length) return '';

    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Convert these memories to ultra-short key facts. Max 60 words total.\n${memories.map((m) => m.content).join('\n')}`,
          },
        ],
        max_tokens: 100,
        temperature: 0,
      });
      return res.choices[0].message.content || '';
    } catch {
      return memories.map((m) => m.content).join('; ').slice(0, 300);
    }
  }

  async loadSmartMemory(userId: string, message: string): Promise<string> {
    // Very short messages likely don't need context
    if (message.split(' ').length < 4) return '';

    const memories = await this.recall(userId, message, 5);
    return this.compress(memories);
  }

  async getAllMemories(
    userId: string,
    options?: { type?: MemoryType; search?: string; limit?: number; offset?: number }
  ): Promise<{ memories: Memory[]; total: number }> {
    const conditions = ['user_id = $1'];
    const params: any[] = [userId];
    let idx = 2;

    if (options?.type) {
      conditions.push(`type = $${idx++}`);
      params.push(options.type);
    }

    if (options?.search) {
      conditions.push(`content ILIKE $${idx++}`);
      params.push(`%${options.search}%`);
    }

    const where = conditions.join(' AND ');
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const [memories, countResult] = await Promise.all([
      db.getMany<Memory>(
        `SELECT id, user_id, content, type, importance, tags, created_at, accessed_at
         FROM memories WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      ),
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM memories WHERE ${where}`,
        params
      ),
    ]);

    return { memories, total: parseInt(countResult?.count || '0') };
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    await db.query('DELETE FROM memories WHERE id = $1 AND user_id = $2', [memoryId, userId]);
  }

  async clearAllMemories(userId: string): Promise<void> {
    await db.query('DELETE FROM memories WHERE user_id = $1', [userId]);
  }

  async exportMemories(userId: string): Promise<Memory[]> {
    return db.getMany<Memory>(
      `SELECT id, content, type, importance, tags, created_at
       FROM memories WHERE user_id = $1
       ORDER BY created_at`,
      [userId]
    );
  }
}

export const memorySystem = new MemorySystem();

// Task-specific memory loading for efficient auto work
const TASK_MEMORY_TAGS: Record<string, string[]> = {
  email_reply: ['communication_style', 'people', 'email_sig'],
  price_monitor: ['tracked_products', 'price_thresholds'],
  news_briefing: ['topics', 'sources', 'brief_length'],
  calendar: ['schedule_prefs', 'timezone'],
  social_media: ['social_accounts', 'posting_style'],
};

export async function loadTaskSpecificMemory(userId: string, taskType: string): Promise<string> {
  const tags = TASK_MEMORY_TAGS[taskType];
  if (!tags) return memorySystem.loadSmartMemory(userId, taskType);

  const memories = await db.getMany<Memory>(
    `SELECT content FROM memories
     WHERE user_id = $1 AND tags && $2::text[]
     ORDER BY importance DESC
     LIMIT 5`,
    [userId, tags]
  );

  return memories.map((m) => m.content).join('; ').slice(0, 300);
}
