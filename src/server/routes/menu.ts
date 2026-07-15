import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';
import { ensureHubPost } from '../core/post';
import { keys } from '../core/keys';
import { dayKey, weekKey } from '../../shared/track';
import { runDailyTick } from './scheduler';

export const menu = new Hono();

/** Manually run the midnight sequence (recap + digest + daily post). */
menu.post('/recap-now', async (c) => {
  try {
    const result = await runDailyTick();
    return c.json<UiResponse>({ showToast: result.slice(0, 250) }, 200);
  } catch (error) {
    console.error(`Manual daily tick failed: ${error}`);
    return c.json<UiResponse>({ showToast: 'Daily tick failed — check logs' }, 400);
  }
});

/**
 * Wipe every time, record, ghost and leaderboard for this installation.
 * For fairness resets after physics tuning. Tracks themselves survive —
 * their records reopen.
 */
menu.post('/reset-all', async (c) => {
  try {
    let deleted = 0;
    const del = async (key: string): Promise<void> => {
      await redis.del(key);
      deleted++;
    };

    // Per-track times, records and replays (players come from the leaderboard below)
    const players = (await redis.zRange(keys.lbAll, 0, 999, { by: 'rank' })) ?? [];
    const tracks = (await redis.zRange(keys.tracksAll, 0, 999, { by: 'rank' })) ?? [];
    for (const t of tracks) {
      const postId = t.member;
      await del(keys.record(postId));
      await del(keys.recordGhost(postId));
      await del(keys.times(postId));
      await del(keys.attempts(postId));
      for (const p of players) {
        await del(keys.pbGhost(postId, p.member));
      }
    }

    // Daily rallies (last 30 days) and weekly boards (last 6 weeks)
    for (let i = 0; i < 30; i++) {
      const day = dayKey(new Date(Date.now() - i * 86400000));
      await del(keys.dailyRecord(day));
      await del(keys.dailyGhost(day));
      await del(keys.dailyTimes(day));
      for (const p of players) {
        await del(keys.dailyPbGhost(day, p.member));
      }
    }
    for (let i = 0; i < 6; i++) {
      await del(keys.lbWeek(weekKey(new Date(Date.now() - i * 7 * 86400000))));
    }

    // Player profiles + all-time board
    for (const p of players) {
      await del(keys.user(p.member));
    }
    await del(keys.lbAll);

    return c.json<UiResponse>(
      { showToast: `♻️ Ghost Rally reset complete (${deleted} keys cleared)` },
      200
    );
  } catch (error) {
    console.error(`Reset failed: ${error}`);
    return c.json<UiResponse>({ showToast: 'Reset failed — check logs' }, 400);
  }
});

menu.post('/create-hub', async (c) => {
  try {
    const { url, created } = await ensureHubPost();
    return c.json<UiResponse>(
      {
        navigateTo: url,
        showToast: created ? 'Ghost Rally hub created!' : 'Hub already exists — taking you there.',
      },
      200
    );
  } catch (error) {
    console.error(`Error creating hub post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create the hub post' }, 400);
  }
});
