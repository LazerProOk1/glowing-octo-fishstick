import { afterEach } from 'vitest';

// Vitest's worker RPC (birpc) times out after 60 s, and its timer runs in the worker.
// Synchronous tests never return to the event loop on their own, so in a long file
// the onTaskUpdate reply sits unread until the timer fires. One macrotask per test lets it in.
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
