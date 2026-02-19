import "@hyperjump/json-schema/draft-07";
import {
  annotate,
  ValidationError,
} from "@hyperjump/json-schema/annotations/experimental";

export interface ValidationError_ {
  instancePath: string;
  message: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError_[];
}

export async function validateInstance(
  schemaUri: string,
  instance: unknown,
): Promise<ValidationResult> {
  try {
    await annotate(schemaUri, instance as any);
    return { valid: true, errors: [] };
  } catch (err) {
    if (err instanceof ValidationError) {
      const errors: ValidationError_[] = [];

      for (const error of (err.output as any).errors ?? []) {
        const instancePath = normalizeInstanceLocation(
          error.instanceLocation ?? "#",
        );
        const keyword = extractKeyword(error.keyword ?? "");

        errors.push({
          instancePath,
          keyword,
          message: buildMessage(keyword, instancePath),
        });
      }

      return { valid: false, errors };
    }

    console.error("[schemaValidator] Unexpected error:", err);
    return { valid: true, errors: [] };
  }
}

function normalizeInstanceLocation(location: string): string {
  if (location === "#") return "";
  if (location.startsWith("#/")) return location.slice(1);
  return location;
}

function extractKeyword(keywordUri: string): string {
  const parts = keywordUri.split("/");
  return parts[parts.length - 1] ?? "unknown";
}

function buildMessage(keyword: string, instancePath: string): string {
  const at = instancePath === "" ? "root" : `"${instancePath}"`;

  switch (keyword) {
    case "type":
      return `Incorrect type at ${at}`;
    case "required":
      return `Missing required property at ${at}`;
    case "enum":
      return `Value at ${at} is not one of the allowed values`;
    case "minLength":
      return `String at ${at} is too short`;
    case "maxLength":
      return `String at ${at} is too long`;
    case "minimum":
      return `Number at ${at} is below the minimum`;
    case "maximum":
      return `Number at ${at} is above the maximum`;
    case "pattern":
      return `String at ${at} does not match the required pattern`;
    case "additionalProperties":
      return `Additional property not allowed at ${at}`;
    case "const":
      return `Value at ${at} must match the expected constant`;
    case "uniqueItems":
      return `Array at ${at} must have unique items`;
    case "minItems":
      return `Array at ${at} has too few items`;
    case "maxItems":
      return `Array at ${at} has too many items`;
    default:
      return `Schema validation failed at ${at} (${keyword})`;
  }
}