# 世界地图的区域扩展

更新：2026-09-29。

## 当前结构

世界 → 区域 → 地点 → 生活事件。

- **生活街区**：街角咖啡店、家中早餐，以及尚未开放的城市生活。
- **职场**：初次见面、设计师英文面试。
- **机场**：已有的机场出行场景。
- 咖啡店内保留四个已有事件，不为每个事件重复放置地图标记。

区域按钮切换地图和底部事件；「全部地点」按区域列出入口。拖动或缩放地图时，底部当前事件卡片收起；点击展开，或通过右侧箭头继续。定位按钮恢复默认缩放，并定位当前卡片对应的地点，不跳回其他区域。地点标签在缩放时保持固定尺寸。

区域浏览只保存 `luma-world-region-v1` 这一界面偏好，不写学习记录。查看地点和切换事件预览不会创建会话；进入事件才沿用现有会话机制。每个区域优先显示本区最近保存的未完成任务，否则推荐本区可进入的任务。标题、入口和定位使用同一推荐，恢复时按该任务的 `sessionId` 读取进度；其他区域的任务保持原样。刷新保留所选区域。短生活事件从事件开头继续，面试恢复已保存的话题和任务进度。

## 如何扩展

1. 在 `world-catalog.js` 的 `regions` 中登记区域名称、图片和说明。
2. 在 `places` 中登记地点，指定 `regionId`、缩略图、地图坐标与事件列表。坐标范围为 0～1；可分别提供普通、窄屏和短屏位置。
3. 若地点已有可用场景，`id` 对应现有场景标识；事件的 `missionId` 对应已实现任务。地图标记、区域列表和地点列表自动生成。
4. 全新可玩场景仍需要配套的场景图、对话、任务和进入逻辑。仅添加地图配置不会生成这些能力，内容未就绪时应保持不可进入。

渲染与交互分别在 `world-regions.js` 和 `world-map.js`。学习记录仍由原有学习系统维护，地点状态统一由 `world-catalog.js` 计算。以后增加区域不需要在首页堆叠全部地点。

## 验证

- `npm run check`：语法检查。
- `npm test`：包括区域资源、任务映射、状态计算和区域推荐检查。
- `test-support/world-map-browser.cjs --app`：独立相机与真实页面拖动、缩放、定位和固定标签检查。
- `test-support/regions-browser.cjs`：320、393、430、884 像素宽度的切区、地点、任务预览、未开放入口、弹层回焦、卡片收起、本区定位和真实继续入口检查。覆盖「较早保存面试、最近保存咖啡」时切到职场、刷新、继续面试、再回街区继续咖啡，确保两个进度不会串用。
- 浏览测试使用隔离数据与模拟服务，不调用真实麦克风或付费对话服务。

## 新机场地图素材

保存位置：`assets/adventure/world-airport-map-v1.png`，实际尺寸 1086 × 1448。

生成方式：内置 `image_gen` 工具。原街区地图 `assets/adventure/world-life-map-v1.png` 仅作为风格参考。机场图是导航插画，不扩充对话场景中的可见物品。

最终生成提示词：

> Use case: stylized-concept. Asset type: vertical zoomable airport district navigation background for the Luma English living-world mobile app. Create a NEW airport district matching ONLY the visual style of the reference image: detailed warm miniature architectural 2.5D elevated three-quarter bird's-eye perspective, realistic materials, quiet golden late-afternoon sun, cream stone, glass, lush planted paths, soft warm shadows. Not a copy of its neighborhood composition. Show one coherent small coastal airport campus, with a beautiful glass-roofed terminal dominating the central middle of the portrait around 45% down, a few believable connected jet bridges and parked passenger planes in the upper-middle distance, a control tower farther back, a forecourt with pathways and trees and a simple access road across lower half. Tiny travelers for scale, no big character portrait. The single interactive place marker will be added separately at 50% width and 40% height, so the building should be visually recognizable there, with enough calm space around it. Fill the entire portrait edge to edge; no floating island, no blank margins. High-resolution crisp detail for mobile zoom: request 1536 by 2048 or larger portrait 3:4. NO labels, NO letters, NO map pins, NO UI, NO borders, NO watermark, NO logos, NO captions. This is a navigation illustration only.
