const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'data.db');
const LOG_FILE = path.join(__dirname, 'access.log');

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
const accessLogStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev')); // 控制台也显示一份简要日志

// --- API 接口 ---

// 健康检查
app.get('/api/health', (req, res) => {
	res.json({ ok: true, status: 'online', time: new Date() });
});

// 获取所有存单
app.get('/api/snapshots', (req, res) => {
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
	db.run("DELETE FROM snapshots WHERE id = ?", [req.params.id], function (err) {
		if (err) {
			return res.status(500).json({ error: err.message });
		}
		res.json({ success: true, deleted: this.changes });
	});
});

// 获取访问日志
app.get('/api/logs', (req, res) => {
	if (fs.existsSync(LOG_FILE)) {
		const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-100);
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

app.listen(PORT, () => {
	console.log(`🚀 后端服务已启动: http://localhost:${PORT}`);
	console.log(`📂 数据库路径: ${DB_PATH}`);
	console.log(`📝 日志路径: ${LOG_FILE}`);
});
