// Entry point (stage 1): the world is generated in the worker, the interface is the loading screen,
// the tooltip at the cursor, the debug panel (F3), the map modes (M), the game clock, top bar and fog (ui/gameSession.ts). Keys live in ui/hotkeys.ts.
import { Application, RendererType, type WebGLRenderer } from 'pixi.js';
import { t, translate } from './i18n/ru';
import { nextMapMode } from './render/mapModes';
import { MapView } from './render/MapView';
import { DebugPanel } from './ui/debugPanel';
import { errorDetail, showError } from './ui/errorScreen';
import { appHotkeys, registerHotkeys } from './ui/hotkeys';
import { GameSession } from './ui/gameSession';
import { LoadingScreen } from './ui/loading';
import { Notice } from './ui/notice';
import { ProvinceTooltip } from './ui/tooltip';
import { defaultParams, type WorldParams } from './sim/world/params';
import { isSuperseded, requestWorld, type GenResult } from './worker/genClient';
import { buildWorldUrl, parseWorldUrl } from './worldUrl';
import './ui/styles.css';
import './ui/topbar.css';
import './ui/topbar.css';

/** Request key: two requests with the same key produce the same world. */
const requestKey = (r: WorldParams): string => buildWorldUrl(r);

/**
 * World params from the address; without a seed — a random seed (options from the address are kept),
 * written to the address without a new history entry.
 */
function initialRequest(): WorldParams {
  const fromHash = parseWorldUrl(location.hash);
  if (fromHash.seed) return fromHash;
  const words = t('seed.words').split(',');
  const word = words[Math.floor(Math.random() * words.length)] ?? words[0] ?? 'seed';
  const req = { ...fromHash, seed: `${word}-${1 + Math.floor(Math.random() * 99)}` };
  history.replaceState(null, '', requestKey(req));
  return req;
}

/** The map shader is written in GLSL ES 3.00 — without WebGL 2 it will not compile. */
function browserHasWebGL2(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

function rendererIsWebGL2(app: Application): boolean {
  if (app.renderer.type !== RendererType.WEBGL) return false;
  return (app.renderer as WebGLRenderer).context.webGLVersion === 2;
}

/** Watches devicePixelRatio (window moved to another monitor, zoom changed). */
function followDevicePixelRatio(app: Application): void {
  const listen = (): void => {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', onChange, { once: true });
  };
  const onChange = (): void => {
    const dpr = window.devicePixelRatio || 1;
    if (app.renderer.resolution !== dpr) {
      // A resize with a new resolution fires 'resize' — MapView recomputes the uniforms.
      app.renderer.resize(app.screen.width, app.screen.height, dpr);
    }
    listen();
  };
  listen();
}

async function createApp(): Promise<Application> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    preference: 'webgl',
    background: '#383e40',
  });
  return app;
}

async function start(root: HTMLElement): Promise<void> {
  const loading = new LoadingScreen(root);
  const initial = initialRequest();
  loading.show(initial.seed);

  if (!browserHasWebGL2()) {
    loading.hide();
    showError(root, t('error.webgl2'));
    return;
  }

  // Generation starts immediately and runs in the worker in parallel with graphics startup.
  // An address change while the graphics start re-requests the world right away (the old request is superseded).
  const load = (r: WorldParams): Promise<GenResult> => requestWorld(r, (s) => loading.setStage(s));
  let first = { req: initial, world: load(initial) };
  const onEarlyHash = (): void => {
    const next = parseWorldUrl(location.hash);
    if (!next.seed || requestKey(next) === requestKey(first.req)) return;
    first.world.catch(() => undefined);
    loading.show(next.seed);
    first = { req: next, world: load(next) };
  };
  window.addEventListener('hashchange', onEarlyHash);
  const abortStart = (): void => {
    window.removeEventListener('hashchange', onEarlyHash);
    first.world.catch(() => undefined);
    loading.hide();
  };

  let app: Application;
  try {
    app = await createApp();
  } catch (err) {
    abortStart();
    showError(root, t('error.init'), errorDetail(err));
    return;
  }
  if (!rendererIsWebGL2(app)) {
    abortStart();
    app.destroy();
    showError(root, t('error.webgl2'));
    return;
  }
  app.canvas.style.display = 'block';
  root.prepend(app.canvas);
  followDevicePixelRatio(app);

  const view = new MapView(app);
  const tooltip = new ProvinceTooltip(root);
  view.onHover((id) => tooltip.setProvince(id));
  let clearError: (() => void) | null = null;
  /** Last requested world: a new seed from the debug panel keeps its packs and options. */
  let current = first.req;
  const debug = new DebugPanel(
    root,
    () => app.ticker.FPS,
    (seed) => {
      const next: WorldParams = { ...current, seed };
      // The same address does not fire hashchange — rebuild directly.
      if (requestKey(next) === requestKey(parseWorldUrl(location.hash))) regenerate(next);
      else location.hash = requestKey(next);
    },
    () => view.benchmark(),
    (off) => game.setFogOff(off),
  );
  const game = new GameSession(root, view, tooltip, (off) => debug.setFogOff(off));
  app.ticker.add((tk) => game.tick(tk.deltaMS));
  debug.setSeed(first.req.seed);
  debug.setMapMode(view.mapMode.nameKey);

  const notice = new Notice(root);
  const hotkeys = appHotkeys({
    toggleDebug: () => debug.toggle(),
    togglePause: game.togglePause,
    setSpeed: game.setSpeed,
    faster: game.faster,
    slower: game.slower,
    toggleFog: () => game.toggleFog(),
    nextMapMode: () => {
      const mode = nextMapMode(view.mapMode.id);
      view.setMapMode(mode.id);
      debug.setMapMode(mode.nameKey);
      notice.show(translate(mode.nameKey));
    },
  });
  registerHotkeys(hotkeys);
  debug.setHotkeys(hotkeys);

  const show = async (pending: Promise<GenResult>): Promise<void> => {
    try {
      const { world, bake, timings } = await pending;
      view.setWorld(world, bake);
      loading.hide(); // the map is already there — the loading block is removed immediately
      tooltip.setWorld(world);
      debug.setWorld(world, timings);
      game.start(world);
    } catch (err) {
      if (isSuperseded(err)) return;
      console.error(err);
      loading.hide();
      // The params in the address may have been wrong: both "Reload" and a seed change (F3) start
      // from the default world for the same seed, not from the broken options.
      current = defaultParams(current.seed);
      clearError = showError(root, t('error.generation'), errorDetail(err), requestKey(current));
    }
  };

  const regenerate = (next: WorldParams): void => {
    clearError?.();
    clearError = null;
    current = next;
    tooltip.setWorld(null);
    game.reset();
    debug.setSeed(next.seed);
    loading.show(next.seed);
    void show(load(next));
  };

  window.removeEventListener('hashchange', onEarlyHash);
  window.addEventListener('hashchange', () => {
    const next = parseWorldUrl(location.hash);
    if (next.seed) regenerate(next);
  });

  // For manual checks in the browser (texture counter and the like).
  if (import.meta.env.DEV) Object.assign(window, { __app: app, __mapView: view });

  await show(first.world);
}

document.title = t('app.title');
const root = document.getElementById('app') ?? document.body;
start(root).catch((err: unknown) => {
  console.error(err);
  showError(root, t('error.generation'), errorDetail(err));
});
