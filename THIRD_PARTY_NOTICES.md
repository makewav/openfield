# Third-party notices

OpenField's own code is MIT (see [`LICENSE`](LICENSE)). It **redistributes no
model weights**. Weights are served by the Kie AI API, and each model the
provider runs stays under its own license with its publisher — Kie's terms and
the model card are what bind what you may do with an output.

This file lists what the repository itself depends on. The previous version of
this file catalogued the ComfyUI custom nodes, the downloaded weights and the
Hugging Face bundles that a local install needed; that machinery has been
removed, so those entries are gone with it. Git history has them if they are
ever needed again.

## Application dependencies

| Component | Version | License | Use |
| --- | --- | --- | --- |
| [React](https://react.dev) / React DOM | 19 | MIT | The UI |
| [Vite](https://vite.dev) | 6 | MIT | Build and dev server |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 4 | MIT | JSX transform |
| [TypeScript](https://www.typescriptlang.org) | 5.7 | Apache-2.0 | Types |
| [three.js](https://threejs.org) | 0.186 | MIT | 3D (kept for the remaining viewer) |
| [zod](https://zod.dev) | 4 | MIT | Request validation on the server |
| [Archivo](https://github.com/Omnibus-Type/Archivo) (variable) | via `@fontsource-variable/archivo` | OFL-1.1 | UI type |
| [Inter](https://github.com/rsms/inter) (variable) | via `@fontsource-variable/inter` | OFL-1.1 | UI type |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | via `@fontsource/jetbrains-mono` | OFL-1.1 | Monospace |

## Services

| Service | What it does | Terms |
| --- | --- | --- |
| [Kie AI](https://kie.ai) | Runs every model call | Kie's own terms and the per-model pages on docs.kie.ai |
| [Vercel](https://vercel.com) | Hosts the app, the functions, Blob storage | Vercel's terms |
| PostgreSQL (Neon or Vercel Postgres) | Job history and daily usage | The provider's terms |

## Provenance of the sample media

`docs/media/` and `public/` hold sample clips and stills that were generated
with OpenField before the port. They were made on open weights on a local GPU,
not by the current provider-backed build; per-file prompts, seeds and models are
recorded in [`docs/MEDIA.md`](docs/MEDIA.md).

## Attribution

OpenField is an independent project with its own name, design, copy and presets.
Higgsfield and Comfy Org do not endorse it.
