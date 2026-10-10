import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {
    throw new Error("Cannot read properties of undefined (reading '__TAURI_INTERNALS__')");
  }),
}));

import { api } from "./tauriClient";

describe("api.checkWorkspacePaths", () => {
  it("treats every input path as available when Tauri is unavailable", async () => {
    await expect(
      api.checkWorkspacePaths({ paths: ["D:\\Works\\alpha", "/srv/beta"] }),
    ).resolves.toEqual({
      results: [
        { path: "D:\\Works\\alpha", status: "available" },
        { path: "/srv/beta", status: "available" },
      ],
    });
  });
});
