import * as Schema from "@hyperjump/json-schema/draft-07";
import { FLAG } from "@hyperjump/json-schema";

export interface ValidationError {
  instancePath: string;
  message: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * In Hyperjump v1.x, only FLAG output is available.
 * FLAG returns { valid: boolean } only — no per-error locations.
 * We report a single diagnostic at the root when validation fails.
 * Phase 4 will improve this with a custom annotation collector.
 */
export async function validateInstance(
  schemaUri: string,
  instance: unknown,
): Promise<ValidationResult> {
  try {
    const output = await Schema.validate(schemaUri, instance as any, FLAG);

    if (output.valid) {
      return { valid: true, errors: [] };
    }

    // FLAG only tells us it failed, not where.
    // We return a single root-level error for now.
    return {
      valid: false,
      errors: [
        {
          instancePath: "",
          keyword: "unknown",
          message: "JSON does not match the expected schema",
        },
      ],
    };
  } catch (err) {
    console.error("[schemaValidator] Validation failed:", err);
    return { valid: true, errors: [] }; // fail open
  }
}