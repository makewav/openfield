/** Shared types for the API. Nothing here touches a provider or the database. */

/** Where a job is in its life. `queued` and `running` are the live ones. */
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** What the provider produced: a still or a clip. */
export type OutputKind = 'image' | 'video';

/** A job row, exactly as it is stored. */
export interface JobRow {
  id: number;
  created_at: string;
  project_id: number | null;
  /** still | edit | video | upscale | cutout */
  kind: string;
  /** image | edit | video | upscale | cutout */
  app: string;
  status: JobStatus;
  /** The compiled prompt that was sent. */
  prompt: string;
  /** What the person typed, kept separate for the UI. */
  user_prompt: string | null;
  /** The Kie model id used. */
  model: string;
  /** Kie's task id. */
  task_id: string | null;
  /** The request body as JSON, so a recreate can resend it. */
  settings: string;
  /** The Blob URL of the finished media. */
  output_path: string | null;
  /** The Blob URL of the thumbnail, when one exists. */
  poster_url: string | null;
  error: string | null;
  /** Credits Kie reported for this task. */
  credits: number | null;
  render_seconds: number | null;
  starred: number;
  /** When the provider was last asked about this task. */
  last_checked_at: string | null;
  /** Kie's raw state string, for debugging. */
  provider_state: string | null;
}

/**
 * The shape the existing React pages read. It is deliberately identical to the
 * old SQLite `Take` so the screens did not have to change.
 */
export interface Take {
  id: number;
  created_at: string;
  project_id: number | null;
  kind: string;
  shot_name: string;
  prompt_id: string | null;
  status: string;
  settings: string;
  output_path: string | null;
  render_seconds: number | null;
  transcript: string | null;
  starred: number;
  error: string | null;
}

export interface Project { id: number; name: string; folder: string }

/** A finished result the provider reported. */
export interface TaskResult {
  state: string;
  resultUrls: string[];
  failMsg: string | null;
  failCode: string | null;
  progress: number | null;
  creditsConsumed: number | null;
  costTime: number | null;
  completeTime: number | null;
}
