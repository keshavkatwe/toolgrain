import { expect, expectTypeOf, it, vi } from "vitest";
import {
  type ContextProvider,
  createContext,
  createServer,
  type ToolContext,
  toolContext,
} from "../../src/index.js";

it("infers sync and async values, including methods, and keeps accessor aliases bound", async () => {
  const database = createContext({
    name: "database",
    resolve(ctx) {
      expectTypeOf(ctx).toEqualTypeOf<ToolContext>();
      return { query: (id: number) => id.toFixed() };
    },
  });
  const useDatabase = database.use;
  const services = createContext({
    name: "services",
    async resolve(ctx) {
      const db = await useDatabase(ctx);
      expectTypeOf(db.query).toEqualTypeOf<(id: number) => string>();
      return { query: db.query };
    },
  });
  expectTypeOf(database).toEqualTypeOf<
    ContextProvider<{ query: (id: number) => string }>
  >();
  const ctx = toolContext({ context: [services, database] });
  expectTypeOf(services.use(ctx)).toEqualTypeOf<
    Promise<{ query: (id: number) => string }>
  >();
  expect((await services.use(ctx)).query(7)).toBe("7");
  expect(database["~toolgrain"]()).toBe("context@1");
});

it("snapshots definitions and registrations and preserves opaque identity in overrides", async () => {
  const original = vi.fn(() => "original");
  const options = { name: "database", resolve: original };
  const database = createContext(options);
  options.name = "changed";
  options.resolve = vi.fn(() => "changed");
  const override = database.provide(() => "override");
  const providers = [override];
  const ctx = toolContext({ context: providers });
  providers.splice(0, 1, database);
  expect(database.name).toBe("database");
  expect(override.name).toBe(database.name);
  expect(override.use).toBe(database.use);
  expect(Object.isFrozen(database)).toBe(true);
  expect(Object.isFrozen(override)).toBe(true);
  expect(Object.keys(database)).not.toContain("~toolgrain");
  expect(Object.isFrozen(ctx)).toBe(true);
  expect(await database.use(ctx)).toBe("override");
  expect(original).not.toHaveBeenCalled();
  expect(await database.use(toolContext({ context: [database] }))).toBe(
    "original",
  );
});

it("validates definitions, overrides, raw registrations, and duplicate bindings eagerly", () => {
  for (const options of [
    null,
    {},
    { name: 2, resolve() {} },
    { name: " ", resolve() {} },
    { name: "db", resolve: 2 },
  ])
    expect(() => createContext(options as never)).toThrow(TypeError);
  const database = createContext({ name: "database", resolve: () => 1 });
  expect(() => database.provide(null as never)).toThrow("resolver function");
  for (const context of [
    null,
    {},
    [null],
    [2],
    [{}],
    [Object.create(database)],
    [{ ...database }],
    [database, database],
    [database, database.provide(() => 2)],
  ]) {
    expect(() => toolContext({ context: context as never })).toThrow(TypeError);
    expect(() =>
      createServer({
        name: "invalid",
        version: "1",
        tools: {},
        context: context as never,
      }),
    ).toThrow(TypeError);
  }
  // Names label errors; distinct definitions with the same name remain independent.
  const other = createContext({ name: "database", resolve: () => 2 });
  expect(() => toolContext({ context: [database, other] })).not.toThrow();
});

it("recognizes providers and context views across compatible package copies", async () => {
  vi.resetModules();
  const copy: typeof import("../../src/index.js") = await import(
    "../../src/index.js"
  );
  expect(copy.createContext).not.toBe(createContext);
  const database = createContext({ name: "db", resolve: () => ({ count: 1 }) });
  const services = copy.createContext({
    name: "services",
    async resolve(ctx) {
      return (await database.use(ctx)).count;
    },
  });
  const override = services.provide(
    async (ctx) => (await database.use(ctx)).count + 1,
  );
  expect(
    await services.use(toolContext({ context: [override, database] })),
  ).toBe(2);
  expect(
    await services.use(copy.toolContext({ context: [services, database] })),
  ).toBe(1);
});

function rejectedDefinitions() {
  const database = createContext({
    name: "database",
    resolve: () => ({ count: 1 }),
  });
  database.provide(async () => ({ count: 2 }));
  // @ts-expect-error Overrides preserve the original inferred type.
  database.provide(() => ({ count: "bad" }));
  // @ts-expect-error Overrides must return the entire value contract.
  database.provide(() => ({}));
  createContext({
    name: "wrong",
    // @ts-expect-error Factories receive a non-generic ToolContext.
    resolve: (ctx: { extra: string }) => ctx.extra,
  });
  // @ts-expect-error Context registrations reject raw definitions.
  toolContext({ context: [{ name: "raw", resolve: () => 1 }] });
  createServer({
    name: "test",
    version: "1",
    tools: {},
    // @ts-expect-error Spreading a definition loses its opaque brand.
    context: [{ ...database }],
  });
  // @ts-expect-error Accessors always return promises.
  const immediate: { count: number } = database.use(toolContext());
  void immediate;
  // @ts-expect-error Widening must not permit incompatible overrides of the original identity.
  const widened: ContextProvider<unknown> = database;
  void widened;
}
void rejectedDefinitions;
