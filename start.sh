#!/bin/zsh

# 数据曲线分析助手 (DataCurve Analyzer) 快速启动脚本
# 修改人: Antigravity (AI)
# 日期: 2026-01-29

echo "🚀 正在启动 DataCurve Analyzer..."

# 获取脚本所在目录的绝对路径
SCRIPT_DIR=$(cd "$(dirname "$0")"; pwd)
FRONTEND_DIR="$SCRIPT_DIR/frontend"
# 1. 环境检查
NODE_BIN=$(which node)
NPM_BIN=$(which npm)

if [ -z "$NODE_BIN" ]; then
    echo "❌ 错误: 未在系统中找到 Node.js，请先安装 Node.js"
    exit 1
fi

if [ -z "$NPM_BIN" ]; then
    echo "❌ 错误: 未在系统中找到 npm，请先安装 Node.js"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ 错误: 找不到前端目录 $FRONTEND_DIR"
    exit 1
fi

# 2. 依赖检查与安装
cd "$FRONTEND_DIR"
echo "📦 正在检查前端依赖..."
if ! "$NPM_BIN" install --quiet; then
    echo "❌ 错误: 前端依赖安装失败，请检查网络或 package.json"
    exit 1
fi

# 3. 启动后端服务器
BACKEND_DIR="$SCRIPT_DIR/backend"
if [ -d "$BACKEND_DIR" ]; then
    echo "⚙️ 正在检查并重启后端服务..."
    # 杀掉可能已在运行的旧后端进程
    lsof -ti :3001 | xargs kill -9 2>/dev/null
    
    mkdir -p "$SCRIPT_DIR/log" # 确保日志目录存在
    cd "$BACKEND_DIR"
    "$NPM_BIN" install --quiet
    node server.js > "$SCRIPT_DIR/log/backend.log" 2>&1 &
    echo "✅ 后端服务已重新启动 (Port: 3001)"
fi

# 4. 启动前端 Vite 开发服务器并尝试自动打开浏览器
cd "$FRONTEND_DIR" # 切换回前端目录以启动 Vite
echo "🌐 正在启动前端开发服务器..."
echo "💡 如果服务器启动成功且无错误，将为您自动打开分析页面。"
echo "------------------------------------------------"

# 在后台启动一个监听程序，等待端口开启后打开浏览器
(
    MAX_RETRIES=30
    COUNT=0
    while ! lsof -i :5173 > /dev/null; do
        sleep 1
        COUNT=$((COUNT + 1))
        if [ $COUNT -ge $MAX_RETRIES ]; then
            echo "\n⚠️  等待服务器启动超时，请手动访问 http://localhost:5173"
            exit 1
        fi
    done
    echo "\n✨ 服务器已就绪，正在打开网页..."
    open "http://localhost:5173"
) &

# 启动 Vite (如果有配置错误，npm run dev 会直接报错退出，不会进入上面的监听逻辑)
"$NPM_BIN" run dev
