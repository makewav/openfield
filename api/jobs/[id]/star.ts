/** POST /api/jobs/:id/star — set the star flag. Body: { on: boolean }. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, setStar } from '../../_db.js';
import { allow, ApiError, body, handler, json, numericParam } from '../../_http.js';
import { takeFromJob } from '../../_jobs.js';
import type { Take } from '../../_types.js';

export default handler(async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (!allow(req, res, 'POST')) return;
  await ensureSchema();
  const id = numericParam(req);

  const { on } = body<{ on?: unknown }>(req);
  if (typeof on !== 'boolean') throw new ApiError(400, 'on must be true or false');

  // setStar returns null for a row that does not exist, so the 404 needs no
  // separate read.
  const job = await setStar(id, on);
  if (!job) throw new ApiError(404, 'Not found');

  const take: Take = takeFromJob(job);
  json(res, 200, take);
});
