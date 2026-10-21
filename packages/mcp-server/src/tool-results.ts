import { BridgeCommandError } from "./bridge-client";
export const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent:
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : { value },
});

export const toolError = (error: unknown) => {
  const detail = error instanceof BridgeCommandError
    ? { code: error.code, message: error.message, details: error.details }
    : { code: "TOOL_FAILED", message: error instanceof Error ? error.message : String(error) };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(detail) }], structuredContent: { ok: false, error: detail } };
};
