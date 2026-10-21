import { expect, it, vi } from "vitest";
import {
  type ContextProvider,
  createContext,
  type ToolContext,
  toolContext,
} from "../../src/index.js";
import { deferred } from "../memory.js";

it("leaves unused factories idle and shares one in-flight promise and value", async () => {
  const gate = deferred<{ count: number }>();
  const resolve = vi.fn(() => gate.promise);
  const database = createContext({ name: "db", resolve });
  const unusedFactory = vi.fn();
  const unused = createContext({ name: "unused", resolve: unusedFactory });
  const ctx = toolContext({ context: [database, unused] });
  expect(resolve).not.toHaveBeenCalled();
  const first = database.use(ctx);
  const second = database.use(ctx);
  expect(first).toBe(second);
  await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
  const value = { count: 1 };
  gate.resolve(value);
  expect(await first).toBe(value);
  expect(await database.use(ctx)).toBe(value);
  value.count++;
  expect((await second).count).toBe(2);
  expect(unusedFactory).not.toHaveBeenCalled();
});

it.each([undefined, null, false, 0, ""])(
  "caches the valid value %s",
  async (value) => {
    const resolve = vi.fn(() => value);
    const provider = createContext({ name: "falsy", resolve });
    const ctx = toolContext({ context: [provider] });
    expect(await provider.use(ctx)).toBe(value);
    expect(await provider.use(ctx)).toBe(value);
    expect(resolve).toHaveBeenCalledOnce();
  },
);

it.each(["throw", "reject"] as const)(
  "caches factory %s failures and retries only in a new context",
  async (mode) => {
    const failure = new Error("database unavailable");
    const resolve = vi.fn(() => {
      if (mode === "throw") throw failure;
      return Promise.reject(failure);
    });
    const database = createContext({ name: "db", resolve });
    const ctx = toolContext({ context: [database] });
    const first = database.use(ctx);
    expect(database.use(ctx)).toBe(first);
    await expect(first).rejects.toBe(failure);
    await expect(database.use(ctx)).rejects.toBe(failure);
    expect(resolve).toHaveBeenCalledOnce();
    await expect(
      database.use(toolContext({ context: [database] })),
    ).rejects.toBe(failure);
    expect(resolve).toHaveBeenCalledTimes(2);
  },
);

it("isolates caches even when contexts share a request id and a provider definition", async () => {
  let count = 0;
  const database = createContext({
    name: "db",
    resolve: () => ({ count: ++count }),
  });
  const first = toolContext({ request: { id: 1 }, context: [database] });
  const second = toolContext({ request: { id: 1 }, context: [database] });
  expect(await database.use(first)).toEqual({ count: 1 });
  expect(await database.use(second)).toEqual({ count: 2 });
});

it("returns application-owned class instances without cloning or freezing", async () => {
  class Client {
    #count = 0;
    next() {
      return ++this.#count;
    }
  }
  const client = new Client();
  const database = createContext({ name: "db", resolve: () => client });
  const resolved = await database.use(toolContext({ context: [database] }));
  expect(resolved).toBe(client);
  expect(Object.isFrozen(resolved)).toBe(false);
  expect(resolved.next()).toBe(1);
});

it("rejects missing dependencies only on access and rejects unsupported hand-built contexts asynchronously", async () => {
  const database = createContext({ name: "database", resolve: () => 1 });
  const services = createContext({
    name: "services",
    resolve: (ctx) => database.use(ctx),
  });
  const ctx = toolContext({ context: [services] });
  await expect(services.use(ctx)).rejects.toThrow(
    '"database" is not registered',
  );
  await expect(database.use(toolContext())).rejects.toThrow(
    '"database" is not registered',
  );
  const handBuilt = { signal: ctx.signal, request: ctx.request };
  await expect(database.use(handBuilt)).rejects.toThrow(
    "Toolgrain-created context",
  );
});

it("resolves conditional dependencies in arbitrary registration order", async () => {
  const primary = createContext({ name: "primary", resolve: () => "primary" });
  const fallback = createContext({
    name: "fallback",
    resolve: () => "fallback",
  });
  const service = createContext({
    name: "service",
    resolve: (ctx) =>
      ctx.request.meta.fallback ? fallback.use(ctx) : primary.use(ctx),
  });
  const ctx = toolContext({ context: [service, primary] });
  expect(await service.use(ctx)).toBe("primary");
  const alternate = toolContext({
    context: [fallback, service],
    request: { meta: { fallback: true } },
  });
  expect(await service.use(alternate)).toBe("fallback");
});

