/** Explore (home), Apps gallery and Library. */
import { useState } from 'react';
import { APPS, APP_CATS, RECIPES, badgeLabel, presetById, recipeUrl, type AppDef } from '../catalog';
import { linkProps, setParams, useRoute } from '../router';
import { isImage, isModel, useStore, inFeed } from '../store';
import { Clip, Icon, MediaCard, Spill, presetClip } from '../ui';
import Viewer, { animate, recreate, remove } from '../Viewer';

/** Cover art for an app: a curated rendered clip, so a fresh install never shows an empty card. */
function AppArt({ app }: { app: AppDef }) {
  return <Clip src={app.clip ?? presetClip(app.cover)} />;
}

export function Explore() {
  const hero = ['director', 'video', 'image', 'edit', 'upscale'].map((id) => APPS.find((a) => a.id === id)!);
  const recent = useStore((s) => s.takes.filter((t) => inFeed(t) && t.status === 'done' && !isModel(t)).slice(0, 8));
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <div className="page-scroll" style={{ position: 'relative' }}>
      <div className="explore-glow"><Spill src={hero[0].clip ?? presetClip(hero[0].cover)} video /></div>
      <div className="page-pad">
        <div className="carousel">
          {hero.map((a) => (
            <a key={a.id} className="hero-card" {...linkProps(a.route)}>
              <AppArt app={a} />
              <div className="txt">
                {a.badge && <span className="badge" style={{ marginBottom: 10, display: 'inline-block' }}>{badgeLabel(a.badge)}</span>}
                <div className="display">{a.name}</div>
                <div className="dim" style={{ marginTop: 6 }}>{a.blurb}</div>
              </div>
            </a>
          ))}
        </div>

        <div className="section-head"><h2 className="display">Tools</h2><a className="dim" {...linkProps('/apps')}>All apps <Icon name="chev" size={12} /></a></div>
        <div className="tiles">
          {APPS.map((a) => (
            <a key={a.id} className="tile" {...linkProps(a.route)}>
              <span className="ico"><Icon name={a.icon} /></span>
              <span>
                <b>{a.name}</b> {a.badge && <span className="badge" style={{ marginLeft: 6 }}>{badgeLabel(a.badge)}</span>}
                <div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>{a.blurb}</div>
              </span>
            </a>
          ))}
        </div>

        <div className="section-head"><h2 className="display">Start from a recipe</h2><span className="dim">One click loads the setup. Change anything.</span></div>
        <div className="recipe-grid">
          {RECIPES.map((r) => (
            <a key={r.id} className="preset-card" {...linkProps(recipeUrl(r))} title={r.prompt}>
              <Clip src={presetClip(r.preset)} />
              <span className="cat badge">{presetById(r.preset).name}</span>
              <span className="name">{r.name}<div className="dim" style={{ font: '550 12px/1.3 var(--font-ui)', fontVariationSettings: "'wdth' 100", textTransform: 'none', marginTop: 8 }}>Recreate this shot</div></span>
            </a>
          ))}
        </div>

        {recent.length > 0 && <>
          <div className="section-head"><h2 className="display">Recent</h2><a className="dim" {...linkProps('/library')}>Library <Icon name="chev" size={12} /></a></div>
          <div className="grid dense">
            {recent.map((t) => <MediaCard key={t.id} take={t} onOpen={() => setViewing(t.id)} />)}
          </div>
        </>}

        <div className="section-head"><h2 className="display">Why it is open</h2></div>
        <div className="tiles">
          <div className="tile"><span className="ico"><Icon name="cpu" /></span><span><b>Nothing to install</b><div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>Generation runs on the Kie AI API. No GPU of your own and no engine to keep updated.</div></span></div>
          <div className="tile"><span className="ico"><Icon name="bolt" /></span><span><b>Credits, not subscriptions</b><div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>You pay the provider for what you generate. Idle time costs nothing.</div></span></div>
          <div className="tile"><span className="ico"><Icon name="grid" /></span><span><b>Fork every app</b><div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>Each app is a plain screen of controls. Change the prompts, the look or the code.</div></span></div>
        </div>
      </div>
      {viewing !== null && <Viewer takeId={viewing} onClose={() => setViewing(null)} onStep={() => {}} />}
    </div>
  );
}

