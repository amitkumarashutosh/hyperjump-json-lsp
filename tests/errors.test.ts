import { describe, it, expect } from "vitest";
import { normalizeErrors } from "../src/json/errors.js";
import { ParseErrorCode } from "jsonc-parser";

describe("normalizeErrors", () => {
  it("returns empty array for no errors", () => {
    expect(normalizeErrors([])).toEqual([]);
  });

  it("normalizes a single error", () => {
    const errors = [
      { error: ParseErrorCode.ValueExpected, offset: 5, length: 1 },
    ];
    const result = normalizeErrors(errors);
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe("Value expected");
    expect(result[0]?.offset).toBe(5);
  });

  it("detects trailing comma pattern", () => {
    const errors = [
      { error: ParseErrorCode.PropertyNameExpected, offset: 10, length: 1 },
      { error: ParseErrorCode.ValueExpected, offset: 10, length: 1 },
    ];
    const result = normalizeErrors(errors);
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe("Trailing comma not allowed");
  });

  it("handles ColonExpected error", () => {
    const errors = [
      { error: ParseErrorCode.ColonExpected, offset: 3, length: 1 },
    ];
    const result = normalizeErrors(errors);
    expect(result[0]?.message).toBe("Colon expected");
  });

  it("handles multiple independent errors", () => {
    const errors = [
      { error: ParseErrorCode.ColonExpected, offset: 3, length: 1 },
      { error: ParseErrorCode.ValueExpected, offset: 10, length: 1 },
    ];
    const result = normalizeErrors(errors);
    expect(result).toHaveLength(2);
  });
});
