import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  createRegistry,
  ToolInputError,
  tool,
  UnknownToolError,
} from "../src/index.js";

describe("tool execution", () => {
  it("infers parsed inputs and applies defaults and transforms", async () => {
    const execute = vi.fn((input: { count: number }) => input.count);
    const count = tool({
      input: z.object({ count: z.string().default("12").transform(Number) }),
      execute,
    });
    const registry = createRegistry({ count });
    expect(await registry.execute("count", {})).toBe(12);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ count: 12 });
    expectTypeOf(registry.execute("count", {})).toEqualTypeOf<
      Promise<number>
    >();
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
      .execute("checked", "bad")
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ToolInputError);
    if (!(error instanceof ToolInputError))
      throw new Error("Expected input error");
    expect(error.toolName).toBe("checked");
    expect(error.cause).toBeInstanceOf(z.ZodError);
    expect(error.issues).toBe((error.cause as z.ZodError).issues);
    expect(execute).not.toHaveBeenCalled();
    expect(await registry.execute("checked", "ok")).toBe("ok");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("preserves sync and async values and handler failures", async () => {
    const value = new Date();
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
    expect(await registry.execute("sync", null)).toBe(value);
    expect(await registry.execute("async", null)).toBe(value);
    await expect(registry.execute("throws", null)).rejects.toBe(failure);
    await expect(registry.execute("rejects", null)).rejects.toBe(failure);
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
    expect(await registry.execute("first", "original")).toBe("original");
    expect(
      await createRegistry({ alias: definition }).execute("alias", "reused"),
    ).toBe("reused");
  });

  it("uses own registrations, including inherited-property names", async () => {
    const registry = createRegistry({
      toString: definition,
      constructor: definition,
      ["__proto__"]: definition,
    });
    for (const name of ["toString", "constructor", "__proto__"]) {
      expect(await registry.execute(name, "ok")).toBe("ok");
    }
    await expect(
      createRegistry({}).execute("toString", null),
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
      .execute("missing", {})
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(UnknownToolError);
    expect(error).toMatchObject({ toolName: "missing" });
  });

  it("infers per-name and dynamic outputs and rejects invalid handlers", () => {
    const registry = createRegistry({
      text: definition,
      number: tool({ input: z.number(), execute: async (value) => value }),
    });
    expectTypeOf(registry.execute("text", "hi")).toEqualTypeOf<
      Promise<string>
    >();
    expectTypeOf(registry.execute("number", 1)).toEqualTypeOf<
      Promise<number>
    >();
    const name: string = "text";
    expectTypeOf(registry.execute(name, "hi")).toEqualTypeOf<
      Promise<string | number>
    >();
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
