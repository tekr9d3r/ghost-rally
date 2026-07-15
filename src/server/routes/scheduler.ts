import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type { Track } from '../../shared/types';
import { dailyRallyNumber, dayKey, formatMs } from '../../shared/track';
import { keys } from '../core/keys';
import { asT3, createDailyPost } from '../core/post';

const postLink = (postId: string): string =>
  `https://www.reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`;

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

  const daily = await redis.get(keys.dailyPost(dayKey()));
  const hubId = daily ?? (await redis.get(keys.hubPost));
  const hubLink = hubId
    ? `\n\n👻 [Race today's rally](${postLink(hubId)}) — a new track is live.`
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

/** Post a digest of tracks published on `day`. Idempotent per day. */
export const postFreshTracksDigest = async (day: string): Promise<string> => {
  if (await redis.get(keys.digestDone(day))) return `Digest for ${day} was already posted.`;

  const start = Date.parse(`${day}T00:00:00Z`);
  const end = start + 86400000 - 1;
  const rows = (await redis.zRange(keys.tracksAll, start, end, { by: 'score' })) ?? [];
  if (rows.length === 0) return `No new tracks on ${day} — nothing to post.`;

  const entries: string[] = [];
  for (const row of rows.slice(0, 10)) {
    const raw = await redis.get(keys.track(row.member));
    if (!raw) continue;
    try {
      const track = JSON.parse(raw) as Track;
      entries.push(`- **${track.name}** by u/${track.owner} — [race it](${postLink(row.member)})`);
    } catch {
      /* skip broken entries */
    }
  }
  if (entries.length === 0) return `No readable tracks for ${day}.`;

  const plural = entries.length === 1 ? 'track' : 'tracks';
  await reddit.submitPost({
    subredditName: context.subredditName,
    title: `🛠 ${entries.length} new ${plural} dropped yesterday — set the first records`,
    text: `Fresh from the community garage:\n\n${entries.join('\n')}\n\n👻 Every record you set becomes a ghost someone else has to race.`,
  });

  await redis.set(keys.digestDone(day), '1');
  await redis.expire(keys.digestDone(day), 7 * 86400);
  return `Digest posted (${entries.length} ${plural}).`;
};

/** Create + pin today's daily post, unpin yesterday's. Idempotent per day. */
export const rotateDailyPost = async (): Promise<string> => {
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 86400000));

  if (await redis.get(keys.dailyPost(today))) return `Daily post for ${today} already exists.`;

  const { postId } = await createDailyPost(today);

  // unpin yesterday's daily post (best effort)
  const prev = await redis.get(keys.dailyPost(yesterday));
  if (prev) {
    try {
      const prevPost = await reddit.getPostById(asT3(prev));
      await prevPost.unsticky();
    } catch {
      /* fine */
    }
  }
  try {
    const post = await reddit.getPostById(asT3(postId));
    await post.sticky();
  } catch (e) {
    console.error('daily post sticky failed:', e);
  }
  return `Daily Rally #${dailyRallyNumber(today)} post created.`;
};

/** The full midnight sequence. */
export const runDailyTick = async (): Promise<string> => {
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const results: string[] = [];
  for (const step of [
    () => postDailyRecap(yesterday),
    () => postFreshTracksDigest(yesterday),
    () => rotateDailyPost(),
  ]) {
    try {
      results.push(await step());
    } catch (e) {
      console.error('daily tick step failed:', e);
      results.push('step failed');
    }
  }
  return results.join(' · ');
};

export const scheduler = new Hono();

scheduler.post('/daily-recap', async (c) => {
  const result = await runDailyTick();
  console.log(`daily-tick: ${result}`);
  return c.json({ status: 'ok' });
});
