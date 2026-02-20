import { describe, it, expect } from "vitest";
import { resolveRef, isRef, resolveSchema } from "../src/json/refResolver.js";
import { RawSchema } from "../src/json/schemaWalker.js";

const rootSchema: RawSchema = {
  type: "object",
  properties: {
    address: { $ref: "#/definitions/Address" },
    contact: { $ref: "#/definitions/Contact" },
  },
  definitions: {
    Address: {
      type: "object",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
      },
      required: ["city"],
    },
    Contact: {
      type: "object",
      properties: {
        email: { type: "string" },
        phone: { $ref: "#/definitions/Phone" },
      },
    },
    Phone: {
      type: "string",
      pattern: "^\\+?[0-9]{10,15}$",
    },
  },
};

describe("resolveRef", () => {
  it("resolves a simple definition ref", () => {
    const result = resolveRef("#/definitions/Address", rootSchema);
    expect(result?.type).toBe("object");
    expect(result?.properties).toHaveProperty("street");
  });

  it("resolves root ref", () => {
    const result = resolveRef("#", rootSchema);
    expect(result).toBe(rootSchema);
  });

  it("returns undefined for external refs", () => {
    const result = resolveRef("other.json#/foo", rootSchema);
    expect(result).toBeUndefined();
  });

  it("returns undefined for unknown path", () => {
    const result = resolveRef("#/definitions/Unknown", rootSchema);
    expect(result).toBeUndefined();
  });

  it("handles nested path", () => {
    const result = resolveRef(
      "#/definitions/Address/properties/city",
      rootSchema,
    );
    expect(result).toEqual({ type: "string" });
  });
});

describe("isRef", () => {
  it("returns true for schema with $ref", () => {
    expect(isRef({ $ref: "#/definitions/Foo" })).toBe(true);
  });

  it("returns false for schema without $ref", () => {
    expect(isRef({ type: "string" })).toBe(false);
  });
});

describe("resolveSchema", () => {
  it("returns schema as-is if not a ref", () => {
    const schema: RawSchema = { type: "string" };
    expect(resolveSchema(schema, rootSchema)).toBe(schema);
  });

  it("resolves a $ref to its target", () => {
    const schema: RawSchema = { $ref: "#/definitions/Address" };
    const result = resolveSchema(schema, rootSchema);
    expect(result?.type).toBe("object");
    expect(result?.properties).toHaveProperty("city");
  });

  it("resolves nested $ref chains", () => {
    const schema: RawSchema = { $ref: "#/definitions/Contact" };
    const result = resolveSchema(schema, rootSchema);
    expect(result?.properties).toHaveProperty("phone");
  });

  it("handles circular refs without infinite loop", () => {
    const circular: RawSchema = {
      definitions: {
        A: { $ref: "#/definitions/B" },
        B: { $ref: "#/definitions/A" },
      },
      $ref: "#/definitions/A",
    };
    // Should not throw or hang
    expect(() => resolveSchema(circular, circular)).not.toThrow();
  });
});

describe("walkSchema with $ref", () => {
  it("resolves $ref when walking into properties", async () => {
    const { walkSchema } = await import("../src/json/schemaWalker.js");

    const result = walkSchema(rootSchema, ["address", "city"], rootSchema);
    expect(result).toEqual({ type: "string" });
  });

  it("returns property schema through ref", async () => {
    const { walkSchema } = await import("../src/json/schemaWalker.js");

    const result = walkSchema(rootSchema, ["address"], rootSchema);
    expect(result?.type).toBe("object");
    expect(result?.properties).toHaveProperty("street");
  });
});
