# AI 旅行规划师（Web）使用说明

本项目是一个基于 React + Vite 的中文 AI 旅行规划器，支持文字/语音输入生成个性化行程、地图联动展示、费用记录与预算分析，以及可选的登录与云端同步。

## 功能特性
- 智能行程生成：输入目的地、天数、预算、人数与偏好，一键生成每日安排。
- 地图联动：在高德地图查看每日地点、路线与位置详情。
- 费用记录与分析：支持文字快速录入开销与 AI 预算分析。
- 登录与同步：可选使用 Firebase 保存与加载计划，未配置时自动使用本地存储。
- 语音输入（可选）：集成科大讯飞或浏览器原生识别，支持中文语音指令。

## 环境准备
- Node.js 18+ 与 npm。
- 进入 `client` 目录执行依赖安装：
  - `npm install`

## 开发与构建
- 开发启动：在 `client` 目录运行 `npm run dev`，访问 `http://localhost:5173/`。
- 生产构建：`npm run build`；本地预览：`npm run preview`。

## 配置说明（.env）
- LLM 提供商：
  - `VITE_LLM_PROVIDER` = `openai` | `dashscope`（如未设置，将按密钥自动推断；都没有时使用本地模拟）
  - OpenAI：`VITE_OPENAI_API_KEY`，`VITE_OPENAI_MODEL`
  - DashScope：`VITE_DASHSCOPE_API_KEY`，`VITE_DASHSCOPE_MODEL`
- 高德地图：
  - `VITE_AMAP_KEY`（Web 端 JS API Key；域名白名单需包含 `localhost`）
  - `VITE_AMAP_SECURITY_JS_CODE`（如开启安全策略则必填）
  - `VITE_AMAP_REST_KEY`（可选，文本检索备用）
- 语音识别（可选）：
  - `VITE_ASR_PROVIDER` = `xfyun` | `web`
  - 讯飞：`VITE_XFYUN_APP_ID`，`VITE_XFYUN_API_KEY`，`VITE_XFYUN_API_SECRET`
- 云端同步（可选 Firebase）：
  - `VITE_FIREBASE_API_KEY`，`VITE_FIREBASE_AUTH_DOMAIN`，`VITE_FIREBASE_PROJECT_ID`，`VITE_FIREBASE_APP_ID`（未配置则自动使用浏览器 localStorage）

修改 `.env` 后需要重启开发服务器。完整示例见 `client/.env.example`。

## 使用指南
- 生成行程：在首页填写目的地、天数、预算、人数与偏好，点击“生成行程”。
- 地图与日切换：生成后可在地图查看每日地点并在侧栏切换“第 N 天”。
- 费用记录：
  - 快速录入示例：输入 “晚餐 85 元 第1天”，点击“解析并记录”。
  - 手动录入：填写金额、分类（交通/住宿/餐饮/门票/购物/其他）、第几天与备注。
- AI 预算分析：点击“AI 预算分析”按钮，查看整体与分类建议、每日提醒与小贴士。
- 登录与云端：
  - 页面 `/login` 支持注册/登录。未配置 Firebase 时使用本地模拟账户与本地存储。
  - 已登录情况下可保存计划、列出与加载历史计划。
- 开发预览自动生成：在开发模式可通过 URL 参数触发，如：
  - `/?auto=1&destination=上海&days=3&budget=6000&people=2&preferences=美食,文化`

## 常见问题
- 地图报错 `Error key!`：
  - 确认 `VITE_AMAP_KEY` 为“Web 端（JS API）”类型；在高德控制台将 `localhost` 加入域名白名单。
  - 若启用了安全策略，需正确配置 `VITE_AMAP_SECURITY_JS_CODE`。
  - 修改后重启开发服务器并刷新页面。
- 语音识别失败：检查麦克风权限与网络，或将 `VITE_ASR_PROVIDER` 切换为 `web` 使用浏览器原生识别。
- LLM 调用受限：确保所选提供商密钥有效；未配置将回退为本地模拟以便前端流程验证。
- 云端同步失败：若未配置 Firebase，将使用本地存储；如需云端，补全相关环境变量后重试。

## 隐私与安全
- 仅在授权后访问麦克风与位置信息；行程与费用数据仅用于功能实现。
- 请勿将真实密钥提交仓库；`.env` 已在 `.gitignore` 中。

## 许可证
- 本项目采用 MIT 许可证，详见 `LICENSE`。