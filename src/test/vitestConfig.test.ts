// @vitest-environment node

import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import vitestConfig from "../../vitest.config";

describe("vitest.config", () => {
  it("keeps default excludes and ignores local worktrees", () => {
    const exclude = vitestConfig.test?.exclude ?? [];

    for (const pattern of configDefaults.exclude) {
      expect(exclude).toContain(pattern);
    }

    expect(exclude).toContain(".worktrees/**");
  });
});
