/** Doctrine encoded: iterate cheap, spend full-res only on locked heroes. */

/**
 * Style preambles are user data, not constants — they live in the database and
 * are edited in the UI.
 */

/** The frame grid the video models use: 17k+5. Returns the nearest legal frame count for a seconds value. */
export function secondsToFrames(seconds: number): number {
  const target = Math.round(seconds * 24);
  const k = Math.round((target - 5) / 17);
  return Math.max(5, Math.min(362, 17 * Math.max(0, k) + 5));
}
