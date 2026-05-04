/**
 * TICKET-10: 30-doctrine seed taxonomy (TypeScript surface).
 *
 * Re-exports the data from taxonomy.mjs and adds the type contract.
 * Single source of truth for the data lives in taxonomy.mjs (so Node-side
 * extract scripts can import it without TS compilation). This file adds
 * the static types for the TS-side callers (lookup.ts, IB render path,
 * X-Ray, Charge Authority Pack).
 */

import {
  DOCTRINE_TAXONOMY as RAW_TAXONOMY,
  DOCTRINE_BY_SLUG as RAW_BY_SLUG,
  DOCTRINE_ALIAS_INDEX as RAW_ALIAS_INDEX,
  DOCTRINE_ALIAS_COUNT as RAW_ALIAS_COUNT,
} from './taxonomy.mjs';

export type Amendment =
  | '4A'
  | '5A'
  | '6A'
  | '8A'
  | 'Due Process'
  | 'Evidence'
  | 'Conspiracy';

export interface Doctrine {
  slug: string;
  name: string;
  aliases: string[];
  amendment: Amendment;
  description: string;
}

export const DOCTRINE_TAXONOMY: readonly Doctrine[] = RAW_TAXONOMY as readonly Doctrine[];
export const DOCTRINE_BY_SLUG: ReadonlyMap<string, Doctrine> = RAW_BY_SLUG as ReadonlyMap<string, Doctrine>;
export const DOCTRINE_ALIAS_INDEX: readonly { alias: string; lower: string; slug: string }[] =
  RAW_ALIAS_INDEX as readonly { alias: string; lower: string; slug: string }[];
export const DOCTRINE_ALIAS_COUNT: number = RAW_ALIAS_COUNT as number;
