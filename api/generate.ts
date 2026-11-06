/**
 * POST /api/generate — the one render entry point for every app.
 *
 * It validates the request, applies the spend guards, asks the provider for a
 * task, stores a job row and answers immediately with the job id. It never waits
 * for a render: a video can take longer than any function may live, so the
 * browser polls /api/jobs/:id.
 *
 * The guards, in order: kill switch, request validation, concurrency, daily cap.
 * Each job costs real credits, so nothing here may be skipped.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeCount, ensureSchema, insertJob, releaseDailySlot, takeDailySlot } from './_db.js';
import { dailyJobCap, generationEnabled, KILL_SWITCH_MESSAGE, publicBaseUrl } from './_env.js';
import { allow, ApiError, body, handler, json } from './_http.js';
import { takeFromJob } from './_jobs.js';
import { createTask } from './_kie.js';
import { parseAndBuild } from './_registry.js';
import type { JobRow, Take } from './_types.js';

/** Never let one click queue more than this many provider tasks. */
const MAX_TAKES = 4;

/** How many jobs may be live at once, across the whole app. */
function maxConcurrent(): number {
  const n = Number(process.env.MAX_CONCURRENT_JOBS ?? 2);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}

function takeCount(raw: Record<string, unknown>): number {
  const n = Number(raw.count ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_TAKES, Math.max(1, Math.floor(n)));
}

export default handler(async (req: VercelRequest, res: VercelResponse) => {
  if (!allow(req, res, 'POST')) return;

  if (!generationEnabled()) {
    throw new ApiError(503, KILL_SWITCH_MESSAGE, 'generation_disabled');
  }

  const raw = body<Record<string, unknown>>(req);
  // Validation happens before any spend, and a bad request never reaches Kie.
  const built = parseAndBuild(raw);
  const count = takeCount(raw);
  const projectId = typeof raw.projectId === 'number' ? raw.projectId : null;
  const userPrompt = typeof raw.userPrompt === 'string' ? raw.userPrompt : null;

  await ensureSchema();

  // Concurrency: a second guard on top of the daily cap, so a burst cannot open
  // a dozen paid tasks at once.
  const limit = maxConcurrent();
  const active = await activeCount();
  if (active + count > limit) {
    throw new ApiError(
      429,
      `Too many jobs are already running (${active} of ${limit}). Wait for one to finish, then try again.`,
      'too_many_active',
    );
  }

  // Daily cap: one atomic slot per take, taken before the provider is called.
  const cap = dailyJobCap();
  const taken: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const used = await takeDailySlot(cap);
    if (used === null) {
      for (const _ of taken) await releaseDailySlot();
      throw new ApiError(
        429,
        `The daily limit of ${cap} generations is used up. It resets at midnight UTC.`,
        'daily_cap_reached',
      );
    }
    taken.push(used);
  }

  // Callbacks only make sense when the deployment is publicly reachable; a
  // protected preview cannot receive them, so polling is always the main path.
  const callbackUrl = process.env.PUBLIC_BASE_URL
    ? `${publicBaseUrl()}/api/callback`
    : undefined;

  const created: Take[] = [];
  let lastError: unknown = null;

  for (let i = 0; i < count; i += 1) {
    try {
      const taskId = await createTask(built.model, built.input, callbackUrl);
      const row: JobRow = await insertJob({
        projectId,
        kind: built.app,
        app: built.app,
        status: 'queued',
        prompt: built.prompt,
        userPrompt,
        model: built.model,
        taskId,
        settings: { ...raw, kind: built.app, model: built.model },
      });
      created.push(takeFromJob(row));
    } catch (e) {
      // A slot was taken for this take and never reached the provider.
      await releaseDailySlot();
      lastError = e;
      if (!created.length) break;
      console.error('[openfield] generate: one take of a batch failed:', e instanceof Error ? e.message : e);
    }
  }

  if (!created.length) {
    if (lastError instanceof ApiError) throw lastError;
    const message = lastError instanceof Error ? lastError.message : 'The provider did not accept the task.';
    throw new ApiError(502, message, 'provider_rejected');
  }

  json(res, 200, {
    takeIds: created.map((t) => t.id),
    takeId: created[0].id,
    jobs: created,
  });
});
