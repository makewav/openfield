/**
 * Postgres: the job history and the daily usage counter.
 *
 * Two things to keep in mind. The pool is module-level so warm serverless
 * instances reuse it, and the schema is created lazily because a fresh database
 * has nothing in it. There is no migration tool; the statements are additive and
 * safe to run on every cold start.
 */
import { Pool } from 'pg';
import { databaseUrl } from './_env.js';
import type { JobRow, JobStatus, Project } from './_types.js';

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      // Serverless: keep the per-instance pool small or the database refuses
      // connections when several functions cold start at once.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await db().query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id               serial PRIMARY KEY,
      created_at       timestamptz NOT NULL DEFAULT now(),
      project_id       integer,
      kind             text        NOT NULL,
      app              text        NOT NULL,
      status           text        NOT NULL DEFAULT 'queued',
      prompt           text        NOT NULL DEFAULT '',
      user_prompt      text,
      model            text        NOT NULL,
      task_id          text,
      settings         jsonb       NOT NULL DEFAULT '{}'::jsonb,
      output_path      text,
      poster_url       text,
      error            text,
      credits          numeric,
      render_seconds   integer,
      starred          integer     NOT NULL DEFAULT 0,
      last_checked_at  timestamptz,
      provider_state   text
    );
    CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
    CREATE INDEX IF NOT EXISTS jobs_status_idx     ON jobs (status);
    CREATE INDEX IF NOT EXISTS jobs_task_id_idx    ON jobs (task_id);

    CREATE TABLE IF NOT EXISTS daily_usage (
      day  date PRIMARY KEY,
      jobs integer NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id         serial PRIMARY KEY,
      name       text NOT NULL,
      folder     text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  schemaReady = true;
}

/** A row as it comes back, with jsonb already parsed by pg. */
type RawRow = Omit<JobRow, 'settings'> & { settings: unknown };

function normalise(row: RawRow): JobRow {
  return {
    ...row,
    // The UI parses `settings` as a JSON string, so hand it a string.
    settings: typeof row.settings === 'string' ? row.settings : JSON.stringify(row.settings ?? {}),
  };
}

export interface NewJob {
  projectId: number | null;
  kind: string;
  app: string;
  prompt: string;
  userPrompt: string | null;
  model: string;
  taskId: string | null;
  settings: Record<string, unknown>;
  status?: JobStatus;
}

export async function insertJob(job: NewJob): Promise<JobRow> {
  const { rows } = await db().query<RawRow>(
    `INSERT INTO jobs (project_id, kind, app, status, prompt, user_prompt, model, task_id, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      job.projectId, job.kind, job.app, job.status ?? 'queued',
      job.prompt, job.userPrompt, job.model, job.taskId,
      JSON.stringify(job.settings),
    ],
  );
  return normalise(rows[0]);
}

export async function getJob(id: number): Promise<JobRow | null> {
  const { rows } = await db().query<RawRow>('SELECT * FROM jobs WHERE id = $1', [id]);
  return rows.length ? normalise(rows[0]) : null;
}

export async function listJobs(projectId: number | null, limit = 200): Promise<JobRow[]> {
  const { rows } = projectId === null
    ? await db().query<RawRow>('SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1', [limit])
    : await db().query<RawRow>(
      'SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
      [projectId, limit],
    );
  return rows.map(normalise);
}

/** Column names a caller may patch. Anything else is ignored, never interpolated. */
const PATCHABLE = new Set([
  'status', 'task_id', 'output_path', 'poster_url', 'error',
  'credits', 'render_seconds', 'last_checked_at', 'provider_state',
]);

export async function updateJob(id: number, patch: Partial<JobRow>): Promise<JobRow | null> {
  const keys = Object.keys(patch).filter((k) => PATCHABLE.has(k));
  if (!keys.length) return getJob(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => (patch as Record<string, unknown>)[k]);
  const { rows } = await db().query<RawRow>(
    `UPDATE jobs SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...values],
  );
  return rows.length ? normalise(rows[0]) : null;
}

export async function setStar(id: number, on: boolean): Promise<JobRow | null> {
  const { rows } = await db().query<RawRow>(
    'UPDATE jobs SET starred = $2 WHERE id = $1 RETURNING *',
    [id, on ? 1 : 0],
  );
  return rows.length ? normalise(rows[0]) : null;
}

export async function deleteJob(id: number): Promise<boolean> {
  const { rowCount } = await db().query('DELETE FROM jobs WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/** Jobs still with the provider. Used for the concurrency limit. */
export async function activeCount(): Promise<number> {
  const { rows } = await db().query<{ n: string }>(
    `SELECT count(*)::text AS n FROM jobs WHERE status IN ('queued', 'running')`,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Take one unit of the daily allowance, atomically. Returns the day's count
 * after the increment, or null when the cap is already reached. Doing this in
 * one statement is what makes the cap hold under concurrent requests.
 */
export async function takeDailySlot(cap: number): Promise<number | null> {
  const { rows } = await db().query<{ jobs: number }>(
    `INSERT INTO daily_usage (day, jobs) VALUES (CURRENT_DATE, 1)
     ON CONFLICT (day) DO UPDATE SET jobs = daily_usage.jobs + 1 WHERE daily_usage.jobs < $1
     RETURNING jobs`,
    [cap],
  );
  return rows.length ? rows[0].jobs : null;
}

export async function usageToday(): Promise<number> {
  const { rows } = await db().query<{ jobs: number }>(
    'SELECT jobs FROM daily_usage WHERE day = CURRENT_DATE',
  );
  return rows.length ? rows[0].jobs : 0;
}

/**
 * Give a unit back. Used when a job was counted but never actually reached the
 * provider, so a failed submission does not silently eat the day's allowance.
 */
export async function releaseDailySlot(): Promise<void> {
  await db().query(
    'UPDATE daily_usage SET jobs = GREATEST(jobs - 1, 0) WHERE day = CURRENT_DATE',
  );
}

export async function listProjects(): Promise<Project[]> {
  const { rows } = await db().query<Project>(
    'SELECT id, name, folder FROM projects ORDER BY created_at ASC',
  );
  return rows;
}

export async function createProject(name: string, folder: string): Promise<number> {
  const { rows } = await db().query<{ id: number }>(
    'INSERT INTO projects (name, folder) VALUES ($1, $2) RETURNING id',
    [name, folder],
  );
  return rows[0].id;
}
