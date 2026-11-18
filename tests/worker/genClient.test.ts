import { describe, expect, it } from 'vitest';
import {
  createGenClient,
  isSuperseded,
  type WorkerFactory,
  type WorkerPort,
} from '../../src/worker/genClient';
import {
  collectTransferables,
  PROTOCOL_VERSION,
  versionErrorReply,
  type GenRequest,
  type GenResponse,
} from '../../src/worker/protocol';
import type { World } from '../../src/sim/world/types';
import { bakeTransferables, type WorldBake } from '../../src/render/bakeWorld';
import { defaultParams, type WorldParams } from '../../src/sim/world/params';

/** Параметры по умолчанию для сида. */
const P = (seed: string): WorldParams => defaultParams(seed);

function fakeWorld(seed: string): World {
  const n = 4 * 2;
  return {
    params: defaultParams(seed),
    w: 4,
    h: 2,
    height: new Float32Array(n),
    temperature: new Float32Array(n),
    moisture: new Float32Array(n),
    arcana: new Float32Array(n),
    biomes: [],
    biome: new Uint8Array(n),
    riverMask: new Uint8Array(n),
    rivers: [],
    provinceOf: new Uint16Array(n),
    provinces: [],
    adjacency: [],
    edgesOf: [],
  };
}

function fakeBake(): WorldBake {
  return {
    provinceRG: new Uint8Array(32),
    terrain: new Uint8Array(32),
    border: new Uint8Array(32),
    height: new Uint16Array(8),
    surface: new Uint16Array(32),
    biomeColor: new Uint8Array(32),
  };
}

const bake = fakeBake();

interface FakeWorker {
  requests: GenRequest[];
  terminated: boolean;
  emit(msg: GenResponse): void;
  fail(message: string): void;
}

/** Фабрика поддельных воркеров: запоминает каждый созданный экземпляр. */
function fakeFactory(): { factory: WorkerFactory; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const factory: WorkerFactory = (onMessage, onError) => {
    const fw: FakeWorker = {
      requests: [],
      terminated: false,
      emit: (msg) => onMessage(msg),
      fail: (message) => onError(message),
    };
    workers.push(fw);
    const port: WorkerPort = {
      post: (req) => fw.requests.push(req),
      terminate: () => {
        fw.terminated = true;
      },
    };
    return port;
  };
  return { factory, workers };
}

const timings = {
  stages: { height: 1, climate: 1, biomes: 1, shoreline: 1, rivers: 1, provinces: 1, bake: 1 },
  total: 7,
};

