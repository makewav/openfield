/**
 * The boot/health payload. It must answer even when the provider is unhappy, so
 * the credit balance is best-effort and never fails the route: the screens need
 * `generation`, the active takes and the daily counters to boot at all.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema, getJob, usageToday } from './_db.js';
import { dailyJobCap, generationEnabled } from './_env.js';
import { allow, handler, json } from './_http.js';
import { takeFromJob } from './_jobs.js';
import { creditBalance } from './_kie.js';
import type { JobRow, Take } from './_types.js';

export default handler(async (req: VercelRequest, res: VercelResponse) => {
  if (!allow(req, res, 'GET')) return;

  await ensureSchema();

  // Ids first, so every row is read through getJob() and is normalised exactly
  // like the rest of the API sees it.
  const { rows } = await db().query<{ id: number }>(
    `SELECT id FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at DESC`,
  );
  const jobs = await Promise.all(rows.map((row) => getJob(row.id)));
  const active: Take[] = jobs.filter((job): job is JobRow => job !== null).map(takeFromJob);

  let credits: number | null = null;
  try {
    credits = await creditBalance();
  } catch (e) {
    // A provider outage is not a boot failure; the balance is simply unknown.
    console.error('[openfield] credit balance unavailable:', e instanceof Error ? e.message : e);
  }

  json(res, 200, {
    up: true,
    generation: generationEnabled(),
    active,
    usedToday: await usageToday(),
    dailyCap: dailyJobCap(),
    credits,
  });
});
