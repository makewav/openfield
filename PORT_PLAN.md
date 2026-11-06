# PORT_PLAN.md — OpenField → Vercel + Kie AI

**Phase 0 deliverable.** Read-only analysis: no application code was changed in this phase.

| | |
|---|---|
| Source | `github.com/wexloops/openfield` @ `1c36412` (`main`), MIT |
| Working copy | this repository (verified: all 273 blobs identical to upstream) |
| Analysed | `server/index.ts` (2,301 lines), `server/jobs.ts`, `server/*` (25 files), `server/graphs/*` (18 files), `src/` (24 modules + 17 pages), `mcp/`, `scripts/`, `deploy/`, all three tsconfigs |
| Not done in this phase | no code edits, no deletions, no Kie API calls, no credits spent |

The three things the brief asks for are §1 (routes), §2 (apps + fate + Kie model) and §3 (surprises).
§4–§6 are the port design and the decisions I need from you. §7 is the evidence index.

---

## 0. Baseline: what I measured before touching anything

| Check | Result |
|---|---|
| Working copy vs upstream | **273/273 blob hashes match** `main@1c36412` — analysis is on the real code |
| `npm install` | 306 packages, exit 0 |
| `npm run typecheck` (all 3 projects) | **green** — `tsc -p tsconfig.json`, `tsc -p server/tsconfig.json`, `tsc -p mcp/tsconfig.json` |
| `vite build` | **green** — 77 modules, `dist/` 1.5 MB app chunk + 650 kB three.js chunk, 22.9 s |
| Node / npm | v24.22.1 / 11.19.1 (repo requires ≥22) |
| Git remote | clone only. **No fork exists yet** and no push has been attempted (see §6.1) |

So the starting point is a green build, and every later phase must be measured against it.

---

## 1. Every API route and what it does

`server/index.ts` registers **50 path/method pairs** (49 HTTP + one WebSocket upgrade on `GET /live`).
`server/judge.ts` adds **3** more when judge mode is on. A **separate** HTTP listener on port 3162 adds **2**.
No SSE is served anywhere (the only `text/event-stream` in the repo is *consumed* from an LLM by the
Director planner). Legend for the **Local** column: `C` ComfyUI/Comfy SDK · `F` ffmpeg/ffprobe ·
`S` better-sqlite3 · `FS` local filesystem · `W` whisper CLI · `—` none.

**Fate column:** `v1` = needed by Image/Edit/Video/Upscale/Remove-background · `later` · `drop`.

### 1a. Render, queue, engine control

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 1 | POST | `/api/generate` | **The single render entry point for every app**, discriminated by `kind`. Validates the body, preflights model weights, resolves `@cast`, expands `count`/`variants`, then queues and submits graphs to the engine. Returns take ids immediately — the render itself finishes out of band. | C S FS F W | **v1** |
| 2 | POST | `/api/stop` | Interrupt every take currently rendering | C S | v1 |
| 3 | POST | `/api/takes/:id/cancel` | Cancel one take: interrupt if rendering, dequeue if queued | C S | v1 |
| 4 | POST | `/api/queue/clear` | Drop the whole queue and the live render | C S | v1 |
| 5 | DELETE | `/api/queue/:promptId` | Cancel by engine prompt id | C S | v1 |
| 6 | POST | `/api/engine/start` | Run the configured `COMFY_LAUNCH` command and wait for ComfyUI | C (spawn) | drop |

### 1b. Uploads and inputs

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 7 | POST | `/api/upload` | Upload a file as a base64 data URL; becomes a Comfy asset token | C FS | **v1** (→ Blob) |
| 8 | GET | `/api/input-image/:name` | Serve a previously uploaded input back to restore the UI's wells | FS | v1 |
| 9 | POST | `/api/stage/blocking` | Stage only: turn WebGL clay/depth frames into mp4s + stills | C FS F | drop |

