import { Hono } from 'hono';
import { ensureHubPost } from '../core/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    await ensureHubPost();
  } catch (error) {
    console.error(`Failed to create hub post on install: ${error}`);
  }
  return c.json({ status: 'ok' });
});
