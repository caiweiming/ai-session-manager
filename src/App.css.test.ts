import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(process.cwd(), "src/App.css"), "utf8");
const mainArea = readFileSync(path.resolve(process.cwd(), "src/components/layout/MainArea.tsx"), "utf8");
const sessionTableParts = readFileSync(path.resolve(process.cwd(), "src/components/sessions/SessionTableParts.tsx"), "utf8");
const sidebar = readFileSync(path.resolve(process.cwd(), "src/components/layout/Sidebar.tsx"), "utf8");

describe("App.css switch alignment", () => {
  it("keeps switch thumb vertically centered in inspector and modal variants", () => {
    expect(css).toMatch(/\.slider::before\s*{[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\);/s);
    expect(css).toMatch(/\.slider::before\s*{[^}]*transition:\s*transform 120ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);[^}]*will-change:\s*transform;/s);
    expect(css).toMatch(/\.slider\s*{[^}]*transition:\s*none;/s);
    expect(css).toMatch(/\.switch input:checked \+ \.slider::before\s*{[^}]*transform:\s*translate\(18px,\s*-50%\);/s);
    expect(css).toMatch(/\.modal-content-area \.slider::before\s*{[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\);/s);
    expect(css).toMatch(
      /\.modal-content-area \.switch input:checked \+ \.slider::before\s*{[^}]*transform:\s*translate\(14px,\s*-50%\);/s,
    );
  });

  it("stretches session table cells to the full row height so operation column dividers stay aligned", () => {
    expect(css).toMatch(/\.session-table-cell\s*{[^}]*align-self:\s*stretch;/s);
    expect(css).toMatch(/\.session-table-cell\s*{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
    expect(css).toMatch(/\.session-table\s*{[^}]*--session-table-columns:\s*40px 92px minmax\(0,\s*1fr\) 172px 172px 92px;/s);
    expect(css).toMatch(/\.session-table-cell\s*{[^}]*padding:\s*12px 14px;/s);
    expect(css).toMatch(/\.path-cell\s*{[^}]*color:\s*var\(--text-secondary\);/s);
    expect(css).toMatch(/\.group-header:hover \.group-path-text,\s*\.group-header\.selected \.group-path-text\s*{[^}]*color:\s*var\(--text-main\);/s);
    expect(css).toMatch(/\.session-title-btn\s*{[^}]*color:\s*var\(--text-main\);[^}]*font-weight:\s*500;/s);
    expect(css).toMatch(/\.session-row\.selected \.session-title-btn\s*{[^}]*color:\s*var\(--text-main\);[^}]*font-weight:\s*600;/s);
    expect(css).toMatch(/\.session-kind-chip\s*{[^}]*font-size:\s*10px;/s);
    expect(css).toMatch(/\.session-kind-chip\s*{[^}]*padding:\s*1px 6px;/s);
    expect(css).toMatch(/\.session-size-value\s*{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.035\);[^}]*border:\s*1px solid rgba\(148,\s*163,\s*184,\s*0\.16\);/s);
    expect(css).toMatch(/\.session-row\.subagent-row \.session-name-cell\s*{[^}]*gap:\s*6px;[^}]*padding-left:\s*22px;/s);
    expect(css).toMatch(/\.session-row\.subagent-row \.session-title-btn\s*{[^}]*color:\s*var\(--text-secondary\);/s);
    expect(css).toMatch(/\.session-row\.subagent-row\.selected \.session-title-btn\s*{[^}]*color:\s*var\(--text-main\);/s);
  });

  it("keeps directory status indicators stable, keyboard-visible, and motion-safe", () => {
    expect(css).toMatch(/\.directory-status-indicator\s*{[^}]*width:\s*16px;[^}]*height:\s*16px;[^}]*flex:\s*0 0 16px;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
    expect(css).toMatch(/\.directory-status-indicator svg\s*{[^}]*width:\s*16px;[^}]*height:\s*16px;/s);
    expect(css).toMatch(/\.directory-status-indicator:focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\);[^}]*outline-offset:\s*2px;/s);
    expect(css).toMatch(/\.directory-status-tooltip\s*{[^}]*box-shadow:\s*0 8px 18px rgba\(0,\s*0,\s*0,\s*0\.24\);[^}]*font-family:\s*var\(--font-ui\);[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;/s);
    expect(css).toMatch(/\.directory-status-tooltip-above\s*{[^}]*bottom:\s*calc\(100% \+ 7px\);/s);
    expect(css).toMatch(/\.directory-status-tooltip-below\s*{[^}]*top:\s*calc\(100% \+ 7px\);/s);
    expect(css).toMatch(/\.directory-status-indicator:hover \.directory-status-tooltip,[\s\S]*\.directory-status-indicator:focus-visible \.directory-status-tooltip\s*{[^}]*visibility:\s*visible;[^}]*opacity:\s*1;/s);
    expect(css).toMatch(/\.directory-status-missing,[\s\S]*\.directory-status-unavailable\s*{[^}]*color:\s*var\(--danger\);/s);
    expect(css).toMatch(/\.directory-status-unknown,[\s\S]*\.directory-status-unchecked\s*{[^}]*color:\s*var\(--text-muted\);/s);
    expect(css).toMatch(/\.directory-status-checking\s*{[^}]*color:\s*var\(--text-secondary\);/s);
    expect(css).toMatch(/\.directory-status-checking svg\s*{[^}]*animation:\s*directory-status-spin 0\.8s linear infinite;/s);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*{[^}]*\.directory-status-checking svg\s*{[^}]*animation:\s*none;/s);
  });

  it("renders scan failure states inline in the main area and sidebar", () => {
    expect(css).toMatch(/\.main-area-error-banner\s*{[^}]*border:\s*1px solid rgba\(239,\s*68,\s*68,\s*0\.18\);[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.main-area-error-title\s*{[^}]*font-weight:\s*700;[^}]*color:\s*#f87171;/s);
    expect(css).toMatch(/\.sidebar-metric-row-error\s*{[^}]*background:\s*rgba\(239,\s*68,\s*68,\s*0\.05\);/s);
    expect(css).toMatch(/\.sidebar-metric-value-error\s*{[^}]*font-size:\s*13px;[^}]*color:\s*#f87171;/s);
  });

  it("animates the sidebar rescan icon while a scan is running", () => {
    expect(css).toMatch(/\.btn-refresh-icon svg\.spinning\s*{[^}]*animation:\s*inspector-loading-spin 0\.85s linear infinite;/s);
  });

  it("treats the scan failure metric as a button and styles the scan failure panel", () => {
    expect(css).toMatch(/\.sidebar-metric-row-button\s*{[^}]*width:\s*100%;[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.scan-failures-panel\s*{[^}]*z-index:\s*910;/s);
  });

  it("renders scan failure row actions as compact icon buttons", () => {
    expect(css).toMatch(/\.scan-failures-icon-button\s*{[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*border-radius:\s*8px;/s);
    expect(css).toMatch(/\.scan-failures-item-actions\s*{[^}]*display:\s*inline-flex;[^}]*gap:\s*8px;/s);
    expect(css).toMatch(/\.scan-failures-icon-button\.copied\s*{[^}]*color:\s*#16a34a;/s);
    expect(css).toMatch(/\.scan-failures-section-title\s*{[^}]*font-weight:\s*600;[^}]*margin-bottom:\s*10px;/s);
    expect(css).toMatch(/\.scan-failures-section-toggle\s*{[^}]*display:\s*inline-flex;[^}]*cursor:\s*pointer;/s);
    expect(css).toMatch(/\.scan-failures-section-chevron\.expanded\s*{[^}]*transform:\s*rotate\(180deg\);/s);
    expect(css).toMatch(/\.scan-failures-section-action\s*{[^}]*background:\s*transparent;[^}]*font-size:\s*12px;/s);
    expect(css).toMatch(/\.scan-failures-item-muted\s*{[^}]*opacity:\s*0\.84;/s);
    expect(css).toMatch(/\.scan-failures-item\s*{[^}]*padding:\s*10px 0;[^}]*border-radius:\s*0;|\.scan-failures-item\s*{[^}]*border-radius:\s*0;[^}]*padding:\s*10px 0;/s);
    expect(css).toMatch(/\.scan-failures-item-meta\s*{[^}]*display:\s*grid;[^}]*gap:\s*4px;/s);
  });

  it("reserves the blue selection surface for explicitly selected session rows", () => {
    expect(css).toMatch(/\.session-row\.selected\s*{[^}]*background:\s*var\(--bg-row-selected\);/s);
    expect(css).not.toMatch(
      /:root\[data-theme-mode="light"\]\s+\.group-header\s*{[^}]*background:/s,
    );
  });

  it("uses the sticky group surface for expanded parent rows without overriding selected rows", () => {
    expect(mainArea).toBeTruthy();
    const sessionTableParts = readFileSync(
      path.resolve(process.cwd(), "src/components/sessions/SessionTableParts.tsx"),
      "utf8",
    );
    expect(sessionTableParts).toContain('${expanded ? " expanded" : ""}');
    expect(css).toMatch(/\.group-header\.expanded:not\(\.selected\)\s*{\s*background:\s*var\(--bg-panel\);\s*}/s);
    expect(css).not.toMatch(/\.group-header\.expanded:not\(\.selected\)\s*{[^}]*border-bottom:/s);
    expect(css).toMatch(/\.session-table-sticky-group,\s*:root\[data-theme-mode="light"\] \.session-table-sticky-group\s*{[^}]*border-bottom:\s*1px solid var\(--border-color\);/s);
  });

  it("marks batch-selected group rows with a subtle surface distinct from active selection", () => {
    expect(css).toMatch(/\.group-header\.checked:not\(\.selected\)\s*{[^}]*background:\s*rgba\(10,\s*102,\s*204,\s*0\.035\);/s);
  });

  it("keeps overview timestamps visually secondary to paths and session titles", () => {
    expect(css).toMatch(/\.session-table \.time-cell\s*{[^}]*color:\s*var\(--text-secondary\);[^}]*font-weight:\s*400;/s);
  });

  it("renders group session counts as quiet metadata rather than a filled badge", () => {
    expect(css).toMatch(/\.session-count\s*{[^}]*background:\s*transparent;[^}]*padding:\s*0;[^}]*border-radius:\s*0;/s);
    expect(css).toMatch(/\.group-header:hover \.session-count\s*{[^}]*color:\s*var\(--text-secondary\);/s);
  });

  it("keeps sidebar selection neutral while preserving distinct storage source colors", () => {
    expect(css).toMatch(/\.sidebar\s*{[^}]*border-right-color:\s*var\(--bg-panel\);/s);
    expect(css).toMatch(/\.nav-item\.active,\s*\.filter-item\.active\s*{[^}]*background:\s*var\(--nav-active-bg\);[^}]*color:\s*var\(--text-main\);/s);
    expect(css).toMatch(/\.storage-segment\.codex\s*{[^}]*background:\s*#5f8fbf;/s);
    expect(css).toMatch(/\.storage-segment\.gemini\s*{[^}]*background:\s*#5c9d91;/s);
    expect(css).toMatch(/\.storage-segment\.claude\s*{[^}]*background:\s*#b58066;/s);
  });

  it("separates the sidebar storage summary through spacing instead of a horizontal rule", () => {
    expect(css).toMatch(/\.storage-widget\s*{[^}]*margin-top:\s*auto;[^}]*padding-top:\s*18px;[^}]*border-top:\s*none;/s);
  });

  it("uses one value size in data overview and keeps tool session counts unboxed", () => {
    expect(css).toMatch(/\.sidebar-metric-value\.metric-time\s*{[^}]*font-size:\s*14px;/s);
    expect(css).toMatch(/\.tool-session-count\s*{[^}]*border:\s*none;[^}]*background:\s*transparent;[^}]*padding:\s*0;/s);
    expect(sidebar).toContain('className="nav-badge tool-session-count"');
  });

  it("keeps the inspector header compact and reserves scrolling for the conversation section", () => {
    expect(css).toMatch(/\.inspector-title-text\s*{[^}]*-webkit-line-clamp:\s*3;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.inspector-sticky-header\s*{[^}]*padding-left:\s*20px;[^}]*padding-right:\s*20px;/s);
    expect(css).toMatch(/\.inspector-context > \.tag,[\s\S]*\.inspector-context \.session-kind-chip\.inspector\s*{[\s\S]*height:\s*20px;/s);
    expect(css).toMatch(/\.inspector-scroll-area\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.conversation-section\s*{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.conversation-section \.preview-box\s*{[^}]*flex:\s*1;[^}]*max-height:\s*none;/s);
  });

  it("keeps the overview toolbar compact and treats group expansion as a neutral action", () => {
    expect(mainArea).not.toContain("<h1>会话总览</h1>");
    expect(mainArea).toMatch(/className="btn-secondary toolbar-icon-btn toolbar-neutral-action"\s*onClick=\{handleResetFilters\}/s);
    expect(mainArea).toMatch(/className="btn-secondary toolbar-inline-btn toolbar-neutral-action"\s*onClick=\{\(\) => void handleBatchRestore\(\)\}/s);
    expect(mainArea).toMatch(/className="btn-secondary toolbar-inline-btn toolbar-neutral-action"\s*onClick=\{handleClearTrashClick\}/s);
    expect(mainArea).toMatch(/className="btn-secondary toolbar-icon-btn toolbar-neutral-action"\s*aria-label="group-expand-toggle"/s);
    expect(css).toMatch(/toolbar-neutral-action\s*{[^}]*background:\s*var\(--bg-panel\);[^}]*border-color:\s*var\(--border-color\);[^}]*color:\s*var\(--text-secondary\);/s);
    expect(css).toMatch(/\.toolbar-neutral-action:hover:not\(:disabled\)\s*{[^}]*background:\s*var\(--bg-panel-hover\);[^}]*color:\s*var\(--text-main\);/s);
    expect(css).toMatch(/toolbar-neutral-action:disabled\s*{[^}]*background:\s*var\(--bg-panel\);[^}]*border-color:\s*var\(--border-color\);[^}]*color:\s*var\(--text-muted\);/s);
    expect(css).toMatch(/\.search-box,\s*\.custom-select-trigger,\s*\.btn,\s*\.btn-secondary\s*{[^}]*background:\s*var\(--bg-panel\);/s);
  });

  it("aligns overview summary metadata in its own labeled column and reduces repeated tool surfaces", () => {
    expect(sessionTableParts).toContain('role="columnheader">会话 / 占用</div>');
    expect(sessionTableParts).not.toContain('role="columnheader">创建时间</div>');
    expect(sessionTableParts).toContain('role="columnheader">更新时间</div>');
    expect(sessionTableParts).toContain('className="session-table-cell col-summary"');
    expect(css).toMatch(/--session-table-columns:\s*42px 84px minmax\(260px, 1fr\) 126px 150px 74px;/);
    expect(css).toMatch(/:root\[data-theme-mode="light"\] \.session-table \.table-tool-tag\s*{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.toolbar\s*{[^}]*justify-content:\s*flex-start;/s);
  });

  it("uses one 36px control height across the overview toolbar", () => {
    expect(css).toMatch(/\.toolbar \.search-box,[\s\S]*\.toolbar \.toolbar-custom-select \.custom-select-trigger,[\s\S]*\.toolbar \.toolbar-inline-btn,[\s\S]*\.toolbar \.toolbar-icon-btn,[\s\S]*\.toolbar \.btn\s*{[\s\S]*height:\s*36px;[\s\S]*min-height:\s*36px;/);
  });

  it("matches the active select option to the sidebar selection treatment", () => {
    expect(css).toMatch(/\.custom-select-option\.active\s*{[^}]*background:\s*var\(--nav-active-bg\);[^}]*color:\s*var\(--text-main\);[^}]*font-weight:\s*600;[^}]*box-shadow:\s*none;/s);
  });

  it("defines the select option keyboard focus treatment", () => {
    expect(css).toMatch(/\.custom-select-option:focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\);[^}]*outline-offset:\s*-2px;/s);
  });

  it("keeps table metadata aligned and visually consistent", () => {
    expect(sessionTableParts).toContain('className="session-meta-text"');
    expect(sessionTableParts).toContain('{row.isSubagent ? "子代理" : "主会话"} · {formatSizeForDisplay(row.sizeBytes)}');
    expect(css).toMatch(/\.session-table-header \.col-summary,\s*\.session-table-header \.col-time\s*{[^}]*justify-content:\s*flex-start;[^}]*text-align:\s*left;/s);
    expect(css).toMatch(/\.session-table-header\s*{[^}]*padding-right:\s*var\(--session-table-scrollbar-gutter, 0px\);/s);
    expect(css).toMatch(/\.session-table-viewport\s*{[^}]*scrollbar-gutter:\s*stable;/s);
    expect(css).toMatch(/\.toolbar-actions\s*{[^}]*margin-left:\s*20px;/s);
    expect(css).toMatch(/\.sidebar-metric-value:not\(\.sidebar-metric-value-error\)\s*{[^}]*font-size:\s*14px;[^}]*font-weight:\s*600;/s);
  });

  it("prevents side navigation containers from creating horizontal scrollbars", () => {
    expect(css).toMatch(/\.sidebar-scroll-area\s*{[^}]*overflow-x:\s*hidden;/s);
    expect(css).toMatch(/\.workspace-list\s*{[^}]*overflow-x:\s*hidden;/s);
  });

  it("keeps table cells within their shared grid tracks", () => {
    expect(css).toMatch(/\.session-table \.col-checkbox,\s*\.session-table \.col-tool,\s*\.session-table \.col-time,\s*\.session-table \.col-action\s*{[^}]*width:\s*auto;/s);
  });

  it("keeps supporting sidebar and destructive batch controls visually restrained", () => {
    expect(css).toMatch(/\.brand-title\s*{[^}]*font-weight:\s*600;/s);
    expect(css).toMatch(/\.brand-icon\s*{[^}]*width:\s*28px;[^}]*height:\s*28px;[^}]*background:\s*linear-gradient\(135deg, #6366f1, #818cf8\);/s);
    expect(css).toMatch(/:root\[data-theme-mode="light"\] \.brand-icon\s*{[^}]*background:\s*linear-gradient\(135deg, #4f46e5, #818cf8\);/s);
    expect(css).not.toMatch(/@media \(max-width: 1400px\)\s*{\s*\.brand-version\s*{\s*display:\s*none;/s);
    expect(css).toMatch(/\.sidebar-metrics\s*{[^}]*border-color:\s*rgba\(127, 127, 118, 0\.12\);[^}]*background:\s*rgba\(127, 127, 118, 0\.015\);/s);
    expect(css).toMatch(/\.toolbar-actions \.btn-danger-solid:disabled\s*{[^}]*border-color:\s*rgba\(196, 60, 53, 0\.22\);[^}]*color:\s*rgba\(196, 60, 53, 0\.48\);/s);
  });

  it("matches the settings modal surface hierarchy to the main application layout", () => {
    expect(css).toMatch(/\.modal-nav\s*{[^}]*background:\s*var\(--bg-panel\);[^}]*border-right:\s*none;/s);
    expect(css).toMatch(/\.modal-content-area\s*{[^}]*background:\s*var\(--bg-base\);/s);
    expect(css).toMatch(/\.modal-nav-item\.active\s*{[^}]*background:\s*var\(--nav-active-bg\);[^}]*color:\s*var\(--text-main\);[^}]*font-weight:\s*600;/s);
  });

  it("uses restrained overview surfaces and a clear scanning hierarchy", () => {
    expect(css).toMatch(/\.search-box\s*{[^}]*width:\s*312px;[^}]*height:\s*36px;/s);
    expect(css).toMatch(/\.toolbar-actions\s*{[^}]*gap:\s*10px;[^}]*margin-left:\s*20px;/s);
    expect(css).toMatch(/\.session-list-summary\s*{[^}]*color:\s*var\(--text-secondary\);[^}]*font-size:\s*13px;[^}]*font-weight:\s*500;/s);
    expect(css).toMatch(/\.path-cell\s*{[^}]*color:\s*var\(--text-secondary\);/s);
    expect(css).toMatch(/\.session-count\s*{[^}]*color:\s*var\(--text-muted\);/s);
    expect(css).toMatch(/\.session-meta-text\s*{[^}]*color:\s*var\(--text-muted\);/s);
    expect(css).toMatch(/\.session-table \.time-cell\s*{[^}]*color:\s*var\(--text-secondary\);/s);
  });

  it("keeps the light overview card grouped without restoring a heavy outline", () => {
    expect(css).toMatch(/:root\[data-theme-mode="light"\] \.sidebar-metrics\s*{[^}]*border-color:\s*rgba\(148, 163, 184, 0\.16\);[^}]*background:\s*rgba\(148, 163, 184, 0\.02\);/s);
    expect(css).toMatch(/:root\[data-theme-mode="light"\] \.sidebar-metric-row \+ \.sidebar-metric-row\s*{[^}]*border-top-color:\s*rgba\(148, 163, 184, 0\.12\);/s);
  });

  it("gives the terminal preference select a stable compact setting-control layout", () => {
    expect(css).toMatch(/\.settings-custom-select\s*{[^}]*width:\s*152px;[^}]*min-width:\s*152px;[^}]*max-width:\s*152px;/s);
    expect(css).toMatch(/\.settings-custom-select \.custom-select-trigger\s*{[^}]*height:\s*36px;[^}]*min-height:\s*36px;[^}]*justify-content:\s*space-between;/s);
    expect(css).toMatch(/\.settings-custom-select \.custom-select-menu\s*{[^}]*width:\s*100%;[^}]*min-width:\s*100%;[^}]*border-radius:\s*8px;/s);
  });
});
