#!/bin/bash

# 停止现有服务
echo "🛑 停止现有服务..."
pkill -f "node.*server/index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "python.*main.py" 2>/dev/null
pkill -f "uvicorn" 2>/dev/null
sleep 2

# 启动爬虫服务
echo "🚀 启动爬虫服务 (端口 8000)..."
cd "$(dirname "$0")/crawler"
python main.py > /tmp/xhs_crawler.log 2>&1 &
CRAWLER_PID=$!
echo "   爬虫服务 PID: $CRAWLER_PID"

# 启动后端服务
echo "🚀 启动后端服务 (端口 3001)..."
cd "$(dirname "$0")/server"
node index.js > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   后端服务 PID: $BACKEND_PID"

# 启动前端服务
echo "🚀 启动前端服务 (端口 5173)..."
cd "$(dirname "$0")"
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   前端服务 PID: $FRONTEND_PID"

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 8

# 检查服务状态
echo ""
echo "=== 服务状态检查 ==="
echo ""

# 检查后端
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ 后端服务 (3001): 运行正常"
else
    echo "❌ 后端服务 (3001): 未响应"
fi

# 检查爬虫
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ 爬虫服务 (8000): 运行正常"
else
    echo "❌ 爬虫服务 (8000): 未响应"
fi

# 检查前端
if curl -s -I http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ 前端服务 (5173): 运行正常"
else
    echo "❌ 前端服务 (5173): 未响应"
fi

echo ""
echo "=== 服务已启动 ==="
echo "前端: http://localhost:5173"
echo "后端: http://localhost:3001/api"
echo "爬虫: http://localhost:8000"
echo ""
echo "查看日志:"
echo "  后端: tail -f /tmp/backend.log"
echo "  爬虫: tail -f /tmp/xhs_crawler.log"
echo "  前端: tail -f /tmp/frontend.log"

