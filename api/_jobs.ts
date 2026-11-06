/**
 * The job lifecycle: what a row means, how it is refreshed against the provider,
 * and what "finished" does.
 *
 * The important invariant is in `finishJob`: every result is copied into Blob
 * before the row is marked done. Kie keeps generated files for 14 days, so a row
 * that stored only the provider URL would rot silently.
 */
import { copyResultToBlob } from './_blob.js';
import { getJob, insertJob, updateJob, type NewJob } from './_db.js';
import { LIVE_STATES, recordInfo } from './_kie.js';
import type { JobRow, Take, TaskResult } from './_types.js';

/** Do not ask the provider more than once every few seconds per job. */
const REFRESH_AFTER_MS = 3_000;

const isTerminal = (status: string): boolean => status === 'done' || status === 'failed' || status === 'cancelled';

/** A short, filesystem-safe name derived from the prompt. */
export function shotName(prompt: string, id: number): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'take'}-${id}`;
}

/**
 * The row in the shape the React pages already read. `prompt_id` carries the
 * provider task id so the screens did not have to change.
 */
export function takeFromJob(job: JobRow): Take {
  return {
    id: job.id,
    created_at: job.created_at,
    project_id: job.project_id,
    kind: job.kind,
    shot_name: shotName(job.prompt, job.id),
    prompt_id: job.task_id,
    status: job.status,
    settings: job.settings,
    output_path: job.output_path,
    render_seconds: job.render_seconds,
    transcript: null,
    starred: job.starred,
    error: job.error,
  };
}

/** True when a live job is due another provider check. */
export function dueForCheck(job: JobRow): boolean {
  if (isTerminal(job.status)) return false;
  if (!job.task_id) return false;
  if (!job.last_checked_at) return true;
  return Date.now() - new Date(job.last_checked_at).getTime() >= REFRESH_AFTER_MS;
}

/** Map Kie's state onto our status. */
function statusFor(state: string): JobRow['status'] {
  if (state === 'success') return 'running'; // finishJob decides 'done'
  if (state === 'fail') return 'failed';
  return state === 'generating' ? 'running' : 'queued';
}

/**
 * Ask the provider about one job and persist whatever changed.
 *
 * Safe to call concurrently: the worst case is two functions writing the same
 * answer, and the Blob copy is keyed on the row id.
 */
export async function refreshJob(job: JobRow): Promise<JobRow> {
  if (!job.task_id || isTerminal(job.status)) return job;

  let result: TaskResult;
  try {
    result = await recordInfo(job.task_id);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'could not ask the provider';
    // A transport hiccup must not fail a real render: record it and try again later.
    return (await updateJob(job.id, { last_checked_at: new Date().toISOString(), error: message })) ?? job;
  }

  if (result.state === 'success') return finishJob(job, result);

  if (result.state === 'fail') {
    return (await updateJob(job.id, {
      status: 'failed',
      error: result.failMsg ?? `The provider failed the task${result.failCode ? ` (code ${result.failCode})` : ''}.`,
      credits: result.creditsConsumed,
      last_checked_at: new Date().toISOString(),
      provider_state: result.state,
    })) ?? job;
  }

  return (await updateJob(job.id, {
    status: statusFor(result.state),
    last_checked_at: new Date().toISOString(),
    provider_state: result.state,
    credits: result.creditsConsumed ?? job.credits,
  })) ?? job;
}

/**
 * Copy every result into Blob, then mark the job done. The row only becomes
 * 'done' once at least one file is safely ours.
 */
export async function finishJob(job: JobRow, result: TaskResult): Promise<JobRow> {
  if (!result.resultUrls.length) {
    return (await updateJob(job.id, {
      status: 'failed',
      error: 'The provider reported success but returned no file.',
      last_checked_at: new Date().toISOString(),
      provider_state: result.state,
    })) ?? job;
  }

  const kind = job.kind === 'video' ? 'video' : 'image';
  const stored: string[] = [];
  for (const url of result.resultUrls) {
    try {
      stored.push(await copyResultToBlob(url, job.id, kind));
    } catch (e) {
      // Keep going: one bad file should not lose the others.
      console.error('[openfield] could not copy result to Blob:', e instanceof Error ? e.message : e);
    }
  }

  if (!stored.length) {
    return (await updateJob(job.id, {
      status: 'failed',
      error: 'The result came back but could not be copied into storage. Check BLOB_READ_WRITE_TOKEN.',
      last_checked_at: new Date().toISOString(),
      provider_state: result.state,
    })) ?? job;
  }

  return (await updateJob(job.id, {
    status: 'done',
    output_path: stored[0],
    // A still is its own poster; a clip gets one in the browser.
    poster_url: kind === 'image' ? stored[0] : null,
    credits: result.creditsConsumed,
    render_seconds: result.costTime !== null ? Math.round(result.costTime) : null,
    error: null,
    last_checked_at: new Date().toISOString(),
    provider_state: result.state,
  })) ?? job;
}

/**
 * Cancel a job locally. The provider has no documented cancel on this endpoint,
 * so this stops us polling and marks the row; the task may still run and bill
 * on their side. Saying so here keeps the UI honest rather than pretending.
 */
export async function cancelJob(job: JobRow): Promise<JobRow> {
  if (isTerminal(job.status)) return job;
  return (await updateJob(job.id, { status: 'cancelled' })) ?? job;
}

/** Load and refresh one job, used by the status route. */
export async function loadJob(id: number): Promise<JobRow | null> {
  const job = await getJob(id);
  if (!job) return null;
  return dueForCheck(job) ? refreshJob(job) : job;
}

/** Insert one row per take. */
export async function insertJobs(rows: NewJob[]): Promise<JobRow[]> {
  const created: JobRow[] = [];
  for (const row of rows) created.push(await insertJob(row));
  return created;
}

/** Every live state the provider uses, exported for the status route. */
export const PROVIDER_LIVE_STATES = LIVE_STATES;
