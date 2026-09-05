# Luma — 2.5D English learning prototype

一个手机竖屏 WebApp 原型。它验证四个核心体验：

- 通过角色视线、手势和物体光环建立“共同注意”；
- 用户在同一张厨房素材中连续完成苹果、牛奶、盘子、杯子、勺子五个任务；
- 用户可以随时开口、打断和发散，对话不会因为任务状态停止收音；
- 任务调度和角色回复由同一套轮次规则协调，避免抢话、串题和残缺字幕；
- 系统在后台判断任务是否完成，不要求用户背固定答案。

## 运行

在这个目录中启动本地 Node 服务：

```bash
npm run dev
```

然后访问：

```text
http://localhost:4174
```

推荐使用最新版 Chrome 或 Safari，并允许麦克风权限。

复制环境变量模板并填写服务端密钥：

```bash
cp .env.example .env.local
```

`.env.local` 不会提交到 GitHub。语音对话使用豆包端到端实时语音，任务语义判断使用 DeepSeek；所有密钥只由 Node 服务端读取。

## 检查

```bash
npm run check
npm test
```

## 文件

- `index.html`：场景结构与无障碍语义
- `styles.css`：2.5D 空间、氛围、动效与响应式布局
- `app.js`：场景任务、轮次协调、实时字幕、拖拽和学习记录
- `dialogue-rules.js`：任务完成、过渡等待、回复保护和轻量纠正规则
- `server.js`：静态资源、豆包实时语音代理和 DeepSeek 任务判断代理
- `assets/kitchen-mobile-neutral.png`：为 9:16 手机屏幕重新构图的中性交流姿态场景底图
- `assets/apple.png`：带透明背景的可交互苹果

这是包含 Node 语音代理的应用，不是纯静态站点。部署时需要支持 WebSocket 的 Node 托管环境，并在托管平台配置 `.env.example` 中的变量；单独启用 GitHub Pages 只能显示界面，不能提供实时语音。
