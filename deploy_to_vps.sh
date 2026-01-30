#!/bin/zsh

# VPS 自动化部署脚本
# 修改人: Antigravity (AI)
# 日期: 2026-01-31

# --- 配置区 ---
VPS_USER="root" # 默认使用 root，如不同请修改
VPS_IP="107.174.62.30"
VPS_PATH="/root/apps/data-analyzer" # VPS 上的部署路径
# --- --- --- ---

echo "📡 准备同步代码到 VPS ($VPS_IP)..."

# 使用 rsync 进行增量同步
# -a: 归档模式
# -v: 显示详情
# -z: 压缩传输
# -e: 指定 ssh 参数
rsync -avz --delete \
    --exclude "node_modules" \
    --exclude ".git" \
    --exclude ".DS_Store" \
    --exclude "frontend/dist" \
    --exclude "log/*.log" \
    ./ $VPS_USER@$VPS_IP:$VPS_PATH

if [ $? -eq 0 ]; then
    echo "✅ 同步成功！"
    echo "🛠  正在远程触发 Docker 重建与启动..."
    
    # 通过 SSH 远程执行 docker-compose 命令
    ssh $VPS_USER@$VPS_IP "cd $VPS_PATH && docker compose up -d --build"
    
    if [ $? -eq 0 ]; then
        echo "🚀 部署完成！系统访问地址: http://$VPS_IP:5003"
    else
        echo "❌ 远程 Docker 构建失败，请检查 VPS 是否已安装 docker 和 docker compose。"
    fi
else
    echo "❌ 代码同步失败，请检查 SSH 连接（建议配置 SSH Key 免密登录）。"
fi
