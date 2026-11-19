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
  surfaceTransferables,
  versionErrorReply,
  type GenRequest,
  type GenResponse,
} from '../../src/worker/protocol';
import type { World } from '../../src/sim/world/types';
import { bakeTransferables, type SurfaceBake, type WorldBake } from '../../src/render/bakeWorld';
import { defaultParams, type WorldParams } from '../../src/sim/world/params';

/** Default params for a seed. */
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
    provinceSeaRG: new Uint8Array(32),
    terrain: new Uint8Array(32),
    height: new Uint16Array(8),
    surface: new Uint16Array(32),
    biomeColor: new Uint8Array(32),
    seaDepth: new Uint16Array(8),
  };
}

const bake = fakeBake();

interface FakeWorker {
  requests: GenRequest[];
  terminated: boolean;
  emit(msg: GenResponse): void;
  fail(message: string): void;
}

/** Fake worker factory: remembers every created instance. */
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
  it('a request returns the world with textures and timings, the stages reach the callback', async () => {
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

  it('a second request before the first answer: the first result is ignored', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const first = client.requestWorld(P('старый'));
    const firstReq = workers[0]!.requests[0]!;
    const second = client.requestWorld(P('новый'));
    await expect(first).rejects.toSatisfy(isSuperseded);
    // The busy worker is killed, the new request goes to a fresh one.
    expect(workers[0]!.terminated).toBe(true);
    const secondWorker = workers[workers.length - 1]!;
    const secondReq = secondWorker.requests[0]!;
    expect(secondReq.params).toEqual(P('новый'));
    expect(secondReq.id).not.toBe(firstReq.id);

    // A late answer to the first request breaks nothing and does not replace the world.
    const stale = fakeWorld('старый');
    workers[0]!.emit({ v: PROTOCOL_VERSION, type: 'done', id: firstReq.id, world: stale, bake, timings });
    secondWorker.emit({ v: PROTOCOL_VERSION, type: 'done', id: firstReq.id, world: stale, bake, timings });
    const fresh = fakeWorld('новый');
    secondWorker.emit({ v: PROTOCOL_VERSION, type: 'done', id: secondReq.id, world: fresh, bake, timings });
    expect((await second).world).toBe(fresh);
  });

  it('an idle worker is reused', async () => {
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

  it('a generation error and a worker crash reject the request', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const p1 = client.requestWorld(P('a'));
    workers[0]!.emit({ v: PROTOCOL_VERSION, type: 'error', id: workers[0]!.requests[0]!.id, message: 'boom' });
    await expect(p1).rejects.toThrow('boom');

    const p2 = client.requestWorld(P('b'));
    workers[workers.length - 1]!.fail('script error');
    await expect(p2).rejects.toThrow('script error');
    expect(workers[workers.length - 1]!.terminated).toBe(true);

    // After a crash the next request gets a new worker.
    const before = workers.length;
    void client.requestWorld(P('c')).catch(() => undefined);
    expect(workers.length).toBe(before + 1);
  });

  it('the request carries the protocol version', () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    void client.requestWorld(P('a')).catch(() => undefined);
    expect(workers[0]!.requests[0]!.v).toBe(PROTOCOL_VERSION);
  });

  it('an answer of another protocol version rejects the request with a clear error', async () => {
    const { factory, workers } = fakeFactory();
    const client = createGenClient(factory);
    const p = client.requestWorld(P('a'));
    const id = workers[0]!.requests[0]!.id;
    const alien = { v: PROTOCOL_VERSION + 1, type: 'done', id, world: fakeWorld('a'), bake, timings };
    workers[0]!.emit(alien as unknown as GenResponse);
    await expect(p).rejects.toThrow(/protocol version/);
    // A worker of another version is not reused.
    expect(workers[0]!.terminated).toBe(true);

    const p2 = client.requestWorld(P('b'));
    workers[1]!.emit({ id: workers[1]!.requests[0]!.id, type: 'stage', stage: 'height' } as unknown as GenResponse);
    await expect(p2).rejects.toThrow(/protocol version/);
  });
});

describe('versionErrorReply (worker side)', () => {
  it('own version — no reply; foreign or missing version — an error message with the request id', () => {
    expect(versionErrorReply({ v: PROTOCOL_VERSION, id: 3 })).toBeNull();
    const reply = versionErrorReply({ v: PROTOCOL_VERSION + 1, id: 3 });
    expect(reply).toMatchObject({ v: PROTOCOL_VERSION, type: 'error', id: 3 });
    expect(reply?.message).toMatch(/protocol version/);
    expect(versionErrorReply({ id: 4 })).toMatchObject({ type: 'error', id: 4 });
    expect(versionErrorReply(null)).toMatchObject({ type: 'error', id: -1 });
  });
});

describe('collectTransferables', () => {
  it('returns the buffers of all typed arrays without duplicates', () => {
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
  it('returns all seven buffers of the baked textures', () => {
    const b = fakeBake();
    const list = bakeTransferables(b);
    expect(list.length).toBe(7);
    expect(list).toContain(b.seaDepth.buffer);
    expect(list).toContain(b.surface.buffer);
    expect(list).toContain(b.provinceSeaRG.buffer);
  });

  it('surfaceTransferables: all terrain texture fields, including future ones', () => {
    const { height, surface, biomeColor, seaDepth } = fakeBake();
    const extra = new Float32Array(4);
    const s = { height, surface, biomeColor, seaDepth, extra } as SurfaceBake;
    const list = surfaceTransferables(s);
    expect(new Set(list)).toEqual(new Set(Object.values(s).map((v: ArrayBufferView) => v.buffer)));
    expect(list.length).toBe(5);
  });
});
