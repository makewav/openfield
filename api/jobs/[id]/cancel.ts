/** POST /api/jobs/:id/cancel — stop polling and mark the row cancelled. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema } from '../../_db.js';
import { allow, ApiError, handler, json, numericParam } from '../../_http.js';
import { cancelJob, loadJob, takeFromJob } from '../../_jobs.js';
import type { Take } from '../../_types.js';

export default handler(async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (!allow(req, res, 'POST')) return;
  await ensureSchema();

  // Load first so a still-running job gets one last provider check before it is
  // closed locally; cancelJob is a no-op on a row that already reached a terminal state.
  const job = await loadJob(numericParam(req));
  if (!job) throw new ApiError(404, 'Not found');

  const take: Take = takeFromJob(await cancelJob(job));
  json(res, 200, take);
});
