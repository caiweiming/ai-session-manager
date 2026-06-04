export const normalizeWindowsDriveLetter = (value: string | undefined | null) => {
  const raw = (value ?? "").trim();
  if (!raw) return raw;

  // Example: d:\works -> D:\works
  if (/^[a-zA-Z]:[\\/]/.test(raw)) {
    return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
  }

  return raw;
};
