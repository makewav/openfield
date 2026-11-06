/**
 * Authorise one direct-to-Blob upload. This function never receives the bytes:
 * a code function body is capped at roughly 4.5 MB and clips are far larger, so
 * the browser PUTs the file to Blob itself with the token returned here.
 */
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, makeUploadToken, uploadPathname } from './_blob.js';
import { allow, ApiError, body, handler, json } from './_http.js';

const MAX_NAME = 200;

export default handler(async (req, res) => {
  if (!allow(req, res, 'POST')) return;

  const { name, contentType } = body<{ name?: unknown; contentType?: unknown }>(req);

  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 1 || trimmed.length > MAX_NAME || /[\\/]/.test(trimmed)) {
    throw new ApiError(400, `A file name of 1 to ${MAX_NAME} characters is required, with no path separators`);
  }

  let type: string | undefined;
  if (contentType !== undefined && contentType !== null && contentType !== '') {
    if (typeof contentType !== 'string' || !(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(contentType)) {
      throw new ApiError(400, `contentType must be one of: ${ALLOWED_UPLOAD_TYPES.join(', ')}`);
    }
    type = contentType;
  }

  const pathname = uploadPathname(trimmed);
  json(res, 200, {
    token: await makeUploadToken(pathname, type),
    pathname,
    maxBytes: MAX_UPLOAD_BYTES,
  });
});