it("shares pending diamonds without treating concurrent readers as cycles", async () => {
  const entered = deferred();
  const finish = deferred<number>();
  const db = createContext({
    name: "db",
    resolve: () => {
      entered.resolve();
      return finish.promise;
    },
  });
  const first = createContext({ name: "first", resolve: (ctx) => db.use(ctx) });
  const second = createContext({
    name: "second",
    resolve: (ctx) => db.use(ctx),
  });
  const root = createContext({
    name: "root",
    resolve: (ctx) => Promise.all([first.use(ctx), second.use(ctx)]),
  });
  const reader = createContext({
    name: "reader",
    resolve: (ctx) => root.use(ctx),
  });
  const ctx = toolContext({ context: [reader, root, second, first, db] });
  const a = root.use(ctx);
  await entered.promise;
  const b = reader.use(ctx);
  // Let the reader inspect both paths through the pending diamond.
  await Promise.resolve();
  finish.resolve(7);
  expect(await a).toEqual([7, 7]);
  expect(await b).toBe(await a);
});

it("ignores dependencies that have settled when checking a pending graph", async () => {
  const entered = deferred();
  const finish = deferred();
  const ready = createContext({ name: "ready", resolve: () => 1 });
  const waiting = createContext({
    name: "waiting",
    async resolve(ctx) {
      await ready.use(ctx);
      entered.resolve();
      await finish.promise;
      return 2;
    },
  });
  const reader = createContext({
    name: "reader",
    resolve: (ctx) => waiting.use(ctx),
  });
  const ctx = toolContext({ context: [reader, waiting, ready] });
  const pending = waiting.use(ctx);
  await entered.promise;
  const read = reader.use(ctx);
  await Promise.resolve();
  finish.resolve();
  expect(await read).toBe(2);
  expect(await pending).toBe(2);
});

it("rejects direct and transitive dependency cycles with a diagnostic chain", async () => {
  let self: ContextProvider<number>;
  self = createContext({ name: "self", resolve: (ctx) => self.use(ctx) });
  await expect(self.use(toolContext({ context: [self] }))).rejects.toThrow(
    "self -> self",
  );
  let a: ContextProvider<number>;
  let b: ContextProvider<number>;
  let c: ContextProvider<number>;
  a = createContext({ name: "a", resolve: (ctx) => b.use(ctx) });
  b = createContext({ name: "b", resolve: (ctx) => c.use(ctx) });
  c = createContext({ name: "c", resolve: (ctx) => a.use(ctx) });
  await expect(a.use(toolContext({ context: [c, a, b] }))).rejects.toThrow(
    "c -> a -> b -> c",
  );
});

it("detects cycles between independently started concurrent factories after awaits", async () => {
  const gate = deferred();
  const started = deferred();
  let count = 0;
  let a: ContextProvider<number>;
  let b: ContextProvider<number>;
  const wait = async () => {
    if (++count === 2) started.resolve();
    await gate.promise;
  };
  a = createContext({
    name: "a",
    async resolve(ctx) {
      await wait();
      return b.use(ctx);
    },
  });
  b = createContext({
    name: "b",
    async resolve(ctx) {
      await wait();
      return a.use(ctx);
    },
  });
  const ctx = toolContext({ context: [a, b] });
  const result = Promise.all([a.use(ctx), b.use(ctx)]);
  const rejected = expect(result).rejects.toThrow("b -> a -> b");
  await started.promise;
  gate.resolve();
  await rejected;
});

it("keeps request data available to provider-owned methods after their resolver settles", async () => {
  let saved: ToolContext | undefined;
  const first = createContext({
    name: "first",
    resolve(ctx) {
      saved = ctx;
      return 1;
    },
  });
  const second = createContext({
    name: "second",
    async resolve(ctx) {
      return (await first.use(ctx)) + 1;
    },
  });
  const ctx = toolContext({ context: [first, second] });
  await first.use(ctx);
  expect(saved?.request).toBe(ctx.request);
  expect(saved?.signal).toBe(ctx.signal);
  expect(Object.isFrozen(saved)).toBe(true);
  expect(await second.use(saved as ToolContext)).toBe(2);
});

it("checks cancellation before access, before factory startup, and after late completion", async () => {
  const controller = new AbortController();
  const reason = new Error("request cancelled");
  const resolve = vi.fn(() => 1);
  const database = createContext({ name: "db", resolve });
  const ctx = toolContext({ signal: controller.signal, context: [database] });
  const queued = database.use(ctx);
  const rejected = expect(queued).rejects.toBe(reason);
  controller.abort(reason);
  await rejected;
  await expect(database.use(ctx)).rejects.toBe(reason);
  expect(resolve).not.toHaveBeenCalled();

  const late = deferred<number>();
  const entered = deferred();
  const active = new AbortController();
  const slow = createContext({
    name: "slow",
    resolve(ctx) {
      expect(ctx.signal).toBe(active.signal);
      entered.resolve();
      return late.promise;
    },
  });
  const pending = slow.use(
    toolContext({ signal: active.signal, context: [slow] }),
  );
  const cancelled = expect(pending).rejects.toBe(reason);
  await entered.promise;
  active.abort(reason);
  late.resolve(7);
  await cancelled;
});
