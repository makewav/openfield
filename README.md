# OpenField

An open-source creative studio for video and stills. Generation runs on the
**Kie AI API**; the app itself is a small web app you deploy to Vercel.

> **Status: port in progress.** OpenField began as a local studio driven by
> ComfyUI on your own GPU. That engine has been removed and the app is being
> moved onto Vercel with Kie as the provider. [`PORT_PLAN.md`](PORT_PLAN.md) is
> the plan, the app fate table and the open issues.

Built for Comfy's Open Source Higgsfield competition. MIT licensed.

## What it does

A v1 of five apps, keeping the studio's look and feel:

- **Image** — stills from a prompt: aspect, resolution, count.
- **Edit** — change a still with a sentence, with an optional mask to hold part
  of the frame, plus the one-click directions (new angle, relight, expand,
  coverage, push in, next beat).
- **Video** — text to video and image to video, with motion presets, duration,
  aspect and count.
- **Upscale** — enlarge a still (image upscaling is what the provider exposes;
  see the plan's open questions for video).
- **Remove background** — a transparent cut-out of a still.

The remaining apps in the catalogue — loops, extend, transitions, speak, add
sound, cast, director, scene — are marked *later* in the plan: their screens are
still here, but they need provider routes that are not built yet. The apps that
needed local-only machinery (effects, mirror, reshoot, stage, object) have been
removed.

## How it is built

```
Browser (Vite + React SPA)
   │  fetch /api/...
   ▼
Vercel Functions (Node)
   ├── the Kie wrapper        createTask / recordInfo / credits
   ├── jobs                   Postgres: history + daily usage
   └── storage                Vercel Blob: every input and result
   │
   └──► api.kie.ai
```

- Every render is a Kie task. The browser starts a job, gets its id back
  immediately, and polls the job status.
- Results are copied into Blob when the task completes. Kie keeps generated
  files for 14 days, so its URLs are never treated as storage.
- Jobs and the daily usage counter live in Postgres.
- Uploads go from the browser straight to Blob, because a Vercel Function caps
  request bodies at roughly 4.5 MB.

## Deploy

1. Import this repository into Vercel.
2. Set the environment variables in [`.env.example`](.env.example) for **Preview
   and Production**: `KIE_API_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`,
   `PUBLIC_BASE_URL`, `DAILY_JOB_CAP`, `GENERATION_ENABLED`.
3. Deploy a preview, not production.

### Protect the credits

This app has **no login of its own** — it is a single-user personal tool. A
public URL with no protection lets anyone who finds the link spend your Kie
credits. Two things close that door without adding a login screen:

- **Vercel deployment protection.** Project > Settings > Deployment Protection >
  turn on Vercel Authentication. Choose "All Deployments" if your plan offers
  it; otherwise keep Standard Protection and use a protected preview URL as your
  daily link.
- **The kill switch.** Set `GENERATION_ENABLED=false` and redeploy to refuse
  every generation request at once. The daily cap still limits the damage.

Keep the Kie balance small; top up only what you plan to use. If a key leaks,
reset it on Kie's API keys page and update `KIE_API_KEY`.

## Local development

```bash
npm install
cp .env.example .env      # fill in the values
npm run dev               # Vite on :3160
```

`npm run build` runs the typecheck and the production build. Both must pass.

## Licence

MIT — see [`LICENSE`](LICENSE). OpenField is an independent project with its own
name, design, copy and presets. Higgsfield and Comfy Org do not endorse it.
Model weights are served by Kie; their own licences apply to what you generate.
Third-party components are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
