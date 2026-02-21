import { describe, it, expect } from "vitest";
import {
  resolveRef,
  isRef,
  resolveSchema,
  resolveDynamicRef,
  buildIdIndex,
} from "../src/json/refResolver.js";
import { walkSchema } from "../src/json/schemaWalker.js";
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
    expect(() => resolveSchema(circular, circular)).not.toThrow();
  });
});

describe("walkSchema with $ref", () => {
  it("resolves $ref when walking into properties", () => {
    const result = walkSchema(rootSchema, ["address", "city"], rootSchema);
    expect(result).toEqual({ type: "string" });
  });

  it("returns property schema through ref", () => {
    const result = walkSchema(rootSchema, ["address"], rootSchema);
    expect(result?.type).toBe("object");
    expect(result?.properties).toHaveProperty("street");
  });
});

describe("resolveDynamicRef", () => {
  it("resolves $dynamicRef by anchor name", () => {
    const schema: RawSchema = {
      $defs: {
        items: {
          $dynamicAnchor: "items",
          type: "string",
        },
      },
    };

    const result = resolveDynamicRef("#items", schema);
    expect(result?.type).toBe("string");
    expect(result?.$dynamicAnchor).toBe("items");
  });

  it("returns undefined for unknown anchor", () => {
    const schema: RawSchema = { type: "object" };
    const result = resolveDynamicRef("#unknown", schema);
    expect(result).toBeUndefined();
  });
});

describe("buildIdIndex", () => {
  it("indexes schemas by $id", () => {
    const schema: RawSchema = {
      $id: "https://example.com/root",
      definitions: {
        Address: {
          $id: "https://example.com/address",
          type: "object",
        },
      },
    };

    const index = buildIdIndex(schema);
    expect(index.has("https://example.com/root")).toBe(true);
    expect(index.has("https://example.com/address")).toBe(true);
  });
});

describe("resolveSchema with $dynamicRef", () => {
  it("resolves $dynamicRef chains", () => {
    const schema: RawSchema = {
      $dynamicRef: "#items",
      $defs: {
        items: {
          $dynamicAnchor: "items",
          type: "array",
        },
      },
    };

    const result = resolveSchema(schema, schema);
    expect(result?.type).toBe("array");
  });
});
