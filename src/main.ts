// Точка входа (этап 1): мир генерируется в воркере, интерфейс — экран загрузки,
// подсказка у курсора, панель отладки (F3) и режимы карты (M). Клавиши — в ui/hotkeys.ts.
import { Application, RendererType, type WebGLRenderer } from 'pixi.js';
import { t, translate } from './i18n/ru';
import { nextMapMode } from './render/mapModes';
import { MapView } from './render/MapView';
import { DebugPanel } from './ui/debugPanel';
import { errorDetail, showError } from './ui/errorScreen';
import { appHotkeys, registerHotkeys } from './ui/hotkeys';
import { LoadingScreen } from './ui/loading';
import { Notice } from './ui/notice';
import { ProvinceTooltip } from './ui/tooltip';
import type { WorldParams } from './sim/world/params';
import { isSuperseded, requestWorld, type GenResult } from './worker/genClient';
import { buildWorldUrl, parseWorldUrl } from './worldUrl';
import './ui/styles.css';

/** Ключ запроса: два запроса с одинаковым ключом дают один и тот же мир. */
const requestKey = (r: WorldParams): string => buildWorldUrl(r);

/**
 * Параметры мира из адреса; без сида — случайный сид (опции из адреса сохраняются), записывается
 * в адрес без новой записи в истории.
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

/** Шейдер карты написан на GLSL ES 3.00 — без WebGL 2 он не соберётся. */
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

/** Следит за devicePixelRatio (окно перенесли на другой монитор, сменили масштаб). */
function followDevicePixelRatio(app: Application): void {
  const listen = (): void => {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', onChange, { once: true });
  };
  const onChange = (): void => {
    const dpr = window.devicePixelRatio || 1;
    if (app.renderer.resolution !== dpr) {
      // resize с новым разрешением шлёт событие 'resize' — MapView пересчитывает uniform-ы.
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

  // Генерация стартует сразу и идёт в воркере параллельно с запуском графики.
  // Смена адреса, пока графика запускается, сразу перезапрашивает мир (старый запрос вытесняется).
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
  /** Последний запрошенный мир: новый сид из панели отладки сохраняет его паки и опции. */
  let current = first.req;
  const debug = new DebugPanel(
    root,
    () => app.ticker.FPS,
    (seed) => {
      const next: WorldParams = { ...current, seed };
      // Тот же адрес не даёт hashchange — перестраиваем напрямую.
      if (requestKey(next) === requestKey(parseWorldUrl(location.hash))) regenerate(next);
      else location.hash = requestKey(next);
    },
  );
  debug.setSeed(first.req.seed);
  debug.setMapMode(view.mapMode.nameKey);

  const notice = new Notice(root);
  const hotkeys = appHotkeys({
    toggleDebug: () => debug.toggle(),
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
      loading.hide(); // карта уже на месте — блок загрузки убирается сразу
      tooltip.setWorld(world);
      debug.setWorld(world, timings);
    } catch (err) {
      if (isSuperseded(err)) return;
      console.error(err);
      loading.hide();
      clearError = showError(root, t('error.generation'), errorDetail(err));
    }
  };

  const regenerate = (next: WorldParams): void => {
    clearError?.();
    clearError = null;
    current = next;
    tooltip.setWorld(null);
    debug.setSeed(next.seed);
    loading.show(next.seed);
    void show(load(next));
  };

  window.removeEventListener('hashchange', onEarlyHash);
  window.addEventListener('hashchange', () => {
    const next = parseWorldUrl(location.hash);
    if (next.seed) regenerate(next);
  });

  // Для ручной проверки в браузере (счётчик текстур и т.п.).
  if (import.meta.env.DEV) Object.assign(window, { __app: app, __mapView: view });

  await show(first.world);
}

const root = document.getElementById('app') ?? document.body;
start(root).catch((err: unknown) => {
  console.error(err);
  showError(root, t('error.generation'), errorDetail(err));
});
