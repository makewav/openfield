/**
 * Mirror's two edit modes, Restyle and Object swap. Both keep the source
 * clip's motion and change what is in it: Restyle redraws frame 0 in a new
 * look (Qwen-Image-Edit) and Mirror carries the motion through it; Swap tracks
 * one object (SAM 3.1), replaces it in frame 0 and redraws only that region
 * through the clip (LTX in/outpainting IC-LoRA). One click each, one take each.
 *
 * Neither mode has a route on the provider yet, so their actions are off: see
 * ../ComingSoon.tsx (Mirror's page carries the notice).
 */
import { useRef, useState } from 'react';
import { inputUrl, uploadFile } from '../api';
import { compilePrompt } from '../catalog';
import { toast } from '../store';
import { Icon, Stepper, Switch } from '../ui';
import { DropWell } from './Mirror';
import { SoonButton } from '../ComingSoon';

/*
 * The Restyle looks, the Swap prompt and their two prompt builders used to live
 * in ../catalog.ts. They are kept here, where the two modes are, because only
 * this screen uses them now.
 */

export interface RestyleStyle { id: string; label: string; text: string }

export const RESTYLE_STYLES: RestyleStyle[] = [
  { id: 'watercolor', label: 'Watercolor', text: 'a loose watercolor painting on textured paper, soft bleeding washes of color, visible brush strokes and white paper showing through' },
  { id: 'oil', label: 'Oil paint', text: 'a thick impasto oil painting, bold visible brush strokes, rich saturated pigment, canvas texture' },
  { id: 'clay', label: 'Claymation', text: 'a stop-motion claymation scene, everything sculpted from smooth plasticine with fingerprint texture, miniature set lighting' },
  { id: 'anime', label: 'Anime cel', text: 'a hand-drawn 2D anime cel, clean ink outlines, flat cel shading with two-tone shadows, painted background' },
  { id: '3d', label: '3D animated', text: 'a polished 3D animated feature film frame, soft subsurface skin, stylized proportions, warm global illumination' },
  { id: 'pencil', label: 'Pencil sketch', text: 'a graphite pencil sketch on off-white paper, cross-hatched shading, loose construction lines' },
  { id: 'ink', label: 'Comic ink', text: 'a black and white comic book page panel, bold brush ink lines, heavy spot blacks, halftone dot shading' },
  { id: 'charcoal', label: 'Charcoal', text: 'a smudged charcoal drawing, deep soft blacks, rough paper grain, expressive strokes' },
  { id: 'pixel', label: 'Pixel art', text: '16-bit pixel art, a limited palette, crisp square pixels, dithered shading' },
  { id: 'lowpoly', label: 'Low poly', text: 'a low-poly 3D render, flat-shaded triangular facets, simple gradients, clean geometry' },
  { id: 'paper', label: 'Paper cutout', text: 'layered paper cutout craft, cut colored card stock with soft drop shadows between the layers' },
  { id: 'stained', label: 'Stained glass', text: 'a stained glass window, jewel-colored glass panes separated by dark lead lines, light glowing through' },
  { id: 'woodcut', label: 'Woodcut', text: 'a woodcut print, bold carved black lines, rough wood grain texture, two-color ink on paper' },
  { id: 'embroidery', label: 'Embroidery', text: 'a detailed embroidery on linen, every shape stitched in colored thread, visible stitch texture' },
  { id: 'marble', label: 'Marble statue', text: 'everything carved from white veined marble, a museum sculpture, soft gallery light' },
  { id: 'chrome', label: 'Liquid chrome', text: 'everything made of mirror-polished liquid chrome, reflecting a bright studio environment' },
  { id: 'toy', label: 'Plastic toy', text: 'a miniature world of glossy molded plastic toys, tilt-shift depth of field, bright toy colors' },
  { id: 'noir', label: 'Film noir', text: 'a black and white film noir frame, hard single key light, deep shadows, venetian blind light, film grain' },
  { id: 'neon', label: 'Neon night', text: 'a rain-soaked neon city at night, magenta and cyan signs reflecting on every wet surface' },
  { id: 'winter', label: 'Deep winter', text: 'the same place buried in deep snow during a quiet snowfall, frost on every surface, cold blue light' },
  { id: 'thermal', label: 'Thermal camera', text: 'a thermal imaging camera view, warm bodies glowing white and orange against a cold purple and blue background' },
  { id: 'blueprint', label: 'Blueprint', text: 'a technical blueprint drawing, fine white construction lines on deep blue paper, measurements and grid' },
];

export const restyleById = (id: string) => RESTYLE_STYLES.find((s) => s.id === id);

/** The look, from a style chip and/or the user's own words. */
export function restyleLook(styleId: string | null | undefined, text: string): string {
  const style = styleId ? restyleById(styleId) : undefined;
  return compilePrompt([style?.text, text.trim()]);
}

/** What Qwen-Image-Edit is told to do to frame 0. */
export function restyleInstruction(look: string): string {
  return compilePrompt([
    `Redraw this entire image as ${look}`,
    'Keep the exact composition and framing, every person and their pose, and every object in the same place and at the same size.',
  ]);
}

/** What LTX is told the finished shot looks like. */
export function restylePrompt(look: string): string {
  return compilePrompt([`The whole scene rendered as ${look}`, 'Same people, same actions and the same camera movement as the source clip.']);
}

