import { act, renderHook, waitFor } from "@testing-library/react";
import { invokeMock } from "../../../../test/mockTauriInvoke";
import {
  defaultExportResult,
  defaultSessionDetail,
  defaultSubagentRows,
} from "../../../../test/tauriFixtures";
import { useInspectorPanelController } from "../useInspectorPanelController";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(
    async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string } }) => {
      if (cmd === "get_session_detail") {
        const sourceId = args?.payload?.sourceId ?? "sub-session-1";
        return {
          detail: {
            ...defaultSessionDetail,
            sourceTool: args?.payload?.sourceTool ?? "codex",
            sourceId,
            title: `detail-${sourceId}`,
            isSubagent: true,
            messages: [
              {
                role: "assistant",
                content: `content-${sourceId}`,
                createdAt: "2026-04-24T10:00:00Z",
              },
            ],
          },
        };
      }
      if (cmd === "open_in_explorer") {
        return null;
      }
      return null;
    },
  );
});

it("opens subagent summary and loads selected subagent detail", async () => {
  const handleDeleteSession = vi.fn(async () => true);
  const handleExportSession = vi.fn(async () => defaultExportResult);

  const { result } = renderHook(() =>
    useInspectorPanelController({
      detail: defaultSessionDetail,
      subagentRows: defaultSubagentRows,
      subagentsLoading: false,
      defaultHardDelete: false,
      handleDeleteSession,
      handleExportSession,
    }),
  );

  act(() => {
    result.current.openSubagentSummary();
  });

  expect(result.current.subagentModalOpen).toBe(true);
  expect(result.current.selectedSubagentId).toBe("sub-session-1");

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "sub-session-1",
        includeSubagent: true,
      },
    });
    expect(result.current.selectedSubagentDetail?.sourceId).toBe("sub-session-1");
  });
});

it("shows info toast when there are no subagent sessions", () => {
  const { result } = renderHook(() =>
    useInspectorPanelController({
      detail: defaultSessionDetail,
      subagentRows: [],
      subagentsLoading: false,
      defaultHardDelete: false,
      handleDeleteSession: vi.fn(async () => true),
      handleExportSession: vi.fn(async () => defaultExportResult),
    }),
  );

  act(() => {
    result.current.openSubagentSummary();
  });

  expect(result.current.subagentModalOpen).toBe(false);
  expect(result.current.toast).toMatchObject({
    type: "info",
    text: "当前主会话无子代理会话。",
  });
});

it("opens hard delete confirm before confirming deletion", async () => {
  const handleDeleteSession = vi.fn(async () => true);

  const { result } = renderHook(() =>
    useInspectorPanelController({
      detail: defaultSessionDetail,
      subagentRows: defaultSubagentRows,
      subagentsLoading: false,
      defaultHardDelete: false,
      handleDeleteSession,
      handleExportSession: vi.fn(async () => defaultExportResult),
    }),
  );

  act(() => {
    result.current.setHardDelete(true);
  });

  act(() => {
    result.current.handleDeleteAction();
  });
  expect(result.current.hardDeleteConfirmOpen).toBe(true);

  act(() => {
    result.current.confirmHardDelete();
  });

  await waitFor(() => {
    expect(handleDeleteSession).toHaveBeenCalledWith(
      defaultSessionDetail.sourceTool,
      defaultSessionDetail.sourceId,
      {
        hardDelete: true,
        cascadeSubagents: true,
      },
    );
  });
});

it("opens conversation modal immediately without entering preparing overlay state", () => {
  const { result } = renderHook(() =>
    useInspectorPanelController({
      detail: defaultSessionDetail,
      subagentRows: defaultSubagentRows,
      subagentsLoading: false,
      defaultHardDelete: false,
      handleDeleteSession: vi.fn(async () => true),
      handleExportSession: vi.fn(async () => defaultExportResult),
    }),
  );

  act(() => {
    result.current.openConversationModal();
  });

  expect(result.current.conversationModalOpen).toBe(true);
  expect(result.current.conversationModalPreparing).toBe(false);
});
