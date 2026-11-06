/** GET /api/jobs — job history, newest first, optionally narrowed to one project. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, listJobs } from '../_db.js';
import { allow, ApiError, handler, json, param } from '../_http.js';
import { takeFromJob } from '../_jobs.js';
import type { Take } from '../_types.js';

/** `?project=` is a filter, so a bad value is a 400 — unlike a missing row, which is a 404. */
function projectFilter(req: VercelRequest): number | null {
  const raw = param(req, 'project');
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'project must be a positive integer');
  return n;
}

export default handler(async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (!allow(req, res, 'GET')) return;
  await ensureSchema();

  // No provider refresh here: the list stays a cheap database read, and the
  // single-job route is where a stale row is brought up to date.
  const takes: Take[] = (await listJobs(projectFilter(req))).map(takeFromJob);
  json(res, 200, takes);
});
