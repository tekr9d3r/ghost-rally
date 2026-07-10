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
  /** Track post only. */
  track?: Track;
  record?: GhostMeta | null;
  myBestMs?: number | null;
  attempts?: number;
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

export type FinishRequest = {
  /** 'post' = the track living in this post; 'daily' = today's generated rally. */
  arena: 'post' | 'daily';
  timeMs: number;
  ghost: { timeMs: number; fps: number; frames: number[] };
};

export type FinishResponse = {
  rpEarned: number;
  newPB: boolean;
  tookRecord: boolean;
  dethroned: string | null;
  recordMs: number;
  streak: number;
  multiplier: number;
  practice: boolean;
};

export type LeaderboardResponse = {
  weekly: LeaderboardRow[];
  allTime: LeaderboardRow[];
  daily: LeaderboardRow[];
  me: {
    weeklyRank: number | null;
    allTimeRank: number | null;
    dailyRank: number | null;
  };
  weekKey: string;
  day: string;
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
  length: number;
  /** Terrain profile for the splash preview (same shape as Track.nodes). */
  nodes: number[];
  boosts: number[];
};

export type HubPostData = {
  kind: 'hub';
};
