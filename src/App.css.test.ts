import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(process.cwd(), "src/App.css"), "utf8");

describe("App.css switch alignment", () => {
  it("keeps switch thumb vertically centered in inspector and modal variants", () => {
    expect(css).toMatch(/\.slider::before\s*{[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\);/s);
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
    expect(css).toMatch(/\.path-cell\s*{[^}]*color:\s*var\(--text-muted\);/s);
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
});
