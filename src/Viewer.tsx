/** Full-screen asset viewer with continue-actions (Animate, Loop, Recreate...). */
import { useRef, useState, useEffect } from 'react';
import { api, downloadUrl, mediaUrl, posterUrl, takeAsInput, type Take } from './api';
import { navigate } from './router';
import { getState, isImage, refreshTakes, setHandoff, settingsOf, toast, useStore } from './store';
import { Icon, Spill } from './ui';
import { DIRECTOR_AXES, IMAGE_MODELS, SPEED_RAMPS, VIDEO_MODELS, editAppById } from './catalog';
import { SaveToCast } from './pages/Cast';
import { useCast } from './castStore';

export async function animate(t: Take, loop = false) {
  toast('Sending to Video...');
  const token = await takeAsInput(t.id);
  setHandoff({
    refs: loop
      ? [{ token, role: 'start', kind: 'image', name: `take ${t.id}` }, { token, role: 'end', kind: 'image', name: `take ${t.id}` }]
      : [{ token, role: 'start', kind: 'image', name: `take ${t.id}` }],
    prompt: settingsOf(t).userPrompt ?? settingsOf(t).prompt,
  });
  navigate(loop ? '/video?preset=static' : '/video');
}

/**
 * Remove background from the Viewer. A still is cut out at once (transparent
 * PNG, the fast path); a clip opens the Remove background page.
 */
export async function removeBackground(t: Take) {
  if (!isImage(t)) { navigate(`/cutout?take=${t.id}`); return; }
  await api.generate({
    kind: 'cutout', app: 'cutout', mode: 'matte', sourceTake: t.id, background: 'transparent', userPrompt: 'Remove background',
  });
  toast('Removing the background');
  navigate('/cutout');
}

export async function recreate(t: Take) {
  const s = { ...settingsOf(t) };
  delete s.seed;
  try {
    if (s.cut) {
      // A cut is recreated by shooting every shot again with new seeds.
      await api.directorScene({ ...s, shots: (s.shots ?? []).map((x: any) => ({ ...x, take: undefined, hero: undefined })) });
      toast('Shooting the scene again');
      return;
    }
    await api.generate(s);
    toast('Recreating with a new seed');
  } catch (e) {
    toast(e instanceof Error ? e.message : 'failed', true);
  }
}

export async function remove(t: Take) {
  await api.trash(t.id);
  await refreshTakes();
}

