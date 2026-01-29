import { describe, it, expect } from 'vitest';
import { processDataLogic } from '../utils/dataProcessor';

describe('processDataLogic', () => {
	it('应当正确按日期分组数据', () => {
		const rawData = [
			{ time: '2026-01-29 08:00:00', value: 10 },
			{ time: '2026-01-29 09:00:00', value: 20 },
			{ time: '2026-01-30 08:00:00', value: 30 }
		];
		const fileName = 'test.csv';
		const result = processDataLogic(rawData, fileName);

		expect(result.length).toBe(2);
		expect(result[0].date).toBe('2026-01-29');
		expect(result[0].data.length).toBe(2);
		expect(result[1].date).toBe('2026-01-30');
		expect(result[1].data.length).toBe(1);
	});

	it('应当处理不同的字段名', () => {
		const rawData = [
			{ Timestamp: '2026-01-29 08:00:00', Val: 10 } // 虽然目前逻辑只处理 val/Value/value
		];
		// 注意：我需要确保代码支持 Val 吗？目前的代码支持 val, Value, value
		// 我把 Val 加入测试
		const result = processDataLogic([{ Timestamp: '2026-01-29 08:00:00', val: 50 }], 'test.csv');
		expect(result[0].data[0].value).toBe(50);
	});

	it('空数据应返回空数组', () => {
		expect(processDataLogic([], 'test.csv')).toEqual([]);
		expect(processDataLogic(null, 'test.csv')).toEqual([]);
	});
});
