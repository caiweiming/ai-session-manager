import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SessionDetail, SubagentSessionRow } from "../../lib/tauriClient";
import {
  defaultExportResult,
  defaultSessionDetail,
  defaultSubagentRows,
} from "../../test/tauriFixtures";
import { invokeMock } from "../../test/mockTauriInvoke";
import { InspectorPanel } from "./InspectorPanel";

const buildDetailPanel = (overrides?: Partial<{
  open: boolean;
  onClose: () => void;
  detail: SessionDetail | null;
  detailLoading: boolean;
  subagentRows: SubagentSessionRow[];
  subagentsLoading: boolean;
  defaultHardDelete: boolean;
  onLoadMoreMessages: () => void;
}>) => ({
  open: true,
  onClose: vi.fn(),
  detail: defaultSessionDetail,
  detailLoading: false,
  subagentRows: defaultSubagentRows,
  subagentsLoading: false,
  defaultHardDelete: false,
  onLoadMoreMessages: vi.fn(),
  ...overrides,
});

const buildMutation = (overrides?: Partial<{
  handleDeleteSession: (sourceTool: string, sourceId: string, options?: { hardDelete?: boolean; cascadeSubagents?: boolean }) => Promise<boolean>;
  handleExportSession: (payload: { sourceTool: string; sourceId: string; includeSubagent?: boolean }) => Promise<{ path: string; canceled: boolean }>;
  handleResumeSession: (payload: { sourceTool: string; sourceId: string; workspacePath: string }) => Promise<void>;
  supportsResumeInTerminal: boolean;
}>) => ({
  handleDeleteSession: vi.fn(async () => true),
  handleExportSession: vi.fn(async () => defaultExportResult),
  handleResumeSession: vi.fn(async () => {}),
  supportsResumeInTerminal: true,
  ...overrides,
});

const expectInfoValueByLabel = (container: HTMLElement, label: string, value: string) => {
  const labelNode = within(container).getByText(label);
  const valueNode = labelNode.nextElementSibling;

  expect(valueNode).toHaveClass("info-value");
  expect(valueNode).toHaveTextContent(value);
};

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
            title: `子代理详情 ${sourceId}`,
            sourcePath: `D:\\Works\\ai-session\\${sourceId}.jsonl`,
            workspacePath: "D:\\Works\\ai-session",
            isSubagent: true,
            messages: [
              {
                role: "assistant",
                content: `message-${sourceId}`,
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

it("shows info toast when markdown export is canceled", async () => {
  const mutation = buildMutation({
    handleExportSession: vi.fn(async () => ({ path: "", canceled: true })),
  });

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={mutation}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "导出为 Markdown" }));

  await waitFor(() => {
    expect(mutation.handleExportSession).toHaveBeenCalledWith({
      sourceTool: defaultSessionDetail.sourceTool,
      sourceId: defaultSessionDetail.sourceId,
      includeSubagent: false,
    });
  });
  expect(await screen.findByText("已取消导出。")).toBeInTheDocument();
});

it("allows retrying markdown export after an initial failure", async () => {
  const handleExportSession = vi
    .fn<
      (payload: { sourceTool: string; sourceId: string; includeSubagent?: boolean }) => Promise<{ path: string; canceled: boolean }>
    >()
    .mockRejectedValueOnce(new Error("first export failed"))
    .mockResolvedValueOnce({
      path: "D:\\Works\\ai-session\\retry-success.md",
      canceled: false,
    });

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation({ handleExportSession })}
    />,
  );

  const exportButton = screen.getByRole("button", { name: "导出为 Markdown" });
  fireEvent.click(exportButton);

  expect(await screen.findByText("导出 Markdown 失败，请重试。")).toBeInTheDocument();
  await waitFor(() => {
    expect(exportButton).not.toBeDisabled();
  });

  fireEvent.click(exportButton);

  await waitFor(() => {
    expect(handleExportSession).toHaveBeenCalledTimes(2);
  });
  expect(
    await screen.findByText("Markdown 已导出：D:\\Works\\ai-session\\retry-success.md"),
  ).toBeInTheDocument();
});

