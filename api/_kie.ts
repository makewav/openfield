/**
 * The one server-only Kie AI wrapper. Everything that talks to the provider goes
 * through here, so the contract lives in a single file.
 *
 * Two rules from the port brief are encoded here and must not be relaxed:
 *
 *  1. Errors come back with HTTP 200 and the real code in the body. Success is
 *     `code: 200` — not 0. We therefore parse the body and never trust the
 *     status line.
 *  2. The key is server-side only. It is read from the environment per call and
 *     never returned, logged, or put in an error message.
 */
import { kieKey } from './_env.js';
import type { TaskResult } from './_types.js';

export const KIE_BASE = 'https://api.kie.ai';

/** Kie's documented failure codes, in words a person can act on. */
const ERROR_MESSAGES: Record<number, string> = {
  401: 'The provider rejected the API key. Check KIE_API_KEY.',
  402: 'Not enough credits on the provider account.',
  404: 'The provider does not know that model or endpoint.',
  408: 'The provider timed out waiting for a result.',
  422: 'The provider rejected the task parameters.',
  429: 'Too many requests to the provider; try again shortly.',
  433: 'The provider refused the request (undocumented code 433).',
  455: 'The provider is down for maintenance.',
  500: 'The provider had an internal error.',
  501: 'The provider could not generate this task.',
  505: 'That provider feature is disabled.',
};

export class KieError extends Error {
  code: number;
  status: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'KieError';
    this.code = code;
    // Our own status is derived from theirs: never let a credit problem look
    // like a bug, and never surface a 200 with an error body as success.
    this.status = code === 402 ? 402 : code === 401 ? 500 : 502;
  }
}

interface Envelope<T> { code?: number; msg?: string; data?: T }

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const key = kieKey();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await fetch(`${KIE_BASE}${path}`, { ...init, headers });
  } catch {
    // Never include the request in the message: it carries the key's purpose,
    // and the browser should not learn provider internals.
    throw new KieError(0, 'Could not reach the provider. Try again.');
  }

  const text = await res.text();
  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new KieError(0, `The provider answered with something that is not JSON (HTTP ${res.status}).`);
  }

  // The documented quirk: check the body, not the status.
  const code = typeof envelope.code === 'number' ? envelope.code : res.status;
  if (code !== 200) {
    const msg = ERROR_MESSAGES[code] ?? (envelope.msg || `The provider returned code ${code}.`);
    throw new KieError(code, msg);
  }
  return envelope.data as T;
}

/** POST /api/v1/jobs/createTask — returns the task id. */
export async function createTask(model: string, input: Record<string, unknown>, callBackUrl?: string): Promise<string> {
  const body: Record<string, unknown> = { model, input };
  if (callBackUrl) body.callBackUrl = callBackUrl;
  const data = await call<{ taskId?: string }>('/api/v1/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!data?.taskId) throw new KieError(0, 'The provider accepted the task but returned no task id.');
  return data.taskId;
}

/** The documented state machine. */
export const LIVE_STATES = new Set(['waiting', 'queuing', 'generating']);

interface RawRecord {
  state?: string;
  resultJson?: string | null;
  failMsg?: string | null;
  failCode?: string | null;
  progress?: number | null;
  creditsConsumed?: number | null;
  costTime?: number | null;
  completeTime?: number | null;
}

/** GET /api/v1/jobs/recordInfo — normalised, with `resultJson` parsed. */
export async function recordInfo(taskId: string): Promise<TaskResult> {
  const data = await call<RawRecord>(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: 'GET',
  });
  return {
    state: data?.state ?? 'unknown',
    resultUrls: parseResultUrls(data?.resultJson),
    failMsg: data?.failMsg ?? null,
    failCode: data?.failCode ?? null,
    progress: typeof data?.progress === 'number' ? data.progress : null,
    creditsConsumed: typeof data?.creditsConsumed === 'number' ? data.creditsConsumed : null,
    costTime: typeof data?.costTime === 'number' ? data.costTime : null,
    completeTime: typeof data?.completeTime === 'number' ? data.completeTime : null,
  };
}

/** `resultJson` is a JSON string, and the URL lives in `resultUrls[]`. */
export function parseResultUrls(resultJson: string | null | undefined): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: unknown; resultObject?: { url?: string } };
    if (Array.isArray(parsed.resultUrls)) {
      return parsed.resultUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    }
    const single = parsed.resultObject?.url;
    if (typeof single === 'string' && single.startsWith('http')) return [single];
    return [];
  } catch {
    return [];
  }
}

/** GET /api/v1/chat/credit — the account balance, for the UI. */
export async function creditBalance(): Promise<number> {
  const data = await call<number>('/api/v1/chat/credit', { method: 'GET' });
  return typeof data === 'number' ? data : 0;
}
