import { describe, it, expect } from "vitest";
import {
  detectDraft,
  detectDraftFromUri,
  getMetaSchemaUri,
  supportsDynamicRef,
  usesNewDefs,
} from "../src/json/draftDetector.js";

describe("detectDraft", () => {
  it("detects draft-04", () => {
    expect(
      detectDraft({
        $schema: "http://json-schema.org/draft-04/schema#",
      }),
    ).toBe("draft-04");
  });

  it("detects draft-06", () => {
    expect(
      detectDraft({
        $schema: "http://json-schema.org/draft-06/schema#",
      }),
    ).toBe("draft-06");
  });

  it("detects draft-07", () => {
    expect(
      detectDraft({
        $schema: "http://json-schema.org/draft-07/schema#",
      }),
    ).toBe("draft-07");
  });

  it("detects draft-2019-09", () => {
    expect(
      detectDraft({
        $schema: "https://json-schema.org/draft/2019-09/schema",
      }),
    ).toBe("draft-2019-09");
  });

  it("detects draft-2020-12", () => {
    expect(
      detectDraft({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      }),
    ).toBe("draft-2020-12");
  });

  it("defaults to draft-07 for unknown schema", () => {
    expect(detectDraft({ $schema: "https://unknown.com/schema" })).toBe(
      "draft-07",
    );
  });

  it("defaults to draft-07 when no $schema", () => {
    expect(detectDraft({ type: "object" })).toBe("draft-07");
  });
});

describe("detectDraftFromUri", () => {
  it("detects draft from URI string", () => {
    expect(detectDraftFromUri("http://json-schema.org/draft-04/schema#")).toBe(
      "draft-04",
    );
  });

  it("defaults to draft-07 for unknown URI", () => {
    expect(detectDraftFromUri("https://example.com/schema")).toBe("draft-07");
  });
});

describe("getMetaSchemaUri", () => {
  it("returns correct URI for each draft", () => {
    expect(getMetaSchemaUri("draft-04")).toContain("draft-04");
    expect(getMetaSchemaUri("draft-07")).toContain("draft-07");
    expect(getMetaSchemaUri("draft-2020-12")).toContain("2020-12");
  });
});

describe("supportsDynamicRef", () => {
  it("returns true only for draft-2020-12", () => {
    expect(supportsDynamicRef("draft-2020-12")).toBe(true);
    expect(supportsDynamicRef("draft-07")).toBe(false);
    expect(supportsDynamicRef("draft-04")).toBe(false);
  });
});

describe("usesNewDefs", () => {
  it("returns true for draft-2019-09 and draft-2020-12", () => {
    expect(usesNewDefs("draft-2019-09")).toBe(true);
    expect(usesNewDefs("draft-2020-12")).toBe(true);
    expect(usesNewDefs("draft-07")).toBe(false);
    expect(usesNewDefs("draft-04")).toBe(false);
  });
});
