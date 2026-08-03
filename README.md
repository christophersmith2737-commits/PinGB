# 拼好豆 PinGB — AI 拼豆图纸生成器

上传任意图片，一键生成拼豆底稿。支持智能色彩映射、多店家色号系统、沉浸式拼豆引导，让拼豆制作更简单。

**体验地址**: https://pindou.348349.xyz/

## ✨ 核心功能

### 图片转像素画
- 拖放上传 JPG/PNG，可调粒度和相似度阈值
- 多种池化策略自适应不同图片类型
- 自动映射到 291 色标准拼豆色板

### 多色号系统
- 支持 MARD / COCO / 漫漫 / 盼盼 / 咪小窝 五个店家
- 全局一键切换，无需重复设置

### 智能噪点识别
- 一键标记数量 ≤3 的疑似杂色
- 预览图金色高亮定位每个噪点像素
- **差值补色**：取 5×5 邻域最高频颜色自动替换噪点
- 支持逐色补色或一键全部补色
- 补色后自动保存状态

### 去除杂色
- 点击排除任意颜色，自动重映射到最近似可用色
- 支持手动替换为指定色号、一键恢复

### 手动编辑
- 画笔（可调大小）+ 调色盘 + 放大镜 + 改色模式
- 消散效果、一键加边框、撤销支持

### AI 优化（云端）
- 接入即梦 4.0 API，智能优化图片色彩
- AI 一键去背景

### 沉浸式拼豆模式
- 任务队列引导：边框优先 → 同色填充
- 实时进度 + 计时器
- 已完成/当前任务高亮区分

### 下载导出
- 带色号 PNG 图纸（粗实线 + 细虚线网格）
- 颜色统计图（按占格数降序）
- CSV 数据导出/导入

### PWA 支持
- 可安装为桌面/移动端独立应用，离线使用

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 浏览器打开 http://localhost:3000

# 生产构建
npm run build

# Cloudflare Pages 部署
npm run pages:deploy
```

## ☁️ 部署

### 前置条件
- [Node.js](https://nodejs.org/) v18+
- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费）

### 命令行部署
```bash
npm run build
npx wrangler login
npx wrangler pages deploy out --project-name pinGB
```

### 环境变量（AI 功能需要）

| 变量名 | 说明 |
|--------|------|
| `VOLC_ACCESS_KEY_ID` | 火山引擎 Access Key |
| `VOLC_SECRET_ACCESS_KEY` | 火山引擎 Secret Key |
| `NEXT_PUBLIC_OFFICIAL_DOMAIN` | 自定义域名（可选） |
| `REMOVEBG_API_KEY` | remove.bg API Key（可选） |

参考 `.env.example` 进行配置。

### 非 Cloudflare 部署
参考 `docs/` 目录下的部署文档。

## 🛠 技术栈

- **框架**: Next.js 15 + React 19 + TypeScript
- **样式**: Tailwind CSS 4
- **渲染**: Canvas API（浏览器端像素化计算）
- **后端**: Cloudflare Pages Functions
- **AI**: 火山引擎 · 即梦 4.0

## 核心算法

1. **初始颜色映射** — max pooling 主导色 + 欧氏距离最近色匹配
2. **区域颜色合并** — BFS 连通区域识别 + 主导色统一
3. **背景移除** — 边界洪水填充标记外部区域
4. **颜色重映射** — 排除颜色后智能寻找最近似替代色
5. **差值补色** — 5×5 邻域频次统计自动替换噪点
6. **任务队列** — 边框轮廓追踪 + 同色连通区域分组

色板数据来自 `src/app/colorSystemMapping.json`（291 色 → 5 系统映射）。

## 📁 项目结构

```
src/
├── app/
│   ├── page.tsx                   # 主页
│   ├── focus/page.tsx             # 沉浸式拼豆模式
│   └── colorSystemMapping.json    # 色号映射数据
├── components/                    # React 组件
├── utils/                         # 工具函数
├── types/                         # TypeScript 类型
├── hooks/                         # React Hooks
└── lib/                           # 第三方客户端
functions/api/                     # Cloudflare Workers
public/                            # 静态资源
```

## 📄 许可证

Apache 2.0
