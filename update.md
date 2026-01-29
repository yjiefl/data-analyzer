# 要求
更新内容需要记录到update.md中，包括日期，更新内容，修改人。

# 已完成
- **2026-01-29**:
    - 完成项目初始化，建立规范文档（spec.md, readme.md）。 (修改人: Antigravity)
    - 实现基于 Vite + React + ECharts 的核心数据分析与可视化功能。 (修改人: Antigravity)
    - 引入 PapaParse 支持 CSV/JSON 数据解析与自动日期分组。 (修改人: Antigravity)
    - 采用 Glassmorphism 磨砂玻璃 UI 设计。 (修改人: Antigravity)
    - 完成核心逻辑的单元测试 (Vitest) 并通过验证。 (修改人: Antigravity)
    - 创建 `start.sh` 快速启动脚本，并增加自动打开浏览器功能（仅在无错误启动时触发）。 (修改人: Antigravity)
- **新增功能及修复 2026年1月29日 15:20**:
    - 增加数据文本拷贝导入功能 (Paste Import)。 (修改人: Antigravity)
    - 增加文件拖拽导入功能 (Drag & Drop)。 (修改人: Antigravity)
    - 修复 CSV 导入兼容性问题，现支持中文表头及分开的日期/时间列。 (修改人: Antigravity)

# 待修改

- bug：拖拽不能导入文件
- 改进：每个数值点加粗显示
- 确认：支持导入多个表的数据并在同一张图显示
- 改进：可以选择每个坐标轴的最大最小值

# 规划中

- 可以部署到qnap的docker中
