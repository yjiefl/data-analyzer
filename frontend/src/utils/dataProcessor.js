import { format } from 'date-fns';

/**
 * 智能识别并处理多维数据行
 * @param {Object} item - 原始数据行
 * @returns {Object} { time: Date, values: Object<string, number> }
 */
const extractTimeAndSeries = (item) => {
	// 1. 识别时间、维度与指标
	const dateFields = ['日期', 'date', 'Date', 'day'];
	const timeFields = ['时间', 'time', 'Time', 'Timestamp', 'timestamp'];

	let datePart = '';
	let timePart = '';

	for (const field of dateFields) {
		if (item[field]) {
			datePart = item[field];
			break;
		}
	}

	for (const field of timeFields) {
		if (item[field]) {
			timePart = item[field];
			break;
		}
	}

	let finalTimeStr = '';
	if (datePart && timePart) {
		finalTimeStr = `${datePart} ${timePart}`;
	} else {
		finalTimeStr = datePart || timePart || '';
	}

	if (!finalTimeStr) {
		const keys = Object.keys(item);
		const fuzzyTimeKey = keys.find(k => k.toLowerCase().includes('time') || k.toLowerCase().includes('date') || k.includes('时间') || k.includes('日期'));
		if (fuzzyTimeKey) finalTimeStr = item[fuzzyTimeKey];
	}

	const time = new Date(finalTimeStr.replace(/-/g, '/'));

	const dimensions = {};
	const values = {};

	const allFields = Object.keys(item);
	const timeRelated = [...dateFields, ...timeFields, 'code', 'Code', '天气代码'];

	allFields.forEach(key => {
		if (timeRelated.includes(key) || key === 'time' || key === 'date') return;

		const val = item[key];
		const numVal = parseFloat(val);

		// 定义空值/无效值的占位符
		const naWords = ['-','--','nan','null','none','n/a','undefined'];
		const isNA = val === undefined || val === null || (typeof val === 'string' && naWords.includes(val.toLowerCase().trim()));

		if (!isNaN(numVal) && !isNaN(val)) {
			// 指标
			values[key] = numVal;
		} else if (!isNA && val !== '') {
			// 维度 (字符串)
			dimensions[key] = val.toString();
		}
	});

	return { time, values, dimensions };
};

/**
 * 从名称中提取单位
 * @param {string} name 
 * @returns {string} unit
 */
const guessUnit = (name) => {
	const unitMap = {
		'温度': '℃',
		'湿度': '%',
		'雨量': 'mm',
		'降水': 'mm',
		'电压': 'V',
		'电流': 'A',
		'功率': 'MW',
		'出清曲线': 'MW',
		'短期预测': 'MW',
		'压力': 'Pa',
		'转速': 'rpm'
	};

	// 1. 尝试从括号中提取
	const match = name.match(/[(（]([^)）]+)[)）]/);
	if (match) return match[1];

	// 2. 模糊匹配关键字
	for (const [key, unit] of Object.entries(unitMap)) {
		if (name.includes(key)) return unit;
	}

	return '';
};

/**
 * 处理解析后的原始数据并进行日期分组，支持多维度拆分
 * @param {Array} rawData - 原始数据数组
 * @param {string} fileName - 文件名
 * @returns {Array} 分组后的多维系列数据
 */
export const processDataLogic = (rawData, fileName) => {
	if (!Array.isArray(rawData)) return [];

	const processedRows = rawData
		.map(item => extractTimeAndSeries(item))
		.filter(item => !isNaN(item.time.getTime()) && Object.keys(item.values).length > 0);

	if (processedRows.length === 0) return [];

	// 按日期和维度组合分组 (例如：2026-01-29 + 城市:北京)
	const grouped = {};
	processedRows.forEach(row => {
		const dateStr = format(row.time, 'yyyy-MM-dd');
		// 生成维度的唯一标识符
		const dimKey = Object.entries(row.dimensions)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([k, v]) => `${k}:${v}`)
			.join('|') || 'default';

		const groupKey = `${dateStr}##${dimKey}`;
		if (!grouped[groupKey]) grouped[groupKey] = {
			date: dateStr,
			dimensions: row.dimensions,
			rows: []
		};
		grouped[groupKey].rows.push(row);
	});

	const resultSeries = [];

	Object.keys(grouped).forEach(groupKey => {
		const group = grouped[groupKey];
		const rows = group.rows;

		const allMetrics = new Set();
		rows.forEach(r => Object.keys(r.values).forEach(k => allMetrics.add(k)));

		allMetrics.forEach(metric => {
			const seriesData = rows
				.filter(r => r.values[metric] !== undefined)
				.map(r => ({
					time: r.time,
					value: r.values[metric]
				}));

			if (seriesData.length > 0) {
				let simpleFileName = fileName.replace(/\.[^/.]+$/, "");
				if (simpleFileName.startsWith('粘贴数据_')) {
					simpleFileName = '手动导入';
				}

				const unit = guessUnit(metric);

				// 构建更详细的名称，包含维度信息
				const dimSuffix = Object.values(group.dimensions).length > 0
					? ` (${Object.values(group.dimensions).join(', ')})`
					: '';

				resultSeries.push({
					name: `${metric}${dimSuffix} (${simpleFileName})`,
					data: seriesData,
					date: group.date,
					dimensions: group.dimensions,
					metricName: metric,
					unit: unit,
					id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36).substr(-4)
				});
			}
		});
	});

	return resultSeries;
};
