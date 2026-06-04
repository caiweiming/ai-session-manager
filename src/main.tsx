import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

const hideBootSplash = () => {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;

  splash.classList.add("done");
  window.setTimeout(() => {
    splash.remove();
  }, 220);
};

// Wait one frame so React UI can paint, then fade out startup shell.
window.requestAnimationFrame(() => {
  window.requestAnimationFrame(hideBootSplash);
});

if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}
