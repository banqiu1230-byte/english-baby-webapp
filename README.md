# Luma — 2.5D English learning prototype

一个以手机使用为主的 WebApp 原型，核心体验是：

- 通过角色视线、生活物品和场景变化建立“共同注意”；物品负责帮助理解和反馈结果，不承担通关操作；
- 家庭早餐由三个连续片段组成：说出饮料选择、回应杯子请求、决定再加多少；厨房全景、冰箱和桌面随语言结果切换；
- 用户可以随时开口和发散，人物先说完当前句子，再接用户的话；对话不会因为任务状态停止收音；
- 任务调度和角色回复由同一套轮次规则协调，避免抢话、串题和残缺字幕；
- 系统在后台判断任务是否完成，不要求用户背固定答案。
- 默认入场先说明可以随时提问、中文求助和短句回答；点击“准备好了，开始”后才申请麦克风权限。用户主动选择“下次直接开始”后，后续会尊重该偏好。

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
- `app.js`：场景任务、轮次协调、实时字幕和学习记录
- `breakfast.js`：前后端共享的早餐任务、选择语义和顺序世界状态
- `coffee.js`：C01–C04 咖啡任务、订单目标、纠错和独立挑战状态
- `scene-visuals.js`：对话步骤、订单与物品画面的同步呈现
- `learning-evidence.js`：区分提示、独立口语、迁移与延迟复练，并兼容旧版文字记录的本地证据
- `learning-experience.js`：首页续练、帮助、复盘与任务衔接
- `breakfast-ui.js`：入场说明、语言提示、杯子与液面的结果反馈
- `dialogue-rules.js`：任务完成、过渡等待、回复保护和轻量纠正规则
- `voice-runtime.js`：按识别条目归属的字幕账本、连续重采样和有界收音缓冲
- `microphone-worklet.js`：独立音频线程中的采集器，旧浏览器降级使用 ScriptProcessor
- `server.js`：静态资源、豆包实时语音代理和 DeepSeek 任务判断代理
- `assets/kitchen-mobile-neutral.png`：为 9:16 手机屏幕重新构图的中性交流姿态场景底图
- `assets/apple.png`：早期场景保留素材，当前三条主流程不使用它作为通关控件
- `assets/breakfast/`：新增的冰箱与空桌面图，来源见 [ASSETS.md](assets/breakfast/ASSETS.md)

这是包含 Node 语音代理的应用，不是纯静态站点。部署时需要支持 WebSocket 的 Node 托管环境，并在托管平台配置 `.env.example` 中的变量；单独启用 GitHub Pages 只能显示界面，不能提供实时语音。

### 给朋友试玩

