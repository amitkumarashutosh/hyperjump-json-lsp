import { describe, it, expect } from "vitest";
import {
  walkSchema,
  getSchemaProperties,
  getPropertySchema,
  isRequired,
} from "../src/json/schemaWalker.js";

const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Full name" },
    age: { type: "number" },
    address: {
      type: "object",
      properties: {
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["city"],
    },
  },
  required: ["name"],
};

describe("walkSchema", () => {
  it("returns root schema for empty path", () => {
    const result = walkSchema(schema, []);
    expect(result).toBe(schema);
  });

  it("returns property schema for single segment", () => {
    const result = walkSchema(schema, ["name"]);
    expect(result).toEqual({ type: "string", description: "Full name" });
  });

  it("returns nested property schema", () => {
    const result = walkSchema(schema, ["address", "city"]);
    expect(result).toEqual({ type: "string" });
  });

  it("returns undefined for unknown property", () => {
    const result = walkSchema(schema, ["unknown"]);
    expect(result).toBeUndefined();
  });

  it("returns undefined for path too deep", () => {
    const result = walkSchema(schema, ["name", "deep"]);
    expect(result).toBeUndefined();
  });
});

describe("getSchemaProperties", () => {
  it("returns all property names", () => {
    const props = getSchemaProperties(schema);
    expect(props).toContain("name");
    expect(props).toContain("age");
    expect(props).toContain("address");
  });

  it("returns empty array when no properties", () => {
    const props = getSchemaProperties({ type: "string" });
    expect(props).toEqual([]);
  });
});

describe("isRequired", () => {
  it("returns true for required property", () => {
    expect(isRequired(schema, "name")).toBe(true);
  });

  it("returns false for optional property", () => {
    expect(isRequired(schema, "age")).toBe(false);
  });

  it("returns true for nested required property", () => {
    const addressSchema = getPropertySchema(schema, "address")!;
    expect(isRequired(addressSchema, "city")).toBe(true);
  });
});
