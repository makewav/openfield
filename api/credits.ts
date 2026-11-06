/** The provider account balance, for the low-credit warning. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allow, fail, handler, json } from './_http.js';
import { creditBalance, KieError } from './_kie.js';

export default handler(async (req: VercelRequest, res: VercelResponse) => {
  if (!allow(req, res, 'GET')) return;

  try {
    json(res, 200, { credits: await creditBalance() });
  } catch (e) {
    if (e instanceof KieError) {
      fail(res, 502, e.message);
      return;
    }
    throw e;
  }
});