export function Apps() {
  const { params } = useRoute();
  const cat = params.get('cat') || 'all';
  const [q, setQ] = useState('');
  const list = APPS.filter((a) => (cat === 'all' || a.cat === cat) && (!q || `${a.name} ${a.blurb}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="page-scroll">
      <div className="page-pad">
        <h1 className="display" style={{ fontSize: 'clamp(48px,6vw,88px)', margin: '8px 0 0' }}>Every tool. <span className="hl">Open.</span></h1>
        <p className="dim" style={{ marginTop: 10 }}>Each app is a screen of controls on the same generation API. The provider runs the model; you get the shot.</p>
        <div className="picker-top" style={{ margin: '22px 0 18px' }}>
          <div style={{ position: 'relative' }}>
            <input className="field" style={{ width: 240, padding: '8px 10px 8px 30px' }} placeholder="Search apps" value={q} onChange={(e) => setQ(e.target.value)} />
            <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--mute)' }}><Icon name="search" size={14} /></span>
          </div>
          {APP_CATS.map((c) => <button key={c.id} type="button" className={`pill ${cat === c.id ? 'active' : ''}`} onClick={() => setParams({ cat: c.id === 'all' ? null : c.id })}>{c.label}</button>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {list.map((a) => (
            <div key={a.id} className="app-card">
              <a className="media" {...linkProps(a.route)}>
                <AppArt app={a} />
                {a.badge && <span className="badge" style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>{badgeLabel(a.badge)}</span>}
                <span className="name display">{a.name}</span>
              </a>
              <div className="body">
                <p>{a.blurb}</p>
                <a className="btn sm try" {...linkProps(a.route)}>Open {a.name}</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Library() {
  const { params } = useRoute();
  const filter = params.get('filter') || 'all';
  const all = useStore((s) => s.takes.filter((t) => inFeed(t) && !isModel(t)));
  const takes = all.filter((t) =>
    filter === 'image' ? isImage(t) : filter === 'video' ? !isImage(t) : filter === 'favorites' ? !!t.starred : true);
  const done = takes.filter((t) => t.status === 'done');
  const [viewing, setViewing] = useState<number | null>(null);
  const step = (dir: 1 | -1) => {
    const i = done.findIndex((t) => t.id === viewing);
    const n = done[(i + dir + done.length) % done.length];
    if (n) setViewing(n.id);
  };
  return (
    <div className="page-scroll">
      <div className="page-pad" style={{ maxWidth: 1600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <h1 className="display" style={{ fontSize: 40, margin: '0 14px 0 0' }}>Library</h1>
          {['all', 'image', 'video', 'favorites'].map((f) => (
            <button key={f} type="button" className={`pill ${filter === f ? 'active' : ''}`} onClick={() => setParams({ filter: f === 'all' ? null : f })}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span className="dim" style={{ marginLeft: 'auto' }}>{done.length} assets · saved to your library</span>
        </div>
        {takes.length === 0 ? <div className="empty">Nothing here yet. Everything you make is saved here automatically.</div> : (
          <div className="grid dense">
            {takes.map((t) => (
              <MediaCard key={t.id} take={t} onOpen={() => setViewing(t.id)} actions={<>
                {isImage(t) && t.status === 'done' && <button type="button" className="icon-btn" title="Animate" onClick={() => void animate(t)}><Icon name="video" size={14} /></button>}
                <button type="button" className="icon-btn" title="Recreate" onClick={() => void recreate(t)}><Icon name="redo" size={14} /></button>
                <button type="button" className="icon-btn" title="Delete" onClick={() => void remove(t)}><Icon name="trash" size={14} /></button>
              </>} />
            ))}
          </div>
        )}
      </div>
      {viewing !== null && <Viewer takeId={viewing} onClose={() => setViewing(null)} onStep={step} />}
    </div>
  );
}