it("confirms hard delete before invoking session deletion", async () => {
  const mutation = buildMutation();

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={mutation}
    />,
  );

  fireEvent.click(screen.getByLabelText("hard-delete-toggle"));
  expect(screen.getByRole("button", { name: "永久删除此记录" })).toHaveClass("btn-danger-solid");
  fireEvent.click(screen.getByRole("button", { name: "永久删除此记录" }));
  expect(screen.getByTestId("inspector-hard-delete-confirm-modal")).toHaveClass("active");
  expect(screen.getByLabelText("confirm-inspector-hard-delete")).toHaveClass("btn-danger-solid");

  fireEvent.click(screen.getByLabelText("confirm-inspector-hard-delete"));

  await waitFor(() => {
    expect(mutation.handleDeleteSession).toHaveBeenCalledWith(
      defaultSessionDetail.sourceTool,
      defaultSessionDetail.sourceId,
      {
        hardDelete: true,
        cascadeSubagents: true,
      },
    );
  });
});

it("copies resume command and shows success feedback", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  fireEvent.click(screen.getByLabelText("copy-resume-command"));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(`codex resume ${defaultSessionDetail.sourceId}`);
  });
  expect(screen.getByLabelText("copy-resume-command")).toHaveClass("success");
});

it("shows resume action beside resume command for main sessions", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByLabelText("resume-session-from-inspector")).toBeInTheDocument();
});

it("shows exact token counts only when below ten thousand", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: {
          ...defaultSessionDetail,
          inputTokens: 9876,
          outputTokens: 9999,
        },
      })}
      mutation={buildMutation()}
    />,
  );

  const headerBody = screen.getByTestId("inspector-header-body");
  const infoGrid = headerBody.querySelector(".info-grid");

  expect(infoGrid).toBeInTheDocument();
  expectInfoValueByLabel(infoGrid as HTMLElement, "输入 Token", "9,876");
  expectInfoValueByLabel(infoGrid as HTMLElement, "输出 Token", "9,999");
});

it("shows exact token counts plus compact chinese approximations for large values", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: {
          ...defaultSessionDetail,
          inputTokens: 137560,
          outputTokens: 123456789,
        },
      })}
      mutation={buildMutation()}
    />,
  );

  const headerBody = screen.getByTestId("inspector-header-body");
  const infoGrid = headerBody.querySelector(".info-grid");

  expect(infoGrid).toBeInTheDocument();
  expectInfoValueByLabel(infoGrid as HTMLElement, "输入 Token", "137,560（约 13.8 万）");
  expectInfoValueByLabel(infoGrid as HTMLElement, "输出 Token", "123,456,789（约 1.2 亿）");
});

it("shows placeholder and missing-data hint when token counts are zero", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: {
          ...defaultSessionDetail,
          inputTokens: 0,
          outputTokens: 0,
        },
      })}
      mutation={buildMutation()}
    />,
  );

  const headerBody = screen.getByTestId("inspector-header-body");
  const infoGrid = headerBody.querySelector(".info-grid");

  expect(infoGrid).toBeInTheDocument();
  expectInfoValueByLabel(infoGrid as HTMLElement, "输入 Token", "--");
  expectInfoValueByLabel(infoGrid as HTMLElement, "输出 Token", "--");
  expect(within(headerBody).getByText("该会话无 token 数据")).toBeInTheDocument();
});

it("uses consistent command action sizing for copy and resume buttons", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByLabelText("copy-resume-command")).toHaveClass("inspector-command-action");
  expect(screen.getByLabelText("resume-session-from-inspector")).toHaveClass("inspector-command-action");
});

it("places conversation modal action beside the section title instead of the right action group", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const titleText = screen.getByText("对话记录");
  const titleRow = titleText.closest(".section-title");
  const titleLead = titleRow?.querySelector(".section-title-label");
  const titleActions = titleRow?.querySelector(".section-title-actions");
  const openButton = screen.getByLabelText("open-conversation-modal");

  expect(titleLead).toContainElement(titleText);
  expect(titleLead).toContainElement(openButton);
  expect(titleActions).not.toContainElement(openButton);
});

it("renders sticky inspector header with tool tag, title, and close action", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const stickyHeader = screen.getByTestId("inspector-sticky-header");
  expect(stickyHeader).toBeInTheDocument();
  expect(within(stickyHeader).getByText("Codex 会话记录")).toBeInTheDocument();
  expect(within(stickyHeader).getByText(defaultSessionDetail.title)).toBeInTheDocument();
  expect(within(stickyHeader).getByLabelText("close-inspector-pane")).toBeInTheDocument();
});

