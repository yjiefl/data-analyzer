import { format } from 'date-fns';

/**
 * 处理解析后的原始数据并进行日期分组
 * @param {Array} rawData - 原始数据数组
 * @param {string} fileName - 文件名
 * @returns {Array} 分组后的系列数据
 */
export const processDataLogic = (rawData, fileName) => {
	if (!Array.isArray(rawData)) return [];

	const formattedData = rawData
		.map(item => {
			const timeStr = item.time || item.Timestamp || item.date;
			const valStr = item.value || item.Value || item.val;

			const time = new Date(timeStr);
			const value = parseFloat(valStr);

			return { time, value };
		})
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
