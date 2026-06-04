import codexLogo from "../assets/tool-logos/codex.svg";
import claudeLogo from "../assets/tool-logos/claude.svg";
import geminiLogo from "../assets/tool-logos/gemini.svg";
import opencodeLogo from "../assets/tool-logos/opencode.svg";
import openclawLogo from "../assets/tool-logos/openclaw.svg";

const normalizeToolKey = (value: string | undefined | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "claudecode") return "claude";
  if (normalized === "geminicli") return "gemini";
  return normalized;
};

export const formatToolName = (value: string | undefined | null) => {
  const key = normalizeToolKey(value);
  if (!key) return "未知工具";

  if (key === "codex") return "Codex";
  if (key === "claude") return "Claude Code";
  if (key === "gemini") return "Gemini CLI";
  if (key === "opencode") return "OpenCode";
  if (key === "openclaw") return "OpenClaw";

  return key.charAt(0).toUpperCase() + key.slice(1);
};

export const formatToolShortName = (value: string | undefined | null) => {
  const key = normalizeToolKey(value);
  if (!key) return "未知";

  if (key === "codex") return "Codex";
  if (key === "claude") return "Claude";
  if (key === "gemini") return "Gemini";
  if (key === "opencode") return "OpenCode";
  if (key === "openclaw") return "OpenClaw";

  return key.charAt(0).toUpperCase() + key.slice(1);
};

export const getToolLogoSrc = (value: string | undefined | null) => {
  const key = normalizeToolKey(value);
  if (key === "codex") return codexLogo;
  if (key === "claude") return claudeLogo;
  if (key === "gemini") return geminiLogo;
  if (key === "opencode") return opencodeLogo;
  if (key === "openclaw") return openclawLogo;
  return null;
};
