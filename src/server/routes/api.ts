import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  BragRequest,
  BragResponse,
  ErrorResponse,
  FinishRequest,
  FinishResponse,
  SubscribeResponse,
  Ghost,
  GhostMeta,
  GhostsResponse,
  InitResponse,
  LeaderboardResponse,
  LeaderboardRow,
  NextTrackResponse,
  PlayerStats,
  PostKind,
  PublishRequest,
  PublishResponse,
  Track,
  TrackPostData,
} from '../../shared/types';
import {
  dayKey,
  weekKey,
  formatMs,
  dailyRallyNumber,
  trackLength,
  validateTrackSubmission,
  validateGhostSubmission,
  MAX_NAME_LEN,
} from '../../shared/track';
import { keys } from '../core/keys';
import { asT3, createTrackPost, updateTrackPostData } from '../core/post';

export const api = new Hono();

const err = (message: string): ErrorResponse => ({ status: 'error', message });

const getJson = async <T>(key: string): Promise<T | null> => {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const loadPlayer = async (username: string | null): Promise<PlayerStats> => {
  if (!username) {
    return { username: '', rp: 0, streak: 0, builds: 0, finishes: 0, records: 0 };
  }
  const h = await redis.hGetAll(keys.user(username));
  return {
    username,
    rp: parseInt(h?.rp ?? '0') || 0,
    streak: parseInt(h?.streak ?? '0') || 0,
    builds: parseInt(h?.builds ?? '0') || 0,
    finishes: parseInt(h?.finishes ?? '0') || 0,
    records: parseInt(h?.records ?? '0') || 0,
  };
};

/** Update daily streak. Returns the current streak count. */
const touchStreak = async (username: string): Promise<number> => {
  const uKey = keys.user(username);
  const today = dayKey();
  const h = await redis.hGetAll(uKey);
  const lastDay = h?.lastDay ?? '';
  let streak = parseInt(h?.streak ?? '0') || 0;
  if (lastDay !== today) {
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    streak = lastDay === yesterday ? streak + 1 : 1;
    await redis.hSet(uKey, { lastDay: today, streak: String(streak) });
  }
  return Math.max(1, streak);
};

const streakMultiplier = (streak: number): number =>
  1 + 0.1 * Math.min(Math.max(streak - 1, 0), 10);

const awardRp = async (username: string, amount: number): Promise<void> => {
  if (amount <= 0) return;
  await Promise.all([
    redis.hIncrBy(keys.user(username), 'rp', amount),
    redis.zIncrBy(keys.lbAll, username, amount),
    redis.zIncrBy(keys.lbWeek(weekKey()), username, amount),
  ]);
};

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(err('Missing post context'), 400);

  const username = (await reddit.getCurrentUsername()) ?? null;
  const player = await loadPlayer(username);
  const day = dayKey();
  const joined = username
    ? (await redis.hGet(keys.user(username), 'joined')) === '1'
    : false;

  const track = await getJson<Track>(keys.track(postId));
  const kind: PostKind = track ? 'track' : 'hub';

  if (kind === 'track' && track) {
    const [record, attemptsRaw, myBest, racers] = await Promise.all([
      getJson<GhostMeta>(keys.record(postId)),
      redis.get(keys.attempts(postId)),
      username ? redis.zScore(keys.times(postId), username) : Promise.resolve(undefined),
      redis.zCard(keys.times(postId)),
    ]);
    return c.json<InitResponse>({
      kind,
      username,
      player,
      day,
      joined,
      track,
      record,
      myBestMs: myBest != null ? Number(myBest) : null,
      attempts: parseInt(attemptsRaw ?? '0') || 0,
      racers: racers ?? 0,
    });
  }

  // Hub post
  const [dailyRecord, myDailyBest, dailyPlayers, activeTracks, hotRows] = await Promise.all([
    getJson<GhostMeta>(keys.dailyRecord(day)),
    username ? redis.zScore(keys.dailyTimes(day), username) : Promise.resolve(undefined),
    redis.zCard(keys.dailyTimes(day)),
    redis.zCard(keys.tracksAll),
    redis.zRange(keys.tracksHot(weekKey()), 0, 0, { by: 'rank', reverse: true }),
  ]);

  let hotTrack: InitResponse['hotTrack'] = null;
  const hotId = hotRows?.[0]?.member;
  if (hotId) {
    const [hotTrackData, hotRecord] = await Promise.all([
      getJson<Track>(keys.track(hotId)),
      getJson<GhostMeta>(keys.record(hotId)),
    ]);
    if (hotTrackData) {
      hotTrack = {
        postId: hotId,
        name: hotTrackData.name,
        owner: hotTrackData.owner,
        recordUser: hotRecord?.user ?? null,
      };
    }
  }

  return c.json<InitResponse>({
    kind: 'hub',
    username,
    player,
    day,
    joined,
    dailyRecord,
    myDailyBestMs: myDailyBest != null ? Number(myDailyBest) : null,
    dailyPlayers: dailyPlayers ?? 0,
    hotTrack,
    activeTracks: activeTracks ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GHOSTS (heavy payloads, fetched on race start)
// ---------------------------------------------------------------------------

api.get('/ghosts', async (c) => {
  const { postId } = context;
  const arena = c.req.query('arena') === 'daily' ? 'daily' : 'post';
  const username = (await reddit.getCurrentUsername()) ?? null;
  const day = dayKey();

  const timesKey = arena === 'daily' ? keys.dailyTimes(day) : keys.times(postId ?? '');
  const pbKeyFor = (user: string): string =>
    arena === 'daily' ? keys.dailyPbGhost(day, user) : keys.pbGhost(postId ?? '', user);

  // Podium: top-3 fastest players, each with their PB replay.
  const podium = (await redis.zRange(timesKey, 0, 2, { by: 'rank' })) ?? [];
  const replays = await Promise.all(podium.map((row) => getJson<Ghost>(pbKeyFor(row.member))));
  const top = replays.filter((g): g is Ghost => g !== null);

  // Your own PB races too — unless you're already on the podium.
  let mine: Ghost | null = null;
  if (username && !top.some((g) => g.user === username)) {
    mine = await getJson<Ghost>(pbKeyFor(username));
  }

  return c.json<GhostsResponse>({ top, mine });
});

// ---------------------------------------------------------------------------
// PUBLISH a community track
// ---------------------------------------------------------------------------

api.post('/track/publish', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  if (!username) return c.json(err('You must be logged in to publish a track.'), 403);

  const body = await c.req.json<PublishRequest>();
  const trackError = validateTrackSubmission(body);
  if (trackError) return c.json(err(trackError), 400);
  const ghostError = validateGhostSubmission(body.ghost ?? {});
  if (ghostError) return c.json(err(`${ghostError} Complete a test run before publishing.`), 400);

  const name = body.name.trim().slice(0, MAX_NAME_LEN);
  const day = dayKey();
  const length = trackLength(body.nodes.length, body.dx);

  const { postId, url } = await createTrackPost({
    name,
    owner: username,
    recordMs: body.ghost.timeMs,
    length,
    nodes: body.nodes,
    boosts: body.boosts,
  });

  const track: Track = {
    v: 1,
    name,
    owner: username,
    nodes: body.nodes,
    dx: body.dx,
    boosts: body.boosts,
    day,
  };
  const record: GhostMeta = { user: username, timeMs: body.ghost.timeMs };
  const recordGhost: Ghost = { user: username, ...body.ghost };

  await Promise.all([
    redis.set(keys.track(postId), JSON.stringify(track)),
    redis.set(keys.record(postId), JSON.stringify(record)),
    redis.set(keys.recordGhost(postId), JSON.stringify(recordGhost)),
    redis.set(keys.pbGhost(postId, username), JSON.stringify(recordGhost)),
    redis.zAdd(keys.times(postId), { member: username, score: body.ghost.timeMs }),
    redis.zAdd(keys.tracksAll, { member: postId, score: Date.now() }),
    redis.hIncrBy(keys.user(username), 'builds', 1),
  ]);

  await awardRp(username, 25);

  return c.json<PublishResponse>({ postId, url });
});

// ---------------------------------------------------------------------------
// FINISH a run (post track or daily rally)
// ---------------------------------------------------------------------------

api.post('/run/finish', async (c) => {
  const { postId } = context;
  const username = (await reddit.getCurrentUsername()) ?? null;
  if (!username) {
    // Logged-out players can race but earn nothing.
    return c.json<FinishResponse>({
      rpEarned: 0,
      newPB: false,
      tookRecord: false,
      dethroned: null,
      recordMs: 0,
      streak: 0,
      multiplier: 1,
      practice: true,
    });
  }

  const body = await c.req.json<FinishRequest>();
  const ghostError = validateGhostSubmission(body.ghost ?? {});
  if (ghostError) return c.json(err(ghostError), 400);
  if (body.timeMs !== body.ghost.timeMs) return c.json(err('Time mismatch.'), 400);

  const day = dayKey();
  const isDaily = body.arena === 'daily';

  let track: Track | null = null;
  if (!isDaily) {
    if (!postId) return c.json(err('Missing post context'), 400);
    track = await getJson<Track>(keys.track(postId));
    if (!track) return c.json(err('Track not found'), 404);
  }

  const timesKey = isDaily ? keys.dailyTimes(day) : keys.times(postId ?? '');
  const recordKey = isDaily ? keys.dailyRecord(day) : keys.record(postId ?? '');
  const ghostKey = isDaily ? keys.dailyGhost(day) : keys.recordGhost(postId ?? '');
  const pbKey = isDaily ? keys.dailyPbGhost(day, username) : keys.pbGhost(postId ?? '', username);

  const isOwner = !isDaily && track?.owner === username;
  const streak = await touchStreak(username);
  const multiplier = streakMultiplier(streak);

  // --- Personal best ---
  const prevBestRaw = await redis.zScore(timesKey, username);
  const prevBest = prevBestRaw != null ? Number(prevBestRaw) : null;
  const newPB = prevBest === null || body.timeMs < prevBest;
  if (newPB) {
    const ghost: Ghost = { user: username, ...body.ghost };
    await Promise.all([
      redis.zAdd(timesKey, { member: username, score: body.timeMs }),
      redis.set(pbKey, JSON.stringify(ghost)),
    ]);
  }

  // --- Track record ---
  const record = await getJson<GhostMeta>(recordKey);
  const tookRecord = newPB && (!record || body.timeMs < record.timeMs);
  let dethroned: string | null = null;
  if (tookRecord) {
    dethroned = record && record.user !== username ? record.user : null;
    const meta: GhostMeta = { user: username, timeMs: body.timeMs };
    const ghost: Ghost = { user: username, ...body.ghost };
    await Promise.all([
      redis.set(recordKey, JSON.stringify(meta)),
      redis.set(ghostKey, JSON.stringify(ghost)),
    ]);
    if (dethroned) {
      await redis.hIncrBy(keys.user(username), 'records', 1);
      // Announce the steal in the post's comments (best effort).
      try {
        const where = isDaily ? await redis.get(keys.hubPost) : postId;
        if (where) {
          const label = isDaily
            ? `Daily Rally #${dailyRallyNumber(day)}`
            : (track?.name ?? 'this track');
          await reddit.submitComment({
            id: asT3(where),
            text: `🏁 **New record on ${label}!** u/${username} — **${formatMs(body.timeMs)}** (dethroned u/${dethroned}, ${formatMs(record!.timeMs)})`,
          });
        }
      } catch (e) {
        console.error('Failed to post record comment:', e);
      }
    }
  }

  // --- Attempts / hot-track counters ---
  let attempts = 0;
  if (!isDaily && postId) {
    attempts = await redis.incrBy(keys.attempts(postId), 1);
    await redis.zIncrBy(keys.tracksHot(weekKey()), postId, 1);
  }
  await redis.hIncrBy(keys.user(username), 'finishes', 1);

  // --- RP ---
  const base = isDaily ? 20 : isOwner ? 5 : 15;
  const pbBonus = newPB && prevBest !== null ? 10 : 0;
  const recordBonus = tookRecord && !isOwner ? 50 : tookRecord ? 10 : 0;
  const rpEarned = Math.round((base + pbBonus + recordBonus) * multiplier);
  await awardRp(username, rpEarned);

  // --- Keep the splash card fresh ---
  if (!isDaily && postId && track && (tookRecord || attempts % 5 === 0)) {
    const currentRecord = tookRecord
      ? { user: username, timeMs: body.timeMs }
      : (record ?? { user: track.owner, timeMs: body.timeMs });
    const racers = (await redis.zCard(keys.times(postId))) ?? 0;
    const pd: TrackPostData = {
      kind: 'track',
      name: track.name,
      owner: track.owner,
      recordUser: currentRecord.user,
      recordMs: currentRecord.timeMs,
      attempts,
      racers,
      length: trackLength(track.nodes.length, track.dx),
      nodes: track.nodes,
      boosts: track.boosts,
    };
    void updateTrackPostData(postId, pd);
  }

  const recordMs = tookRecord ? body.timeMs : (record?.timeMs ?? body.timeMs);

  return c.json<FinishResponse>({
    rpEarned,
    newPB,
    tookRecord,
    dethroned,
    recordMs,
    streak,
    multiplier,
    practice: isOwner,
  });
});

// ---------------------------------------------------------------------------
// BRAG: comment your time, as the user, threaded under a pinned anchor
// ---------------------------------------------------------------------------

api.post('/brag', async (c) => {
  const { postId } = context;
  const username = (await reddit.getCurrentUsername()) ?? null;
  if (!username) return c.json(err('Log in to comment your time.'), 403);

  const body = await c.req.json<BragRequest>();
  const isDaily = body.arena === 'daily';
  const day = dayKey();

  const timesKey = isDaily ? keys.dailyTimes(day) : keys.times(postId ?? '');
  const bestRaw = await redis.zScore(timesKey, username);
  if (bestRaw == null) return c.json(err('Finish a run first!'), 400);
  const best = Number(bestRaw);

  const targetPost = isDaily ? ((await redis.get(keys.hubPost)) ?? postId) : postId;
  if (!targetPost) return c.json(err('Missing post context'), 400);

  // Lazily create the pinned "post your times" anchor comment.
  let anchorId = await redis.get(keys.anchor(targetPost));
  if (!anchorId) {
    const anchor = await reddit.submitComment({
      id: asT3(targetPost),
      text: '🏁 **Post your times here** — finish a run and tap "Comment my time".',
    });
    anchorId = anchor.id;
    await redis.set(keys.anchor(targetPost), anchorId);
    try {
      await anchor.distinguish(true);
    } catch {
      // app account isn't a mod here — anchor works unpinned
    }
  }

  const label = isDaily ? ` on Daily Rally #${dailyRallyNumber(day)}` : '';
  try {
    await reddit.submitComment({
      id: anchorId as `t1_${string}`,
      text: `⏱ **${formatMs(best)}**${label} — beat that 👻`,
      runAs: 'USER',
    });
  } catch (e) {
    console.error('brag comment failed:', e);
    return c.json(err('Could not post the comment. Try again.'), 500);
  }

  return c.json<BragResponse>({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// SUBSCRIBE to the subreddit
// ---------------------------------------------------------------------------

api.post('/subscribe', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  if (!username) return c.json(err('Log in to join.'), 403);
  try {
    await reddit.subscribeToCurrentSubreddit();
    await redis.hSet(keys.user(username), { joined: '1' });
    return c.json<SubscribeResponse>({ status: 'ok' });
  } catch (e) {
    console.error('subscribe failed:', e);
    return c.json(err('Could not subscribe. Try again.'), 500);
  }
});

// ---------------------------------------------------------------------------
// LEADERBOARDS
// ---------------------------------------------------------------------------

const toRows = (zr: { member: string; score: number }[] | undefined): LeaderboardRow[] =>
  (zr ?? []).map((r, i) => ({ member: r.member, score: r.score, rank: i + 1 }));

api.get('/leaderboard', async (c) => {
  const { postId } = context;
  const username = (await reddit.getCurrentUsername()) ?? null;
  const day = dayKey();
  const wk = weekKey();

  // Is this post a community track? Then include its all-time top-10.
  const isTrack = postId ? (await redis.get(keys.track(postId))) !== null : false;

  const [weekly, allTime, daily, trackRows] = await Promise.all([
    redis.zRange(keys.lbWeek(wk), 0, 9, { by: 'rank', reverse: true }),
    redis.zRange(keys.lbAll, 0, 9, { by: 'rank', reverse: true }),
    redis.zRange(keys.dailyTimes(day), 0, 9, { by: 'rank' }), // ascending: fastest first
    isTrack && postId
      ? redis.zRange(keys.times(postId), 0, 9, { by: 'rank' })
      : Promise.resolve(undefined),
  ]);

  let me: LeaderboardResponse['me'] = { weeklyRank: null, allTimeRank: null, dailyRank: null };
  if (username) {
    const [wr, ar, dr, tr, wCard, aCard] = await Promise.all([
      redis.zRank(keys.lbWeek(wk), username),
      redis.zRank(keys.lbAll, username),
      redis.zRank(keys.dailyTimes(day), username),
      isTrack && postId ? redis.zRank(keys.times(postId), username) : Promise.resolve(undefined),
      redis.zCard(keys.lbWeek(wk)),
      redis.zCard(keys.lbAll),
    ]);
    // zRank is ascending; RP boards are ranked descending → invert.
    me = {
      weeklyRank: wr != null && wCard != null ? wCard - Number(wr) : null,
      allTimeRank: ar != null && aCard != null ? aCard - Number(ar) : null,
      dailyRank: dr != null ? Number(dr) + 1 : null,
      trackRank: tr != null ? Number(tr) + 1 : null,
    };
  }

  return c.json<LeaderboardResponse>({
    weekly: toRows(weekly),
    allTime: toRows(allTime),
    daily: toRows(daily),
    ...(trackRows ? { track: toRows(trackRows) } : {}),
    me,
    weekKey: wk,
    day,
  });
});

// ---------------------------------------------------------------------------
// NEXT TRACK to race
// ---------------------------------------------------------------------------

api.get('/tracks/next', async (c) => {
  const { postId } = context;
  const card = (await redis.zCard(keys.tracksAll)) ?? 0;
  if (card === 0) return c.json<NextTrackResponse>({ postId: null, url: null });

  // Random pick, retrying a couple of times if we land on the current post.
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * card);
    const rows = await redis.zRange(keys.tracksAll, idx, idx, { by: 'rank' });
    const pick = rows?.[0]?.member;
    if (pick && pick !== postId) {
      const url = `https://www.reddit.com/r/${context.subredditName}/comments/${pick.replace(/^t3_/, '')}`;
      return c.json<NextTrackResponse>({ postId: pick, url });
    }
  }
  return c.json<NextTrackResponse>({ postId: null, url: null });
});
