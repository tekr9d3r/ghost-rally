/** Redis key layout. Everything is namespaced per installation automatically. */
export const keys = {
  hubPost: 'hub:post',
  // Track posts
  track: (postId: string) => `t:${postId}:track`,
  record: (postId: string) => `t:${postId}:record`,
  recordGhost: (postId: string) => `t:${postId}:ghost`,
  pbGhost: (postId: string, user: string) => `t:${postId}:pb:${user}`,
  times: (postId: string) => `t:${postId}:times`,
  attempts: (postId: string) => `t:${postId}:attempts`,
  /** Stickied "post your times" anchor comment id, per post. */
  anchor: (postId: string) => `t:${postId}:anchor`,
  /** Dedup flag so the daily recap posts only once per day. */
  recapDone: (day: string) => `recap:${day}`,
  /** Dedup flag for the fresh-tracks digest. */
  digestDone: (day: string) => `digest:${day}`,
  /** The pinned daily-rally post for a given day. */
  dailyPost: (day: string) => `daily:${day}:post`,
  // Daily rally
  dailyRecord: (day: string) => `daily:${day}:record`,
  dailyGhost: (day: string) => `daily:${day}:ghost`,
  dailyPbGhost: (day: string, user: string) => `daily:${day}:pb:${user}`,
  dailyTimes: (day: string) => `daily:${day}:times`,
  // Players & leaderboards
  user: (username: string) => `u:${username}`,
  lbAll: 'lb:all',
  lbWeek: (week: string) => `lb:w:${week}`,
  tracksAll: 'tracks:all',
  tracksHot: (week: string) => `tracks:hot:${week}`,
} as const;