将仓库推送到 GitHub 后，在 [Render](https://render.com/docs/infrastructure-as-code) 选择 **New → Blueprint**、连接该仓库并部署根目录的 `render.yaml`。首次创建时，在 Render 页面分别填写 `DOUBAO_API_KEY` 和 `DEEPSEEK_API_KEY`；不要把密钥提交到 GitHub。部署成功后，把服务的 `https://…onrender.com` 地址发给朋友，打开页面并允许麦克风即可练习。这个配置运行同一个 Node 服务来提供页面、语义判断和实时语音 WebSocket；GitHub Pages 不能替代它。

Blueprint 默认使用 Render 免费实例供小范围体验。免费实例闲置后会休眠，再次打开可能要等约一分钟；实时语音和语义判断仍会消耗各自 API 的额度。项目目前没有访客账号或总用量配额，请控制分享范围并在服务商后台设置额度。更多部署限制见 [Render 免费服务说明](https://render.com/docs/free)。

## 对话与收音约定

- 用户授权后持续收音，角色说话和任务切换不关闭麦克风。用户可以主动静音或离开场景；同一浏览器只允许一个页面占用练习收音。
- 增量识别替换同一条气泡，最终识别仍归属于最初的语音条目和任务；任务判断在后台进行，不阻塞角色回复。
- 默认不打断人物：播放期间持续采集，PCM 暂存在内存，整句播放结束后按顺序发送给语音服务。因此重叠说话的字幕会等人物说完才开始识别；这不是实时并行转写。已有在途识别事件也等待当前句子播完，不会清空人物字幕。
- 本地音量和 VAD 事件只作声音候选，不能取消角色语音、确认文字或推进任务。声音候选保留当前问题归属；启用浏览器回声消除、降噪和自动增益，并对采集音频做低频过滤。
- 静音结束窗口为 1 秒，用于容纳初学者句内停顿，不保证云端识别的固定延迟。客户端最多暂存 60 秒 PCM，超限会提示，静音、退出或重开时清空；不保存录音文件。没有识别完成事件时，6 秒无进展后明确提示重说，保持麦克风开启，不再额外等待一轮回复超时。
- 默认使用简单词汇、短句和慢速语音，单词回答也可完成语义目标。用户可以发散或用中文求助；提示逐步提供，不要求背标准答案。
- “简单”是语义明确，而非限制字数：角色用 Do you want milk or water? 等完整问句，不让初学者猜 Milk? / More? 的意图；续杯会点明已选的饮料。中文求助解释整句意思，用户仍可以只回一个词。
- 当前早餐、咖啡、机场和办公室的实际任务都由口语回应推进；没有点物品、拖杯子、点答案或打字通关。物品会随已理解的表达自动变化，“需要提示”只展示或播放帮助，不替用户提交答案。Yes/No 只对应实际问出的 More，不拿发散对话中的回答推进任务。
- 字幕根据已排程音频的播放进度逐步显示，正常说话重叠不会截断整句。主动退出、重开或点重听仍可取消播放。当前是估算进度，不是服务端逐词时间戳对齐。

## 手机检查

使用 HTTPS 打开部署链接并允许麦克风；本地开发的 localhost 也可申请权限，但手机通过普通 HTTP 局域网地址访问时通常不能使用麦克风。界面支持小屏、横屏与安全区；麦克风不可用时会明确提示检查权限或重试。

自动化验证及未覆盖的真机条件见 [VERIFICATION.md](VERIFICATION.md)。浏览器降噪不是说话人识别：附近人声、电视声音仍可能被识别，需要真机外放环境验证。

### 2026-09-07 product iteration（历史）

The earlier mobile Today, Explore, Growth and Profile screens followed the first immersive direction. The current information architecture is documented below. `learning-evidence.js` stores local practice evidence and review/checkpoint state; `learning-experience.js` connects it to the existing scenario and voice runtime. Current scene progression is language-driven; objects visualize meaning and outcomes. New records distinguish voice, text and Chinese support. Existing aggregate history remains available without being reinterpreted as independent mastery.

Run `npm run check` and `npm test`. See `design-qa.md` for screenshot comparisons, tested interactions and the remaining real-device validation scope. This iteration contains no subscription or payment UI.

## 2026-09-16 咖啡任务冒险

探索页新增一条连续的咖啡任务线：C01 在帮助下自己点单，C02 按朋友的目标转述，C03 发现错误杯型并修正，C04 默认关闭字幕，用变化订单独立挑战。每关只由语言回应推进；一句话可以同时说清多个订单信息，系统只追问缺少或错误的部分。五张本地图片、订单卡和物品标记随当前事实一起变化。

复盘分别呈现任务完成、中文/提示帮助与独立英语语音，看到物品英文词或完整示范不会被记成无提示完成；旧版文字记录只保留为历史，不再提供打字入口。验证范围见 `VERIFICATION.md`。

## 2026-09-17 旅程、世界与学习笔记

手机端主框架现为“旅程／世界／笔记”，设置从头像进入。旅程页是世界中当前分支的详情，用街角咖啡店承接 C01–C04 事件和 checkpoint；世界呈现所有生活分支；学习笔记按真实练习记录整理今日复习、仍需帮助的表达、学习成果与最近记录。浏览世界、笔记和场景预览都不会启用麦克风；只有明确开始具体练习才会请求权限。用户未选择“下次直接开始”时，会先经过开场确认。

学习笔记不会从技术中断推断用户能力，也不会生成没有证据的发音、语法或掌握率结论。单项“再练一次”先打开场景预览；主复习按钮才按到期记录或当前旅程进入练习。

首页主视觉位于 `assets/adventure/coffee-neighborhood-v1.png`，不含嵌入式 UI、路线文字或物体白描边。世界与学习笔记的 320×568、360×640、390×844 截图和浏览器验证见 `design-qa.md`。当前自动检查 165 项通过；真人设备语音和长期回访效果仍需单独验收。
