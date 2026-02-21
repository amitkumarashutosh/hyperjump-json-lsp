import { RawSchema } from "./schemaWalker.js";

export type JsonSchemaDraft =
  | "draft-04"
  | "draft-06"
  | "draft-07"
  | "draft-2019-09"
  | "draft-2020-12"
  | "unknown";

/**
 * Map of $schema URI patterns to draft versions.
 * Order matters — more specific patterns first.
 */
const DRAFT_MAP: Array<{ pattern: RegExp; draft: JsonSchemaDraft }> = [
  {
    pattern: /json-schema\.org\/draft\/2020-12/,
    draft: "draft-2020-12",
  },
  {
    pattern: /json-schema\.org\/draft\/2019-09/,
    draft: "draft-2019-09",
  },
  {
    pattern: /json-schema\.org\/draft-07/,
    draft: "draft-07",
  },
  {
    pattern: /json-schema\.org\/draft-06/,
    draft: "draft-06",
  },
  {
    pattern: /json-schema\.org\/draft-04/,
    draft: "draft-04",
  },
];

/**
 * Detect the JSON Schema draft from a schema's $schema keyword.
 * Returns "draft-07" as default if not determinable.
 */
export function detectDraft(schema: RawSchema): JsonSchemaDraft {
  const schemaUri = schema["$schema"];

  if (typeof schemaUri !== "string") return "draft-07";

  for (const { pattern, draft } of DRAFT_MAP) {
    if (pattern.test(schemaUri)) return draft;
  }

  return "draft-07"; // safe default
}

/**
 * Detect draft from a raw $schema URI string.
 */
export function detectDraftFromUri(schemaUri: string): JsonSchemaDraft {
  for (const { pattern, draft } of DRAFT_MAP) {
    if (pattern.test(schemaUri)) return draft;
  }
  return "draft-07";
}

/**
 * Get the canonical meta-schema URI for a given draft.
 */
export function getMetaSchemaUri(draft: JsonSchemaDraft): string {
  switch (draft) {
    case "draft-04":
      return "http://json-schema.org/draft-04/schema#";
    case "draft-06":
      return "http://json-schema.org/draft-06/schema#";
    case "draft-07":
      return "http://json-schema.org/draft-07/schema#";
    case "draft-2019-09":
      return "https://json-schema.org/draft/2019-09/schema";
    case "draft-2020-12":
      return "https://json-schema.org/draft/2020-12/schema";
    default:
      return "http://json-schema.org/draft-07/schema#";
  }
}

/**
 * Check if a draft supports $dynamicRef.
 * Only draft-2020-12 supports it.
 */
export function supportsDynamicRef(draft: JsonSchemaDraft): boolean {
  return draft === "draft-2020-12";
}

/**
 * Check if a draft uses $defs vs definitions.
 * draft-2019-09 and draft-2020-12 use $defs.
 * Earlier drafts use definitions.
 */
export function usesNewDefs(draft: JsonSchemaDraft): boolean {
  return draft === "draft-2019-09" || draft === "draft-2020-12";
}
