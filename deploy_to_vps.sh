#!/bin/zsh

# VPS 自动化部署脚本
# 修改人: Antigravity (AI)
# 日期: 2026-01-31

# --- 配置区 ---
SSH_ALIAS="racknerd" # 使用用户 ~/.ssh/config 中配置的别名
VPS_PATH="/root/apps/data-analyzer" # VPS 上的部署路径
# --- --- --- ---

echo "📡 准备同步代码到 VPS ($SSH_ALIAS)..."

# 确保远程目录存在
ssh $SSH_ALIAS "mkdir -p $VPS_PATH"

# 使用 rsync 进行增量同步
rsync -avz --delete \
    --exclude "node_modules" \
    --exclude ".git" \
    --exclude ".DS_Store" \
    --exclude "frontend/dist" \
    --exclude "log/*.log" \
    ./ $SSH_ALIAS:$VPS_PATH

if [ $? -eq 0 ]; then
    echo "✅ 同步成功！"
    echo "🛠  正在远程触发 Docker 重建与启动..."
    
    # 通过 SSH 远程执行 docker-compose 命令
    ssh $SSH_ALIAS "cd $VPS_PATH && docker-compose up -d --build"
    
    if [ $? -eq 0 ]; then
        echo "🚀 部署完成！系统访问地址: http://$VPS_IP:5003"
    else
        echo "❌ 远程 Docker 构建失败，请检查 VPS 是否已安装 docker 和 docker compose。"
    fi
else
    echo "❌ 代码同步失败，请检查 SSH 连接（建议配置 SSH Key 免密登录）。"
fi
