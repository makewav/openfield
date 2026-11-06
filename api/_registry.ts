/**
 * The model registry: the only place that knows which Kie model an app uses and
 * which input fields that model takes.
 *
 * Every model id here was read off its own page on docs.kie.ai. The brief
 * forbids guessing provider details, so if a model must change, change it here
 * and nowhere else — and check its page first.
 *
 * All seven are on POST /api/v1/jobs/createTask, which is the only endpoint the
 * brief allows for v1.
 */
import { z } from 'zod';
import { ApiError } from './_http.js';
import type { OutputKind } from './_types.js';

export const MODELS = {
  /** Text to still. Output may be PNG *or* JPEG — never assume an extension. */
  still: 'seedream/4.5-text-to-image',
  /** Instruction edit of one or more images. */
  edit: 'google/nano-banana-edit',
  /** Text to video. */
  videoT2V: 'bytedance/v1-pro-text-to-video',
  /** Image to video, one image. */
  videoI2V: 'wan/2-6-image-to-video',
  /** Image to video with a first *and* last frame. */
  videoI2VEnd: 'kling/v2-1-pro',
  /** Image upscaling. There is no verified route for upscaling a user video. */
  upscale: 'topaz/image-upscale',
  /** Background removal, stills only. */
  cutout: 'recraft/remove-background',
} as const;

export const MODEL_IDS = Object.values(MODELS);

/** What each model accepts, kept next to the id so the pair cannot drift. */
const ASPECT = {
  /** seedream/4.5-text-to-image */
  still: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
  /** google/nano-banana-edit adds `auto` and the square-ish pairs. */
  edit: ['1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3', '5:4', '4:5', '21:9', 'auto'],
  /** bytedance/v1-pro-text-to-video */
  t2v: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
} as const;

/** A public https URL. Blob URLs and provider URLs both qualify. */
const publicUrl = z
  .string()
  .refine((u) => /^https:\/\//i.test(u), 'must be an https URL the provider can fetch');

/** The generate body. Unknown keys are dropped rather than rejected. */
export const generateSchema = z.object({
  kind: z.enum(['still', 'edit', 'video', 'upscale', 'cutout']),
  app: z.string().max(40).optional(),
  prompt: z.string().max(10000).optional(),
  userPrompt: z.string().max(10000).optional(),
  instruction: z.string().max(10000).optional(),
  aspect: z.string().max(8).optional(),
  resolution: z.enum(['480p', '720p', '1080p']).optional(),
  /** Kie takes these as strings; numbers are accepted and normalised. */
  seconds: z.number().min(1).max(20).optional(),
  quality: z.enum(['basic', 'high', 'draft']).optional(),
  seed: z.number().int().min(-1).optional(),
  images: z.array(publicUrl).max(10).optional(),
  startImage: publicUrl.optional(),
  endImage: publicUrl.optional(),
  sourceVideo: publicUrl.optional(),
  upscaleFactor: z.enum(['2', '4']).optional(),
  projectId: z.number().int().positive().nullable().optional(),
  negative: z.string().max(2000).optional(),
});

export type GenerateBody = z.infer<typeof generateSchema>;

export interface BuiltTask {
  model: string;
  input: Record<string, unknown>;
  output: OutputKind;
  /** The prompt actually sent, after normalisation. */
  prompt: string;
  app: string;
}

const clampAspect = (value: string | undefined, allowed: readonly string[], fallback: string): string =>
  value && allowed.includes(value) ? value : fallback;

/** Kie's duration enums, as the quoted strings its schemas declare. */
function durationString(seconds: number | undefined, allowed: readonly number[], fallback: number): string {
  const pick = allowed.find((d) => d === seconds) ?? fallback;
  return String(pick);
}

function need<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null || value === '') throw new ApiError(400, message);
  return value;
}

/**
 * Map one validated request to one Kie task. Throws ApiError(400) when the
 * request is missing something the chosen model needs.
 */
export function buildTask(body: GenerateBody): BuiltTask {
  const prompt = (body.prompt ?? body.instruction ?? '').trim();
  const app = body.app ?? body.kind;

  switch (body.kind) {
    case 'still': {
      if (!prompt) throw new ApiError(400, 'A prompt is required');
      return {
        model: MODELS.still,
        output: 'image',
        app,
        prompt,
        input: {
          prompt,
          aspect_ratio: clampAspect(body.aspect, ASPECT.still, '16:9'),
          quality: body.quality === 'high' ? 'high' : 'basic',
        },
      };
    }

    case 'edit': {
      if (!prompt) throw new ApiError(400, 'An instruction is required');
      const images = need(body.images, 'At least one image is required');
      return {
        model: MODELS.edit,
        output: 'image',
        app,
        prompt,
        input: {
          prompt,
          image_urls: images.slice(0, 10),
          output_format: 'png',
          aspect_ratio: clampAspect(body.aspect, ASPECT.edit, 'auto'),
        },
      };
    }

    case 'video': {
      if (!prompt) throw new ApiError(400, 'A prompt is required');
      // Text-to-video documents 480p/720p/1080p. Default to 720p: it is the
      // cheapest setting that still looks like video in this studio.
      const t2vResolution = body.resolution ?? '720p';
      // Image-to-video documents only 720p/1080p, so 480p is not a legal ask.
      const i2vResolution = body.resolution === '480p' ? '720p' : body.resolution ?? '720p';

      // First *and* last frame: only Kling documents an end frame.
      if (body.startImage && body.endImage) {
        return {
          model: MODELS.videoI2VEnd,
          output: 'video',
          app,
          prompt,
          input: {
            prompt,
            image_url: body.startImage,
            tail_image_url: body.endImage,
            duration: durationString(body.seconds, [5, 10], 5),
          },
        };
      }
      // One image: Wan.
      if (body.startImage) {
        return {
          model: MODELS.videoI2V,
          output: 'video',
          app,
          prompt,
          input: {
            prompt,
            image_urls: [body.startImage],
            duration: durationString(body.seconds, [5, 10, 15], 5),
            resolution: i2vResolution,
          },
        };
      }
      // No image: text to video.
      return {
        model: MODELS.videoT2V,
        output: 'video',
        app,
        prompt,
        input: {
          prompt,
          aspect_ratio: clampAspect(body.aspect, ASPECT.t2v, '16:9'),
          resolution: t2vResolution,
          duration: durationString(body.seconds, [5, 10], 5),
          ...(body.seed !== undefined && body.seed >= 0 ? { seed: body.seed } : {}),
        },
      };
    }

    case 'upscale': {
      if (body.sourceVideo) {
        throw new ApiError(
          400,
          'Video upscaling is not available: the provider only upscales stills, and its video upscaler only accepts its own generated videos.',
        );
      }
      const source = need(body.images?.[0], 'A source image is required');
      return {
        model: MODELS.upscale,
        output: 'image',
        app,
        prompt,
        input: {
          image_url: source,
          upscale_factor: body.upscaleFactor === '4' ? '4' : '2',
        },
      };
    }

    case 'cutout': {
      if (body.sourceVideo) {
        throw new ApiError(
          400,
          'Removing the background from a clip is not available: the provider only does stills here.',
        );
      }
      const source = need(body.images?.[0], 'A source image is required');
      return {
        model: MODELS.cutout,
        output: 'image',
        app,
        prompt,
        input: { image: source },
      };
    }
  }
}

/** Parse and build in one step, so callers cannot skip validation. */
export function parseAndBuild(raw: unknown): BuiltTask {
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') || 'request';
    throw new ApiError(400, `${where}: ${first?.message ?? 'is invalid'}`);
  }
  return buildTask(parsed.data);
}
