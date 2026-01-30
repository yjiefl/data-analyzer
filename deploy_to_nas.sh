#!/bin/zsh

# QNAP NAS 自动化部署脚本
# 修改人: Antigravity (AI)
# 日期: 2026-01-30

# --- 配置区 ---
NAS_USER="yjiefl"
NAS_IP="192.168.3.10"
NAS_PORT="22222"
NAS_PATH="/share/CACHEDEV1_DATA/Container/data-analyzer" # 请根据 NAS 实际路径修改
# --- --- --- ---

echo "📡 准备同步代码到 QNAP NAS ($NAS_IP)..."

# 使用 rsync 进行增量同步，速度快且支持排除不需要的文件夹
# -a: 归档模式
# -v: 显示详情
# -z: 压缩传输
# -e: 指定 ssh 参数
rsync -avz --delete \
    -e "ssh -p $NAS_PORT" \
    --exclude "node_modules" \
    --exclude ".git" \
    --exclude ".DS_Store" \
    --exclude "frontend/dist" \
    --exclude "log/*.log" \
    ./ $NAS_USER@$NAS_IP:$NAS_PATH

if [ $? -eq 0 ]; then
    echo "✅ 同步成功！"
    echo "🛠  正在远程触发 Docker 重建与启动..."
    
    # 通过 SSH 远程执行 docker-compose 命令
    # 针对 QNAP PATH 可能缺失的问题，增加 QPKG 的 bin 路径和常见路径
    ssh -p $NAS_PORT $NAS_USER@$NAS_IP "export PATH=\$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin:/usr/local/bin:/opt/bin; cd $NAS_PATH && docker compose up -d --build"
    
    if [ $? -eq 0 ]; then
        echo "🚀 部署完成！系统访问地址: http://$NAS_IP:5003"
    else
        echo "❌ 远程 Docker 构建失败，请手动登录 NAS 检查。"
    fi
else
    echo "❌ 代码同步失败，请检查 SSH 连接或 NAS 路径。"
fi
