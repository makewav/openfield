/** OpenField shell: top bar + routed page. */
import { useEffect } from 'react';
import { APPS, badgeLabel } from './catalog';
import { linkProps, useRoute } from './router';
import { startLive } from './store';
import { useGlobalDrop } from './drop';
import { Logo, Toast } from './ui';
import VideoPage from './pages/Video';
import ImagePage from './pages/Image';
import DirectorPage from './pages/Director';
import UpscalePage from './pages/Upscale';
import ExtendPage from './pages/Extend';
import SpeakPage from './pages/Speak';
import EditPage from './pages/Edit';
import CastPage from './pages/Cast';
import CutoutPage from './pages/Cutout';
import EffectsPage from './pages/Effects';
import MirrorPage from './pages/Mirror';
import ReshootPage from './pages/Reshoot';
import StagePage from './pages/Stage';
import ObjectPage from './pages/Object';
import { Apps, Explore, Library } from './pages/Home';

const SECTIONS = [
  { to: '/', label: 'Explore' },
  { to: '/image', label: 'Image' },
  { to: '/edit', label: 'Edit' },
  { to: '/video', label: 'Video' },
  { to: '/apps', label: 'Apps' },
  { to: '/library', label: 'Library' },
];
const APP_LINKS = APPS.filter((a) => ['director', 'loop', 'upscale'].includes(a.id));

export default function App() {
  const { path, params } = useRoute();
  useEffect(() => { startLive(); }, []);
  const drop = useGlobalDrop();

  const page = (() => {
    if (path === '/image') return <ImagePage />;
    if (path === '/video') return <VideoPage />;
    if (path === '/director') return <DirectorPage />;
    if (path === '/upscale') return <UpscalePage />;
    if (path === '/extend') return <ExtendPage />;
    if (path === '/speak') return <SpeakPage />;
    if (path === '/edit') return <EditPage />;
    if (path === '/cast') return <CastPage />;
    if (path === '/cutout') return <CutoutPage />;
    if (path === '/effects') return <EffectsPage />;
    if (path === '/mirror') return <MirrorPage />;
    if (path === '/reshoot') return <ReshootPage />;
    if (path === '/stage') return <StagePage />;
    if (path === '/object') return <ObjectPage />;
    if (path === '/apps') return <Apps />;
    if (path === '/library') return <Library />;
    return <Explore />;
  })();

  // the tab says where you are
  useEffect(() => {
    const name = path === '/' ? 'Explore'
      : APPS.find((a) => a.route.split('?')[0] === path)?.name ?? SECTIONS.find((s) => s.to === path)?.label;
    document.title = name ? `${name} · OpenField` : 'OpenField';
  }, [path]);

  const isActive = (to: string) => {
    if (to === '/') return path === '/';
    const [p, q] = to.split('?');
    if (p !== path) return false;
    if (!q) return !(path === '/video' && params.get('mode') === 'loop');
    return [...new URLSearchParams(q)].every(([k, v]) => params.get(k) === v);
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" {...linkProps('/')}><Logo /><span className="brand-word">OpenField</span></a>
        <nav className="nav">
          {SECTIONS.map((s) => <a key={s.to} className={`nav-link ${isActive(s.to) ? 'active' : ''}`} {...linkProps(s.to)}>{s.label}</a>)}
          <span className="nav-sep" />
          {APP_LINKS.map((a) => (
            <a key={a.id} className={`nav-link ${isActive(a.route) ? 'active' : ''}`} {...linkProps(a.route)}>
              {a.name}{a.badge === 'new' && <span className="badge">{badgeLabel(a.badge)}</span>}
            </a>
          ))}
        </nav>
        <div className="topbar-right" />
      </header>
      <main className="main">{page}</main>
      {drop.dragging && drop.label && <div className="drop-veil" aria-hidden><span>{drop.label}</span></div>}
      <Toast />
    </div>
  );
}
