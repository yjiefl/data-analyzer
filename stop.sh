#!/bin/zsh

echo "🛑 正在停止 DataCurve Analyzer..."

# 1. 停止 Vite
VITE_PID=$(lsof -t -i:5173)
if [ -n "$VITE_PID" ]; then
    echo " killing Vite (PID: $VITE_PID)"
    kill -9 $VITE_PID
fi

# 2. 停止 Backend
BACKEND_PID=$(lsof -t -i:3001)
if [ -n "$BACKEND_PID" ]; then
    echo " killing Backend (PID: $BACKEND_PID)"
    kill -9 $BACKEND_PID
fi

# 3. 如果是 Docker 部署
if command -v docker-compose &> /dev/null; then
    if [ -f "docker-compose.yml" ]; then
        echo " stopping Docker containers..."
        docker-compose down
    fi
fi

echo "✅ 系统已停止。"