/** Restyle keeps the shape of the scene (depth) or its outlines (edges). Body pose alone loses the world. */
export const RESTYLE_CONTROLS = [
  { id: 'depth', label: 'Whole scene', note: 'Keeps the shape of the space and the camera move.' },
  { id: 'edges', label: 'Outlines', note: 'Keeps contours tightly. Best for objects and graphics.' },
] as const;

/** Object swap (in Mirror): what LTX is told fills the masked region. */
export function swapPrompt(replacement: string): string {
  return compilePrompt([replacement, 'It moves naturally with the scene, lit by the same light, filmed by the same camera.']);
}

/** Object swap reads at most this much of a clip (the inpaint pass holds every frame). */
export const SWAP_MAX_SECONDS = 8;

export interface MirrorClip { token: string; url: string; seconds: number; w: number; h: number; name: string }

export function RestyleControls({ clip }: { clip: MirrorClip | null }) {
  const [style, setStyle] = useState<string | null>('watercolor');
  const [text, setText] = useState('');
  const [control, setControl] = useState<'depth' | 'edges'>('depth');
  const [strength, setStrength] = useState(0.9);
  const [audio, setAudio] = useState(false);
  const [count, setCount] = useState(1);

  const seconds = clip ? Math.max(1, Math.min(12, Math.floor(clip.seconds))) : 5;

  return (
    <>
      <div className="rail-section">
        <div className="label">Style</div>
        <div className="chip-row">
          {RESTYLE_STYLES.map((s) => (
            <button key={s.id} type="button" className={`chip ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(style === s.id ? null : s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="rail-section">
        <div className="label">{style ? 'Add to the look · optional' : 'The look'}</div>
        <textarea className="prompt" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={style ? 'warm autumn colors, falling leaves' : 'a hand-painted 1930s cartoon, rubber-hose limbs, sepia film'} />
      </div>

      <div className="rail-section">
        <div className="label">Keep from the clip</div>
        <div className="seg">
          {RESTYLE_CONTROLS.map((c) => (
            <button key={c.id} type="button" className={control === c.id ? 'on' : ''} onClick={() => setControl(c.id as 'depth' | 'edges')}>{c.label}</button>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12.5 }}>{RESTYLE_CONTROLS.find((c) => c.id === control)!.note}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">Hold to the clip</span><span className="mono dim" style={{ fontSize: 12 }}>{Math.round(strength * 100)}%</span></div>
        <input type="range" min={0.4} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
      </div>

      <div className="chip-row" style={{ alignItems: 'center' }}>
        <span className="chip"><Icon name="clock" size={14} />{seconds}s</span>
        <Stepper value={count} min={1} max={4} onChange={setCount} fmt={(v) => `${v}/4`} />
        <span className="chip" style={{ gap: 10 }}><Icon name="audio" size={14} />Sound <Switch on={audio} onChange={setAudio} label="sound" /></span>
      </div>

      <div style={{ marginTop: 'auto' }}><SoonButton /></div>
    </>
  );
}

export function SwapControls({ clip }: { clip: MirrorClip | null }) {
  const [target, setTarget] = useState('');
  const [replacement, setReplacement] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [count, setCount] = useState(1);
  const frame = useRef<HTMLVideoElement>(null);

  const seconds = clip ? Math.max(1, Math.min(SWAP_MAX_SECONDS, Math.floor(clip.seconds))) : 4;

  async function addReference(f: File) {
    if (!f.type.startsWith('image/')) return;
    try { setReference(await uploadFile(f)); } catch (e) { toast(String(e), true); }
  }

  return (
    <>
      {clip && (
        <div className="rail-section">
          <div className="label">Click the object · optional</div>
          <div className="ref" style={{ aspectRatio: `${clip.w || 16} / ${clip.h || 9}`, cursor: 'crosshair' }}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }}>
            <video ref={frame} src={clip.url} muted playsInline preload="auto" onLoadedData={() => { if (frame.current) frame.current.currentTime = 0; }} />
            {point && <span className="pin" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />}
            <span className="role">first frame</span>
            {point && <button type="button" className="x" onClick={(e) => { e.stopPropagation(); setPoint(null); }} aria-label="clear the point"><Icon name="x" size={12} /></button>}
          </div>
          <div className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>A click picks one object when there are several. Without one, the words below find it.</div>
        </div>
      )}

      <div className="rail-section">
        <div className="label">Replace</div>
        <input className="field" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="the red car" />
        <div className="label">With</div>
        <textarea className="prompt" rows={2} value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="a white horse at full gallop" />
        {reference ? (
          <div className="ref" style={{ aspectRatio: '1' , maxWidth: 120 }}>
            <img src={inputUrl(reference)} alt="" />
            <span className="role">looks like this</span>
            <button type="button" className="x" onClick={() => setReference(null)} aria-label="remove"><Icon name="x" size={12} /></button>
          </div>
        ) : (
          <DropWell accept="image/*" onFile={(f) => void addReference(f)} icon="ref" compact title="+ Picture of the new object · optional" sub="" />
        )}
      </div>

      <div className="chip-row" style={{ alignItems: 'center' }}>
        <span className="chip"><Icon name="clock" size={14} />{seconds}s</span>
        <Stepper value={count} min={1} max={4} onChange={setCount} fmt={(v) => `${v}/4`} />
      </div>

      <div style={{ marginTop: 'auto' }}><SoonButton /></div>
    </>
  );
}
