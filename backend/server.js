const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(morgan('combined')); // 标准访问日志

// 健康检查接口
app.get('/api/health', (req, res) => {
	res.json({ ok: true, status: 'online', time: new Date() });
});

// 日志获取接口 (演示用，正式环境建议用专业的日志系统)
app.get('/api/logs', (req, res) => {
	// 简单读取最后几行日志或返回当前状态
	res.json({ message: "访问日志已记录在后台控制台" });
});

// 生产环境下托管前端静态文件
if (process.env.NODE_ENV === 'production') {
	const frontendDist = path.join(__dirname, '../frontend/dist');
	if (fs.existsSync(frontendDist)) {
		app.use(express.static(frontendDist));
		app.get('*', (req, res) => {
			res.sendFile(path.join(frontendDist, 'index.html'));
		});
	}
}

app.listen(PORT, () => {
	console.log(`🚀 后端服务已启动: http://localhost:${PORT}`);
	console.log(`📂 NODE_ENV: ${process.env.NODE_ENV}`);
});
