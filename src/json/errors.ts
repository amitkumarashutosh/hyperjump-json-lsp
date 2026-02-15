import { ParseError, ParseErrorCode } from "jsonc-parser";

export interface NormalizedError {
  offset: number;
  length: number;
  message: string;
}

export function normalizeErrors(errors: ParseError[]): NormalizedError[] {
  const result: NormalizedError[] = [];

  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (!err) break;

    const next = errors[i + 1];

    // Detect trailing comma pattern:
    // PropertyNameExpected followed by ValueExpected at same offset
    if (
      err.error === ParseErrorCode.PropertyNameExpected &&
      next &&
      next.error === ParseErrorCode.ValueExpected &&
      next.offset === err.offset
    ) {
      result.push({
        offset: err.offset,
        length: err.length,
        message: "Trailing comma not allowed",
      });

      i++; // skip the paired error
      continue;
    }

    // Default fallback messages
    result.push({
      offset: err.offset,
      length: err.length,
      message: defaultMessage(err.error),
    });
  }

  return result;
}

function defaultMessage(code: ParseErrorCode): string {
  switch (code) {
    case ParseErrorCode.InvalidSymbol:
      return "Invalid JSON symbol";

    case ParseErrorCode.ValueExpected:
      return "Value expected";

    case ParseErrorCode.PropertyNameExpected:
      return "Property name expected";

    case ParseErrorCode.ColonExpected:
      return "Colon expected";

    case ParseErrorCode.CommaExpected:
      return "Comma expected";

    case ParseErrorCode.CloseBraceExpected:
      return "Closing brace expected";

    case ParseErrorCode.CloseBracketExpected:
      return "Closing bracket expected";

    case ParseErrorCode.EndOfFileExpected:
      return "Unexpected content after document end";

    default:
      return "Invalid JSON";
  }
}
