# OpenField, for the agent working on this repo

This repository is **OpenField ported to run on Vercel with the Kie AI API**. It
started life as a local ComfyUI studio; the local engine has been removed and
generation now goes through Kie.

Read [`PORT_PLAN.md`](PORT_PLAN.md) first: it holds the route inventory, the app
fate table, and the surprises that shaped the port.

## The rules that matter here

- **The Kie key is server-side only.** It lives in `KIE_API_KEY` and never in the
  browser bundle, a log line, or a committed file. The client must never call
  `api.kie.ai` directly.
- **Never guess Kie's API.** Before touching a model, read its page on
  <https://docs.kie.ai> and copy the exact model id and input fields. Do not
  invent endpoints or field names.
- **Check the body, not the status.** Kie returns errors with HTTP 200 and the
  real code in the response body. Success is `code: 200`, not `0`. Never gate on
  `res.ok`.
- **Copy results into Blob on completion.** Kie keeps generated files for 14
  days and uploaded files for 24 hours. A task's URL is not storage.
- **Keep the build green.** `npm run build` runs `npm run typecheck` (TypeScript
  across the client) and then `vite build`. Both must pass. If you delete code,
  delete its imports and its tsconfig entry in the same change.
- **No app-level login.** This is a single-user personal tool. Credit protection
  is a daily job cap in the database, a concurrency limit, input and prompt
  caps, rate limiting on the generate route, a low-credit warning, and the
  `GENERATION_ENABLED` kill switch. Door-level access control is Vercel's
  deployment protection, not application code.
- **Keep the licence honest.** The code is MIT and keeps its copyright notice.
  Do not imply endorsement by Higgsfield or Comfy Org, and do not claim local or
  GPU rendering anywhere in the app or the docs.
- **Control test spend.** One cheap test per model family. Ask before any test
  that costs more than a trivial amount, and log the credits consumed.

## Layout

| Path | What lives there |
| --- | --- |
| `src/` | The React SPA. `catalog.ts` holds the prompt craft, presets and Director grammar; `pages/` holds one screen per app. |
| `api/` | Vercel Functions: the Kie wrapper, the job routes, upload and callback. |
| `PORT_PLAN.md` | The Phase 0 analysis and the port design. |
| `docs/internal/phase0/` | The full evidence behind the plan (gitignored, kept on disk). |

## Environment

See [`.env.example`](.env.example). Locally: copy it to `.env`. In Vercel: set
every variable for both the Preview and Production environments.

## Do not

- Do not set `GENERATION_ENABLED=false` in a deployed environment casually — it
  is the emergency brake, and turning it off is how spending stops.
- Do not commit `.env`, tokens, or any screenshot that shows a key.
- Do not add app-level signup, login, accounts or a password screen.
