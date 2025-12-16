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
2. **内容库**: 公共文章库和个人配置
3. **实验系统**: AI 推荐策略实验
4. **Jina 导入**: 从 URL 导入文章内容
5. **MCP 连接**: 外部 MCP 服务器集成
6. **小红书爬虫**: 搜索和导入小红书内容（需要用户提供 Cookie）

## 小红书爬虫使用说明
1. 在浏览器登录小红书网页版 (xiaohongshu.com)
2. 打开开发者工具 -> 网络 -> 复制任意请求的 Cookie
3. 在 Admin 页面的"小红书"标签页中粘贴 Cookie
4. 使用搜索功能查找笔记，点击笔记查看详情
5. 点击"保存到内容库"将笔记导入到平台

## 最近更新
- 2024-12: 添加小红书爬虫模块，替代 MCP 进行内容采集
- 2024-12: 修复 Jina API 集成，改进错误处理
