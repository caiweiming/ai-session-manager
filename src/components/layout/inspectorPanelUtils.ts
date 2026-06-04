export const normalizeToolClass = (value: string | undefined) => {
  if (!value) return "unknown";
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return safe || "unknown";
};

export const normalizeRole = (
  role: string,
): "user" | "assistant" | "ai" | "tool" | "dev" => {
  if (
    role === "user" ||
    role === "assistant" ||
    role === "ai" ||
    role === "tool" ||
    role === "dev"
  ) {
    return role;
  }
  return "dev";
};

export const extractWorkspacePath = (sourcePath: string | undefined) => {
  if (!sourcePath) return "--";
  const slashIndex = Math.max(
    sourcePath.lastIndexOf("\\"),
    sourcePath.lastIndexOf("/"),
  );
  if (slashIndex < 0) return sourcePath;
  return sourcePath.slice(0, slashIndex);
};

export const extractParentDirectory = (path: string | undefined) => {
  if (!path) return "";
  const trimmed = path.trim();
  if (!trimmed || trimmed === "--") return "";
  const slashIndex = Math.max(
    trimmed.lastIndexOf("\\"),
    trimmed.lastIndexOf("/"),
  );
  if (slashIndex <= 0) return trimmed;
  return trimmed.slice(0, slashIndex);
};

export const formatBytes = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"] as const;
  let size = value;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  const text = size
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
  return `${text} ${units[unitIndex]}`;
};

const formatCompactChineseNumber = (value: number, base: number) =>
  (value / base)
    .toFixed(1)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");

const formatCompactChineseCount = (value: number) => {
  const wanCompact = formatCompactChineseNumber(value, 10000);
  if (Number(wanCompact) >= 10000) {
    return `约 ${formatCompactChineseNumber(value, 100000000)} 亿`;
  }
  return `约 ${wanCompact} 万`;
};

export const formatTokenCount = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const exact = value.toLocaleString("zh-CN");
  if (value < 10000) {
    return exact;
  }

  return `${exact}（${formatCompactChineseCount(value)}）`;
};

export const copyPlainText = async (text: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("clipboard unavailable");
  }
};

export const buildResumeCommand = (sourceTool?: string, sourceId?: string) => {
  if (!sourceTool || !sourceId) return "--";
  const tool = sourceTool.trim().toLowerCase();
  const id = sourceId.trim();
  if (!tool || !id) return "--";

  if (tool === "claude") {
    return `claude --resume ${id}`;
  }
  if (tool === "gemini") {
    return `gemini --resume ${id}`;
  }
  if (tool === "codex") {
    return `codex resume ${id}`;
  }
  return `${tool} resume ${id}`;
};
