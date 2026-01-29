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

# 检查 Node 环境
if [ ! -f "$NODE_BIN" ]; then
    echo "❌ 错误: 未在 /opt/homebrew/bin/ 找到 Node.js"
    exit 1
fi

# 检查前端目录
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ 错误: 找不到前端目录 $FRONTEND_DIR"
    exit 1
fi

# 进入前端目录并启动
cd "$FRONTEND_DIR"

echo "📦 正在检查依赖..."
"$NPM_BIN" install --quiet

echo "🌐 正在启动开发服务器..."
echo "------------------------------------------------"
"$NPM_BIN" run dev
