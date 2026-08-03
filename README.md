# 拼好豆 PinGB

上传任意图片，一键生成拼豆底稿。

**网页端**: https://pingb.350234235.xyz/

## 功能

- **图片转像素画**：上传 JPG/PNG，可调粒度和相似度阈值，多种池化策略
- **多店家色号**：支持 MARD / COCO / 漫漫 / 盼盼 / 咪小窝，全局一键切换
- **智能噪点识别**：自动标记数量 ≤3 的疑似杂色，预览图金色高亮定位
- **差值补色**：5×5 邻域最高频颜色自动替换噪点，支持逐个或批量
- **去除杂色**：点击排除任意颜色，智能重映射到最近似可用色
- **手动编辑**：画笔、调色盘、放大镜、改色模式、消散效果、一键加边框
- **AI 优化**：接入即梦 4.0 智能优化图片，支持一键去背景
- **沉浸式拼豆**：任务队列引导，边框→填充渐进，实时计时和进度
- **下载导出**：带色号 PNG 图纸（粗线+细线网格）、颜色统计图（按数量降序）、CSV 数据

## 技术栈

Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Cloudflare Pages

## 开发

```bash
npm install
npm run dev        # 本地开发 http://localhost:3000
npm run build      # 生产构建
npm run lint       # ESLint
```

## 部署

```bash
npm run build
npm run pages:deploy
```

需要 AI 功能时配置环境变量（参考 `.env.example`）：
- `VOLC_ACCESS_KEY_ID` — 火山引擎 Access Key
- `VOLC_SECRET_ACCESS_KEY` — 火山引擎 Secret Key
- `REMOVEBG_API_KEY` — remove.bg API Key（可选）

## 许可证

MIT
