import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import { dailyRallyNumber, dayKey, formatMs } from '../../shared/track';
import { keys } from '../core/keys';

/**
 * Post yesterday's Daily Rally podium as a regular post (app account).
 * Returns a status string for toasts/logs. Idempotent per day.
 */
export const postDailyRecap = async (day: string): Promise<string> => {
  if (await redis.get(keys.recapDone(day))) return `Recap for ${day} was already posted.`;

  const rows = (await redis.zRange(keys.dailyTimes(day), 0, 2, { by: 'rank' })) ?? [];
  if (rows.length === 0) return `No times were set on ${day} — nothing to post.`;

  const n = dailyRallyNumber(day);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((r, i) => `${medals[i]} u/${r.member} — **${formatMs(r.score)}**`).join('\n\n');

  const hubId = await redis.get(keys.hubPost);
  const hubLink = hubId
    ? `\n\n👻 [Race today's rally](https://www.reddit.com/r/${context.subredditName}/comments/${hubId.replace(/^t3_/, '')}) — a new track is live.`
    : '';

  await reddit.submitPost({
    subredditName: context.subredditName,
    title: `🏁 Daily Rally #${n} results — u/${rows[0]!.member} takes the crown`,
    text: `The ghosts have settled. Final podium for Daily Rally #${n}:\n\n${lines}${hubLink}`,
  });

  await redis.set(keys.recapDone(day), '1');
  await redis.expire(keys.recapDone(day), 7 * 86400);
  return `Recap for Daily Rally #${n} posted.`;
};

export const scheduler = new Hono();

scheduler.post('/daily-recap', async (c) => {
  try {
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    const result = await postDailyRecap(yesterday);
    console.log(`daily-recap: ${result}`);
  } catch (e) {
    console.error('daily-recap failed:', e);
  }
  return c.json({ status: 'ok' });
});
