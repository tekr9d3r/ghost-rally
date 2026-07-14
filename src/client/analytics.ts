import { telemetry } from '@devvit/analytics/client/reddit';

/**
 * Devvit Journeys, wrapped so a telemetry hiccup can never break gameplay.
 * Journey ids are managed by the client's session helper automatically.
 */

const safe = (p: Promise<unknown>): void => {
  p.catch(() => {
    /* analytics must never throw into the game */
  });
};

export const appReady = (): void => safe(telemetry.appReady());

export const journeyStart = (): void => safe(telemetry.startJourney());

export const journeyProgress = (progress: number, action?: string): void =>
  safe(telemetry.progress({ progress, ...(action ? { action } : {}) }));

export const journeyEnd = (complete: boolean, score?: number): void =>
  safe(
    telemetry.endJourney({
      complete,
      ...(score !== undefined ? { game: { win: complete, score } } : {}),
    })
  );

/** Granular button/action tracking. */
export const track = (action: string, details?: string): void =>
  safe(telemetry.interaction({ action, ...(details ? { actionDetails: details } : {}) }));
