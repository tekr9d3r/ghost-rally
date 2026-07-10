import { context, reddit, redis, EntrypointHeight } from '@devvit/web/server';
import type { HubPostData, TrackPostData } from '../../shared/types';
import { formatMs } from '../../shared/track';
import { keys } from './keys';

export type T3 = `t3_${string}`;

/** Narrow a stored id back to a post id, guarded at runtime. */
export const asT3 = (id: string): T3 => {
  if (!id.startsWith('t3_')) throw new Error(`Not a post id: ${id}`);
  return id as T3;
};

const postUrl = (postId: string): string =>
  `https://www.reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`;

/** Create (or return the existing) hub post — the game's home. */
export const ensureHubPost = async (): Promise<{ postId: string; url: string; created: boolean }> => {
  const existing = await redis.get(keys.hubPost);
  if (existing) return { postId: existing, url: postUrl(existing), created: false };

  const postData: HubPostData = { kind: 'hub' };
  const post = await reddit.submitCustomPost({
    title: '🏁 Ghost Rally — race your community, steal the record',
    entry: 'default',
    postData,
    textFallback: {
      text: 'Ghost Rally is an interactive racing game. Open this post on new Reddit or the app to play!',
    },
    styles: {
      backgroundColor: '#12233AFF',
      backgroundColorDark: '#0A1626FF',
      height: EntrypointHeight.TALL,
    },
  });
  await redis.set(keys.hubPost, post.id);
  try {
    await post.sticky();
  } catch {
    // Not a mod-capable context or already stickied — fine.
  }
  return { postId: post.id, url: postUrl(post.id), created: true };
};

/** Create a post for a freshly published community track. */
export const createTrackPost = async (args: {
  name: string;
  owner: string;
  recordMs: number;
  length: number;
  nodes: number[];
  boosts: number[];
}): Promise<{ postId: string; url: string }> => {
  const postData: TrackPostData = {
    kind: 'track',
    name: args.name,
    owner: args.owner,
    recordUser: args.owner,
    recordMs: args.recordMs,
    attempts: 1,
    length: args.length,
    nodes: args.nodes,
    boosts: args.boosts,
  };
  const post = await reddit.submitCustomPost({
    title: `🏁 ${args.name} — beat u/${args.owner}'s ${formatMs(args.recordMs)}`,
    entry: 'default',
    postData,
    textFallback: {
      text: `${args.name} is a Ghost Rally track by u/${args.owner}. Open on new Reddit or the app to race it!`,
    },
    styles: {
      backgroundColor: '#12233AFF',
      backgroundColorDark: '#0A1626FF',
      height: EntrypointHeight.TALL,
    },
  });
  return { postId: post.id, url: postUrl(post.id) };
};

/** Refresh the splash card data on a track post. Best-effort. */
export const updateTrackPostData = async (postId: string, data: TrackPostData): Promise<void> => {
  try {
    const post = await reddit.getPostById(asT3(postId));
    await post.setPostData(data);
  } catch (e) {
    console.error(`Failed to update postData for ${postId}:`, e);
  }
};

export { postUrl };
