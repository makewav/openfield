/**
 * The single playback/download URL for a take. It redirects instead of
 * streaming: Blob serves the bytes (with Range support) and a function never
 * has to hold a clip in memory.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, getJob } from '../_db.js';
import { allow, ApiError, handler, numericParam, param } from '../_http.js';

/** Blob turns `?download=1` into an attachment. */
function asDownload(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

function redirect(res: VercelResponse, location: string): void {
  res.status(302);
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.end();
}

export default handler(async (req: VercelRequest, res: VercelResponse) => {
  if (!allow(req, res, 'GET')) return;

  await ensureSchema();
  const job = await getJob(numericParam(req));

  if (!job) throw new ApiError(404, 'Not found');
  if (!job.output_path) {
    // Finished but never stored: the file is gone, not missing (old-route behaviour).
    if (job.status === 'done') throw new ApiError(410, 'The media for this take is no longer available');
    throw new ApiError(404, 'Not found');
  }

  redirect(res, param(req, 'download') === '1' ? asDownload(job.output_path) : job.output_path);
});
