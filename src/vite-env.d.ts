/// <reference types="vite/client" />

declare global {
  interface Window {
    __AI_SESSION_MANAGER_INVOKE_MOCK__?: <TResult>(
      command: string,
      args?: Record<string, unknown>,
    ) => Promise<TResult>;
    __AI_SESSION_MANAGER_E2E_STATE__?: unknown;
  }
}
