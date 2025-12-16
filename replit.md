# Maze Lab

## 项目概述
Maze Lab 是一个 AI 推荐策略验证实验平台，使用 Gemini AI 进行内容推荐。

## 技术栈
- **前端**: React + Vite + TypeScript (端口 5000)
- **后端**: Express.js + SQLite (端口 3001)
- **AI**: Google Gemini API (@google/genai)
- **爬虫**: Python FastAPI + Playwright (端口 8000)

## 项目结构
```
├── pages/          # React 页面组件
├── components/     # React 组件
├── services/       # 前端服务层
│   ├── xhsService.ts  # 小红书爬虫 API
│   └── ...
├── server/         # Express 后端
│   ├── index.js    # 主入口
│   └── database.js # SQLite 数据库
├── crawler/        # Python 爬虫服务
│   ├── main.py     # FastAPI 服务入口
│   └── xhs/        # 小红书爬虫模块
├── types/          # TypeScript 类型定义
└── vite.config.ts  # Vite 配置
```

## 配置
- vite.config.ts: 端口 5000, allowedHosts: true, 代理 /api 和 /uploads 到后端
- 后端: 端口 3001, SQLite 数据库
- 爬虫: 端口 8000, Python FastAPI

## 环境变量
- GEMINI_API_KEY: Gemini AI API 密钥
- JINA_API_KEY: Jina Reader API 密钥

## 功能模块
1. **用户系统**: 多用户支持
2. **内容库**: 公共文章库（所有导入内容统一存储）
3. **实验系统**: AI 推荐策略实验
4. **冷启动问卷**: 收集用户偏好，自动生成搜索关键词
5. **自动爬取**: 基于用户偏好自动从小红书搜索并导入内容
6. **Jina 导入**: 从 URL 导入文章内容
7. **MCP 连接**: 外部 MCP 服务器集成
8. **小红书爬虫**: 搜索和导入小红书内容（需要用户提供 Cookie）

## 实验流程
1. 选择用户 → 点击"开始新实验"
2. 填写冷启动问卷（收集兴趣偏好）
3. AI 根据问卷答案自动生成搜索关键词
4. 从小红书搜索并批量导入内容到公共库
5. 基于公共库运行生成式推荐
6. 用户浏览推荐内容，进行交互
7. 循环：生成新关键词 → 爬取新内容 → 更新推荐

## 小红书爬虫使用说明
1. 在浏览器登录小红书网页版 (xiaohongshu.com)
2. 打开开发者工具 -> 网络 -> 复制任意请求的 Cookie
3. 在 Admin 页面的"小红书"标签页中粘贴 Cookie
4. 使用搜索功能查找笔记，点击笔记查看详情
5. 点击"保存到内容库"将笔记导入到平台

## 最近更新
- 2024-12-16: 问卷后台可配置（Admin 页面新增"问卷配置"标签页）
- 2024-12-16: 用户行为记录改为携带最近30次交互（原为3个Session）
- 2024-12-16: 交互记录新增 summary 字段，确保 AI 上下文包含文章摘要
- 2024-12-16: 修复小红书检索入库功能崩溃问题（空字段防护）
- 2024-12: 重构实验流程，移除"我的配置"，改为问卷驱动的自动爬取
- 2024-12: 添加 OnboardingWizard 冷启动问卷组件
- 2024-12: 添加 AI 关键词生成 API (/api/ai/generate-keywords)
- 2024-12: 所有内容统一保存到公共库 (isPublic=true)
- 2024-12: 添加小红书爬虫模块，替代 MCP 进行内容采集
- 2024-12: 修复 Jina API 集成，改进错误处理

## 问卷配置说明
管理员可在 Admin 页面的"问卷配置"标签页管理冷启动问卷：
- 支持单选题、多选题、简答题三种类型
- 可设置问题分类（基础信息/兴趣偏好/行为习惯）
- 可控制问题排序、是否必填、是否启用
- API 端点: `/api/admin/onboarding/questions` (GET/POST/PUT/DELETE)
