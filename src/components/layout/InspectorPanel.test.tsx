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
  onLoadMoreMessages: () => void;
}>) => ({
  open: true,
  onClose: vi.fn(),
  detail: defaultSessionDetail,
  detailLoading: false,
  subagentRows: defaultSubagentRows,
  subagentsLoading: false,
  onLoadMoreMessages: vi.fn(),
  ...overrides,
});

const buildMutation = (overrides?: Partial<{
  handleDeleteSession: (sourceTool: string, sourceId: string, options?: { hardDelete?: boolean; cascadeSubagents?: boolean }) => Promise<boolean>;
  handleExportSession: (payload: { sourceTool: string; sourceId: string; includeSubagent?: boolean }) => Promise<{ path: string; canceled: boolean }>;
  handleResumeSession: (payload: { sourceTool: string; sourceId: string; workspacePath: string }) => Promise<void>;
  supportsResumeInTerminal: boolean;
  codexResumeUsesNoDaemon?: boolean;
}>) => ({
  handleDeleteSession: vi.fn(async () => true),
  handleExportSession: vi.fn(async () => defaultExportResult),
  handleResumeSession: vi.fn(async () => {}),
  supportsResumeInTerminal: true,
  codexResumeUsesNoDaemon: false,
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

it("renders an in-panel skeleton instead of an empty detail or loading mask", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({ detail: null, detailLoading: true })}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByLabelText("close-inspector-pane")).toBeInTheDocument();
  expect(screen.getByTestId("inspector-detail-skeleton")).toBeInTheDocument();
  expect(screen.getByTestId("inspector-title-skeleton")).toBeInTheDocument();
  expect(screen.getByTestId("inspector-metadata-skeleton")).toBeInTheDocument();
  expect(screen.getByTestId("inspector-conversation-skeleton")).toBeInTheDocument();
  expect(screen.queryByTestId("inspector-loading-mask")).not.toBeInTheDocument();
  expect(screen.queryByText("未选择会话")).not.toBeInTheDocument();
});

it("switches to the next session skeleton before its detail request resolves", () => {
  const detailPanel = {
    ...buildDetailPanel(),
    activeSession: {
      sourceTool: "claude",
      sourceId: "next-session",
      title: "新会话标题",
      isSubagent: false,
    },
  };

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={detailPanel}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByTestId("inspector-detail-skeleton")).toBeInTheDocument();
  expect(screen.getByText("新会话标题")).toBeInTheDocument();
  expect(screen.queryByText(defaultSessionDetail.title)).not.toBeInTheDocument();
});

it("shows a quiet sync status while cached detail is being revalidated", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({ detailLoading: true })}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent("同步中");
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

it("moves inspector sessions to the trash without offering a permanent-delete switch", async () => {
  const mutation = buildMutation();

  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={mutation}
    />,
  );

  expect(screen.queryByLabelText("hard-delete-toggle")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "删除此记录" }));

  await waitFor(() => {
    expect(mutation.handleDeleteSession).toHaveBeenCalledWith(
      defaultSessionDetail.sourceTool,
      defaultSessionDetail.sourceId,
      {
        hardDelete: false,
        cascadeSubagents: true,
      },
    );
  });
});

it("places export and delete actions together in one compact footer row", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const actionRow = document.querySelector(".inspector-actions .inspector-action-row");

  expect(actionRow).toContainElement(screen.getByRole("button", { name: "导出为 Markdown" }));
  expect(actionRow).toContainElement(screen.getByRole("button", { name: "删除此记录" }));
  expect(actionRow?.querySelectorAll("button")).toHaveLength(2);
  expect(document.querySelector(".inspector-danger-zone")).not.toBeInTheDocument();
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

it("shows the no-daemon Codex command in an elevated Windows context", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation({ codexResumeUsesNoDaemon: true })}
    />,
  );

  expect(screen.getByText(`codex --no-daemon resume ${defaultSessionDetail.sourceId}`)).toBeInTheDocument();
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

it("shows compact token counts with exact values available on hover", () => {
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
  const inputValue = within(infoGrid as HTMLElement).getByText("约 13.8 万");
  const outputValue = within(infoGrid as HTMLElement).getByText("约 1.2 亿");

  expect(inputValue).toHaveAttribute("title", "137,560");
  expect(outputValue).toHaveAttribute("title", "123,456,789");
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

it("keeps copy inside the command field and presents resume as a labeled primary action", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByLabelText("copy-resume-command")).toHaveClass("inspector-command-action");
  expect(screen.getByLabelText("copy-resume-command")).toHaveClass("inspector-resume-copy-action");
  expect(screen.getByLabelText("resume-session-from-inspector")).toHaveClass("inspector-resume-command-button");
  expect(screen.getByLabelText("resume-session-from-inspector")).toHaveTextContent("恢复会话");
});

