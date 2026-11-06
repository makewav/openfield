/**
 * Rendering sizes: the one source of truth for how big a video renders.
 *
 * These are pixel budgets, not device budgets. Each app asks for a size, and
 * the provider runs the model at whatever resolution it supports; the app maps
 * its frame to the nearest grid point at the chosen tier.
 *
 * No imports, so anything can use it.
 */

export type RenderTier = '480p' | '720p' | '1080p';

export interface TierDef {
  id: RenderTier;
  /** Pixel budget in megapixels. */
  mp: number;
  /** The full name, as a picker shows it. */
  label: string;
  /** The second half of the label, for size chips. */
  short: string;
  /** One line on what it costs. */
  note: string;
}

export const RENDER_TIERS: readonly TierDef[] = [
  { id: '480p', mp: 0.41, label: '480p · fast', short: 'fast', note: 'Fastest and cheapest per job.' },
  { id: '720p', mp: 0.92, label: '720p · recommended', short: 'recommended', note: 'The usual choice for video. Roughly 1.3 to 2x the time of 480p.' },
  { id: '1080p', mp: 2.07, label: '1080p · slow, hero shots', short: 'slow, hero shots', note: 'Over twice the pixels of 720p and much slower. Video, loops and Director shots.' },
];

export const RENDER_TIER_IDS = RENDER_TIERS.map((t) => t.id) as ['480p', '720p', '1080p'];

export const isRenderTier = (v: unknown): v is RenderTier => typeof v === 'string' && (RENDER_TIER_IDS as string[]).includes(v);

/** A tier from free text (a request field, a stored setting), or undefined. */
export const parseTier = (v: unknown): RenderTier | undefined => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : v;
  return isRenderTier(t) ? t : undefined;
};

export const tierDef = (t: RenderTier): TierDef => RENDER_TIERS.find((x) => x.id === t) ?? RENDER_TIERS[1];

/**
 * Pixel size at a tier for a frame shaped `ratio` (width / height), on a 32 or
 * 64 grid. Two-stage renders and every guide-conditioned model need 64;
 * single-stage continue tools (Extend, Transition) take 32. Of the grid points
 * around the budget, the one closest in both shape and area wins, so 16:9 at
 * 720p is 1280x704 on 64 and 480p is 864x480.
 */
export function tierSize(t: RenderTier, ratio: number, align: 32 | 64 = 64): { w: number; h: number } {
  const r = ratio > 0 && Number.isFinite(ratio) ? ratio : 16 / 9;
  const px = tierDef(t).mp * 1e6;
  const h0 = Math.sqrt(px / r);
  const grid = (n: number) => [Math.max(256, Math.floor(n / align) * align), Math.max(256, Math.ceil(n / align) * align)];
  let best = { w: 0, h: 0 };
  let score = Infinity;
  for (const h of grid(h0)) {
    for (const w of grid(h * r)) {
      const s = Math.abs(Math.log(w / h / r)) + Math.abs(Math.log((w * h) / px));
      if (s < score - 1e-9) { score = s; best = { w, h }; }
    }
  }
  return best;
}

/** tierSize for a source of w x h (16:9 when unknown). */
export const tierSizeOf = (t: RenderTier, w: number | undefined, h: number | undefined, align: 32 | 64 = 64) =>
  tierSize(t, w && h ? w / h : 16 / 9, align);

const ORDER: Record<RenderTier, number> = { '480p': 0, '720p': 1, '1080p': 2 };

/** The tier, held at or under an app's largest size. */
export function capTier(t: RenderTier, max: RenderTier = '1080p'): RenderTier {
  return ORDER[t] > ORDER[max] ? max : t;
}

/**
 * The largest size each app asks for. These used to be GPU limits; now they are
 * the size each app's screen is designed around, so a small app does not quietly
 * get asked for a huge frame.
 */
export const APP_MAX_TIER = {
  video: '1080p',
  director: '1080p',
  scene: '720p',
  mirror: '720p',
  restyle: '720p',
  swap: '720p',
  effects: '720p',
  speak: '720p',
  extend: '720p',
  transition: '720p',
  reshoot: '480p',
  stage: '720p',
} as const satisfies Record<string, RenderTier>;

export type TierApp = keyof typeof APP_MAX_TIER;

/** The tier an app renders at: the chosen one, capped at what the app asks for. */
export const appTier = (app: TierApp, t: RenderTier): RenderTier => capTier(t, APP_MAX_TIER[app]);
