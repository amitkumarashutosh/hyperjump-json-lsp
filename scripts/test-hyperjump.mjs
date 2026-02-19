import * as Schema from "@hyperjump/json-schema/draft-07";
import { BASIC } from "/Users/amitashutosh/Desktop/hyperjump-json-lsp-claude/node_modules/@hyperjump/json-schema/lib/core.js";

Schema.addSchema({
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: { type: "string" },
    age:  { type: "number" },
  },
  required: ["name"],
}, "https://example.com/test.schema.json");

// Test 1: missing required
const out1 = await Schema.validate(
  "https://example.com/test.schema.json",
  { age: 25 },
  BASIC
);
console.log("=== MISSING REQUIRED ===");
console.log(JSON.stringify(out1, null, 2));

// Test 2: wrong type
const out2 = await Schema.validate(
  "https://example.com/test.schema.json",
  { name: 123, age: 25 },
  BASIC
);
console.log("=== WRONG TYPE ===");
console.log(JSON.stringify(out2, null, 2));

// Test 3: nested object
Schema.addSchema({
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    user: {
      type: "object",
      properties: {
        name: { type: "string" },
        age:  { type: "number" },
      },
      required: ["name"],
    }
  },
}, "https://example.com/test2.schema.json");

const out3 = await Schema.validate(
  "https://example.com/test2.schema.json",
  { user: { age: 25 } },
  BASIC
);
console.log("=== NESTED MISSING REQUIRED ===");
console.log(JSON.stringify(out3, null, 2));