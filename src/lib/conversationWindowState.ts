export type ConversationWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const storageKey = "ai-session:conversation-window-bounds:v1";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const readConversationWindowBounds = (): ConversationWindowBounds | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const x = record.x;
    const y = record.y;
    const width = record.width;
    const height = record.height;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) {
      return null;
    }
    if (width < 640 || height < 480) return null;
    return { x, y, width, height };
  } catch {
    return null;
  }
};

export const writeConversationWindowBounds = (bounds: Partial<ConversationWindowBounds>) => {
  if (typeof window === "undefined") return;
  const current = readConversationWindowBounds() ?? {
    x: 120,
    y: 100,
    width: 1200,
    height: 860,
  };
  const next: ConversationWindowBounds = {
    x: typeof bounds.x === "number" ? bounds.x : current.x,
    y: typeof bounds.y === "number" ? bounds.y : current.y,
    width: typeof bounds.width === "number" ? bounds.width : current.width,
    height: typeof bounds.height === "number" ? bounds.height : current.height,
  };
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || !Number.isFinite(next.width) || !Number.isFinite(next.height)) {
    return;
  }
  if (next.width < 640 || next.height < 480) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // ignore localStorage persistence failures
  }
};

