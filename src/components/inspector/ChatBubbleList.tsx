export function ChatBubbleList({
  messages,
}: {
  messages: Array<{ role: "user" | "ai" | "tool" | "dev"; content: string }>;
}) {
  return (
    <div>
      {messages.map((m, i) => (
        <p key={i}>
          <strong>{m.role}</strong>: {m.content}
        </p>
      ))}
    </div>
  );
}
