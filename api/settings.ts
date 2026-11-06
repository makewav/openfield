/** GET /api/settings — read-only. With no app-level auth, nothing here may be writable. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeCount, ensureSchema, usageToday } from './_db.js';
import { dailyJobCap, generationEnabled } from './_env.js';
import { allow, handler, json } from './_http.js';

export default handler(async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (!allow(req, res, 'GET')) return;
  await ensureSchema();

  const [usedToday, active] = await Promise.all([usageToday(), activeCount()]);
  json(res, 200, {
    generation: generationEnabled(),
    dailyCap: dailyJobCap(),
    usedToday,
    active,
  });
});
