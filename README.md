# AI 会话管理

一个本地离线的 AI 会话管理桌面应用，用来集中浏览、检索、整理和导出 Codex、Claude、Gemini 等命令行 AI 工具留下的历史会话。

应用基于 Tauri、React、TypeScript 和 Rust 构建。会话数据只在本机扫描和索引，不依赖云端服务。

## 功能特性

- 多来源会话扫描：支持 Codex、Claude、Gemini 的本地会话目录。
- 本地索引与列表浏览：按工具、时间、工作区、会话状态查看历史记录。
- 会话详情预览：查看消息内容、来源路径、工作区、时间、Token 统计等信息。
- 会话恢复：可从列表或详情中调用对应 CLI 恢复会话。
- 终端偏好检测：根据 Windows、macOS、Linux 平台检测常见终端，并支持自动选择。
- 导出 Markdown：将会话导出为 Markdown 文件，便于归档或分享。
- 回收站与删除：支持软删除、恢复、批量删除和清空回收站。
- 本地设置：支持主题、扫描来源、删除策略、恢复终端等配置。
- 更新检查：可检查 GitHub Release 中的新版信息。
- GitHub Actions 发布：支持 Windows 和 macOS 自动构建发布产物。

## 数据来源

应用会扫描用户主目录下常见的 AI 工具数据目录：

| 工具 | 默认目录 |
| --- | --- |
| Codex | `~/.codex` |
| Claude | `~/.claude` |
| Gemini | `~/.gemini` |

实际可用数据取决于对应工具是否已在本机产生历史会话文件。

## 隐私说明

- 应用不会主动上传会话内容。
- 会话索引和设置保存在本机应用数据目录。
- 导出 Markdown 时，导出内容由用户自行选择保存位置。
- 使用“恢复会话”功能时，会调用本机已安装的对应 CLI 工具。

## 系统要求

运行应用：

- Windows 10 / Windows 11，需 WebView2 Runtime。
- macOS，需系统支持 Tauri 2 运行时要求。
- Linux，需 WebKitGTK 等桌面运行时依赖。

本地开发：

- Node.js 22 或较新版本。
- pnpm 10。
- Rust stable。
- Tauri 所需的系统依赖。

Linux 开发环境通常需要安装：

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

## 本地开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm tauri dev
```

运行前端测试：

```bash
pnpm test
```

运行 Rust 测试：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

运行端到端测试：

```bash
pnpm e2e
```

## 构建发布版

Windows 构建：

```bash
pnpm run release:windows
```

构建完成后，英文命名的发布产物会生成在：

```text
release-assets/
```

示例文件名：

```text
ai-session-manager-v0.1.1-windows-x64-portable.exe
ai-session-manager-v0.1.1-windows-x64-setup.exe
ai-session-manager-v0.1.1-windows-x64.msi
```

macOS 构建需要在 macOS 机器上执行：

```bash
pnpm run release:macos
```

示例文件名：

```text
ai-session-manager-v0.1.1-macos-universal.dmg
```

如果已经完成 Tauri 构建，只想重新整理英文发布文件名：

```bash
pnpm run release:assets
```

## 项目结构

```text
.
├── .github/workflows/     # CI 和发布流程
├── e2e/                   # Playwright 端到端测试
├── public/                # 前端静态资源
├── scripts/               # 发布产物整理与校验脚本
├── src/                   # React 前端
├── src-tauri/             # Tauri / Rust 后端
└── vendor/                # 固定依赖源码补丁
```

## 常用命令

```bash
pnpm install
pnpm tauri dev
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm run release:windows
```

## 许可证

本项目基于 MIT License 开源，详见 [LICENSE](./LICENSE)。

