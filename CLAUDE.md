# 拼好豆 PinGB — AI 拼豆图纸生成器

## 项目简介

上传任意图片，一键生成拼豆底稿。利用 AI 智能色彩映射，将照片转化为可在现实中用拼豆制作的标准图纸。

- **官网**: https://pindou.348349.xyz/
- **技术栈**: Next.js 15 (React 19) + TypeScript + Tailwind CSS 4 + Cloudflare Pages

## 核心功能

### 图片转像素画
- 上传 JPG/PNG，通过可调粒度（横向格子数 N）和相似度阈值生成像素网格
- 多种解析风格（池化逻辑）：max pooling / mean pooling
- 自动将像素映射到标准拼豆色板（291 色 hex → 5 个店家色号系统）

### 多色号系统
- 支持 MARD、COCO、漫漫、盼盼、咪小窝 五个店家色号体系
- 全局色号切换，所有 UI 同步更新显示
- 色板数据来自 `src/app/colorSystemMapping.json`

### 智能噪点识别与补色
- 一键识别数量 ≤3 的疑似杂色
- 预览图高亮所有噪点像素（金色脉冲动画，与沉浸式拼豆同款效果）
- **差值补色**：对每个噪点取 5×5 邻域（24 格）占比最高的颜色自动替换
- 支持单色补色和批量一键补色
- 补色后自动保存到 localStorage

### 去除杂色
- 点击颜色列表中任意色块可排除该颜色，自动重映射到最近似可用色
- 支持手动替换为指定色号
- 已排除颜色可一键恢复

### 手动编辑模式
- 画笔工具（可调半径 1-50）+ 连续绘制（Shift 追加）
- 调色盘（浮动面板，取色/橡皮擦/颜色替换）
- 放大镜工具（像素级精确编辑）
- 改色模式（单击改色 + 四邻快捷选取）
- 消散效果面板
- 一键加外边框（H07）
- 撤销支持

### AI 优化（云端）
- 接入即梦 4.0 API（火山引擎），智能优化图片色彩和对比度
- AI 一键去背景（remove.bg API）
- Cloudflare Workers 承载后端函数（`functions/api/`）

### 下载导出
- **带色号图纸** PNG：每个格子标注色号、可调网格线（粗实线 + 细虚线）
- **颜色统计图**：色块 + 色号 + 数量，按占据格数降序排列
- **CSV 导出**：hex 颜色数据，可重新导入恢复编辑状态
- 可配置：网格线颜色、是否显示坐标、是否显示色号

### 沉浸式拼豆模式 (`/focus`)
- 基于当前像素数据生成任务队列
- 边框优先 → 同色内部填充，每任务 ≤15 个豆子
- 实时进度追踪 + 计时器
- 画布支持缩放、拖拽、双指捏合
- 已完成/当前任务/未完成三种视觉效果

### PWA 支持
- 可安装为桌面/移动端独立应用
- Service Worker 离线缓存
- 自适应响应式布局

## 项目结构

```
src/
├── app/
│   ├── page.tsx                    # 主页（~3500 行，核心交互逻辑）
│   ├── layout.tsx                  # 全局布局 + metadata
│   ├── focus/page.tsx              # 沉浸式拼豆模式
│   ├── globals.css                 # Tailwind + 全局样式
│   ├── colorSystemMapping.json     # 291 色 hex → 5 系统映射
│   └── api/bg-remove/              # Next.js API: 去背景
├── components/
│   ├── PixelatedPreviewCanvas.tsx  # 像素画布渲染（高亮、笔刷、选择）
│   ├── FocusCanvas.tsx             # 沉浸模式画布
│   ├── FocusStartOverlay.tsx       # START 覆盖层 + 倒计时
│   ├── FocusTaskPanel.tsx          # 底部任务面板（独立组件，未内联使用）
│   ├── FocusModePreDownloadModal.tsx # 进入前 CSV 备份弹窗
│   ├── FloatingColorPalette.tsx    # 手动编辑浮动调色盘
│   ├── FloatingToolbar.tsx         # 手动编辑浮动工具栏
│   ├── ColorPalette.tsx            # 色板选择组件
│   ├── CustomPaletteEditor.tsx     # 自定义色板编辑器
│   ├── DownloadSettingsModal.tsx   # 下载设置弹窗（网格线等）
│   ├── AIOptimizeModal.tsx         # AI 优化弹窗
│   ├── BackgroundRemoveModal.tsx   # AI 去背景弹窗
│   ├── ImageCropperModal.tsx       # 图片裁剪弹窗
│   ├── MagnifierTool.tsx           # 放大镜工具
│   ├── MagnifierSelectionOverlay.tsx # 放大镜选区覆盖层
│   ├── RecolorPopover.tsx          # 改色弹窗
│   ├── DissolvePanel.tsx           # 消散效果面板
│   ├── GridTooltip.tsx             # 网格悬停提示
│   └── InstallPWA.tsx              # PWA 安装提示
├── utils/
│   ├── pixelation.ts               # 核心像素化算法
│   ├── imageDownloader.ts          # 图纸下载 + CSV 导入导出
│   ├── colorSystemUtils.ts         # 多色号系统转换工具
│   ├── taskQueueGenerator.ts       # 沉浸模式任务队列算法
│   ├── aiOptimize.ts               # AI 优化客户端
│   ├── bgRemove.ts                 # 去背景客户端
│   ├── apiSettings.ts              # API 配置
│   ├── borderUtils.ts              # 边框工具
│   ├── selectionUtils.ts           # 笔刷选区工具
│   └── particleUtils.ts            # 消散粒子工具
├── types/
│   └── downloadTypes.ts            # 下载选项类型
├── hooks/
└── lib/
    └── volcEngineClient.ts         # 火山引擎客户端
```

## 开发命令

```bash
npm run dev          # 启动 Next.js 开发服务器
npm run build        # 生产构建
npm run start        # 启动生产服务器
npm run lint         # 运行 ESLint
npm run pages:dev    # Cloudflare Pages 本地模拟
npm run pages:deploy # 部署到 Cloudflare Pages
```

## 部署

### Cloudflare Pages（推荐）
```bash
npm run build
npm run pages:deploy
```

### 静态部署
参考 `docs/静态部署方法配置指南.md`，使用 `no-backend` 分支。

## 色号系统

`colorSystemMapping.json` 维护 291 个标准 hex 颜色值，每个映射到 5 个店家色号：
MARD / COCO / 漫漫 / 盼盼 / 咪小窝

## 许可证

Apache 2.0
