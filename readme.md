# 数据曲线分析系统 (DataCurve Analysis System)

一个优雅、高效的 Web 数据分析工具，专注于时间序列数据的曲线展示与对比分析。

## 主要功能

- **灵活导入**: 支持 CSV、JSON 等格式的数据导入。
- **动态曲线**: 基于 ECharts 的高性能曲线展示。
- **多维对比**: 轻松对比同一天内不同批次或不同维度的数据。
- **极致美学**: 现代感十足的磨砂玻璃风格 UI。

## 开发环境

- **操作系统**: macOS
- **运行环境**: Node.js 18+
- **构建工具**: Vite

## 快速开始

```bash
cd frontend
npm install
npm run dev
```

## 部署说明

### 1. 本地 NAS 部署 (QNAP)

确保本地网络通畅并在项目根执行：

```bash

./deploy_to_nas.sh
```

### 2. VPS 部署 (Docker)

确保 VPS ($IP: 107.174.62.30) 运行环境已安装 Docker 及其 Compose 插件：

```bash

./deploy_to_vps.sh
```

## 目录结构

- `/frontend`: 前端 React 应用代码
- `/backend`: 后端 API 服务
- `/log`: 调试日志

## 贡献者

- yjiefl
