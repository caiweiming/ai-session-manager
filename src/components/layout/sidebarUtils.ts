const getBeijingDateTimeParts = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(value));
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }
    if (!map.year || !map.month || !map.day || !map.hour || !map.minute || !map.second) return null;
    return map;
  } catch {
    return null;
  }
};

export const formatBeijingDateTime = (value: number | null | undefined) => {
  const parts = getBeijingDateTimeParts(value);
  if (!parts) return "--";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export const formatBeijingTime = (value: number | null | undefined) => {
  const parts = getBeijingDateTimeParts(value);
  if (!parts) return "--";
  return `${parts.hour}:${parts.minute}:${parts.second}`;
};
