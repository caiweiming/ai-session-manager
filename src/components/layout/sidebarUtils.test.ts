import { describe, expect, it } from "vitest";
import { formatBeijingDateTime, formatBeijingTime } from "./sidebarUtils";

describe("sidebar scan timestamps", () => {
  it("shows only the local scan time while preserving a full timestamp for the tooltip", () => {
    const scannedAt = Date.UTC(2026, 7, 25, 9, 17, 40);

    expect(formatBeijingTime(scannedAt)).toBe("17:17:40");
    expect(formatBeijingDateTime(scannedAt)).toBe("2026-08-25 17:17:40");
  });
});