### 1c. Library, takes, projects, media

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 10 | GET | `/api/takes` | Job history (`?project=`), newest first, limit 500 | S | **v1** |
| 11 | DELETE | `/api/takes/:id` | Delete a take row (file on disk deliberately kept) | S | v1 |
| 12 | POST | `/api/takes/:id/star` | Star / unstar a take | S | v1 |
| 13 | GET | `/api/media/:id` | Stream a take's media with **Range/206**, `?download=1` attachment, `?alpha=1` for the ProRes-alpha sidecar | FS | **v1** (→ Blob) |
| 14 | GET | `/api/poster/:id` | Grid thumbnail; videos get a JPEG extracted at 0.5 s by ffmpeg | FS F | v1 (→ Blob/canvas) |
| 15 | GET | `/api/projects` | Project folders | S | v1 |
| 16 | POST | `/api/projects` | Create a project folder, containment-checked under the output dir | S FS | v1 |
| 17 | GET | `/api/takes/:id/workflow` | The API-format ComfyUI graph behind a take, as a droppable `.json` | C S | drop |
| 18 | GET | `/api/takes/:id/workflow/:file` | Same, under a filename | C S | drop |
| 19 | GET | `/api/takes/:id/turntable` | Object app: turntable mp4 (Range) | FS | drop |
| 20 | GET | `/api/takes/:id/subject` | Object app: isolated-subject PNG | FS | drop |
| 21 | GET | `/api/takes/:id/file/:which` | HDR downloads: `exr` zip, `hlg` HEVC, `prores` | FS | drop |
| 22 | GET | `/api/estimate` | Median render seconds of similar past takes | S | later |

### 1d. Cast (`@mention` characters, props, places)

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 23 | GET | `/api/cast` | List cast members; refs get a URL | S | later |
| 24 | POST | `/api/cast` | Create a member from 1–6 refs (token or take id only, never paths) | S C FS | later |
| 25 | PUT | `/api/cast/:id` | Rename / rekind / add / remove / reorder refs | S C FS | later |
| 26 | DELETE | `/api/cast/:id` | Delete the row; files stay by design | S | later |
| 27 | GET | `/api/cast/:id/ref/:n` | Serve the app's own copy of a cast picture | FS | later |
| 28 | POST | `/api/cast/hero` | Compose a hero frame of cast members as a still take | C S FS | later |

### 1e. Style preambles (prompt prefix library)

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 29 | GET | `/api/preambles` | List preambles (two seeded once per DB) | S | later |
| 30 | POST | `/api/preambles` | Create | S | later |
| 31 | PUT | `/api/preambles/:id` | Update | S | later |
| 32 | DELETE | `/api/preambles/:id` | Delete | S | later |

### 1f. Settings, status, models, preflight

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 33 | GET | `/api/status` | Boot/health payload: engine up, v2 API up, target local/cloud, active takes, launch capability, Comfy URL, render tier, video-decode mode, planner override, judge state | C S | **v1** (reshaped) |
| 34 | GET | `/api/settings` | Machine-wide render size + decode mode | S C | v1 (loses the GPU half) |
| 35 | PUT | `/api/settings` | Set them | S C | v1 (loses the GPU half) |
| 36 | GET | `/api/preflight` | "Can this render run?" — model bundles/nodes vs what the engine reports, 15 s cache | C | drop |
| 37 | GET | `/api/models` | Checkpoint enums by family + a hard-coded model card blurb | C FS | drop |
| 38 | GET | `/api/loras` | The user's own LoRA files, family sniffed from safetensors headers | C FS | drop |
| 39 | POST | `/api/free` | Unload models / free VRAM (400 when not local) | C | drop |

### 1g. Director (LLM scene → shot list → cut)

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 40 | POST | `/api/director/plan` | Start an async plan into shots (engine planner / OpenAI-compatible LLM / Ollama / sentence split); plan lives in an in-memory Map | C + LLM + S | later |
| 41 | GET | `/api/director/plan/:id` | Poll a plan; also the progress channel for streaming planners | — | later |
| 42 | POST | `/api/director/scene` | Shoot a scene: queue missing shots, then cut them into one take | C S FS F | later |

### 1h. Seam Doctor (loop seam measurement and repair)

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 43 | GET | `/api/takes/:id/seam` | Measure a finished video as a loop and store the measurement | F FS S | later |
| 44 | POST | `/api/takes/:id/fix-seam` | Queue `trim` / `regen` / `bridge` / `reseed` / `auto` | C F S FS | later |

