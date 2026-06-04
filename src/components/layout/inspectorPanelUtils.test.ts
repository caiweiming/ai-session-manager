import { describe, expect, it } from "vitest";
import { formatTokenCount } from "./inspectorPanelUtils";

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

  it("appends compact ten-thousand unit at the threshold", () => {
    expect(formatTokenCount(10000)).toBe("10,000（约 1 万）");
    expect(formatTokenCount(137560)).toBe("137,560（约 13.8 万）");
  });

  it("appends compact hundred-million unit for larger counts", () => {
    expect(formatTokenCount(99999999)).toBe("99,999,999（约 1 亿）");
    expect(formatTokenCount(100000000)).toBe("100,000,000（约 1 亿）");
    expect(formatTokenCount(123456789)).toBe("123,456,789（约 1.2 亿）");
  });
});
