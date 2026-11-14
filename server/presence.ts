/** 最近一分钟活跃的玩家：同账号多设备算一人，游客按浏览器标识去重。 */
export function createPresence(capacity = 20, now = Date.now, ttl = 60000) {
  const active = new Map<string, {key: string; at: number}>();
  const prune = () => { const cutoff = now() - ttl; for (const [visitor, record] of active) if (record.at <= cutoff) active.delete(visitor); };
  return {
    touch(visitor: string, userId?: number) {
      prune();
      const key = userId ? `user:${userId}` : `visitor:${visitor}`;
      if (active.size < 10000 || active.has(visitor)) active.set(visitor, {key, at:now()});
      return this.count();
    },
    count() { prune(); return { online: new Set([...active.values()].map(record=>record.key)).size, capacity }; },
  };
}

const configured = Number(process.env.A3_SERVER_CAPACITY || 20);
export const presence = createPresence(Number.isInteger(configured) && configured > 0 ? configured : 20);