### 1i. Finish in HDR

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 45 | POST | `/api/takes/:id/collect-hdr` | Collect an HDR finish's EXR/HLG/ProRes from ComfyUI's output | C F FS | drop |

### 1j. Phone capture ("film it on your phone" — **second listener, port 3162**)

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 46 | POST | `/api/phone/start` | Open the second LAN listener for one clip, plus a QR URL | second `http.Server`, `ipconfig.exe` | drop |
| 47 | POST | `/api/phone/stop` | Close the session | — | drop |
| 48 | GET | `/api/phone` | Current session, if any | — | drop |
| P1 | GET | `/p/<token>` | The mobile capture page (on :3162, not :3161) | — | drop |
| P2 | POST | `/p/<token>/upload` | Receive one raw-body clip (≤300 MiB), spend the token | — | drop |

### 1k. Legacy

| # | Method | Path | What it does | Local | Fate |
|---|---|---|---|---|---|
| 49 | POST | `/api/takes/:id/upres` | Legacy one-click 2× Sharpen; Upscale now uses `kind:'upscale'` | C F S FS | drop |

### 1l. Judge mode (`server/judge.ts`) — deletion target

| # | Method | Path | What it does |
|---|---|---|---|
| J1 | GET | `/login` | Inline HTML password page |
| J2 | POST | `/api/judge/login` | Constant-time password check, signed HttpOnly cookie (7 days) |
| J3 | POST | `/api/judge/logout` | Clear the cookie |

Judge hooks also mutate other routes: unauthenticated → 401 for `/api*` and `/live`; **every DELETE is
403**; a blocklist covers `PUT /api/settings`, `POST /api/projects`, phone/engine/free/queue/stop/HDR;
render routes are capped per UTC day and draft-limited. It also flips the bind address to `0.0.0.0`.
`/api/status` returns a `judge` field, so deleting judge must remove that too.

### 1m. Non-route surface that the routes depend on

| Surface | What it is | Why it matters for Vercel |
|---|---|---|
| `GET /live` | The only WebSocket. Server→client text frames `progress`, `preview`, `started`, `queue`, `take`, `phone`, plus **binary ComfyUI preview frames**. No client→server messages. | A long-lived WS cannot live in a Vercel Function, and **Kie has no preview-frame equivalent**. Must become polling (the UI already polls `/api/takes`). |
| Post-response work | `onPromptFinished`: fetch result bytes → write to a project folder → sidecars → mark the take done → broadcast → then `afterRender()` (HDR/seam) and `transcribe()`. | Serverless functions cannot work after replying. **This becomes the job-completion step.** |
| `setInterval(reconcile, 20 s)` | Re-attaches every active take to the engine | Replaced by cron, or reconcile-on-poll |
| Boot hooks | Fail orphaned takes, wire cast queue, init scenes, autostart ComfyUI, `ensureProxy()` | Delete |
| `SIGINT`/`SIGTERM` | Stop proxy, close phone session | Delete |
| Body limit | **64 MiB JSON on every route** (≈48 MiB binary after base64) | Vercel caps request bodies at roughly 4.5 MB → direct-to-Blob upload is mandatory |
| Loopback guard | `onRequest` rejects any non-loopback `Host`/`Origin` with 403 | Would 403 every real request once public; must be removed |
| Static UI | `@fastify/static` on `dist/` + SPA fallback, only under `--production` | Vercel hosts the static build itself |
| Ports | 3161 API, 3160 dev UI, 3162 phone, 8188 ComfyUI, 8189 Comfy proxy | Only 80/443 exist on Vercel |

### 1n. Route counts

| | Count |
|---|---|
| Main Fastify app | 50 (49 HTTP + 1 WS) |
| Judge mode adds | 3 |
| Phone listener adds | 2 |
| **Total** | **55 path/method pairs** |
| Needed for a v1 surface | **~17** (see §4.3); everything else is later/drop |

---

## 2. Every app, its fate, and its Kie model

The brief fixes v1 as **Image, Edit, Video (text→video and image→video), Upscale, Remove background**.
The catalogue declares **24 apps** (`src/catalog.ts:194-219`). No per-app `kind` field exists — each page
hard-codes the `kind` it posts, so the `kind` column below is read from the pages.

