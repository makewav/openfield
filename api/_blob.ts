/**
 * Vercel Blob. Two jobs here:
 *
 *  1. Own every result. Kie keeps generated files for 14 days and uploaded files
 *     for 24 hours, so a provider URL is never storage — the completion step
 *     copies each result into Blob immediately.
 *  2. Let the browser upload straight to Blob, because a Vercel Function caps a
 *     request body at roughly 4.5 MB and clips are much bigger than that.
 */
import { del, put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { blobToken } from './_env.js';

/** Where results live inside the store. */
const RESULT_DIR = 'results';
const INPUT_DIR = 'inputs';

/** Extension from a URL path, ignoring query strings. Defaults per kind. */
export function extensionOf(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

/** Refuse to buffer anything absurd; a v1 clip is far below this. */
const MAX_COPY_BYTES = 200 * 1024 * 1024;

/**
 * Copy a provider result into our own Blob store.
 *
 * The format is not guessed: Kie's image models may return PNG or JPEG, so the
 * content type and extension come from the response itself and only fall back
 * to the kind's usual container.
 */
export async function copyResultToBlob(sourceUrl: string, jobId: number, kind: 'image' | 'video'): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`could not download the result (HTTP ${res.status})`);

  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_COPY_BYTES) throw new Error('the result is too large to copy');

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const fallbackType = kind === 'video' ? 'video/mp4' : 'image/png';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_COPY_BYTES) throw new Error('the result is too large to copy');

  const ext = extensionOf(sourceUrl, kind === 'video' ? 'mp4' : 'png');
  const pathname = `${RESULT_DIR}/${jobId}-${Date.now()}.${ext}`;
  const blob = await put(pathname, bytes, {
    access: 'public',
    token: blobToken(),
    contentType: contentType || fallbackType,
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Store a server-generated body (a poster, an uploaded buffer) in Blob. */
export async function putBytes(pathname: string, body: Buffer, contentType: string): Promise<string> {
  const blob = await put(pathname, body, {
    access: 'public',
    token: blobToken(),
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Delete a stored blob. A missing or already-gone blob is not an error. */
export async function deleteBlob(url: string | null): Promise<void> {
  if (!url) return;
  try {
    await del(url, { token: blobToken() });
  } catch {
    /* the row is the source of truth; a stale blob must not fail a delete */
  }
}

/** Types a browser may upload: the inputs the v1 apps actually take. */
export const ALLOWED_UPLOAD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
] as const;

/** 200 MB: generous for a phone clip, well under Blob's own limits. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * A short-lived token the browser can use to upload one file straight to Blob.
 * The route that hands this out is the only place an upload is authorised.
 */
export async function makeUploadToken(pathname: string, contentType?: string): Promise<string> {
  return generateClientTokenFromReadWriteToken({
    token: blobToken(),
    pathname,
    allowedContentTypes: contentType ? [contentType] : [...ALLOWED_UPLOAD_TYPES],
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
}

/** A collision-free pathname for one browser upload. */
export function uploadPathname(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'upload';
  return `${INPUT_DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}
