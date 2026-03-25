import redis from '../lib/redis';

export async function cachedExecute<T>(
  taskKey: string,
  userId: string,
  ttlMinutes: number,
  executeFn: () => Promise<T>
): Promise<{ result: T; fromCache: boolean }> {
  const cacheKey = `task:${userId}:${taskKey}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const { result, ts } = JSON.parse(cached);
    const ageMinutes = (Date.now() - ts) / 60000;
    if (ageMinutes < ttlMinutes) {
      return { result, fromCache: true };
    }
  }

  const result = await executeFn();
  await redis.setex(
    cacheKey,
    ttlMinutes * 60,
    JSON.stringify({ result, ts: Date.now() })
  );

  return { result, fromCache: false };
}

export async function invalidateCache(userId: string, taskKey: string): Promise<void> {
  await redis.del(`task:${userId}:${taskKey}`);
}

export async function invalidateAllUserCache(userId: string): Promise<void> {
  const pattern = `task:${userId}:*`;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}