Kie model IDs are **verified against docs.kie.ai**, not guessed. Every one is on
`POST /api/v1/jobs/createTask`, which satisfies the brief's "stay on the main endpoint" rule.

### 2.1 The five v1 apps

| App | `kind` | What the screen does today | **Kie model (verified)** | Fits? |
|---|---|---|---|---|
| **Image** | `still` | Text→still. Qwen-Image or FLUX.2; aspect, resolution, count; FLUX.2 takes up to 6 reference images | `seedream/4.5-text-to-image` — `prompt` (≤3000), `aspect_ratio`, `quality` (`basic`=2K / `high`=4K) | **Partial.** No reference-image input is documented, so FLUX.2 refs and `@cast` refs have no home. Output may be **PNG or JPEG** — do not hardcode an extension. |
| **Edit** | `edit` | Instruction edit of 1–3 images, optional **mask painter**, 7 chip presets (New angle, Coverage, Push in, Next beat, Relight, Expand), before/after compare | `google/nano-banana-edit` — `prompt` (≤20000), `image_urls[]` (**up to 10**), `output_format` png/jpeg, `aspect_ratio` | **Good.** Multi-image is covered. **Mask is not documented** — the mask painter may become decorative. Expand-as-geometry is not documented. |
| **Video** | `video` | Text→video **and** image→video; start/end frame slots, 28 motion presets, duration 1–20 s @24 fps, aspect, count, sound | T2V `bytedance/v1-pro-text-to-video` (`prompt`, `aspect_ratio`, `resolution`, `duration` "5"/"10", `seed`, `camera_fixed`)<br>I2V `wan/2-6-image-to-video` (`prompt`, `image_urls[]` **max 1**, `duration` "5"/"10"/"15", `resolution`)<br>I2V+end frame `kling/v2-1-pro` (`prompt`, `image_url`, `duration` **required**, `tail_image_url`, `negative_prompt`, `cfg_scale`) | **Good for t2v/i2v.** Duration is model-specific ("5"/"10"…), not 1–20 s. **Start+end frame** only exists on Kling (`image_url` + `tail_image_url`). Audio: Wan documents "includes generated audio". |
| **Upscale** | `upscale` | Three modes over a video or still: Sharpen (RealESRGAN 4× + optional RIFE), Redraw (SeedVR2 → 1080p/1440p), Dream (LTX prompt-steered 2×) | `topaz/image-upscale` (`image_url`, `upscale_factor` "1"/"2"/"4") | **Image only.** The only verified video upscaler, `grok-imagine/upscale`, takes a **Kie-generated task id** and explicitly refuses external videos. Redraw and Dream are generative re-renders with no documented analogue. **This is a plan-breaker — see §3.1.** |
| **Remove background** | `cutout` | Still → transparent PNG; **clip → ProRes 4444 with alpha** (BiRefNet matte, SAM 3.1 tracked modes, background replacement, checkerboard preview) | `recraft/remove-background` — `image` (≤**5 MB**, ≤16 MP, dim ≤4096, ≥256), formats PNG/JPG/WEBP | **Stills only, with limits.** Field name is `image`, not `image_url`. The docs' example result is **`.webp`**; transparent *PNG* is not stated. Clip mattes, tracked modes and ProRes alpha have no Kie route. **Plan-breaker — see §3.2.** |

### 2.2 Everything else

