import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';

/**
 * Hono adapter for Devvit Journeys — the packaged router is Express-only.
 * Paths mirror TELEMETRY_JOURNEY_ENDPOINTS so the default client
 * (`@devvit/analytics/client/reddit`, basePath `/api/telemetry`) works as-is.
 */
export const telemetryRoutes = new Hono();

const handle = (fn: (body: never) => Promise<unknown>) => {
  return async (c: { req: { json: () => Promise<unknown> }; json: (o: unknown, s?: 200 | 400) => Response }) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as never;
      const result = await fn(body);
      return c.json(result ?? {}, 200);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'telemetry error' }, 400);
    }
  };
};

telemetryRoutes.post('/journey/start', handle(() => telemetry.startJourney()));
telemetryRoutes.post('/journey/progress', handle((b) => telemetry.journeyProgress(b)));
telemetryRoutes.post('/journey/interaction', handle((b) => telemetry.journeyInteraction(b)));
telemetryRoutes.post('/journey/end', handle((b) => telemetry.endJourney(b)));
telemetryRoutes.post('/journey/app-ready', handle(() => telemetry.appReady()));
