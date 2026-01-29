import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import Papa from 'papaparse';
import { Upload, FileText, ChevronRight, BarChart3, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { processDataLogic } from './utils/dataProcessor';
import './App.css';

/**
 * 数据文件解析与曲线展示主应用
 * @returns {JSX.Element}
 */
function App() {
	// 存储所有导入的数据系列 [ { name: string, data: [{time, value}], date: string } ]
	const [series, setSeries] = useState([]);
	const [selectedDate, setSelectedDate] = useState('');
	const [availableDates, setAvailableDates] = useState([]);
	const chartRef = useRef(null);
	const chartInstance = useRef(null);

	// 初始化图表
	useEffect(() => {
		if (chartRef.current) {
			chartInstance.current = echarts.init(chartRef.current, 'dark');
			window.addEventListener('resize', () => chartInstance.current?.resize());
		}
		return () => {
			chartInstance.current?.dispose();
		};
	}, []);

	// 当数据或选择的日期变化时更新图表
	useEffect(() => {
		if (!chartInstance.current) return;

		// 过滤出选中日期的所有系列
		const activeSeries = series.filter(s => s.date === selectedDate);

		const option = {
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(13, 13, 18, 0.8)',
				borderColor: 'rgba(255, 255, 255, 0.1)',
				textStyle: { color: '#fff' }
			},
			legend: {
				data: activeSeries.map(s => s.name),
				textStyle: { color: '#ccc' },
				top: 10
			},
			grid: {
				left: '3%',
				right: '4%',
				bottom: '3%',
				containLabel: true
			},
			xAxis: {
				type: 'time',
				axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
				splitLine: { show: false }
			},
			yAxis: {
				type: 'value',
				axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
				splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
			},
			series: activeSeries.map(s => ({
				name: s.name,
				type: 'line',
				smooth: true,
				showSymbol: false,
				data: s.data.map(d => [d.time, d.value]),
				lineStyle: { width: 3 }
			}))
		};

		chartInstance.current.setOption(option, true);
	}, [series, selectedDate]);

	/**
	 * 处理文件上传
	 * @param {Event} e 
	 */
	const handleFileUpload = (e) => {
		const file = e.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target.result;
			if (file.name.endsWith('.csv')) {
				parseCSV(content, file.name);
			} else if (file.name.endsWith('.json')) {
				parseJSON(content, file.name);
			}
		};
		reader.readAsText(file);
	};

	/**
	 * 解析 CSV 数据
	 * @param {string} csvContent 
	 * @param {string} fileName 
	 */
	const parseCSV = (csvContent, fileName) => {
		Papa.parse(csvContent, {
			header: true,
			skipEmptyLines: true,
			complete: (results) => {
				processData(results.data, fileName);
			}
		});
	};

	/**
	 * 解析 JSON 数据
	 * @param {string} jsonContent 
	 * @param {string} fileName 
	 */
	const parseJSON = (jsonContent, fileName) => {
		try {
			const data = JSON.parse(jsonContent);
			processData(data, fileName);
		} catch (err) {
			console.error('JSON 解析失败:', err);
		}
	};

	/**
	 * 处理解析后的数据并进行日期分组
	 * @param {Array} rawData 
	 * @param {string} fileName 
	 */
	const processData = (rawData, fileName) => {
		const newSeries = processDataLogic(rawData, fileName);
		if (newSeries.length === 0) return;

		setSeries(prev => [...prev, ...newSeries]);

		// 更新可用日期
		setAvailableDates(prev => {
			const currentDates = newSeries.map(s => s.date);
			const combined = [...new Set([...prev, ...currentDates])];
			return combined.sort();
		});

		// 如果当前没选日期，默认选第一个
		if (!selectedDate && newSeries.length > 0) {
			setSelectedDate(newSeries[0].date);
		}
	};

	const clearAll = () => {
		setSeries([]);
		setAvailableDates([]);
		setSelectedDate('');
	};

	return (
		<div className="app-container">
			<nav className="navbar glass-panel">
				<div className="logo">
					<BarChart3 className="logo-icon" />
					<span>DataCurve <strong>Analyzer</strong></span>
				</div>
				<div className="nav-actions">
					<label className="upload-btn premium-button">
						<Upload size={18} />
						导入数据
						<input type="file" accept=".csv,.json" onChange={handleFileUpload} hidden />
					</label>
					<button className="clear-btn" onClick={clearAll}>
						<Trash2 size={18} />
					</button>
				</div>
			</nav>

			<main className="main-content">
				<aside className="sidebar glass-panel">
					<h3>分析列表</h3>
					<div className="date-selector">
						<p className="label">选择日期查看对比</p>
						<select
							value={selectedDate}
							onChange={(e) => setSelectedDate(e.target.value)}
							className="styled-select"
						>
							<option value="">-- 请选择日期 --</option>
							{availableDates.map(date => (
								<option key={date} value={date}>{date}</option>
							))}
						</select>
					</div>

					<div className="series-list">
						<p className="label">当前日期曲线 ({series.filter(s => s.date === selectedDate).length})</p>
						<ul>
							{series.filter(s => s.date === selectedDate).map(s => (
								<li key={s.id} className="series-item">
									<ChevronRight size={14} />
									<span title={s.name}>{s.name}</span>
								</li>
							))}
						</ul>
					</div>
				</aside>

				<section className="chart-area glass-panel">
					{!selectedDate ? (
						<div className="empty-state">
							<FileText size={48} />
							<p>请导入 CSV 或 JSON 数据并选择日期以开始分析</p>
						</div>
					) : (
						<div ref={chartRef} className="chart-container"></div>
					)}
				</section>
			</main>

			<footer className="footer">
				<p>© 2026 DataCurve Analyzer by yjiefl</p>
			</footer>
		</div>
	);
}

export default App;