| App | `kind` | Fate | Reason | Kie model |
|---|---|---|---|---|
| `loop` Seamless Loop | `video` | **later** | Just image→video with start=end; the Seam meter/doctor that makes it a feature is local ffmpeg | Closest: `kling/v2-1-pro` (`image_url` + `tail_image_url` — set them equal) |
| `angle` New angle | `edit` | later | Pure prompt chip over Edit; needs a model that follows camera-move instructions | `google/nano-banana-edit` |
| `coverage` | `edit` | later | Nine Edit instructions as nine variants — technically fine, expensive | `google/nano-banana-edit` |
| `pushin` | `edit` | later | Edit chip preset | `google/nano-banana-edit` |
| `next` Next beat | `edit` | later | Edit chip preset | `google/nano-banana-edit` |
| `relight` | `edit` | later | Edit chip preset + direction chip | `google/nano-banana-edit` |
| `expand` | `edit` | later | Outpaint with target aspect + zoom; needs provider outpainting semantics | `google/nano-banana-edit` (aspect only; zoom unverified) |
| `extend` | `extend` | later | Continue a clip forward/backward; needs a video model that accepts a source clip | **none verified** |
| `transition` | `transition` | later | First+last-frame bridge; viable if first/last-frame i2v ships | `kling/v2-1-pro` (first + tail) |
| `speak` | `speak` | later | Audio-driven talking video | **none verified** |
| `sound` Add sound | `sound` | later | Video→audio | **none verified** |
| `cast` | (CRUD) | later | Rows + pictures + notes; worth porting once a model accepts reference images | refs → `google/nano-banana-edit` (≤10 images) |
| `director` | `still` / `video` | later | Frame/Shot modes are a prompt compiler (survives); the **era grade is a local GLSL pass**, and speed ramps are local RIFE | `seedream/4.5-text-to-image` + T2V model |
| `scene` | planner | later | Needs a planner plus a local cut/stitch step; Kie chat models are **synchronous and not on createTask** | Gemini 4 Argon chat endpoint (off the main endpoint) |
| `effects` | `effect` | **drop** | Eleven looks, each a specific LTX LoRA file installed in ComfyUI, gated on install state | none |
| `mirror` | `mirror` | **drop** | Pose/depth/edge control track + IC-LoRA + phone capture | none |
| `reshoot` | `reshoot` | **drop** | MoGe-2 + CrossView-Warp IC-LoRA + server-computed warp preview | none |
| `stage` | `stage` / `stage-look` | **drop** | three.js blocking editor, WebGL clay+depth passes, .glb props, Layout-to-Render IC-LoRA | none |
| `object` | `object` | **drop** | TRELLIS.2 image→textured GLB | none |

**Counts: 5 keep (v1) · 14 later · 5 drop.**

Shell screens: **Explore, Apps, Library** keep (copy and take metadata change); **Setup** must be rebuilt
(it *is* the local doctor: engine, VRAM, model bundles, `npm run models`, `npm run doctor`); **Soon** is
dead code; **Viewer** keeps most hand-offs but loses the ComfyUI-workflow panel, HDR files and seam report.

---

## 3. Surprises that break the plan

These are the things that do **not** survive contact with Kie, in order of how much they change the brief.
§3.1–§3.3 need your decision before Phase 3.

### 3.1 Upscale in v1 cannot mean what it means today

The brief lists **Upscale** as a v1 app. Every mode in OpenField's Upscale operates on **video**:
Sharpen (RealESRGAN + optional RIFE frame doubling), Redraw (SeedVR2 → 1080p/1440p), Dream
(LTX prompt-steered 2×). All three are local models run per frame.

On Kie, the only verified upscaler that accepts a file is **`topaz/image-upscale` — images**. The only
verified *video* upscaler, `grok-imagine/upscale`, takes the **task id of a Kie-generated Grok video** and
states: *"Only videos generated by Kie AI models can be upscaled. External videos are not supported."*

**So v1 Upscale = still images only**, and the three-mode screen collapses to one action.
**Decision needed:** (a) image-only Upscale for v1, (b) drop Upscale from v1, or (c) I search `docs.kie.ai`
for an unverified video upscaler before committing.

### 3.2 Remove background loses every clip capability

The brief lists **Remove background** in v1. Today it handles stills *and clips*: BiRefNet matte, SAM 3.1
steady/tracked modes, background replacement, and a **ProRes 4444 with alpha** deliverable.

`recraft/remove-background` is **images only**, **5 MB** cap, and the documented example output is `.webp`.
Transparent PNG is implied by the operation but **not stated** in the docs.

**So v1 Remove background = stills only, ≤5 MB.** The clip path, tracked modes, background compositing
and the alpha delivery all die. **Decision needed:** accept stills-only for v1, and confirm you're happy
with a post-conversion step if Recraft returns webp.

### 3.3 The local-engine dependency is not a delete; it is a rewrite of the server

