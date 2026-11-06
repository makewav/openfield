/**
 * Local smoke test for the provider layer. No network, no database, no credits.
 *
 * It proves the registry maps each v1 app to the right Kie model and input shape,
 * and that the two documented encoding traps are handled. Run it with:
 *
 *   npm run smoke:api
 */
import assert from 'node:assert/strict';
import { buildTask, MODELS, parseAndBuild } from '../api/_registry.js';
import { parseResultUrls } from '../api/_kie.js';
import { generationEnabled, KILL_SWITCH_MESSAGE } from '../api/_env.js';

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  FAIL ${name}`);
  }
}

const IMG = 'https://example.public.blob.vercel-storage.com/a.png';
const IMG2 = 'https://example.public.blob.vercel-storage.com/b.png';
const VID = 'https://example.public.blob.vercel-storage.com/c.mp4';

console.log('\nregistry: the five v1 apps');

check('Image (still) uses the text-to-image model', () => {
  const t = buildTask({ kind: 'still', prompt: 'a lighthouse at dusk' });
  assert.equal(t.model, MODELS.still);
  assert.equal(t.output, 'image');
  assert.equal(t.input.aspect_ratio, '16:9');
  assert.equal(t.input.quality, 'basic');
});

check('Image quality high maps to the high tier', () => {
  const t = buildTask({ kind: 'still', prompt: 'x', quality: 'high', aspect: '9:16' });
  assert.equal(t.input.quality, 'high');
  assert.equal(t.input.aspect_ratio, '9:16');
});

check('Image ignores an aspect the model does not document', () => {
  const t = buildTask({ kind: 'still', prompt: 'x', aspect: '5:4' });
  assert.equal(t.input.aspect_ratio, '16:9');
});

check('Edit uses the instruction-edit model and the images array', () => {
  const t = buildTask({ kind: 'edit', prompt: 'make it night', images: [IMG, IMG2] });
  assert.equal(t.model, MODELS.edit);
  assert.deepEqual(t.input.image_urls, [IMG, IMG2]);
  assert.equal(t.input.output_format, 'png');
  assert.equal(t.input.aspect_ratio, 'auto');
});

check('Edit without an image is refused', () => {
  assert.throws(() => buildTask({ kind: 'edit', prompt: 'x' }), /image is required/i);
});

check('Video with no image uses text-to-video', () => {
  const t = buildTask({ kind: 'video', prompt: 'a dolly shot', resolution: '1080p', seconds: 10 });
  assert.equal(t.model, MODELS.videoT2V);
  assert.equal(t.input.resolution, '1080p');
  assert.equal(t.input.duration, '10', 'duration is a quoted string');
  assert.equal(t.input.aspect_ratio, '16:9');
});

check('Video with a start image uses image-to-video', () => {
  const t = buildTask({ kind: 'video', prompt: 'she turns', startImage: IMG });
  assert.equal(t.model, MODELS.videoI2V);
  assert.deepEqual(t.input.image_urls, [IMG]);
  assert.equal(t.input.duration, '5');
});

check('Video with a start AND end frame uses the model that has an end frame', () => {
  const t = buildTask({ kind: 'video', prompt: 'loop', startImage: IMG, endImage: IMG2 });
  assert.equal(t.model, MODELS.videoI2VEnd);
  assert.equal(t.input.image_url, IMG);
  assert.equal(t.input.tail_image_url, IMG2);
  assert.equal(t.input.duration, '5');
});

check('Video clamps an undocumented duration to a legal one', () => {
  const t = buildTask({ kind: 'video', prompt: 'x', seconds: 7 });
  assert.equal(t.input.duration, '5');
});

check('Upscale of a still uses the image upscaler', () => {
  const t = buildTask({ kind: 'upscale', images: [IMG], upscaleFactor: '4' });
  assert.equal(t.model, MODELS.upscale);
  assert.equal(t.input.image_url, IMG);
  assert.equal(t.input.upscale_factor, '4');
});

check('Upscale of a video is refused with a clear reason', () => {
  assert.throws(() => buildTask({ kind: 'upscale', sourceVideo: VID }), /video upscal/i);
});

check('Remove background uses the field name that model actually takes', () => {
  const t = buildTask({ kind: 'cutout', images: [IMG] });
  assert.equal(t.model, MODELS.cutout);
  // Recraft documents `image`, not `image_url`: a silent mismatch would fail at runtime.
  assert.equal(t.input.image, IMG);
  assert.equal(t.input.image_url, undefined);
});

check('Remove background of a clip is refused', () => {
  assert.throws(() => buildTask({ kind: 'cutout', sourceVideo: VID }), /stills/i);
});

console.log('\nvalidation');

check('A non-https image URL is rejected, because the provider must fetch it', () => {
  assert.throws(() => parseAndBuild({ kind: 'edit', prompt: 'x', images: ['file:///tmp/a.png'] }), /https/i);
});

check('An unknown kind is rejected', () => {
  assert.throws(() => parseAndBuild({ kind: 'mirror', prompt: 'x' }), /kind/i);
});

check('A still with no prompt is rejected', () => {
  assert.throws(() => parseAndBuild({ kind: 'still' }), /prompt is required/i);
});

check('Unknown extra fields are dropped, not fatal', () => {
  const t = parseAndBuild({ kind: 'still', prompt: 'x', someOldField: 'ignored' });
  assert.equal(t.model, MODELS.still);
});

console.log('\nprovider quirks');

check('resultUrls is parsed out of the JSON *string* Kie returns', () => {
  const urls = parseResultUrls(JSON.stringify({ resultUrls: ['https://a/1.png', 'https://a/2.png'] }));
  assert.deepEqual(urls, ['https://a/1.png', 'https://a/2.png']);
});

check('A malformed resultJson yields no urls instead of throwing', () => {
  assert.deepEqual(parseResultUrls('not json'), []);
  assert.deepEqual(parseResultUrls(null), []);
});

check('Non-http entries inside resultUrls are dropped', () => {
  const urls = parseResultUrls(JSON.stringify({ resultUrls: ['https://ok/1.png', 'javascript:alert(1)'] }));
  assert.deepEqual(urls, ['https://ok/1.png']);
});

console.log('\nsafety defaults');

check('Generation is OFF unless GENERATION_ENABLED is exactly "true"', () => {
  assert.equal(generationEnabled(), false);
  assert.match(KILL_SWITCH_MESSAGE, /GENERATION_ENABLED/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
