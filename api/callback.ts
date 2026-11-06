/**
 * Kie's optional completion webhook.
 *
 * The body is attacker-controlled, so it is read for exactly one thing: a task
 * id. Everything about the job's state is re-fetched from the provider. A task
 * id that matches no row is ignored — a stranger must not be able to make this
 * deployment spend credits or write rows.
 *
 * The provider expects HTTP 200 with `{ code: 200, msg: 'success' }` and may
 * retry anything else, so this route always answers that, even on an internal
 * error; the poll path remains the source of truth.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema, getJob, updateJob } from './_db.js';
import { allow, body, handler, json } from './_http.js';
import { finishJob } from './_jobs.js';
import { recordInfo } from './_kie.js';

const PROVIDER_OK = { code: 200, msg: 'success' } as const;

/** The task id, from either documented envelope shape. Anything else is ignored. */
function taskIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const outer = payload as { data?: unknown; taskId?: unknown };
  const inner =
    outer.data && typeof outer.data === 'object' ? (outer.data as { taskId?: unknown }).taskId : undefined;
  const value = inner ?? outer.taskId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default handler(async (req: VercelRequest, res: VercelResponse) => {
  if (!allow(req, res, 'POST')) return;

  try {
    await ensureSchema();

    let payload: unknown = {};
    try {
      payload = body(req);
    } catch {
      payload = {};
    }

    const taskId = taskIdOf(payload);
    if (!taskId) return json(res, 200, PROVIDER_OK);

    const { rows } = await db().query<{ id: number }>(
      'SELECT id FROM jobs WHERE task_id = $1 LIMIT 1',
      [taskId],
    );
    if (!rows.length) return json(res, 200, PROVIDER_OK);

    const job = await getJob(rows[0].id);
    if (!job) return json(res, 200, PROVIDER_OK);

    // Already settled: a retry (or a duplicate delivery) must not copy or write again.
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      return json(res, 200, PROVIDER_OK);
    }

    const result = await recordInfo(taskId);

    if (result.state === 'success') {
      await finishJob(job, result);
    } else if (result.state === 'fail') {
      await updateJob(job.id, {
        status: 'failed',
        error:
          result.failMsg ??
          `The provider failed the task${result.failCode ? ` (code ${result.failCode})` : ''}.`,
        credits: result.creditsConsumed,
        last_checked_at: new Date().toISOString(),
        provider_state: result.state,
      });
    }
  } catch (e) {
    // Never surface this to the provider, and never log the body: it may be junk.
    console.error('[openfield] callback:', e instanceof Error ? e.message : e);
  }

  json(res, 200, PROVIDER_OK);
});
