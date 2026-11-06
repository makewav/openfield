/** Client-side API. Generation runs on the model provider; nothing here talks to a local engine. */

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

export type CastKind = 'character' | 'prop' | 'place';
export interface CastRef { token: string; file: string; w: number; h: number; url: string }
export interface CastMember { id: number; name: string; kind: CastKind; refs: CastRef[]; notes: string; created_at: string }
/** Where a cast picture comes from: an upload token or a finished still take. */
export type CastSource = { token: string } | { takeId: number };

export interface Preamble { id: number; name: string; text: string; sort: number }

/** Boot/health payload. `up` means the provider answered; `active` is the live take list. */
export interface Status {
  up: boolean;
  active: Take[];
  /** Set when the operator has switched generation off (GENERATION_ENABLED). */
  generation?: boolean;
  /** Kie credit balance, where the provider reported one. */
  credits?: number | null;
  /** The optional Scene planner's reasoning override. */
  plannerReasoning?: string | null;
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  // Only claim a JSON body when one exists — a body-less POST with a JSON
  // content-type is rejected by some servers, which silently broke every
  // body-less POST (STOP, CLEAR QUEUE, cancel, trash) until 2026-08-04.
  const headers = init?.body
    ? { 'Content-Type': 'application/json', ...init.headers }
    : init?.headers;
  const r = await fetch(url, init && { ...init, headers });
  const d = await r.json();
  if (!r.ok) {
    const msg = (d && (d.error || d.message)) || `${r.status}`;
    console.error(`[openfield] ${init?.method || 'GET'} ${url} failed:`, msg);
    throw new Error(msg);
  }
  return d as T;
}

export const api = {
  status: () => j<Status>('/api/status'),
  takes: (projectId: number | null) => j<Take[]>(`/api/takes${projectId ? `?project=${projectId}` : ''}`),
  projects: () => j<Project[]>('/api/projects'),
  addProject: (name: string, folder: string) =>
    j<{ id: number }>('/api/projects', { method: 'POST', body: JSON.stringify({ name, folder }) }),
  upload: (name: string, dataUrl: string) =>
    j<{ name: string }>('/api/upload', { method: 'POST', body: JSON.stringify({ name, dataUrl }) }),
  generate: (body: Record<string, unknown>) =>
    j<{ takeId: number; takeIds: number[] }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelTake: (id: number) => j<{ ok: true }>(`/api/takes/${id}/cancel`, { method: 'POST' }),
  star: (id: number, on: boolean) => j<Take>(`/api/takes/${id}/star`, { method: 'POST', body: JSON.stringify({ on }) }),
  trash: (id: number) => j<{ ok: true }>(`/api/takes/${id}`, { method: 'DELETE' }),
  preambles: () => j<Preamble[]>('/api/preambles'),
  addPreamble: (name: string, text: string) =>
    j<{ id: number }>('/api/preambles', { method: 'POST', body: JSON.stringify({ name, text }) }),
  savePreamble: (id: number, name: string, text: string) =>
    j<Preamble>(`/api/preambles/${id}`, { method: 'PUT', body: JSON.stringify({ name, text }) }),
  deletePreamble: (id: number) => j<{ ok: true }>(`/api/preambles/${id}`, { method: 'DELETE' }),
  cast: () => j<CastMember[]>('/api/cast'),
  createCast: (m: { name: string; kind: CastKind; notes: string; refs: CastSource[] }) =>
    j<CastMember>('/api/cast', { method: 'POST', body: JSON.stringify(m) }),
  updateCast: (id: number, patch: { name?: string; kind?: CastKind; notes?: string; addRefs?: CastSource[]; removeRefs?: number[] }) =>
    j<CastMember>(`/api/cast/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteCast: (id: number) => j<{ ok: true }>(`/api/cast/${id}`, { method: 'DELETE' }),
  castHero: (b: { castIds: number[]; shot: string; width?: number; height?: number }) =>
    j<{ takeId: number }>('/api/cast/hero', { method: 'POST', body: JSON.stringify(b) }),
  /** Director scenes: plan a shot list (poll it), then shoot it into one cut. */
  directorPlan: (body: { scene: string; shots?: number; planner?: string; think?: boolean }) =>
    j<ScenePlan>('/api/director/plan', { method: 'POST', body: JSON.stringify(body) }),
  directorPlanStatus: (id: string) => j<ScenePlan>(`/api/director/plan/${id}`),
  directorScene: (body: Record<string, unknown>) =>
    j<{ cutId: number; take: Take }>('/api/director/scene', { method: 'POST', body: JSON.stringify(body) }),
};

/** A shot list being planned on the server. */
export interface ScenePlan {
  id: string;
  status: 'running' | 'done' | 'failed';
  scene: string;
  shots?: { framing: string; move: string; action: string; seconds: number }[];
  planner?: 'engine' | 'llm' | 'ollama' | 'split';
  notes: string[];
  seconds?: number;
  error?: string;
  /** While running: the planner at work, its model, what it is doing and the shots written so far. */
  stage?: 'engine' | 'llm' | 'ollama';
  model?: string;
  phase?: 'waiting' | 'thinking' | 'writing';
  partial?: { framing: string; move: string; action: string; seconds: number }[];
}

export const mediaUrl = (id: number) => `/api/media/${id}`;
export const posterUrl = (id: number) => `/api/poster/${id}`;
export const downloadUrl = (id: number) => `/api/media/${id}?download=1`;
export const inputUrl = (token: string) => `/api/input-image/${encodeURIComponent(token)}`;

/** Read a File as a data URL and upload it; returns the asset token. */
export async function uploadFile(f: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
  return (await api.upload(f.name, dataUrl)).name;
}

/** Upload a finished take's media as a new input (Animate, Use as reference). */
export async function takeAsInput(id: number, name = `take_${id}.png`): Promise<string> {
  const blob = await (await fetch(mediaUrl(id))).blob();
  return uploadFile(new File([blob], name, { type: blob.type }));
}
