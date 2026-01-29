import { describe, it, expect } from 'vitest';
import { processDataLogic } from '../utils/dataProcessor';

describe('processDataLogic', () => {
	it('应当正确引导按日期分组数据', () => {
		const rawData = [
			{ time: '2026-01-29 08:00:00', value: 10 },
			{ time: '2026-01-29 09:00:00', value: 20 },
			{ time: '2026-01-30 08:00:00', value: 30 }
		];
		const fileName = 'test.csv';
		const result = processDataLogic(rawData, fileName);

		expect(result.length).toBe(2);
		expect(result[0].date).toBe('2026-01-29');
	});

	it('应当支持中文表头和分开的日期时间列 (用户图示场景)', () => {
		const rawData = [
			{
				"城市": "南宁",
				"日期": "2026/1/28",
				"时间": "0:00",
				"温度(°C)": "12.4"
			},
			{
				"城市": "南宁",
				"日期": "2026/1/28",
				"时间": "1:00",
				"温度(°C)": "11.9"
			}
		];
		const result = processDataLogic(rawData, 'nanning.csv');
		expect(result.length).toBe(1);
		expect(result[0].date).toBe('2026-01-28');
		expect(result[0].data[0].value).toBe(12.4);
		// 检查时间是否正确合并
		const firstTime = result[0].data[0].time;
		expect(firstTime.getFullYear()).toBe(2026);
		expect(firstTime.getMonth()).toBe(0); // 1月
		expect(firstTime.getDate()).toBe(28);
		expect(firstTime.getHours()).toBe(0);
	});

	it('应当支持用户提供的具体数据格式 (__2026-01-28_2026-01-28.csv)', () => {
		const rawData = [
			{
				"城市": "南宁",
				"日期": "2026-01-28",
				"时间": "00:00",
				"温度(°C)": "12.4",
				"相对湿度(%)": "82.0"
			}
		];
		const result = processDataLogic(rawData, 'test.csv');
		expect(result.length).toBe(1);
		expect(result[0].data[0].value).toBe(12.4);
		expect(result[0].date).toBe('2026-01-28');
	});

	it('应当支持带有单位的复杂中文表头 (用户实际数据)', () => {
		const rawData = [
			{
				"城市": "南宁",
				"日期": "2026-01-28",
				"时间": "00:00",
				"温度(°C)": "12.4",
				"10米风速(km/h)": "3.7"
			}
		];
		const result = processDataLogic(rawData, 'exact.csv');
		expect(result.length).toBe(1);
		expect(result[0].data[0].value).toBe(12.4);
	});

	it('应当智能匹配第一个数值列（无明确表头时）', () => {
		const rawData = [
			{ "Date": "2026-01-29 12:00", "RandomLabel": "X", "SecretValue": "42.5" }
		];
		const result = processDataLogic(rawData, 'fuzzy.csv');
		expect(result[0].data[0].value).toBe(42.5);
	});

	it('空数据应返回空数组', () => {
		expect(processDataLogic([], 'test.csv')).toEqual([]);
	});
});
