const DEFAULT_SVG_WIDTH = 300;
const DEFAULT_SVG_HEIGHT = 150;

const unitScale = {
  "": 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

const readAttribute = (source, name) => {
  const match = source.match(
    new RegExp(
      `\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
};

const parseLength = (value) => {
  if (!value) return null;
  const match = value
    .trim()
    .match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)$/i);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const scale = unitScale[unit];
  if (scale === undefined) return null;
  const length = Number(match[1]) * scale;
  return Number.isFinite(length) && length > 0 ? length : null;
};

const parseViewBox = (value) => {
  if (!value) return null;
  const values = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    values.length !== 4 ||
    values.some((value) => !Number.isFinite(value)) ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    return null;
  }
  return { width: values[2], height: values[3] };
};

const readSvgDimensions = (input) => {
  const source = Buffer.isBuffer(input) ? input.toString("utf8") : String(input);
  const root = source.match(/<svg\b([^>]*)>/i);
  if (!root) {
    throw new Error("SVG 文件缺少有效的 <svg> 根节点");
  }

  const attributes = root[1];
  let width = parseLength(readAttribute(attributes, "width"));
  let height = parseLength(readAttribute(attributes, "height"));
  const viewBox = parseViewBox(readAttribute(attributes, "viewBox"));

  if (viewBox) {
    if (width && !height) {
      height = width * (viewBox.height / viewBox.width);
    } else if (height && !width) {
      width = height * (viewBox.width / viewBox.height);
    } else if (!width && !height) {
      width = viewBox.width;
      height = viewBox.height;
    }
  }

  width ??= DEFAULT_SVG_WIDTH;
  height ??= DEFAULT_SVG_HEIGHT;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
};

const validateSvg = (input) => {
  const source = Buffer.isBuffer(input) ? input.toString("utf8") : String(input);
  if (!/<svg[\s>]/i.test(source)) {
    throw new Error("SVG 文件缺少有效的 <svg> 根节点");
  }
  if (
    /<script[\s>]/i.test(source) ||
    /<foreignObject[\s>]/i.test(source) ||
    /\son[a-z]+\s*=/i.test(source) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:|data:)/i.test(
      source,
    )
  ) {
    throw new Error("SVG 包含脚本、外部链接或其他不安全内容");
  }
  return source;
};

module.exports = { readSvgDimensions, validateSvg };
