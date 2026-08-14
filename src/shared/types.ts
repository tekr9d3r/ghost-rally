/** A player-built (or daily-generated) track. */
export type Track = {
  v: 1;
  name: string;
  owner: string;
  /** Terrain heights: y offset per node (px, relative to baseline; negative = up). */
  nodes: number[];
  /** Horizontal spacing between nodes (px). */
  dx: number;
  /** X positions of boost pads (world px). */
  boosts: number[];
  /** Creation day (YYYY-MM-DD, UTC). */
  day: string;
};

/** Recorded run replay. Frames are a flat [x, y, rotDeg, x, y, rotDeg, ...] array at `fps`. */
export type Ghost = {
  user: string;
  timeMs: number;
  fps: number;
  frames: number[];
};

/** Lightweight ghost metadata (no frames). */
export type GhostMeta = {
  user: string;
  timeMs: number;
};

export type PlayerStats = {
  username: string;
  rp: number;
  streak: number;
  builds: number;
  finishes: number;
  records: number;
};

export type LeaderboardRow = {
  member: string;
  score: number;
  rank: number;
};

export type PostKind = 'hub' | 'track';

export type InitResponse = {
  kind: PostKind;
  username: string | null;
  player: PlayerStats;
  day: string;
  /** Whether this user already tapped "join the subreddit". */
  joined?: boolean;
  /** Whether the player has any campaign progress (drives the hub hero button). */
  campaignStarted?: boolean;
  /** Track post only. */
  track?: Track;
  record?: GhostMeta | null;
  myBestMs?: number | null;
  attempts?: number;
  /** Unique finishers on this track. */
  racers?: number;
  /** Hub only. */
  dailyRecord?: GhostMeta | null;
  myDailyBestMs?: number | null;
  dailyPlayers?: number;
  hotTrack?: { postId: string; name: string; owner: string; recordUser: string | null } | null;
  activeTracks?: number;
};

/** Full ghost payloads for a race (fetched separately — they are heavy). */
export type GhostsResponse = {
  /** Podium: the top-3 fastest replays, fastest first. */
  top: Ghost[];
  /** Your PB replay, when you're not already on the podium. */
  mine: Ghost | null;
};

export type PublishRequest = {
  name: string;
  nodes: number[];
  dx: number;
  boosts: number[];
  /** The creator's successful test run — becomes the track's first record. */
  ghost: { timeMs: number; fps: number; frames: number[] };
};

export type PublishResponse = {
  postId: string;
  url: string;
};

/**
 * 'post' = the track living in this post; 'daily' = today's generated rally;
 * 'campaign' = a fixed stage; 'country' = a fixed country-seeded track.
 */
export type Arena = 'post' | 'daily' | 'campaign' | 'country';

export type FinishRequest = {
  arena: Arena;
  /** Required when arena === 'campaign'. */
  stageId?: string;
  /** Required when arena === 'country'. */
  countryCode?: string;
  timeMs: number;
  ghost: { timeMs: number; fps: number; frames: number[] };
};

export type MedalTier = 'bronze' | 'silver' | 'gold';

export type FinishResponse = {
  rpEarned: number;
  newPB: boolean;
  tookRecord: boolean;
  dethroned: string | null;
  recordMs: number;
  streak: number;
  multiplier: number;
  practice: boolean;
  /** Campaign only: medal earned by this run (if any), the next unlocked stage, and whether this run just finished the whole campaign. */
  medal?: MedalTier | null;
  nextStageId?: string | null;
  campaignJustCompleted?: boolean;
};

export type LeaderboardResponse = {
  weekly: LeaderboardRow[];
  allTime: LeaderboardRow[];
  daily: LeaderboardRow[];
  /** Present when viewing a track post: top-10 all-time on this track. */
  track?: LeaderboardRow[];
  /** Top-10 aggregate campaign times (players who finished every stage). */
  campaign?: LeaderboardRow[];
  me: {
    weeklyRank: number | null;
    allTimeRank: number | null;
    dailyRank: number | null;
    trackRank?: number | null;
    campaignRank?: number | null;
  };
  weekKey: string;
  day: string;
};

export type BragRequest = {
  arena: Arena;
  stageId?: string;
  countryCode?: string;
};

export type BragResponse = {
  status: 'ok';
};

export type SubscribeResponse = {
  status: 'ok';
};

export type NextTrackResponse = {
  postId: string | null;
  url: string | null;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

/** postData attached to track posts (drives the instant feed splash card, ≤2KB). */
export type TrackPostData = {
  kind: 'track';
  name: string;
  owner: string;
  recordUser: string | null;
  recordMs: number;
  attempts: number;
  /** Unique finishers. */
  racers: number;
  length: number;
  /** Terrain profile for the splash preview (same shape as Track.nodes). */
  nodes: number[];
  boosts: number[];
};

export type HubPostData = {
  kind: 'hub';
};

/** postData for the pinned daily-rally post (countdown splash card). */
export type DailyPostData = {
  kind: 'daily';
  day: string;
};

/** One campaign stage, with the current player's progress on it. */
export type CampaignStageStatus = {
  id: string;
  name: string;
  locked: boolean;
  bestMs: number | null;
  medal: MedalTier | null;
  gold: number;
  silver: number;
  bronze: number;
};

export type CampaignResponse = {
  stages: CampaignStageStatus[];
  completedAll: boolean;
  /** Sum of best times across every stage, once completedAll is true. */
  totalMs: number | null;
};

/** One country, with its current champion and the player's own best. */
export type CountryStatus = {
  code: string;
  name: string;
  flag: string;
  championUser: string | null;
  championMs: number | null;
  myBestMs: number | null;
};

export type CountryResponse = {
  countries: CountryStatus[];
};
