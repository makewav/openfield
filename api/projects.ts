/** GET /api/projects lists them; POST creates one. Without auth, POST only ever inserts. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createProject, ensureSchema, listProjects } from './_db.js';
import { allow, ApiError, body, handler, json } from './_http.js';
import type { Project } from './_types.js';

const MAX_FIELD = 80;

function textField(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new ApiError(400, `${what} is required`);
  const text = value.trim();
  if (text.length < 1 || text.length > MAX_FIELD) {
    throw new ApiError(400, `${what} must be between 1 and ${MAX_FIELD} characters`);
  }
  return text;
}

/**
 * A folder is a display label under the output root, never a filesystem escape:
 * `..` and absolute paths are refused before they reach the database.
 */
function folderField(value: unknown): string {
  const folder = textField(value, 'folder');
  if (folder.includes('..')) throw new ApiError(400, 'folder must not contain ".."');
  if (/^[\\/]/.test(folder) || /^[A-Za-z]:/.test(folder)) {
    throw new ApiError(400, 'folder must be a relative path');
  }
  return folder;
}

export default handler(async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (!allow(req, res, 'GET', 'POST')) return;
  await ensureSchema();

  if ((req.method ?? 'GET').toUpperCase() === 'POST') {
    const input = body<{ name?: unknown; folder?: unknown }>(req);
    const name = textField(input.name, 'name');
    const folder = folderField(input.folder);
    json(res, 201, { id: await createProject(name, folder) });
    return;
  }

  const projects: Project[] = await listProjects();
  json(res, 200, projects);
});
