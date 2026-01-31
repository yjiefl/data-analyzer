const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'data.db');
const LOG_DIR = path.join(__dirname, '../log');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logToError = (msg) => {
	const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
	fs.appendFileSync(ERROR_LOG, `[${timestamp}] ERROR: ${msg}\n`);
};

// 初始化数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
	if (err) {
		console.error('❌ 数据库连接失败:', err.message);
	} else {
		console.log('✅ 已连接到 SQLite 数据库');
		db.run(`CREATE TABLE IF NOT EXISTS snapshots (
			id TEXT PRIMARY KEY,
			name TEXT,
			data TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`);
	}
});

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 支持大数据量上传

// 网站访问日志记录到文件
const accessLogStream = fs.createWriteStream(ACCESS_LOG, { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev')); // 控制台也显示一份简要日志

// 自定义操作日志函数 (带 30 天自动清理)
const logAction = (req, action, details = '') => {
	const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
	const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
	const logMessage = `[${timestamp}] IP: ${ip} | ACTION: ${action} | DETAILS: ${details}\n`;
	fs.appendFileSync(ACCESS_LOG, logMessage);

	// 简单的清理策略：每记录 20 次尝试清理一次超过 30 天的日志
	if (Math.random() < 0.05) {
		try {
			const oneMonthAgo = new Date();
			oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
			if (fs.existsSync(ACCESS_LOG)) {
				const lines = fs.readFileSync(ACCESS_LOG, 'utf8').split('\n');
				const filteredLines = lines.filter(line => {
					const match = line.match(/\[(\d{4}-\d{2}-\d{2})/);
					if (match) {
						const logDate = new Date(match[1]);
						return logDate > oneMonthAgo;
					}
					return true;
				});
				fs.writeFileSync(ACCESS_LOG, filteredLines.join('\n'));
			}
		} catch (e) { logToError('日志清理失败: ' + e.message); }
	}
};

// --- API 接口 ---

// 健康检查
app.get('/api/health', (req, res) => {
	logAction(req, 'Health Check');
	res.json({ ok: true, status: 'online', time: new Date() });
});

// 获取所有存单
app.get('/api/snapshots', (req, res) => {
	logAction(req, 'Get Snapshots');
	db.all("SELECT * FROM snapshots ORDER BY created_at DESC", [], (err, rows) => {
		if (err) {
			return res.status(500).json({ error: err.message });
		}
		const records = rows.map(row => ({
			...JSON.parse(row.data),
			id: row.id,
			name: row.name,
			internal_id: row.id // 保持兼容
		}));
		res.json(records);
	});
});

// 保存存单
app.post('/api/snapshots', (req, res) => {
	const record = req.body;
	const id = record.id || Date.now().toString();
	const name = record.name || '未命名记录';
	logAction(req, 'Save Snapshot', `Name: ${name}, ID: ${id}`);
	const dataString = JSON.stringify(record);

	db.run("INSERT OR REPLACE INTO snapshots (id, name, data) VALUES (?, ?, ?)",
		[id, name, dataString],
		function (err) {
			if (err) {
				return res.status(500).json({ error: err.message });
			}
			res.json({ success: true, id });
		}
	);
});

// 删除存单
app.delete('/api/snapshots/:id', (req, res) => {
	logAction(req, 'Delete Snapshot', `ID: ${req.params.id}`);
	db.run("DELETE FROM snapshots WHERE id = ?", [req.params.id], function (err) {
		if (err) {
			return res.status(500).json({ error: err.message });
		}
		res.json({ success: true, deleted: this.changes });
	});
});

// 删除所有存单
app.delete('/api/snapshots', (req, res) => {
	logAction(req, 'Clear All Snapshots');
	db.run("DELETE FROM snapshots", [], function (err) {
		if (err) {
			return res.status(500).json({ error: err.message });
		}
		res.json({ success: true, deleted: this.changes });
	});
});


// 获取访问日志
app.get('/api/logs', (req, res) => {
	const type = req.query.type || 'access';
	const targetFile = type === 'error' ? ERROR_LOG : ACCESS_LOG;
	
	if (fs.existsSync(targetFile)) {
		const logs = fs.readFileSync(targetFile, 'utf8').split('\n').filter(Boolean).slice(-500);
		res.json({ logs });
	} else {
		res.json({ logs: [] });
	}
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

// 全局错误处理
app.use((err, req, res, next) => {
	logToError(`Uncaught Exception: ${err.message}\n${err.stack}`);
	res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
	console.log(`🚀 后端服务已启动: http://localhost:${PORT}`);
	console.log(`📂 数据库路径: ${DB_PATH}`);
	console.log(`📝 访问日志: ${ACCESS_LOG}`);
	console.log(`🚨 错误日志: ${ERROR_LOG}`);
});
