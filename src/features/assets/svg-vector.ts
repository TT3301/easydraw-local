import { DOMParser } from "@xmldom/xmldom";

import type { SvgVectorData, SvgVectorPath } from "../../core/protocol";

type Matrix = [number, number, number, number, number, number];

interface PathPresentation {
  fill: string;
  stroke: string;
  strokeWidth: number;
  lineCap: SvgVectorPath["lineCap"];
  lineJoin: SvgVectorPath["lineJoin"];
  miterLimit: number;
  fillRule: SvgVectorPath["fillRule"];
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  transform: Matrix;
}

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

const DEFAULT_PRESENTATION: PathPresentation = {
  fill: "black",
  stroke: "none",
  strokeWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 4,
  fillRule: "nonzero",
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  transform: IDENTITY_MATRIX,
};

const SAFE_ELEMENTS = new Map<string, string>([
  ["g", "g"],
  ["path", "path"],
  ["rect", "rect"],
  ["circle", "circle"],
  ["ellipse", "ellipse"],
  ["line", "line"],
  ["polyline", "polyline"],
  ["polygon", "polygon"],
  ["defs", "defs"],
  ["clippath", "clipPath"],
  ["mask", "mask"],
  ["lineargradient", "linearGradient"],
  ["radialgradient", "radialGradient"],
  ["stop", "stop"],
  ["symbol", "symbol"],
  ["use", "use"],
]);

const SAFE_ATTRIBUTES = new Set([
  "d",
  "points",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "transform",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "fill-rule",
  "clip-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "vector-effect",
  "paint-order",
  "id",
  "clip-path",
  "mask",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "offset",
  "stop-color",
  "stop-opacity",
  "href",
  "xlink:href",
  "preserveaspectratio",
]);

const SAFE_STYLE_PROPERTIES = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "fill-rule",
  "clip-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "vector-effect",
  "paint-order",
  "stop-color",
  "stop-opacity",
]);

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const isSafePaintReference = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return !normalized.includes("javascript:") &&
    (!normalized.includes("url(") || /^url\(\s*#[^)]+\s*\)$/i.test(normalized));
};

const sanitizeStyle = (style: string) =>
  style
    .split(";")
    .flatMap((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return [];
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (!SAFE_STYLE_PROPERTIES.has(property) || !value) return [];
      if (!isSafePaintReference(value)) return [];
      return [`${property}:${value}`];
    })
    .join(";");

const sanitizeAttributes = (element: Element) => {
  const attributes: string[] = [];
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index);
    if (!attribute) continue;
    const name = attribute.name.toLowerCase();
    if (name === "style") {
      const style = sanitizeStyle(attribute.value);
      if (style) attributes.push(`style="${escapeXml(style)}"`);
      continue;
    }
    if (!SAFE_ATTRIBUTES.has(name)) continue;
    const value = attribute.value.trim();
    if (!value || !isSafePaintReference(value)) continue;
    if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) {
      continue;
    }
    attributes.push(`${attribute.name}="${escapeXml(value)}"`);
  }
  return attributes.join(" ");
};

const sanitizeNode = (node: Node): string => {
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  const safeTag = SAFE_ELEMENTS.get(element.tagName.toLowerCase());
  if (!safeTag) return "";
  const attributes = sanitizeAttributes(element);
  let children = "";
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index);
    if (child) children += sanitizeNode(child as unknown as Node);
  }
  const open = attributes ? `<${safeTag} ${attributes}>` : `<${safeTag}>`;
  return `${open}${children}</${safeTag}>`;
};

const parseLength = (value: string | null) => {
  if (!value) return null;
  const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseViewBox = (svg: Element): [number, number, number, number] => {
  const values = (svg.getAttribute("viewBox") ?? svg.getAttribute("viewbox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    values.length === 4 &&
    values.every(Number.isFinite) &&
    values[2]! > 0 &&
    values[3]! > 0
  ) {
    return [values[0]!, values[1]!, values[2]!, values[3]!];
  }
  return [
    0,
    0,
    parseLength(svg.getAttribute("width")) ?? 24,
    parseLength(svg.getAttribute("height")) ?? 24,
  ];
};

const multiplyMatrix = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];

const transformNumbers = (value: string) =>
  value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);

const parseTransform = (value: string | null): Matrix => {
  if (!value) return IDENTITY_MATRIX;
  const expression = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let result: Matrix = IDENTITY_MATRIX;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value))) {
    const values = transformNumbers(match[2] ?? "");
    if (values.some((number) => !Number.isFinite(number))) continue;
    let next: Matrix | null = null;
    switch (match[1]?.toLowerCase()) {
      case "matrix":
        if (values.length === 6) next = values as Matrix;
        break;
      case "translate":
        if (values.length >= 1) {
          next = [1, 0, 0, 1, values[0]!, values[1] ?? 0];
        }
        break;
      case "scale":
        if (values.length >= 1) {
          next = [values[0]!, 0, 0, values[1] ?? values[0]!, 0, 0];
        }
        break;
      case "rotate":
        if (values.length >= 1) {
          const radians = (values[0]! * Math.PI) / 180;
          const cosine = Math.cos(radians);
          const sine = Math.sin(radians);
          const rotation: Matrix = [cosine, sine, -sine, cosine, 0, 0];
          if (values.length >= 3) {
            const toCenter: Matrix = [1, 0, 0, 1, values[1]!, values[2]!];
            const fromCenter: Matrix = [1, 0, 0, 1, -values[1]!, -values[2]!];
            next = multiplyMatrix(
              multiplyMatrix(toCenter, rotation),
              fromCenter,
            );
          } else {
            next = rotation;
          }
        }
        break;
      case "skewx":
        if (values.length >= 1) {
          next = [1, 0, Math.tan((values[0]! * Math.PI) / 180), 1, 0, 0];
        }
        break;
      case "skewy":
        if (values.length >= 1) {
          next = [1, Math.tan((values[0]! * Math.PI) / 180), 0, 1, 0, 0];
        }
        break;
    }
    if (next) result = multiplyMatrix(result, next);
  }
  return result;
};

