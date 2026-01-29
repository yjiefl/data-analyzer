import { format } from 'date-fns';

/**
 * 智能识别并处理多列数据
 * @param {Object} item - 原始数据行
 * @returns {Object} { time: Date, value: Number }
 */
const extractTimeAndValue = (item) => {
	// 1. 提取时间
	// 支持的日期/时间字段名
	const dateFields = ['日期', 'date', 'Date', 'day'];
	const timeFields = ['时间', 'time', 'Time', 'Timestamp', 'timestamp'];

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

	// 2. 提取数值
	const valueFields = ['温度', 'value', 'Value', 'val', '数值', '结果', 'temp', 'Temp'];
	let value = NaN;

	// 优先精确匹配，再进行包含匹配
	for (const field of valueFields) {
		if (item[field] !== undefined) {
			value = parseFloat(item[field]);
			if (!isNaN(value)) break;
		}
	}

	if (isNaN(value)) {
		for (const field of valueFields) {
			const actualKey = Object.keys(item).find(k => k.includes(field));
			if (actualKey && item[actualKey] !== undefined) {
				value = parseFloat(item[actualKey]);
				if (!isNaN(value)) break;
			}
		}
	}

	// 兜底：如果没找到明确的数值字段，取第一个数值类型的列
	if (isNaN(value)) {
		for (const key in item) {
			const val = parseFloat(item[key]);
			if (!isNaN(val) && typeof item[key] !== 'boolean' && !key.toLowerCase().includes('date') && !key.toLowerCase().includes('time')) {
				value = val;
				break;
			}
		}
	}

	return { time, value };
};

/**
 * 处理解析后的原始数据并进行日期分组
 * @param {Array} rawData - 原始数据数组
 * @param {string} fileName - 文件名
 * @returns {Array} 分组后的系列数据
 */
export const processDataLogic = (rawData, fileName) => {
	if (!Array.isArray(rawData)) return [];

	const formattedData = rawData
		.map(item => extractTimeAndValue(item))
		.filter(item => !isNaN(item.time.getTime()) && !isNaN(item.value));

	if (formattedData.length === 0) return [];

	const grouped = {};
	formattedData.forEach(d => {
		const dateStr = format(d.time, 'yyyy-MM-dd');
		if (!grouped[dateStr]) grouped[dateStr] = [];
		grouped[dateStr].push(d);
	});

	return Object.keys(grouped).map(date => ({
		name: `${fileName} (${date})`,
		data: grouped[date],
		date: date,
		id: Math.random().toString(36).substr(2, 9)
	}));
};