describe('genClient', () => {
  it('запрос возвращает мир с текстурами и таймингами, этапы доходят до колбэка', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const stages: string[] = [];
    const params = P('Альфа-1');
    params.options = { fantasy: true, disabledBiomes: ['swamp'], size: 'small' };
    const p = client.requestWorld(params, (s) => stages.push(s));
    const w = workers[0]!;
    const req = w.requests[0]!;
    expect(req.params).toEqual(params);
    w.emit({ v: PROTOCOL_VERSION, type: 'stage', id: req.id, stage: 'height' });
    w.emit({ v: PROTOCOL_VERSION, type: 'stage', id: req.id, stage: 'climate' });
    const world = fakeWorld('Альфа-1');
    w.emit({ v: PROTOCOL_VERSION, type: 'done', id: req.id, world, bake, timings });
    const result = await p;
    expect(result.world).toBe(world);
    expect(result.bake).toBe(bake);
    expect(result.timings).toEqual(timings);
    expect(stages).toEqual(['height', 'climate']);
  });

  it('второй запрос до ответа первого: результат первого игнорируется', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const first = client.requestWorld(P('старый'));
    const firstReq = workers[0]!.requests[0]!;
    const second = client.requestWorld(P('новый'));
    await expect(first).rejects.toSatisfy(isSuperseded);
    // Занятый воркер прерывается, новый запрос идёт в свежий.
    expect(workers[0]!.terminated).toBe(true);
    const secondWorker = workers[workers.length - 1]!;
    const secondReq = secondWorker.requests[0]!;
    expect(secondReq.params).toEqual(P('новый'));
    expect(secondReq.id).not.toBe(firstReq.id);

    // Запоздалый ответ на первый запрос ничего не ломает и не подменяет мир.
    const stale = fakeWorld('старый');
    workers[0]!.emit({ v: PROTOCOL_VERSION, type: 'done', id: firstReq.id, world: stale, bake, timings });
    secondWorker.emit({ v: PROTOCOL_VERSION, type: 'done', id: firstReq.id, world: stale, bake, timings });
    const fresh = fakeWorld('новый');
    secondWorker.emit({ v: PROTOCOL_VERSION, type: 'done', id: secondReq.id, world: fresh, bake, timings });
    expect((await second).world).toBe(fresh);
  });

  it('свободный воркер переиспользуется', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const p1 = client.requestWorld(P('a'));
    workers[0]!.emit({ v: PROTOCOL_VERSION, type: 'done', id: workers[0]!.requests[0]!.id, world: fakeWorld('a'), bake, timings });
    await p1;
    const p2 = client.requestWorld(P('b'));
    expect(workers.length).toBe(1);
    workers[0]!.emit({ v: PROTOCOL_VERSION, type: 'done', id: workers[0]!.requests[1]!.id, world: fakeWorld('b'), bake, timings });
    expect((await p2).world.params.seed).toBe('b');
  });

  it('ошибка генерации и падение воркера отклоняют запрос', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const p1 = client.requestWorld(P('a'));
    workers[0]!.emit({ v: PROTOCOL_VERSION, type: 'error', id: workers[0]!.requests[0]!.id, message: 'boom' });
    await expect(p1).rejects.toThrow('boom');

    const p2 = client.requestWorld(P('b'));
    workers[workers.length - 1]!.fail('script error');
    await expect(p2).rejects.toThrow('script error');
    expect(workers[workers.length - 1]!.terminated).toBe(true);

    // После падения следующий запрос получает новый воркер.
    const before = workers.length;
    void client.requestWorld(P('c')).catch(() => undefined);
    expect(workers.length).toBe(before + 1);
  });

  it('запрос несёт версию протокола', () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    void client.requestWorld(P('a')).catch(() => undefined);
    expect(workers[0]!.requests[0]!.v).toBe(PROTOCOL_VERSION);
  });

  it('ответ другой версии протокола отклоняет запрос понятной ошибкой', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const p = client.requestWorld(P('a'));
    const id = workers[0]!.requests[0]!.id;
    const alien = { v: PROTOCOL_VERSION + 1, type: 'done', id, world: fakeWorld('a'), bake, timings };
    workers[0]!.emit(alien as unknown as GenResponse);
    await expect(p).rejects.toThrow(/protocol version/);
    // Воркер другой версии не переиспользуется.
    expect(workers[0]!.terminated).toBe(true);

    const p2 = client.requestWorld(P('b'));
    workers[1]!.emit({ id: workers[1]!.requests[0]!.id, type: 'stage', stage: 'height' } as unknown as GenResponse);
    await expect(p2).rejects.toThrow(/protocol version/);
  });
});

describe('versionErrorReply (сторона воркера)', () => {
  it('своя версия — ответа нет; чужая или без версии — сообщение об ошибке с id запроса', () => {
    expect(versionErrorReply({ v: PROTOCOL_VERSION, id: 3 })).toBeNull();
    const reply = versionErrorReply({ v: PROTOCOL_VERSION + 1, id: 3 });
    expect(reply).toMatchObject({ v: PROTOCOL_VERSION, type: 'error', id: 3 });
    expect(reply?.message).toMatch(/protocol version/);
    expect(versionErrorReply({ id: 4 })).toMatchObject({ type: 'error', id: 4 });
    expect(versionErrorReply(null)).toMatchObject({ type: 'error', id: -1 });
  });
});

describe('collectTransferables', () => {
  it('отдаёт буферы всех типизированных массивов без повторов', () => {
    const world = fakeWorld('x');
    const shared = new ArrayBuffer(16);
    world.biome = new Uint8Array(shared, 0, 8);
    world.riverMask = new Uint8Array(shared, 8, 8);
    const list = collectTransferables(world);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toContain(world.height.buffer);
    expect(list).toContain(world.temperature.buffer);
    expect(list).toContain(world.moisture.buffer);
    expect(list).toContain(world.arcana.buffer);
    expect(list).toContain(world.provinceOf.buffer);
    expect(list).toContain(shared);
    expect(list.length).toBe(6);
  });
});

describe('bakeTransferables', () => {
  it('отдаёт все шесть буферов запечённых текстур', () => {
    const b = fakeBake();
    const list = bakeTransferables(b);
    expect(list.length).toBe(6);
    expect(list).toContain(b.surface.buffer);
  });
});
