#!/bin/zsh

# 数据曲线分析助手 (DataCurve Analyzer) 快速启动脚本
# 修改人: Antigravity (AI)
# 日期: 2026-01-29

echo "🚀 正在启动 DataCurve Analyzer..."

# 获取脚本所在目录的绝对路径
SCRIPT_DIR=$(cd "$(dirname "$0")"; pwd)
FRONTEND_DIR="$SCRIPT_DIR/frontend"
NODE_BIN="/opt/homebrew/bin/node"
NPM_BIN="/opt/homebrew/bin/npm"

# 1. 环境检查
if [ ! -f "$NODE_BIN" ]; then
    echo "❌ 错误: 未在 /opt/homebrew/bin/ 找到 Node.js"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ 错误: 找不到前端目录 $FRONTEND_DIR"
    exit 1
fi

# 2. 依赖检查与安装
cd "$FRONTEND_DIR"
echo "📦 正在检查依赖..."
if ! "$NPM_BIN" install --quiet; then
    echo "❌ 错误: 依赖安装失败，请检查网络或 package.json"
    exit 1
fi

# 3. 启动开发服务器并尝试自动打开浏览器
echo "🌐 正在启动开发服务器..."
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
