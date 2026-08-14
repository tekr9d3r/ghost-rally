import type { DifficultyParams } from './track';
import type { Track } from './types';
import { generateSeededTrack } from './track';

export type Country = {
  code: string;
  name: string;
  flag: string;
};

/** Fixed, extensible roster — one array entry per addition, no migration needed. */
export const COUNTRIES: Country[] = [
  { code: 'de', name: 'Germany', flag: '🇩🇪' },
  { code: 'en', name: 'England', flag: '🏴' },
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'ar', name: 'Argentina', flag: '🇦🇷' },
  { code: 'cn', name: 'China', flag: '🇨🇳' },
  { code: 'br', name: 'Brazil', flag: '🇧🇷' },
  { code: 'fr', name: 'France', flag: '🇫🇷' },
  { code: 'it', name: 'Italy', flag: '🇮🇹' },
  { code: 'mx', name: 'Mexico', flag: '🇲🇽' },
  { code: 'ca', name: 'Canada', flag: '🇨🇦' },
  { code: 'au', name: 'Australia', flag: '🇦🇺' },
  { code: 'in', name: 'India', flag: '🇮🇳' },
  { code: 'kr', name: 'South Korea', flag: '🇰🇷' },
  { code: 'es', name: 'Spain', flag: '🇪🇸' },
];

export const countryByCode = (code: string): Country | undefined =>
  COUNTRIES.find((c) => c.code === code);

/** Slightly harder than the daily rally — this is challenge content, not onboarding. */
const COUNTRY_PARAMS: DifficultyParams = {
  minNodes: 34,
  maxNodes: 44,
  ampScale: 1.1,
  boostMin: 2,
  boostMax: 4,
  bigDip: true,
};

/** Build a country's Track. Same seed forever — deterministic on every client. */
export const generateCountryTrack = (code: string): Track | null => {
  const country = countryByCode(code);
  if (!country) return null;
  return generateSeededTrack(`country:${code}`, COUNTRY_PARAMS, {
    name: `${country.name} Rally`,
    owner: 'ghost-rally',
    day: `country:${code}`,
  });
};
