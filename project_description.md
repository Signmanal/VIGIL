# Project Memory

## Project Paths
- 项目根目录：/Users/chiyuchou/Desktop/Ahen/VIGIL
- 路由注册文件：web/src/App.tsx, apps/desktop/src/app/routes.ts
- 页面输出目录：web/src/pages, apps/desktop/src/app

## Design Context
- 产品名称：VIGIL
- 默认视觉方向：Sentinel Ops
- 目标用户：在终端、dashboard、desktop 中运行本地优先 AI 安全运营代理的开发者与安全运营人员
- 主要场景：启动 CLI/TUI、查看 dashboard、使用 desktop chat 与配置界面、识别代理状态与安全运营上下文
- 品牌语气：克制、可靠、指挥台感、本地优先；避免 Hermes/Nous 默认视觉残留和夸张霓虹 hacker 感
- 品牌主色：#38BDF8
- 功能色：
  - success: #34D399
  - warning: #F59E0B
  - danger: #EF4444
  - info: #38BDF8
- Sentinel Ops palette:
  - background-dark: #08111F
  - background-alt: #111827
  - surface: #162033
  - surface-alt: #1F2937
  - sensor-cyan: #38BDF8
  - signal-green: #34D399
  - incident-amber: #F59E0B
  - danger-red: #EF4444
  - text-primary: #E5E7EB
  - text-muted: #9CA3AF
  - border: #334155

## Delivery Defaults
- 包管理器：npm workspaces
- 启动命令：vigil, vigil --tui, vigil dashboard, npm --workspace apps/desktop run dev
- 构建命令：
  - dashboard: npm --workspace web run build
  - TUI: npm --workspace ui-tui run build
  - desktop: npm --workspace apps/desktop run build

## Architecture Baseline
- Classic CLI 使用 Python Rich/banner/skin engine 渲染默认 ASCII 与 skin。
- Ink TUI 使用 ui-tui/src/banner.ts 与 ui-tui/src/theme.ts 渲染默认终端视觉。
- Dashboard 源码在 web/，构建产物进入 vigil_cli/web_dist，由 vigil_cli/web_server.py 提供主题列表 API。
- Desktop 是 Electron + React + Tailwind 主题系统，默认主题由 apps/desktop/src/themes/presets.ts 与 context.tsx 决定。

## Collaboration Contract
- 不重命名公开产品、包名、CLI 命令或既有 VIGIL 标识。
- Sentinel Ops 是默认视觉系统和主题方向，不是产品新名称。
- 不删除或改写 LICENSE、NOTICE.md、UPSTREAM_SYNC.md 等法律或上游维护归属文档。
- 默认体验不得继续显示 Hermes/Caduceus 或 Nous 品牌身份；旧主题可保留为兼容选项。

## Risk & Constraints
- 旧 `nous` saved theme 偏好必须继续可解析，避免 desktop fresh/upgrade 启动失败。
- Dashboard 内置主题名需要前后端同步，否则主题列表和实际应用会分叉。
- web_dist 必须由 web 源码构建生成，不手工编辑 dist。
- Branding 扫描不能把法律/维护归属文档里的 upstream attribution 当作违规项。

## Open Questions
- 无；本轮默认从本地 main 创建设计分支并实现 repo 文档 + 代码。

## Evidence Index
- VIGIL 产品定位与多端结构 -> AGENTS.md
- CLI skin/banner 入口 -> vigil_cli/skin_engine.py, vigil_cli/banner.py, cli.py
- Ink TUI 默认视觉入口 -> ui-tui/src/banner.ts, ui-tui/src/theme.ts, ui-tui/src/components/branding.tsx
- Dashboard 主题入口 -> web/src/themes/presets.ts, web/src/index.css, vigil_cli/web_server.py
- Desktop 主题和品牌资产入口 -> apps/desktop/src/themes/presets.ts, apps/desktop/src/themes/context.tsx, apps/desktop/src/components/brand-mark.tsx

## Last Updated
- 日期：2026-06-26
- 来源：opt-pro-ux-code-init / Sentinel Ops implementation plan
