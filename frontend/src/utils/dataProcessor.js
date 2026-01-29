import { format } from 'date-fns';

/**
 * 智能识别并处理多维数据行
 * @param {Object} item - 原始数据行
 * @returns {Object} { time: Date, values: Object<string, number> }
 */
const extractTimeAndSeries = (item) => {
	// 1. 提取时间
	// 支持的日期/时间字段名
	const dateFields = ['日期', 'date', 'Date', 'day'];
	const timeFields = ['时间', 'time', 'Time', 'Timestamp', 'timestamp'];
	const nonMetricFields = [...dateFields, ...timeFields, '城市', 'City', 'city', '天气', 'Weather', 'code', 'Code', '天气代码'];

	let datePart = '';
	let timePart = '';

	// 查找日期列
	for (const field of dateFields) {
		if (item[field]) {
			datePart = item[field];
			break;
		}
	}

	// 查找时间列
	for (const field of timeFields) {
		if (item[field]) {
			timePart = item[field];
			break;
		}
	}

	// 如果日期和时间分开了（如用户图示），合并它们
	let finalTimeStr = '';
	if (datePart && timePart) {
		finalTimeStr = `${datePart} ${timePart}`;
	} else {
		finalTimeStr = datePart || timePart || '';
	}

	// 兜底：如果没找到明确的字段，尝试找包含 date 或 time 的任何字段
	if (!finalTimeStr) {
		const keys = Object.keys(item);
		const fuzzyTimeKey = keys.find(k => k.toLowerCase().includes('time') || k.toLowerCase().includes('date') || k.includes('时间') || k.includes('日期'));
		if (fuzzyTimeKey) finalTimeStr = item[fuzzyTimeKey];
	}

	// 使用 / 替换 - 以获得更好的浏览器兼容性 (特别是 Safari)
	const time = new Date(finalTimeStr.replace(/-/g, '/'));

	// 2. 提取所有数值型列（作为单独的指标）
	const values = {};

	Object.keys(item).forEach(key => {
		// 跳过已知的非数值字段
		if (nonMetricFields.some(f => key.includes(f) || key === f)) return;

		// 尝试解析数值
		const valStr = item[key];
		// 清理可能的单位符号等（简单处理）
		const val = parseFloat(valStr);

		// 必须是有效数字
		if (!isNaN(val)) {
			values[key] = val;
		}
	});

	return { time, values };
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

	// 按日期分组
	const groupedByDate = {};
	processedRows.forEach(row => {
		const dateStr = format(row.time, 'yyyy-MM-dd');
		if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
		groupedByDate[dateStr].push(row);
	});

	const resultSeries = [];

	// 遍历每个日期
	Object.keys(groupedByDate).forEach(date => {
		const rows = groupedByDate[date];

		// 收集该日期下的所有所有可用指标 (metrics)
		const allMetrics = new Set();
		rows.forEach(r => Object.keys(r.values).forEach(k => allMetrics.add(k)));

		// 为每个指标创建一个独立的系列
		allMetrics.forEach(metric => {
			// 提取该指标的时间序列数据
			const seriesData = rows
				.filter(r => r.values[metric] !== undefined)
				.map(r => ({
					time: r.time,
					value: r.values[metric]
				}));

			if (seriesData.length > 0) {
				// 获取简单的文件名（去除扩展名）
				let simpleFileName = fileName.replace(/\.[^/.]+$/, "");

				// 优化：如果是粘贴的数据，不显示冗余的“粘贴数据_HHmm”
				if (simpleFileName.startsWith('粘贴数据_')) {
					simpleFileName = '手动导入';
				}

				resultSeries.push({
					name: `${metric} (${simpleFileName})`, // 例如：相对湿度(%) (手动导入)
					data: seriesData,
					date: date,
					metricName: metric, // 用于后续分组或轴匹配
					id: Math.random().toString(36).substr(2, 9)
				});
			}
		});
	});

	return resultSeries;
};
