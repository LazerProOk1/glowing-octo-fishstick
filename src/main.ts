// Временная точка входа (этап 1): генерация мира в главном потоке, Task 11 вынесет её в воркер.
import { Application } from 'pixi.js';
import { MapView } from './render/MapView';
import { generateWorld } from './sim/world/generateWorld';

function seedFromHash(): string {
  const raw = location.hash.slice(1);
  try {
    return decodeURIComponent(raw) || '1';
  } catch {
    return raw || '1';
  }
}

async function start(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    preference: 'webgl',
    background: '#383e40',
  });
  app.canvas.style.display = 'block';
  (document.getElementById('app') ?? document.body).appendChild(app.canvas);

  const view = new MapView(app);
  view.setWorld(generateWorld(seedFromHash()));
  window.addEventListener('hashchange', () => view.setWorld(generateWorld(seedFromHash())));

  // Для ручной проверки в браузере (счётчик текстур и т.п.).
  if (import.meta.env.DEV) Object.assign(window, { __app: app, __mapView: view });
}

void start();
