import type {
  BragResponse,
  FinishRequest,
  FinishResponse,
  SubscribeResponse,
  GhostsResponse,
  InitResponse,
  LeaderboardResponse,
  NextTrackResponse,
  PublishRequest,
  PublishResponse,
} from '../shared/types';

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & { status?: string; message?: string };
  if (!res.ok) {
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return body;
};

const post = <T>(url: string, data: unknown): Promise<T> =>
  request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const fetchInit = (): Promise<InitResponse> => request('/api/init');

export const fetchGhosts = (arena: 'post' | 'daily'): Promise<GhostsResponse> =>
  request(`/api/ghosts?arena=${arena}`);

export const publishTrack = (body: PublishRequest): Promise<PublishResponse> =>
  post('/api/track/publish', body);

export const submitFinish = (body: FinishRequest): Promise<FinishResponse> =>
  post('/api/run/finish', body);

export const fetchLeaderboard = (): Promise<LeaderboardResponse> => request('/api/leaderboard');

export const fetchNextTrack = (): Promise<NextTrackResponse> => request('/api/tracks/next');

export const postBrag = (arena: 'post' | 'daily'): Promise<BragResponse> =>
  post('/api/brag', { arena });

export const postSubscribe = (): Promise<SubscribeResponse> => post('/api/subscribe', {});
