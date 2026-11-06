/** GET /api/jobs/:id — one job, refreshed against the provider when due. DELETE removes it and its files. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteBlob } from '../_blob.js';
import { deleteJob, ensureSchema, getJob } from '../_db.js';
import { allow, ApiError, handler, json, numericParam } from '../_http.js';
import { loadJob, takeFromJob } from '../_jobs.js';
import type { Take } from '../_types.js';

export default handler(async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (!allow(req, res, 'GET', 'DELETE')) return;
  await ensureSchema();
  const id = numericParam(req);

  if ((req.method ?? 'GET').toUpperCase() === 'DELETE') {
    // Read the row first: after it is gone nothing tells us which blobs it owned.
    const job = await getJob(id);
    if (!job) throw new ApiError(404, 'Not found');
    if (!(await deleteJob(id))) throw new ApiError(404, 'Not found');

    await deleteBlob(job.output_path);
    // A still's poster is the same blob as its output, so only a distinct one
    // needs a second delete.
    if (job.poster_url !== job.output_path) await deleteBlob(job.poster_url);
    json(res, 200, { ok: true });
    return;
  }

  const job = await loadJob(id);
  if (!job) throw new ApiError(404, 'Not found');
  const take: Take = takeFromJob(job);
  json(res, 200, take);
});
