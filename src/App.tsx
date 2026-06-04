import { AppShell } from "./components/layout/AppShell";
import { ConversationWindow } from "./components/conversation/ConversationWindow";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "conversation") {
    return <ConversationWindow />;
  }
  return <AppShell />;
}
