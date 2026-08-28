import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { defaultSessionDetail } from "../../test/tauriFixtures";
import { invokeMock } from "../../test/mockTauriInvoke";
import { ConversationWindow } from "./ConversationWindow";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    throw new Error("窗口状态在测试环境不可用");
  },
}));

beforeEach(() => {
  window.history.replaceState({}, "", "/?view=conversation&sourceTool=codex&sourceId=session-1");
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string, args?: { payload?: { messageLimit?: number } }) => {
    if (command !== "get_session_detail") return null;
    const messageLimit = args?.payload?.messageLimit ?? 120;
    const messageLoaded = Math.min(messageLimit, 320);
    return {
      detail: {
        ...defaultSessionDetail,
        messageTotal: 320,
        messageLoaded,
        messages: Array.from({ length: messageLoaded }, (_, index) => ({
          role: "assistant",
          content: `消息 ${index + 1}`,
          createdAt: "2026-04-24T10:00:00Z",
        })),
      },
    };
  });
});

it("loads additional conversation messages independently in the conversation window", async () => {
  render(<ConversationWindow />);

  expect(await screen.findByText("120 / 320 条")).toBeInTheDocument();
  expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
    payload: expect.objectContaining({ messageLimit: 120 }),
  });

  fireEvent.click(screen.getByLabelText("load-more-conversation-messages"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: expect.objectContaining({ messageLimit: 200 }),
    });
  });
  expect(await screen.findByText("200 / 320 条")).toBeInTheDocument();
});
