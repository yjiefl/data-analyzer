import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import Papa from 'papaparse';
import { Upload, FileText, ChevronRight, BarChart3, Trash2, ClipboardPaste, X } from 'lucide-react';
import { format } from 'date-fns';
import { processDataLogic } from './utils/dataProcessor';
import './App.css';

/**
 * 数据文件解析与曲线展示主应用
 * @returns {JSX.Element}
 */
function App() {
	const [series, setSeries] = useState([]);
	const [selectedDate, setSelectedDate] = useState('');
	const [availableDates, setAvailableDates] = useState([]);
	const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
	const [pasteContent, setPasteContent] = useState('');
	const [isDragging, setIsDragging] = useState(false);

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

		const activeSeries = series.filter(s => s.date === selectedDate);

		const option = {
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(13, 13, 18, 0.9)',
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
	 */
	const handleFileUpload = (e) => {
		const file = e.target.files ? e.target.files[0] : e;
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target.result;
			if (file.name.endsWith('.csv')) {
				parseCSV(content, file.name);
			} else if (file.name.endsWith('.json')) {
				parseJSON(content, file.name);
			} else {
				// 尝试自动识别
				if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
					parseJSON(content, file.name);
				} else {
					parseCSV(content, file.name);
				}
			}
		};
		reader.readAsText(file);
	};

	/**
	 * 处理粘贴内容
	 */
	const handlePasteSubmit = () => {
		if (!pasteContent.trim()) return;

		const timestamp = format(new Date(), 'HHmm');
		const name = `粘贴数据_${timestamp}`;

		if (pasteContent.trim().startsWith('[') || pasteContent.trim().startsWith('{')) {
			parseJSON(pasteContent, name);
		} else {
			parseCSV(pasteContent, name);
		}

		setPasteContent('');
		setIsPasteModalOpen(false);
	};

	/**
	 * 拖拽处理
	 */
	const onDrop = (e) => {
		e.preventDefault();
		setIsDragging(false);
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			handleFileUpload(files[0]);
		}
	};

	const onDragOver = (e) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const onDragLeave = () => {
		setIsDragging(false);
	};

	/**
	 * 解析 CSV
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
	 * 解析 JSON
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
	 * 处理数据
	 */
	const processData = (rawData, fileName) => {
		const newSeries = processDataLogic(rawData, fileName);
		if (newSeries.length === 0) {
			alert(`无法从 ${fileName} 中解析出有效的曲线数据。请确保文件包含日期、时间以及数值列。`);
			return;
		}

		setSeries(prev => [...prev, ...newSeries]);

		setAvailableDates(prev => {
			const currentDates = newSeries.map(s => s.date);
			const combined = [...new Set([...prev, ...currentDates])];
			return combined.sort();
		});

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
		<div
			className={`app-container ${isDragging ? 'dragging' : ''}`}
			onDrop={onDrop}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
		>
			{isDragging && (
				<div className="drag-overlay">
					<div className="drag-message">
						<Upload size={64} />
						<h2>松开鼠标导入文件</h2>
					</div>
				</div>
			)}

			<nav className="navbar glass-panel">
				<div className="logo">
					<BarChart3 className="logo-icon" />
					<span>DataCurve <strong>Analyzer</strong></span>
				</div>
				<div className="nav-actions">
					<button className="nav-btn premium-button" onClick={() => setIsPasteModalOpen(true)}>
						<ClipboardPaste size={18} />
						粘贴数据
					</button>
					<label className="upload-btn premium-button">
						<Upload size={18} />
						导入文件
						<input type="file" accept=".csv,.json" onChange={handleFileUpload} hidden />
					</label>
					<button className="clear-btn" onClick={clearAll} title="清空所有数据">
						<Trash2 size={18} />
					</button>
				</div>
			</nav>

			<main className="main-content">
				<aside className="sidebar glass-panel">
					<h3>分析控制台</h3>
					<div className="date-selector">
						<p className="label">日期筛选</p>
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
						<p className="label">已选系列 ({series.filter(s => s.date === selectedDate).length})</p>
						<ul>
							{series.filter(s => s.date === selectedDate).map(s => (
								<li key={s.id} className="series-item">
									<ChevronRight size={14} className="accent-color" />
									<span title={s.name}>{s.name}</span>
								</li>
							))}
						</ul>
					</div>
				</aside>

				<section className="chart-area glass-panel">
					{!selectedDate ? (
						<div className="empty-state">
							<Upload size={64} className="accent-color floating" />
							<h2>开始分析</h2>
							<p>支持拖拽文件、点击导入或粘贴文本数据</p>
							<div className="support-tips">
								<span>CSV</span> • <span>JSON</span> • <span>TXT</span>
							</div>
						</div>
					) : (
						<div ref={chartRef} className="chart-container"></div>
					)}
				</section>
			</main>

			{isPasteModalOpen && (
				<div className="modal-overlay">
					<div className="modal-content glass-panel">
						<div className="modal-header">
							<h3>粘贴数据导入</h3>
							<button className="close-btn" onClick={() => setIsPasteModalOpen(false)}>
								<X size={20} />
							</button>
						</div>
						<p className="modal-subtitle">支持 CSV (带表头) 或 JSON 数组格式</p>
						<textarea
							className="paste-area"
							placeholder="在此处粘贴您的数据..."
							value={pasteContent}
							onChange={(e) => setPasteContent(e.target.value)}
						/>
						<div className="modal-actions">
							<button className="cancel-btn" onClick={() => setIsPasteModalOpen(false)}>取消</button>
							<button className="premium-button" onClick={handlePasteSubmit}>确认导入</button>
						</div>
					</div>
				</div>
			)}

			<footer className="footer">
				<p>© 2026 DataCurve Analyzer • 强大的曲线对比分析工具</p>
			</footer>
		</div>
	);
}

export default App;