it("keeps info grid outside sticky inspector header", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const stickyHeader = screen.getByTestId("inspector-sticky-header");
  const headerBody = screen.getByTestId("inspector-header-body");

  expect(stickyHeader).toContainElement(screen.getByText("Codex 会话记录"));
  expect(stickyHeader).toContainElement(screen.getByText(defaultSessionDetail.title));
  expect(within(stickyHeader).queryByText("会话 ID")).not.toBeInTheDocument();
  expect(within(headerBody).getByText("会话 ID")).toBeInTheDocument();
  expect(within(headerBody).getByText("恢复命令")).toBeInTheDocument();
});

it("separates sticky header and header body for independent styling", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const stickyHeader = screen.getByTestId("inspector-sticky-header");
  const headerBody = screen.getByTestId("inspector-header-body");
  const topBar = stickyHeader.querySelector(".inspector-top-bar");
  const title = stickyHeader.querySelector(".inspector-title");

  expect(stickyHeader).toHaveClass("inspector-sticky-header");
  expect(headerBody).toHaveClass("inspector-header-body");
  expect(topBar).toBeInTheDocument();
  expect(title).toBeInTheDocument();
});

it("hides resume action for subagent session detail", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: {
          ...defaultSessionDetail,
          sourceId: "sub-session-1",
          isSubagent: true,
        },
      })}
      mutation={buildMutation()}
    />,
  );

  expect(screen.queryByLabelText("resume-session-from-inspector")).not.toBeInTheDocument();
});

it("disables inspector resume action when terminal resume is unsupported", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation({ supportsResumeInTerminal: false })}
    />,
  );

  expect(screen.getByLabelText("resume-session-from-inspector")).toBeDisabled();
});

it("resumes main session from inspector via terminal", async () => {
  const handleResumeSession = vi.fn(async () => {});

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation({ handleResumeSession })}
    />,
  );

  fireEvent.click(screen.getByLabelText("resume-session-from-inspector"));

  await waitFor(() => {
    expect(handleResumeSession).toHaveBeenCalledWith({
      sourceTool: defaultSessionDetail.sourceTool,
      sourceId: defaultSessionDetail.sourceId,
      workspacePath: defaultSessionDetail.workspacePath as string,
    });
  });
  expect(screen.getByLabelText("resume-session-from-inspector")).toHaveClass("resume-success");
});

it("shows error feedback when inspector resume fails", async () => {
  const handleResumeSession = vi.fn(async () => {
    throw new Error("resume failed");
  });

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation({ handleResumeSession })}
    />,
  );

  fireEvent.click(screen.getByLabelText("resume-session-from-inspector"));

  expect(await screen.findByText("启动恢复失败，请重试。")).toBeInTheDocument();
  expect(screen.getByLabelText("resume-session-from-inspector")).toHaveClass("resume-error");
});

it("loads and switches subagent details inside the summary modal", async () => {
  const subagentRows: SubagentSessionRow[] = [
    {
      ...defaultSubagentRows[0],
      sourceId: "sub-session-1",
      title: "子代理一",
      sourcePath: "D:\\Works\\ai-session\\sub-session-1.jsonl",
    },
    {
      ...defaultSubagentRows[0],
      sourceId: "sub-session-2",
      title: "子代理二",
      sourcePath: "D:\\Works\\ai-session\\sub-session-2.jsonl",
    },
  ];

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({ subagentRows })}
      mutation={buildMutation()}
    />,
  );

  fireEvent.click(screen.getByLabelText("open-subagent-summary"));
  expect(await screen.findByTestId("subagent-summary-modal")).toHaveClass("active");

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "sub-session-1",
        includeSubagent: true,
      },
    });
  });
  expect(await screen.findByText("message-sub-session-1")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("open-subagent-sub-session-2"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: {
        sourceTool: "codex",
        sourceId: "sub-session-2",
        includeSubagent: true,
      },
    });
  });
  expect(await screen.findByText("message-sub-session-2")).toBeInTheDocument();
});
