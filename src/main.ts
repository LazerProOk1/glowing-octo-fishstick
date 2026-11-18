// Точка входа (этап 1): мир генерируется в воркере, интерфейс — экран загрузки,
// подсказка у курсора и панель отладки (F3).
import { Application, RendererType, type WebGLRenderer } from 'pixi.js';
import { t } from './i18n/ru';
import { MapView } from './render/MapView';
import { DebugPanel } from './ui/debugPanel';
import { errorDetail, showError } from './ui/errorScreen';
import { LoadingScreen } from './ui/loading';
import { ProvinceTooltip } from './ui/tooltip';
import { isSuperseded, requestWorld, type GenResult } from './worker/genClient';
import './ui/styles.css';

function seedFromHash(): string {
  const raw = location.hash.slice(1);
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/** Зерно из адреса; без него — случайное, записывается в адрес без новой записи в истории. */
function initialSeed(): string {
  const fromHash = seedFromHash();
  if (fromHash) return fromHash;
  const words = t('seed.words').split(',');
  const word = words[Math.floor(Math.random() * words.length)] ?? words[0] ?? 'seed';
  const seed = `${word}-${1 + Math.floor(Math.random() * 99)}`;
  history.replaceState(null, '', `#${encodeURIComponent(seed)}`);
  return seed;
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
  const seed = initialSeed();
  loading.show(seed);

  if (!browserHasWebGL2()) {
    loading.hide();
    showError(root, t('error.webgl2'));
    return;
  }

  // Генерация стартует сразу и идёт в воркере параллельно с запуском графики.
  // Смена адреса, пока графика запускается, сразу перезапрашивает мир (старый запрос вытесняется).
  let first = { seed, world: requestWorld(seed, (s) => loading.setStage(s)) };
  const onEarlyHash = (): void => {
    const next = seedFromHash();
    if (!next || next === first.seed) return;
    first.world.catch(() => undefined);
    loading.show(next);
    first = { seed: next, world: requestWorld(next, (s) => loading.setStage(s)) };
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
  const debug = new DebugPanel(
    root,
    () => app.ticker.FPS,
    (next) => {
      // То же зерно не меняет адрес и не даёт hashchange — перестраиваем напрямую.
      if (next === seedFromHash()) regenerate(next);
      else location.hash = encodeURIComponent(next);
    },
  );
  debug.setSeed(first.seed);

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

  const regenerate = (next: string): void => {
    clearError?.();
    clearError = null;
    tooltip.setWorld(null);
    debug.setSeed(next);
    loading.show(next);
    void show(requestWorld(next, (s) => loading.setStage(s)));
  };

  window.removeEventListener('hashchange', onEarlyHash);
  window.addEventListener('hashchange', () => {
    const next = seedFromHash();
    if (next) regenerate(next);
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