The brief's Phase 1 reads like a removal. It is not: **`server/index.ts` imports from 35 of the modules
Phase 1 deletes**, with 150+ call sites (`eng.` 54×, `takes.` 70×, `comfy.` 17×). There is **no order of
deletion that keeps it compiling** — the API entry has to be replaced in the same commit.

Three specific traps, all verified:

1. **`package.json` line 19** chains `tsc -p mcp/tsconfig.json`. Delete `mcp/` and the typecheck fails on a
   *missing project file* before any code is looked at — and `npm run build` is `typecheck && vite build`,
   so the build goes red for a reason that has nothing to do with the code.
2. Both `server/tsconfig.json` and `mcp/tsconfig.json` use `"include": ["."]`, which compiles **every** `.ts`
   under the directory whether imported or not. So orphaned files (`seam.ts`, `judge.ts`, `phone.ts`) fail
   the typecheck even after nothing references them. Emptying `server/` completely gives
   `TS18003: No inputs were found`.
3. The "screens" are not separable files. `TierChip`/`useTierChoice` are imported by **9 pages**; `LoraChips`
   by Image and Video; judge by `App.tsx` + `ui.tsx` + `styles.css`. Deleting the shared component first
   turns the whole `src` project red.

### 3.4 SQLite → Postgres is a signature change, not a driver swap

`server/jobs.ts` opens `better-sqlite3` **at import time** and every accessor is **synchronous**, called
from synchronous loops and handlers throughout `index.ts`, `scene.ts` and `cast.ts`. Moving to Postgres
makes every one of those `async`. Budget it as a real rewrite of the take lifecycle.

### 3.5 Retention will silently destroy the library if the completion step is missed

