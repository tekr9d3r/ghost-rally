import type {
  Arena,
  BragResponse,
  CampaignResponse,
  CountryResponse,
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

export const fetchGhosts = (arena: Arena, id?: string): Promise<GhostsResponse> => {
  const param = arena === 'campaign' ? 'stage' : arena === 'country' ? 'country' : null;
  return request(`/api/ghosts?arena=${arena}${param && id ? `&${param}=${id}` : ''}`);
};

export const publishTrack = (body: PublishRequest): Promise<PublishResponse> =>
  post('/api/track/publish', body);

export const submitFinish = (body: FinishRequest): Promise<FinishResponse> =>
  post('/api/run/finish', body);

export const fetchLeaderboard = (): Promise<LeaderboardResponse> => request('/api/leaderboard');

export const fetchNextTrack = (): Promise<NextTrackResponse> => request('/api/tracks/next');

export const postBrag = (arena: Arena, id?: string): Promise<BragResponse> => {
  const key = arena === 'campaign' ? 'stageId' : arena === 'country' ? 'countryCode' : null;
  return post('/api/brag', { arena, ...(key && id ? { [key]: id } : {}) });
};

export const postSubscribe = (): Promise<SubscribeResponse> => post('/api/subscribe', {});

export const fetchCampaign = (): Promise<CampaignResponse> => request('/api/campaign');

export const fetchCountries = (): Promise<CountryResponse> => request('/api/countries');