it("groups resume command actions below a dedicated label", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const resumeGroup = screen.getByTestId("inspector-resume-command");
  const commandControls = resumeGroup.querySelector(".inspector-resume-command-controls");
  const copyButton = screen.getByLabelText("copy-resume-command");
  const resumeButton = screen.getByLabelText("resume-session-from-inspector");

  expect(resumeGroup.querySelector(".inspector-resume-command-label")).toHaveTextContent("恢复命令");
  expect(commandControls).toContainElement(copyButton);
  expect(commandControls).toContainElement(resumeButton);
  expect(resumeButton.closest(".command-wrapper")).toBeNull();
  expect(commandControls?.children).toHaveLength(2);
});

it("places the combined subagent summary action in the conversation title row", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({ subagentRows: defaultSubagentRows.slice(0, 1) })}
      mutation={buildMutation()}
    />,
  );

  const conversationTitleRow = screen.getByText("对话记录").closest(".section-title");
  const subagentButton = screen.getByLabelText("open-subagent-summary");

  expect(subagentButton).toHaveTextContent("子代理 1 个");
  expect(conversationTitleRow?.querySelector(".section-title-actions")).toContainElement(subagentButton);
  expect(screen.queryByText("子代理梳理")).not.toBeInTheDocument();
});

it("hides the subagent action when the session has no subagents", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({ subagentRows: [], subagentsLoading: false })}
      mutation={buildMutation()}
    />,
  );

  expect(screen.queryByLabelText("open-subagent-summary")).not.toBeInTheDocument();
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

it("renders the loaded message count as quiet text metadata", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: { ...defaultSessionDetail, messageLoaded: 2, messageTotal: 2 },
      })}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByText("2 / 2 条")).toHaveClass("message-progress-text");
  expect(screen.queryByText("已加载 2 / 共 2 条")).not.toBeInTheDocument();
});

it("uses a clear load-more label when more conversation messages are available", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: { ...defaultSessionDetail, messageLoaded: 120, messageTotal: 162 },
      })}
      mutation={buildMutation()}
    />,
  );

  expect(screen.getByLabelText("load-more-messages")).toHaveTextContent("加载更多");
});

it("allows loading more messages from the expanded conversation modal", () => {
  const onLoadMoreMessages = vi.fn();
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: { ...defaultSessionDetail, messageLoaded: 120, messageTotal: 162 },
        onLoadMoreMessages,
      })}
      mutation={buildMutation()}
    />,
  );

  fireEvent.click(screen.getByLabelText("open-conversation-modal"));
  const conversationModal = screen.getByTestId("conversation-modal");
  expect(conversationModal).toBeInTheDocument();
  expect(within(conversationModal).getByText("120 / 162 条")).toBeInTheDocument();

  fireEvent.click(within(conversationModal).getByLabelText("load-more-conversation-modal-messages"));
  expect(onLoadMoreMessages).toHaveBeenCalledOnce();
});

it("shows an in-place loading indicator while the conversation modal fetches more messages", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel({
        detail: { ...defaultSessionDetail, messageLoaded: 120, messageTotal: 162 },
        detailLoading: true,
      })}
      mutation={buildMutation()}
    />,
  );

  fireEvent.click(screen.getByLabelText("open-conversation-modal"));
  const conversationModal = screen.getByTestId("conversation-modal");
  const loadMoreButton = within(conversationModal).getByLabelText("load-more-conversation-modal-messages");

  expect(loadMoreButton).toBeDisabled();
  expect(loadMoreButton).toHaveTextContent("正在加载");
  expect(within(conversationModal).getByRole("status")).toHaveTextContent("正在加载更多对话记录");
  expect(within(conversationModal).getByText(defaultSessionDetail.messages[0]?.content ?? "")).toBeInTheDocument();
});

it("groups the tool and session type while keeping the title in its own header row", () => {
  render(
    <InspectorPanel
      panelWidth={360}
      detailPanel={buildDetailPanel()}
      mutation={buildMutation()}
    />,
  );

  const stickyHeader = screen.getByTestId("inspector-sticky-header");
  const context = stickyHeader.querySelector(".inspector-context");
  const title = stickyHeader.querySelector(".inspector-title");

  expect(stickyHeader).toBeInTheDocument();
  expect(context).toContainElement(within(stickyHeader).getByText("Codex 会话记录"));
  expect(context).toContainElement(within(stickyHeader).getByText("主会话"));
  expect(title).toContainElement(within(stickyHeader).getByText(defaultSessionDetail.title));
  expect(title).not.toContainElement(within(stickyHeader).getByText("主会话"));
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