const styleDeclarations = (element: Element) => {
  const declarations = new Map<string, string>();
  const style = element.getAttribute("style") ?? "";
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    declarations.set(
      declaration.slice(0, separator).trim().toLowerCase(),
      declaration.slice(separator + 1).trim(),
    );
  }
  return declarations;
};

const presentationValue = (
  element: Element,
  styles: Map<string, string>,
  name: string,
) => styles.get(name) || element.getAttribute(name) || null;

const clampedOpacity = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
};

const positiveNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const readPresentation = (
  element: Element,
  parent: PathPresentation,
): PathPresentation => {
  const styles = styleDeclarations(element);
  const fill = presentationValue(element, styles, "fill") ?? parent.fill;
  const stroke = presentationValue(element, styles, "stroke") ?? parent.stroke;
  const lineCapValue = presentationValue(element, styles, "stroke-linecap");
  const lineJoinValue = presentationValue(element, styles, "stroke-linejoin");
  const fillRuleValue = presentationValue(element, styles, "fill-rule");
  return {
    fill: isSafePaintReference(fill) ? fill : parent.fill,
    stroke: isSafePaintReference(stroke) ? stroke : parent.stroke,
    strokeWidth: positiveNumber(
      presentationValue(element, styles, "stroke-width"),
      parent.strokeWidth,
    ),
    lineCap:
      lineCapValue === "round" || lineCapValue === "square"
        ? lineCapValue
        : lineCapValue === "butt"
          ? "butt"
          : parent.lineCap,
    lineJoin:
      lineJoinValue === "round" || lineJoinValue === "bevel"
        ? lineJoinValue
        : lineJoinValue === "miter"
          ? "miter"
          : parent.lineJoin,
    miterLimit: positiveNumber(
      presentationValue(element, styles, "stroke-miterlimit"),
      parent.miterLimit,
    ),
    fillRule: fillRuleValue === "evenodd" ? "evenodd" : parent.fillRule,
    opacity:
      parent.opacity *
      clampedOpacity(presentationValue(element, styles, "opacity"), 1),
    fillOpacity: clampedOpacity(
      presentationValue(element, styles, "fill-opacity"),
      parent.fillOpacity,
    ),
    strokeOpacity: clampedOpacity(
      presentationValue(element, styles, "stroke-opacity"),
      parent.strokeOpacity,
    ),
    transform: multiplyMatrix(
      parent.transform,
      parseTransform(element.getAttribute("transform")),
    ),
  };
};

const extractPaths = (svg: Element) => {
  const paths: SvgVectorPath[] = [];
  const visit = (element: Element, parent: PathPresentation) => {
    const presentation = readPresentation(element, parent);
    if (element.tagName.toLowerCase() === "path") {
      const d = element.getAttribute("d")?.trim();
      if (d) paths.push({ d, ...presentation });
    }
    for (let index = 0; index < element.childNodes.length; index += 1) {
      const child = element.childNodes.item(index);
      if (child?.nodeType === 1) visit(child as Element, presentation);
    }
  };
  visit(svg, DEFAULT_PRESENTATION);
  return paths;
};

export const parseSvgVector = (source: string): SvgVectorData | null => {
  if (!source.trim()) return null;
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = document.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg") return null;

  const rootAttributes = sanitizeAttributes(svg);
  let content = "";
  for (let index = 0; index < svg.childNodes.length; index += 1) {
    const child = svg.childNodes.item(index);
    if (child) content += sanitizeNode(child as unknown as Node);
  }
  if (!content) return null;

  const paths = extractPaths(svg);
  if (paths.length === 0) return null;

  return {
    viewBox: parseViewBox(svg),
    content: rootAttributes
      ? `<g ${rootAttributes}>${content}</g>`
      : content,
    paths,
  };
};

const decodeBase64 = (encoded: string) => {
  const binary = atob(encoded.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const parseSvgVectorBase64 = (encoded: string) => {
  try {
    return parseSvgVector(decodeBase64(encoded));
  } catch {
    return null;
  }
};

export const parseSvgVectorDataUrl = (dataUrl: string) => {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) return null;
  const header = dataUrl.slice(0, separator).toLowerCase();
  if (!header.includes("image/svg+xml")) return null;
  try {
    const payload = dataUrl.slice(separator + 1);
    return parseSvgVector(
      header.includes(";base64") ? decodeBase64(payload) : decodeURIComponent(payload),
    );
  } catch {
    return null;
  }
};
