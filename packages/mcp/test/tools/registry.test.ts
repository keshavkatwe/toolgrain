import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { toolContext } from "../../src/tools/context.js";
import { tool } from "../../src/tools/definition.js";
import { ToolInputError, UnknownToolError } from "../../src/tools/errors.js";
import { createRegistry } from "../../src/tools/registry.js";

const ctx = toolContext();

describe("tool execution", () => {
  it("parses inputs and applies defaults and transforms", async () => {
    const execute = vi.fn((input: { count: number }) => input.count);
    const count = tool({
      input: z.object({ count: z.string().default("12").transform(Number) }),
      execute,
    });
    const registry = createRegistry({ count });
    expect(await registry.execute("count", {}, ctx)).toBe(12);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ count: 12 }, ctx);
  });

  it("supports async refinements and rejects invalid inputs before executing", async () => {
    const execute = vi.fn((value: string) => value);
    const registry = createRegistry({
      checked: tool({
        input: z.string().refine(async (value) => value === "ok"),
        execute,
      }),
    });
    const error = await registry
      .execute("checked", "bad", ctx)
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ToolInputError);
    if (!(error instanceof ToolInputError))
      throw new Error("Expected input error");
    expect(error.toolName).toBe("checked");
    expect(error.cause).toBeInstanceOf(z.ZodError);
    expect(error.issues).toBe((error.cause as z.ZodError).issues);
    expect(execute).not.toHaveBeenCalled();
    expect(await registry.execute("checked", "ok", ctx)).toBe("ok");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("preserves sync and async values and handler failures", async () => {
    const value = { timestamp: "2026-10-18T00:00:00.000Z" };
    const failure = new Error("handler failed");
    const registry = createRegistry({
      sync: tool({ input: z.unknown(), execute: () => value }),
      async: tool({ input: z.unknown(), execute: async () => value }),
      throws: tool({
        input: z.unknown(),
        execute: () => {
          throw failure;
        },
      }),
      rejects: tool({
        input: z.unknown(),
        execute: async () => {
          throw failure;
        },
      }),
    });
    expect(await registry.execute("sync", null, ctx)).toBe(value);
    expect(await registry.execute("async", null, ctx)).toBe(value);
    await expect(registry.execute("throws", null, ctx)).rejects.toBe(failure);
    await expect(registry.execute("rejects", null, ctx)).rejects.toBe(failure);
  });
});

describe("registry", () => {
  const definition = tool({
    description: "Echo",
    input: z.string(),
    execute: (value) => value,
  });

  it("captures definitions, lists fresh metadata, and permits reuse", async () => {
    const tools = {
      first: definition,
      second: tool({ input: z.number(), execute: (value) => value }),
    };
    const registry = createRegistry(tools);
    const list = registry.list();
    expect(list.map((entry) => entry.name)).toEqual(["first", "second"]);
    expect(list[0]).toEqual({
      name: "first",
      description: "Echo",
      input: definition.input,
    });
    expect(list[1]).not.toHaveProperty("description");
    list.splice(0);
    expect(registry.list()).toHaveLength(2);
    tools.first = tool({ input: z.string(), execute: () => "changed" });
    expect(await registry.execute("first", "original", ctx)).toBe("original");
    expect(
      await createRegistry({ alias: definition }).execute(
        "alias",
        "reused",
        ctx,
      ),
    ).toBe("reused");
  });

  it("uses own registrations, including inherited-property names", async () => {
    const registry = createRegistry({
      toString: definition,
      constructor: definition,
      ["__proto__"]: definition,
    });
    for (const name of ["toString", "constructor", "__proto__"]) {
      expect(await registry.execute(name, "ok", ctx)).toBe("ok");
    }
    await expect(
      createRegistry({}).execute("toString", null, ctx),
    ).rejects.toBeInstanceOf(UnknownToolError);
    const inherited = Object.create({ hidden: definition }) as {
      visible: typeof definition;
    };
    inherited.visible = definition;
    expect(
      createRegistry(inherited)
        .list()
        .map((entry) => entry.name),
    ).toEqual(["visible"]);
  });

  it("rejects unknown names and handles an empty registry", async () => {
    const registry = createRegistry({});
    expect(registry.list()).toEqual([]);
    const error = await registry
      .execute("missing", {}, ctx)
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(UnknownToolError);
    expect(error).toMatchObject({ toolName: "missing" });
  });

  it("uses unknown internal results and preserves tool inference", () => {
    const number = tool({ input: z.number(), execute: async (value) => value });
    const registry = createRegistry({
      text: definition,
      number,
    });
    expectTypeOf(registry.execute("text", "hi", ctx)).toEqualTypeOf<
      Promise<unknown>
    >();
    expectTypeOf(registry.execute("number", 1, ctx)).toEqualTypeOf<
      Promise<unknown>
    >();
    const name: string = "text";
    expectTypeOf(registry.execute(name, "hi", ctx)).toEqualTypeOf<
      Promise<unknown>
    >();
    expectTypeOf(definition.execute("hi", ctx)).toEqualTypeOf<string>();
    expectTypeOf(number.execute(1, ctx)).toEqualTypeOf<Promise<number>>();
    tool({
      input: z.string(),
      execute(value) {
        expectTypeOf(value).toEqualTypeOf<string>();
        return value;
      },
    });
    // @ts-expect-error The handler must accept the schema's parsed string output.
    tool({ input: z.string(), execute: (value: number) => value });
  });
});
