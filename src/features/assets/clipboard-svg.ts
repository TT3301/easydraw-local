const SVG_CODE_FENCE = /^```(?:svg|xml)?\s*([\s\S]*?)\s*```$/i;

export const extractClipboardSvg = (clipboardText: string) => {
  let candidate = clipboardText.trim();
  if (!candidate) return null;

  const fenced = candidate.match(SVG_CODE_FENCE);
  if (fenced) candidate = (fenced[1] ?? "").trim();

  candidate = candidate
    .replace(/^<\?xml[^?]*\?>\s*/i, "")
    .replace(/^(?:<!--[\s\S]*?-->\s*)*/, "")
    .trim();

  if (!/^<svg(?:\s|>)/i.test(candidate)) return null;
  if (!/<\/svg>\s*$/i.test(candidate)) return null;
  return candidate;
};
