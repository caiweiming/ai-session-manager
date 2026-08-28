import { describe, expect, it } from "vitest";
import { formatExactTokenCount, formatTokenCount } from "./inspectorPanelUtils";

describe("inspectorPanelUtils", () => {
  it("returns placeholder for invalid token values", () => {
    expect(formatTokenCount(undefined)).toBe("--");
    expect(formatTokenCount(-1)).toBe("--");
    expect(formatTokenCount(Number.NaN)).toBe("--");
  });

  it("treats zero token count as missing token data placeholder", () => {
    expect(formatTokenCount(0)).toBe("--");
  });

  it("keeps exact count only below ten thousand", () => {
    expect(formatTokenCount(9876)).toBe("9,876");
  });

  it("uses a compact ten-thousand unit at the threshold", () => {
    expect(formatTokenCount(10000)).toBe("约 1 万");
    expect(formatTokenCount(137560)).toBe("约 13.8 万");
  });

  it("uses a compact hundred-million unit for larger counts", () => {
    expect(formatTokenCount(99999999)).toBe("约 1 亿");
    expect(formatTokenCount(100000000)).toBe("约 1 亿");
    expect(formatTokenCount(123456789)).toBe("约 1.2 亿");
  });

  it("retains exact token counts for hover details", () => {
    expect(formatExactTokenCount(123456789)).toBe("123,456,789");
    expect(formatExactTokenCount(0)).toBe("--");
  });
});
