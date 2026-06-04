import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { invokeMock } from "../../../../test/mockTauriInvoke";
import type { SessionTableRow } from "../../../sessions/SessionTable";
import { useSessionDetailController } from "../useSessionDetailController";

const baseRows: SessionTableRow[] = [
  {
    id: "codex:alpha-id",
    tool: "codex",
    path: "D:\\Works\\alpha",
    sourceTool: "codex",
    sourceId: "alpha-id",
    title: "Alpha",
    createdAt: "2026-05-01T08:00:00Z",
    updatedAt: "2026-05-01T09:00:00Z",
  },
  {
    id: "codex:sub-id",
    tool: "codex",
    path: "D:\\Works\\alpha",
    sourceTool: "codex",
    sourceId: "sub-id",
    title: "Sub",
    isSubagent: true,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-01T11:00:00Z",
  },
];

beforeEach(() => {
  invokeMock.mockClear();
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: Record<string, unknown> }) => {
    if (cmd === "get_session_detail") {
      const payload = args?.payload ?? {};
      return {
        detail: {
          sourceTool: payload.sourceTool ?? "codex",
          sourceId: payload.sourceId ?? "alpha-id",
          title: "Detail",
          workspacePath: "D:\\Works\\alpha",
          sourcePath: "D:\\Works\\alpha\\alpha.jsonl",
          isSubagent: payload.includeSubagent === true,
          createdAt: "2026-05-01T08:00:00Z",
          updatedAt: "2026-05-01T09:00:00Z",
          messages: [],
        },
      };
    }
    if (cmd === "list_subagent_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "sub-1",
            title: "Subagent 1",
            workspacePath: "D:\\Works\\alpha",
            sourcePath: "D:\\Works\\alpha\\sub-1.jsonl",
            createdAt: "2026-05-01T10:00:00Z",
            updatedAt: "2026-05-01T11:00:00Z",
          },
        ],
      };
    }
    return null;
  });
});

it("selects session and requests detail plus subagents with current view scope and message limit", async () => {
  const { result } = renderHook(
    (props: { rows: SessionRow[]; viewMode: "overview" | "trash" }) => useSessionDetailController(props),
    {
      initialProps: {
        rows: baseRows,
        viewMode: "trash",
      },
    },
  );

  act(() => {
    result.current.handleSessionSelection("codex:alpha-id");
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        includeSubagent: false,
        inTrash: true,
        messageLimit: 120,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("list_subagent_sessions", {
      payload: {
        sourceTool: "codex",
        parentSourceId: "alpha-id",
        inTrash: true,
      },
    });
  });
});

it("loads more messages by increasing limit to 320 and refetching detail", async () => {
  const { result } = renderHook(
    (props: { rows: SessionRow[]; viewMode: "overview" | "trash" }) => useSessionDetailController(props),
    {
      initialProps: {
        rows: baseRows,
        viewMode: "overview",
      },
    },
  );

  act(() => {
    result.current.handleSessionSelection("codex:alpha-id");
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        includeSubagent: false,
        inTrash: false,
        messageLimit: 120,
      },
    });
  });

  act(() => {
    result.current.handleLoadMoreMessages();
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        includeSubagent: false,
        inTrash: false,
        messageLimit: 320,
      },
    });
  });
});

it("clicking the same session twice closes inspector and resets detail state", async () => {
  const { result } = renderHook(
    (props: { rows: SessionRow[]; viewMode: "overview" | "trash" }) => useSessionDetailController(props),
    {
      initialProps: {
        rows: baseRows,
        viewMode: "overview",
      },
    },
  );

  act(() => {
    result.current.handleSessionSelection("codex:alpha-id");
  });

  await waitFor(() => {
    expect(result.current.activeSessionId).toBe("codex:alpha-id");
  });

  act(() => {
    result.current.handleSessionSelection("codex:alpha-id");
  });

  expect(result.current.activeSessionId).toBeNull();
  expect(result.current.detail).toBeNull();
  expect(result.current.subagentRows).toEqual([]);
  expect(result.current.detailMessageLimit).toBe(120);
});

it("resets detail state when view mode changes", async () => {
  const { result, rerender } = renderHook(
    (props: { rows: SessionRow[]; viewMode: "overview" | "trash" }) => useSessionDetailController(props),
    {
      initialProps: {
        rows: baseRows,
        viewMode: "overview",
      },
    },
  );

  act(() => {
    result.current.handleSessionSelection("codex:alpha-id");
  });

  await waitFor(() => {
    expect(result.current.activeSessionId).toBe("codex:alpha-id");
    expect(result.current.subagentRows).toHaveLength(1);
  });

  rerender({
    rows: baseRows,
    viewMode: "trash",
  });

  await waitFor(() => {
    expect(result.current.activeSessionId).toBeNull();
    expect(result.current.detail).toBeNull();
    expect(result.current.subagentRows).toEqual([]);
    expect(result.current.detailMessageLimit).toBe(120);
  });
});

it("clears active session when selected row disappears from rows", async () => {
  const { result, rerender } = renderHook(
    (props: { rows: SessionRow[]; viewMode: "overview" | "trash" }) => useSessionDetailController(props),
    {
      initialProps: {
        rows: baseRows,
        viewMode: "overview",
      },
    },
  );

  act(() => {
    result.current.handleSessionSelection("codex:alpha-id");
  });

  await waitFor(() => {
    expect(result.current.activeSessionId).toBe("codex:alpha-id");
  });

  rerender({
    rows: [baseRows[1]!],
    viewMode: "overview",
  });

  await waitFor(() => {
    expect(result.current.activeSessionId).toBeNull();
  });
});

it("does not request subagent list for subagent session", async () => {
  const { result } = renderHook(
    (props: { rows: SessionRow[]; viewMode: "overview" | "trash" }) => useSessionDetailController(props),
    {
      initialProps: {
        rows: baseRows,
        viewMode: "overview",
      },
    },
  );

  act(() => {
    result.current.handleSessionSelection("codex:sub-id");
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "sub-id",
        includeSubagent: true,
        inTrash: false,
        messageLimit: 120,
      },
    });
  });
  expect(invokeMock).not.toHaveBeenCalledWith("list_subagent_sessions", expect.anything());
});
