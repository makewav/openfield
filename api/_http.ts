/** Request/response helpers shared by every function. */
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** An error that should reach the client with a specific status. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(body));
}

/** `{ error }` on failure, which is what every screen already shows. */
export function fail(res: VercelResponse, status: number, message: string, code?: string): void {
  json(res, status, code ? { error: message, code } : { error: message });
}

/** Returns true when the method is allowed; otherwise answers 405. */
export function allow(req: VercelRequest, res: VercelResponse, ...methods: string[]): boolean {
  const m = (req.method ?? 'GET').toUpperCase();
  if (methods.includes(m)) return true;
  res.setHeader('Allow', methods.join(', '));
  fail(res, 405, `${m} is not allowed here`);
  return false;
}

/**
 * The request body as an object. Vercel parses JSON bodies already; this also
 * accepts a raw string body (some clients send one) and refuses anything else.
 */
export function body<T = Record<string, unknown>>(req: VercelRequest): T {
  if (req.body === undefined || req.body === null || req.body === '') return {} as T;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      throw new ApiError(400, 'The request body is not valid JSON');
    }
  }
  return req.body as T;
}

/** A single path segment or query value. */
export function param(req: VercelRequest, name: string): string | undefined {
  const q = req.query?.[name];
  if (Array.isArray(q)) return q[0];
  if (typeof q === 'string' && q.length > 0) return q;
  return undefined;
}

/** A numeric path id, or a 404 (an absent key is a missing resource, not a bad request). */
export function numericParam(req: VercelRequest, name = 'id'): number {
  const raw = param(req, name);
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'Not found');
  return n;
}

/**
 * Wrap a handler so thrown errors become clean JSON. A ConfigError is a
 * deployment mistake, so it is reported as 500 with a hint that names the
 * variable but never its value.
 */
export function handler(fn: (req: VercelRequest, res: VercelResponse) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof ApiError) {
        fail(res, e.status, e.message, e.code);
        return;
      }
      const name = (e as { name?: string })?.name;
      if (name === 'ConfigError') {
        console.error('[openfield] configuration:', (e as Error).message);
        fail(res, 500, `The server is not configured: ${(e as Error).message}`);
        return;
      }
      console.error('[openfield] unhandled:', e);
      const message = e instanceof Error ? e.message : 'Unexpected server error';
      fail(res, 500, message);
    }
  };
}
