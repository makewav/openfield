/**
 * The grid thumbnail URL for a take. A still is its own poster; a clip's poster
 * is produced in the browser (canvas), so there is no server-side thumbnailer
 * here — ffmpeg and sharp are gone.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, getJob } from '../_db.js';
import { allow, ApiError, handler, numericParam } from '../_http.js';

export default handler(async (req: VercelRequest, res: VercelResponse) => {
  if (!allow(req, res, 'GET')) return;

  await ensureSchema();
  const job = await getJob(numericParam(req));

  if (!job) throw new ApiError(404, 'Not found');

  const target = job.poster_url ?? job.output_path;
  if (!target) throw new ApiError(404, 'No poster is available for this take');

  res.status(302);
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.end();
});
