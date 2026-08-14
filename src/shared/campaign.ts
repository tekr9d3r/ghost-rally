import type { DifficultyParams } from './track';
import type { MedalTier, Track } from './types';
import { NODE_DX, generateSeededTrack, trackLength } from './track';

export type CampaignStage = {
  id: string;
  name: string;
  params: DifficultyParams;
};

/**
 * Fixed roster, ramping from a gentle on-ramp to harder-than-the-daily-rally.
 * Stage seeds (`campaign:{id}`) never change, so these tracks are permanent —
 * unlike the daily rally, which is reseeded every UTC day.
 */
export const CAMPAIGN_STAGES: CampaignStage[] = [
  {
    id: 'c1',
    name: 'First Gear',
    params: { minNodes: 16, maxNodes: 20, ampScale: 0.3, boostMin: 3, boostMax: 5, bigDip: false },
  },
  {
    id: 'c2',
    name: 'Easy Does It',
    params: { minNodes: 18, maxNodes: 22, ampScale: 0.4, boostMin: 3, boostMax: 5, bigDip: false },
  },
  {
    id: 'c3',
    name: 'Rolling Hills',
    params: { minNodes: 20, maxNodes: 25, ampScale: 0.55, boostMin: 2, boostMax: 4, bigDip: false },
  },
  {
    id: 'c4',
    name: 'Air Time',
    params: { minNodes: 24, maxNodes: 29, ampScale: 0.7, boostMin: 2, boostMax: 4, bigDip: true },
  },
  {
    id: 'c5',
    name: 'Valley Run',
    params: { minNodes: 28, maxNodes: 34, ampScale: 0.85, boostMin: 2, boostMax: 4, bigDip: true },
  },
  {
    id: 'c6',
    name: 'Full Throttle',
    params: { minNodes: 32, maxNodes: 38, ampScale: 1.0, boostMin: 2, boostMax: 4, bigDip: true },
  },
  {
    id: 'c7',
    name: 'Ghost Country',
    params: { minNodes: 36, maxNodes: 42, ampScale: 1.15, boostMin: 2, boostMax: 3, bigDip: true },
  },
  {
    id: 'c8',
    name: 'Redline',
    params: { minNodes: 40, maxNodes: 48, ampScale: 1.3, boostMin: 1, boostMax: 3, bigDip: true },
  },
];

export const campaignStageIndex = (id: string): number => CAMPAIGN_STAGES.findIndex((s) => s.id === id);

export const campaignStage = (id: string): CampaignStage | undefined =>
  CAMPAIGN_STAGES.find((s) => s.id === id);

export const nextCampaignStage = (id: string): CampaignStage | undefined => {
  const i = campaignStageIndex(id);
  return i >= 0 ? CAMPAIGN_STAGES[i + 1] : undefined;
};

export const firstCampaignStage = (): CampaignStage => CAMPAIGN_STAGES[0]!;

/** Build a stage's Track. Same seed forever — deterministic on every client. */
export const generateCampaignTrack = (stageId: string): Track | null => {
  const stage = campaignStage(stageId);
  if (!stage) return null;
  return generateSeededTrack(`campaign:${stageId}`, stage.params, {
    name: stage.name,
    owner: 'ghost-rally',
    day: `campaign:${stageId}`,
  });
};

export type MedalTimes = { gold: number; silver: number; bronze: number };

/**
 * Rough difficulty-scaled medal targets, in ms, derived from the stage's
 * expected track length. Approximate on purpose — tune the CRUISE_PX_PER_S
 * constant against real playtests rather than hand-tuning every stage.
 */
export const medalThresholds = (stage: CampaignStage): MedalTimes => {
  const avgNodes = Math.round((stage.params.minNodes + stage.params.maxNodes) / 2);
  const length = trackLength(avgNodes, NODE_DX);
  const CRUISE_PX_PER_S = 95;
  const base = (length / CRUISE_PX_PER_S) * 1000;
  return {
    gold: Math.round(base * 0.8),
    silver: Math.round(base * 1.05),
    bronze: Math.round(base * 1.4),
  };
};

export const medalForTime = (stage: CampaignStage, timeMs: number): MedalTier | null => {
  const t = medalThresholds(stage);
  if (timeMs <= t.gold) return 'gold';
  if (timeMs <= t.silver) return 'silver';
  if (timeMs <= t.bronze) return 'bronze';
  return null;
};
