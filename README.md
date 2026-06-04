# AI 会话管理工具

基于 Tauri + React + TypeScript 的本地离线 AI 会话管理工具。

## 当前实现范围（2026-04-24）

- 仅支持 Codex 默认目录 `~/.codex`。
- 启动应用后自动扫描会话数据，并支持手动触发重扫。
- 主区域表格展示真实会话列表，右侧 Inspector 展示真实消息预览详情。
- 尚未支持手动目录选择、Claude/Gemini 数据源、运行期文件变化监听。

## 系统要求

- macOS：`10.13` 及以上。
- Windows：推荐 `Windows 10 1803` 及以上。
- Windows 依赖 `WebView2 Runtime`；在较新的 Windows 10 / Windows 11 上通常已预装。
- 当前 macOS 安装包为 `x64` 版本，主要面向 Intel Mac；Apple Silicon 设备通常需要通过 Rosetta 运行。

## 常用命令

- 安装依赖：`pnpm install`
- 本地开发：`pnpm tauri dev`
- 运行测试：`pnpm test`
- 端到端测试：`pnpm e2e`
- 构建桌面应用：`pnpm tauri build`
- 打包校验：`pwsh ./scripts/verify-package.ps1`

## 发布前检查清单

- 同步修改以下 3 处版本号，并保持完全一致：
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- 确认应用内显示的版本号与打包版本一致。
- 至少运行一次构建校验：`pnpm build`
- 正式发布桌面安装包前，再执行：`pnpm tauri build`
- GitHub Release 的 tag 使用 `vX.Y.Z` 格式，例如 `v0.1.1`。
- 当前更新提醒依赖 GitHub Releases 的 latest，正式发布时应创建正式版 Release，避免 pre-release 影响默认更新通道。
