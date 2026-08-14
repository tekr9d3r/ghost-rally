import type { DifficultyParams } from './track';
import { MAX_NODES, MIN_NODES, generateSeededTrack } from './track';

export const MIN_WORD_LEN = 2;
export const MAX_WORD_LEN = 20;

export const normalizeWord = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

/** Returns an error message, or null when the word is valid. */
export const validateWord = (raw: string): string | null => {
  const w = normalizeWord(raw);
  if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) {
    return `Word must be ${MIN_WORD_LEN}–${MAX_WORD_LEN} characters.`;
  }
  if (!/^[\p{L}\p{N} '-]+$/u.test(w)) {
    return 'Letters, numbers, spaces, hyphens and apostrophes only.';
  }
  return null;
};

export const capitalizeWord = (w: string): string =>
  w
    .split(' ')
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');

/** Longer words make longer tracks — a small, explainable flavor rule. */
const wordTrackParams = (word: string): DifficultyParams => {
  const len = Math.max(3, Math.min(20, word.length));
  const base = 20 + Math.round(len * 1.3);
  return {
    minNodes: Math.max(MIN_NODES, base - 3),
    maxNodes: Math.min(MAX_NODES + 1, base + 5),
    ampScale: 0.85,
    boostMin: 2,
    boostMax: 4,
    bigDip: true,
  };
};

export type WordTrackResult = {
  nodes: number[];
  boosts: number[];
  suggestedName: string;
};

/**
 * Generate a starting terrain from any word — same deterministic engine as the
 * daily rally and campaign stages, just reseeded. Same word always produces the
 * same track. Returns null when the word fails validation.
 */
export const generateWordTrack = (rawWord: string): WordTrackResult | null => {
  const w = normalizeWord(rawWord);
  if (validateWord(w)) return null;
  const seedKey = w.toLowerCase();
  const name = capitalizeWord(w);
  const track = generateSeededTrack(`word:${seedKey}`, wordTrackParams(w), {
    name,
    owner: 'you',
    day: `word:${seedKey}`,
  });
  return { nodes: track.nodes, boosts: track.boosts, suggestedName: name };
};