Kie keeps **generated files for 14 days** and **uploads for 24 hours**; download links live **20 minutes**
(the first two are the brief's own claims — I verified both in the docs). Today the completion handler is
what copies bytes to disk. If the port does not copy every result into Blob **in the completion step**,
the app looks fine in testing and every take's media is dead two weeks later.

### 3.6 Removing judge mode removes the only authentication in the app

`server/judge.ts` is the app's only password gate; the default path is an explicit *"loopback only, no
auth by design"* hook. The brief correctly says the replacement is Vercel deployment protection plus a
daily cap — but note that **until those are on, a public URL is an open wallet for your Kie key**. I will
not deploy a preview without the kill switch and the cap in place.

### 3.7 The `/live` preview stream has no Kie equivalent

ComfyUI streams latent preview JPEGs and per-step progress over a WebSocket; those frames are painted
inside in-flight cards and drive "Step n/m". Kie gives a task id and a `progress` field that **appears only
in an example payload, not in the documented schema**. Polling can carry status; it cannot carry previews.
Cards will show placeholders instead of a forming image. **Decision needed:** accept losing live previews
in v1 (my recommendation), or drop the in-flight preview treatment entirely.

### 3.8 Smaller corrections to the brief and the code

| Claim | Reality |
|---|---|
| "the brief says 17 graph builders" | **18** files in `server/graphs/` |
| `server/index.ts` line count in the brief | **2,301 lines**, not 2,158 |
| `src/catalog.ts` line count | **903 lines**, not 818 |
| "no signup, no login" | already true — the app has **no** app-level login; judge mode was a preview password, not accounts |
| Video "start and end frames" | only Kling documents an end frame (`tail_image_url`); the T2V model has none |
| `resultJson` | is a **JSON string** — `parse` then read `.resultUrls[0]`; `param.input` is **double-encoded** |
| Error handling | errors arrive with **HTTP 200**; success is `code: 200` (**not** `0`) — branch on the body, never on `res.ok` |
| Two hosts | main API `api.kie.ai`; **file uploads go to `kieai.redpandaai.co`** |

---

## 4. The port I propose

### 4.1 Shape

Keep the look and feel by keeping the SPA, and put a thin API in front of Kie:

```
Browser (existing Vite + React SPA, built to static)
   │  fetch /api/...
   ▼
Vercel Functions  (api/*.ts, Node runtime)
   ├── kiev.ts        one server-only Kie wrapper (createTask / recordInfo / credits / upload)
   ├── registry.ts    typed model registry, zod-validated
   ├── db.ts          Postgres: jobs, daily usage
   └── blob.ts        Vercel Blob: every input and result
   │
   ├──► api.kie.ai          (generation)
   ├──► kieai.redpandaai.co (file uploads — different host)
   └──► Postgres + Blob
```

No Next.js migration: it would rewrite the shell for no benefit, and the brief says keep the look.
`api/` is the brief's own suggestion for Vercel Functions and keeps the existing `src/` untouched apart
from removing local-engine controls.

### 4.2 What carries over untouched

The genuinely valuable, engine-free assets — keep almost verbatim:

- `src/catalog.ts` (903 lines of prompt craft, 28 motion presets, Director grammar, edit recipes, sizes)
- `src/presets.ts`, `src/effects.ts`, `src/castSheet.ts`, `src/mentions.ts`
- `src/renderTier.ts` and `src/videoDecode.ts` **geometry** (the server halves die with the GPU)
- `src/stage.ts` maths (only if Stage ever returns)
- `server/estimate.ts`, `server/shotlist.ts`, `server/files.ts` (`safeShotName`, `imageDims`)
- the pure halves of `server/seam.ts` (scoring/planning maths) and `server/cast.ts` (`composeInstruction`)
- `src/ui.tsx` primitives (ChipMenu, Stepper, Switch, Toast, MediaCard), `src/router.ts`, `src/drop.ts` upload half

### 4.3 The v1 API surface (target)

~17 endpoints replace 55. Every one is a Vercel Function.

| New route | Replaces | Notes |
|---|---|---|
| `POST /api/generate` | `/api/generate` | validate → spend checks + kill switch → `createTask` → insert job row → return job id **immediately** |
| `GET /api/jobs` | `/api/takes` | job history from Postgres |
| `GET /api/jobs/:id` | part of `/api/status` + `/live` | returns the row; if running and stale, ask Kie and update |
| `POST /api/jobs/:id/cancel` | `/api/takes/:id/cancel` | cancel/stop/clear collapse into this |
| `DELETE /api/jobs/:id` | `DELETE /api/takes/:id` | |
| `POST /api/jobs/:id/star` | `/api/takes/:id/star` | |
| `POST /api/upload` | `/api/upload` | issues a **Blob client-upload token** so bytes never pass through a function (4.5 MB cap) |
| `GET /api/media/:id` | `/api/media/:id` | Blob URL or redirect; keeps `?download=1` |
| `GET /api/poster/:id` | `/api/poster/:id` | Blob, or client-side canvas |
| `GET /api/status` | `/api/status` | reshaped: kill switch, credits, cap remaining, no engine |
| `GET /api/credits` | — | `GET /api/v1/chat/credit` |
| `GET/PUT /api/settings` | same | daily cap etc., no VRAM |
| `GET/POST /api/projects` | same | |
| `POST /api/kie/callback` | — | optional; **do not trust the body** — re-fetch the task, make it idempotent |
| `GET /live` | `GET /live` | **removed**; the client polls `GET /api/jobs` every 3 s with backoff |

### 4.4 Environment variables (exactly what the brief lists)

`KIE_API_KEY` · `DATABASE_URL` · `BLOB_READ_WRITE_TOKEN` · `PUBLIC_BASE_URL` · `DAILY_JOB_CAP` ·
`GENERATION_ENABLED` — set for **Preview as well as Production**.

---

## 5. Phase 1 deletion map, in the order that keeps the build green

One commit, because the build cannot be green in between:

1. **Replace** `server/index.ts` with the Kie-backed API (not delete-around — see §3.3).
2. **Delete** `server/graphs/` (18), `engine.ts`, `comfy.ts`, `modelSwitch.ts`, `videoDecode.ts`,
   `renderTier.ts`, `preflight.ts`, `models.ts`, `loras.ts`, `spice.ts`, `whisper.ts`, `hdr.ts`,
   `cutout.ts`, `stage.ts`, `stageRaster.ts`, `judge.ts`, `phone.ts`, `phone.html`; split `scene.ts`,
   `cast.ts`, `seam.ts` and keep their pure halves.
3. **Replace** `server/jobs.ts` with the Postgres layer (async).
4. **Retarget `package.json`**: `typecheck` (drop the `mcp` project), the `models`/`doctor`/`docs:models`/
   `workflows`/`mcp*`/`test:*` scripts, and the `@comfyorg/sdk`, `better-sqlite3`,
   `@types/better-sqlite3`, `@fastify/websocket`, `ws`, `@modelcontextprotocol/sdk`, `qrcode-generator`
   dependencies plus the `allowScripts` block. Keep `three`, keep `zod`.
5. **Delete** `mcp/`, `workflows/`, the local-only `scripts/`, `deploy/runpod/`,
   `docs/{MODELS,RUNPOD,MCP}.md`; rewrite `.env.example`, `README.md`, `CLAUDE.md`, `THIRD_PARTY_NOTICES.md`
   (keep the MIT licence and copyright notice; do not imply Higgsfield/Comfy Org endorsement).
6. **Clean `src/`**: TierChip / RenderTierPicker / VideoDecodePicker / GpuChip / JudgeBanner / Setup /
   Loras / "Open in ComfyUI" / HDR / seam / phone, plus the local-engine copy.

**Completion check** — these should all be 0 matches afterwards:
`@comfyorg/sdk`, `better-sqlite3`, `COMFY_`, `comfyUrl`, `comfyBaseUrl`, `openfield.db`, `whisper`,
`/object_info`, `/system_stats`, `comfy-api-proxy`, `child_process` under `server/`.

---

## 6. What I need from you before Phase 1

### 6.1 The fork

The brief says you fork `wexloops/openfield` and paste the fork URL. **No fork URL was provided**, so I
have worked from a clone of upstream and have **pushed nothing anywhere**. This is the only hard blocker
on Phase 1 (the phase that starts committing).

Your GitHub CLI is authenticated as **`makewav`** with `repo` scope. Options:
- **A (recommended):** I create the fork with `gh repo fork wexloops/openfield --clone=false`, point
  `origin` at it, and never push to the original. Say the word and it's one command.
- **B:** you fork it yourself and paste the URL.

### 6.2 The Kie key

I have **no Kie API key**, have called **no Kie endpoint**, and have spent **no credits**. The Phase 5
test run (one cheap job per v1 app) needs a key in Vercel, not in this repo. Please confirm you have one
and that it will go into Vercel environment variables only.

### 6.3 The three product decisions

| # | Decision | My recommendation |
|---|---|---|
| 3.1 | Upscale: image-only in v1, drop it, or let me hunt for a video upscaler first? | **Image-only v1.** Hunt for a video upscaler before dropping anything. |
| 3.2 | Remove background: stills-only (≤5 MB) acceptable? | **Yes for v1.** Clip mattes are a v2 problem. |
| 3.7 | Accept losing the live latent-preview stream? | **Yes** — polling carries status, and previews were a local-engine luxury. |

Smaller ones I will decide unless you object: Edit keeps the mask painter but does not promise it works
until a live probe proves the model honours it; Video ships T2V + I2V and start+end frame only via Kling;
`@cast` stays out of v1 because the t2i model takes no reference images.

### 6.4 Cost control

No per-model credit **prices** are documented on any model page (`kie.ai/pricing` is named as the
authoritative list but the model pages do not embed it). I will not hardcode prices. The balance display
will use `GET /api/v1/chat/credit`, and actual spend will be read from each task's `creditsConsumed`.
**I will ask you before any test that costs more than a trivial amount**, per the brief.

---

## 7. Evidence index

The full Phase 0 analysis is in `docs/internal/phase0/` (gitignored by the repo's own convention —
`.gitignore` line 22 reserves that folder for internal planning notes). Read them there:

| File | What it holds |
|---|---|
| `routes.md` (497 lines) | every route, request/response shape, dependency map, `/live` protocol, judge hooks, limits |
| `apps.md` (507 lines) | all 24 apps, per-page control inventory, 20 local-only couplings, fate table |
| `engine.md` (579 lines) | module-by-module survival verdict, exact import graph, tsconfig surface, ordered Phase-1 failure list |
| `kie.md` (575 lines) | verified Kie contract: createTask/recordInfo/credits, state machine, error codes, 8 verified model ids, **19 explicitly unverified items** |

Nothing in those files is a guess: uncertain claims are marked unknown rather than filled in.
