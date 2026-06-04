import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InspectorView } from "./InspectorView";

it("renders ai badge and message createdAt", () => {
  render(
    <InspectorView
      open={true}
      onClose={() => {}}
      messages={[
        {
          role: "ai",
          content: "根据日志分析，问题出在签名算法版本不一致。",
          createdAt: "2026-04-24 15:35:10",
        },
      ]}
    />,
  );

  expect(screen.getByText("AI")).toBeInTheDocument();
  expect(screen.getByText("根据日志分析，问题出在签名算法版本不一致。")).toBeInTheDocument();
  expect(screen.getByText("2026-04-24 15:35:10")).toBeInTheDocument();
});

it("maps assistant role to ai style", () => {
  render(
    <InspectorView
      open={true}
      onClose={() => {}}
      messages={[
        {
          role: "assistant",
          content: "这是 assistant 返回的总结。",
          createdAt: "2026-04-24 16:20:00",
        },
      ]}
    />,
  );

  expect(screen.getByText("AI")).toBeInTheDocument();
  expect(screen.queryByText("开发者")).not.toBeInTheDocument();
  expect(screen.getByText("这是 assistant 返回的总结。")).toBeInTheDocument();
  expect(screen.getByText("2026-04-24 16:20:00")).toBeInTheDocument();
});

it("copies message content when clicking bubble copy button", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  render(
    <InspectorView
      open={true}
      onClose={() => {}}
      messages={[
        {
          role: "user",
          content: "请复制这段消息内容",
          createdAt: "2026-04-24 16:30:00",
        },
      ]}
    />,
  );

  fireEvent.click(screen.getByLabelText("copy-message-0"));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith("请复制这段消息内容");
  });
  expect(screen.getByLabelText("copy-message-0")).toHaveClass("copied");
});