export default function Viewer({ takeId, onClose, onStep }: { takeId: number; onClose: () => void; onStep: (dir: 1 | -1) => void }) {
  const take = useStore((s) => s.takes.find((x) => x.id === takeId));
  const [casting, setCasting] = useState(false);
  const cast = useCast();
  useEffect(() => { setCasting(false); }, [takeId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, onStep]);
  if (!take) return null;
  const s = settingsOf(take);
  const image = isImage(take);
  const cutoutBg = s.background === 'color' ? `over ${s.color}` : s.background === 'blur' ? 'blurred background' : s.background === 'image' ? 'new background' : 'transparent';
  const model = s.app === 'cutout' ? `Remove background · ${cutoutBg}`
    : s.app === 'upscale' ? `Upscale · ${s.mode === 'redraw' ? 'Redraw' : s.mode === 'dream' ? 'Dream' : 'Sharpen'}`
    : image
    ? s.app === 'edit' ? editAppById(s.mode ?? 'free').name
    : IMAGE_MODELS.find((m) => m.id === s.model)?.label ?? s.model
    : take.kind === 'upres' ? 'Upscale 2x'
    : s.app === 'extend' ? `Extend ${s.direction === 'backward' ? 'backward' : 'forward'}`
    : s.app === 'transition' ? 'Transition'
    : s.app === 'speak' ? 'Speak'
    : s.app === 'sound' ? 'Add sound'
    : s.cut ? `Director scene · ${(s.shots ?? []).length} shots`
    : VIDEO_MODELS.find((m) => m.id === s.videoModel)?.label ?? s.videoModel;

  const act = (fn: () => Promise<unknown>) => () => void fn().catch((e) => toast(e instanceof Error ? e.message : 'failed', true));
  const done = take.status === 'done';

  return (
    <div className="viewer-back" onClick={onClose}>
      <Spill src={posterUrl(take.id)} key={take.id} />
      <div className="viewer-stage" onClick={(e) => e.stopPropagation()}>
        {image
          ? <img src={mediaUrl(take.id)} alt="" className={s.app === 'cutout' && s.background === 'transparent' ? 'checker' : undefined} />
          : <video src={mediaUrl(take.id)} controls autoPlay muted loop playsInline />}
        <button type="button" className="icon-btn" style={{ position: 'absolute', top: 16, left: 16 }} onClick={onClose} aria-label="close"><Icon name="x" /></button>
      </div>
      <aside className="viewer-side" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">{image ? 'Image' : 'Video'} · #{take.id}</span>
          <button type="button" className={`icon-btn ${take.starred ? 'on' : ''}`} onClick={act(() => api.star(take.id, !take.starred).then(refreshTakes))} aria-label="favorite"><Icon name="heart" /></button>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Prompt</div>
          <div className="viewer-prompt">{s.userPrompt || s.prompt || s.instruction}</div>
          {s.prompt && s.userPrompt && s.prompt !== s.userPrompt && (
            <details style={{ marginTop: 8 }}>
              <summary className="label" style={{ cursor: 'pointer' }}>Compiled prompt</summary>
              <div className="compiled" style={{ marginTop: 6 }}>{s.prompt}</div>
            </details>
          )}
          <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => { void navigator.clipboard.writeText(s.prompt ?? ''); toast('Prompt copied'); }}>Copy prompt</button>
        </div>
        <div className="viewer-actions">
          {image && take.status === 'done' && <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/edit?take=${take.id}`); }} title="Edit, new angle, relight, expand and more"><Icon name="wand" size={14} />Edit...</button>}
          {image && <button type="button" className="btn sm accent" onClick={act(() => animate(take))}><Icon name="video" size={14} />Animate</button>}
          {image && <button type="button" className="btn sm" onClick={act(() => animate(take, true))}><Icon name="loop" size={14} />Make a loop</button>}
          {image && <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/speak?take=${take.id}`); }}><Icon name="person" size={14} />Speak</button>}
          {take.kind !== 'upres' && s.app !== 'upscale' && <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/upscale?take=${take.id}`); }}><Icon name="up" size={14} />Upscale</button>}
          {!image && <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/extend?take=${take.id}`); }}><Icon name="plus" size={14} />Extend</button>}
          <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/extend?mode=transition&take=${take.id}`); }}><Icon name="loop" size={14} />Transition to...</button>
          {done && s.app !== 'cutout' && <button type="button" className="btn sm" onClick={act(async () => { onClose(); await removeBackground(take); })}><Icon name="cutout" size={14} />Remove background</button>}
          {!image && <button type="button" className="btn sm" onClick={() => { onClose(); navigate(`/speak?mode=sound&take=${take.id}`); }}><Icon name="audio" size={14} />Add sound</button>}
          {image && <button type="button" className="btn sm" onClick={act(async () => {
            const token = await takeAsInput(take.id);
            setHandoff({ refs: [{ token, role: 'end', kind: 'image', name: `take ${take.id}` }] });
            navigate('/video');
          })} title="Use as the end frame of a new video"><Icon name="ref" size={14} />As end frame</button>}
          {image && take.status === 'done' && <button type="button" className={`btn sm ${casting ? 'on' : ''}`} onClick={() => setCasting(!casting)} title="Keep this face, prop or place and @mention it in any prompt"><Icon name="person" size={14} />Save to cast</button>}
          <button type="button" className="btn sm" onClick={act(() => recreate(take))}><Icon name="redo" size={14} />Recreate</button>
          <a className="btn sm" href={downloadUrl(take.id)}><Icon name="download" size={14} />Download</a>
          <button type="button" className="btn sm danger" onClick={act(async () => { await remove(take); onClose(); })}><Icon name="trash" size={14} />Delete</button>
        </div>
        {casting && <SaveToCast takeId={take.id} onClose={() => setCasting(false)} />}
        <dl className="kv">
          <dt>Model</dt><dd>{model}</dd>
          {s.preset && s.preset !== 'free' && <><dt>Motion</dt><dd>{s.presetName ?? s.preset}</dd></>}
          {Array.isArray(s.cast) && s.cast.length > 0 && <><dt>Cast</dt><dd>{s.cast.map((id: number) => cast.find((m) => m.id === id)?.name ?? `#${id}`).join(', ')}</dd></>}
          <dt>Size</dt><dd>{s.width}x{s.height}</dd>
          {!image && s.seconds && <><dt>Length</dt><dd>{s.outSeconds ? `${s.outSeconds}s (shot ${s.seconds}s)` : `${s.seconds}s`}</dd></>}
          {s.picks?.genre && s.picks.genre !== 'auto' && <><dt>Genre</dt><dd>{DIRECTOR_AXES[0].options.find((o) => o.id === s.picks.genre)?.label ?? s.picks.genre}</dd></>}
          {s.ramp && s.ramp !== 'linear' && <><dt>Speed</dt><dd>{SPEED_RAMPS.find((r) => r.id === s.ramp)?.label ?? s.ramp}{s.rampSilent ? ', no sound' : ''}</dd></>}
          {s.cut && <><dt>Shots</dt><dd>{(s.shots ?? []).map((x: any, i: number) => <div key={i} style={{ fontSize: 12 }}>{i + 1}. {x.action}</div>)}</dd></>}
          <dt>Seed</dt><dd className="mono">{s.seed}</dd>
          {take.render_seconds && <><dt>Render</dt><dd>{Math.round(take.render_seconds)}s</dd></>}
        </dl>
        <div className="label" style={{ marginTop: 'auto' }}>← → to browse · Esc to close · {getState().takes.length} assets</div>
      </aside>
    </div>
  );
}
