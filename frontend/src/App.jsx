import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import Papa from 'papaparse';
import { Upload, FileText, ChevronRight, BarChart3, Trash2, ClipboardPaste, X, Download, RotateCcw } from 'lucide-react';
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

	// 轴范围设置：{ metricName: { min: '', max: '' } }
	const [axisRanges, setAxisRanges] = useState({});

	// 1. 生命周期管理：初始化与销毁
	useEffect(() => {
		if (chartRef.current) {
			// 确保容器有尺寸
			if (chartRef.current.clientWidth === 0) {
				chartRef.current.style.width = '100%';
				chartRef.current.style.height = '100%';
			}

			chartInstance.current = echarts.init(chartRef.current, 'dark');

			const handleResize = () => {
				chartInstance.current?.resize();
			};
			window.addEventListener('resize', handleResize);

			return () => {
				window.removeEventListener('resize', handleResize);
				chartInstance.current?.dispose();
				chartInstance.current = null;
			};
		}
	}, []);

	// 2. 数据驱动：更新图表内容 (多轴支持)
	useEffect(() => {
		// 防御性检查：确保实例存在且未被销毁
		if (!chartInstance.current || chartInstance.current.isDisposed()) {
			// 尝试重新初始化（如果之前的 ref 仍然有效）
			if (chartRef.current) {
				chartInstance.current = echarts.init(chartRef.current, 'dark');
			} else {
				return;
			}
		}

		const activeSeries = series.filter(s => s.date === selectedDate);

		if (activeSeries.length === 0 || !selectedDate) {
			chartInstance.current.clear();
			return;
		}

		// --- 动态多轴逻辑 ---
		// 1. 识别所有独特的指标类型（用于创建共享轴）
		// 优先使用 metricName (如果存在), 否则使用 name
		const uniqueMetrics = [...new Set(activeSeries.map(s => s.metricName || s.name))];

		// 2. 生成 Y 轴配置
		const yAxisConfig = uniqueMetrics.map((metric, index) => {
			const isLeft = index === 0;
			// 如果超过2个轴，右侧轴向右偏移
			const offset = index > 1 ? (index - 1) * 60 : 0;

			const customRange = axisRanges[metric] || {};

			return {
				type: 'value',
				name: metric, // 轴名称显示指标名
				nameTextStyle: {
					color: '#ccc',
					padding: [0, 0, 0, 10]
				},
				position: isLeft ? 'left' : 'right',
				offset: offset,
				scale: true, // 自动缩放
				min: customRange.min !== '' && customRange.min !== undefined ? parseFloat(customRange.min) : null,
				max: customRange.max !== '' && customRange.max !== undefined ? parseFloat(customRange.max) : null,
				axisLine: {
					show: true,
					lineStyle: { color: getUserColor(index) } // 轴线颜色与数据对齐
				},
				axisLabel: { color: '#ccc' },
				splitLine: {
					show: isLeft, // 只显示第一条轴的网格线，避免混乱
					lineStyle: { color: 'rgba(255, 255, 255, 0.05)' }
				}
			};
		});

		// 计算右侧需要的边距 (每个额外的右侧轴约需 60px)
		// 0个指标 -> 4%
		// 1个指标 -> 4%
		// 2个指标 -> 5%
		// 3个指标 -> 5 + 4 = 9%
		const rightPercent = uniqueMetrics.length > 2 ? `${5 + (uniqueMetrics.length - 2) * 5}%` : '5%';

		const option = {
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(13, 13, 18, 0.9)',
				borderColor: 'rgba(255, 255, 255, 0.2)',
				textStyle: { color: '#fff' },
				axisPointer: { type: 'cross' } // 十字准星，更适合多轴
			},
			legend: {
				data: activeSeries.map(s => s.name),
				textStyle: { color: '#ccc' },
				top: 10,
				type: 'plain',
				formatter: (name) => {
					// 仅显示指标名，隐藏括号内的文件名部分
					return name.split(' (')[0];
				}
			},
			grid: {
				left: '5%',
				right: rightPercent, // 动态调整右边以容纳多轴
				bottom: '10%',
				containLabel: true
			},
			xAxis: {
				type: 'time',
				axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
				splitLine: { show: false }
			},
			yAxis: yAxisConfig,
			series: activeSeries.map((s, idx) => {
				// 找到该序列对应的轴索引
				const metricKey = s.metricName || s.name;
				const axisIndex = uniqueMetrics.indexOf(metricKey);

				return {
					name: s.name,
					type: 'line',
					yAxisIndex: axisIndex, // 绑定到对应轴
					smooth: true,
					showSymbol: true, // 加粗显示每个数值点
					symbol: 'circle',
					symbolSize: 8,
					data: s.data.map(d => [d.time, d.value]),
					lineStyle: { width: 3 },
					itemStyle: {
						color: getUserColor(axisIndex),
						borderWidth: 2
					}
				};
			})
		};

		chartInstance.current.setOption(option, true);
		setTimeout(() => chartInstance.current?.resize(), 100);
	}, [series, selectedDate, axisRanges]);

	// 3. 自动同步可用日期列表
	useEffect(() => {
		const dates = [...new Set(series.map(s => s.date))].sort();
		setAvailableDates(dates);

		// 如果当前选中的日期已不存在，则自动切换
		if (selectedDate && !dates.includes(selectedDate)) {
			setSelectedDate(dates.length > 0 ? dates[0] : '');
		}
	}, [series]);

	/**
	 * 处理文件上传
	 */
	const handleFileUpload = (e) => {
		let file;
		// 区分 input 选择 (事件对象) 和 拖拽 (File对象)
		if (e && e.target && e.target.files) {
			file = e.target.files[0];
		} else {
			file = e;
		}

		if (!file || !(file instanceof File || file instanceof Blob)) {
			console.error('无效的文件对象:', file);
			return;
		}

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
		e.stopPropagation();
		setIsDragging(false);
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			handleFileUpload(files[0]);
		}
	};

	const onDragOver = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const onDragEnter = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const onDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		// 只有当离开的是顶层容器时才取消
		if (e.currentTarget === e.target) {
			setIsDragging(false);
		}
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

		if (!selectedDate && newSeries.length > 0) {
			setSelectedDate(newSeries[0].date);
		}
	};

	/**
	 * 删除单个系列
	 */
	const removeSeries = (id) => {
		setSeries(prev => prev.filter(s => s.id !== id));
	};

	/**
	 * 导出当前图表数据为 CSV
	 */
	const exportData = () => {
		const activeSeries = series.filter(s => s.date === selectedDate);
		if (activeSeries.length === 0) return;

		// 收集所有的时间戳并排序
		const allTimestamps = new Set();
		activeSeries.forEach(s => s.data.forEach(d => allTimestamps.add(d.time.getTime())));
		const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

		// 构建 CSV 表头
		const headers = ['时间', ...activeSeries.map(s => s.name)];
		const rows = [headers];

		// 构建数据行
		sortedTimestamps.forEach(ts => {
			const timeStr = format(new Date(ts), 'yyyy-MM-dd HH:mm:ss');
			const row = [timeStr];
			activeSeries.forEach(s => {
				const point = s.data.find(d => d.time.getTime() === ts);
				row.push(point ? point.value : '');
			});
			rows.push(row);
		});

		// 转换为 CSV 字符串
		const csvContent = rows.map(r => r.join(',')).join('\n');
		const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.setAttribute('download', `exported_data_${selectedDate}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
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
			onDragEnter={onDragEnter}
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
					{selectedDate && (
						<button className="nav-btn export-btn" onClick={exportData} title="导出当前视图数据">
							<Download size={18} />
							导出
						</button>
					)}
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
									<div className="series-info">
										<ChevronRight size={14} className="accent-color" />
										<span title={s.name}>{s.name}</span>
									</div>
									<button
										className="delete-series-btn"
										onClick={() => removeSeries(s.id)}
										title="删除此曲线"
									>
										<X size={14} />
									</button>
								</li>
							))}
						</ul>
					</div>

					{selectedDate && (
						<div className="axis-controls">
							<p className="label">坐标轴设置</p>
							{[...new Set(series.filter(s => s.date === selectedDate).map(s => s.metricName || s.name))].map(metric => (
								<div key={metric} className="axis-input-group-compact glass-panel">
									<div className="axis-header">
										<span className="axis-name" title={metric}>{metric}</span>
										<button
											className="reset-axis-btn"
											onClick={() => setAxisRanges(prev => {
												const next = { ...prev };
												delete next[metric];
												return next;
											})}
											title="恢复默认范围"
										>
											<RotateCcw size={12} />
											默认
										</button>
									</div>
									<div className="input-row">
										<input
											type="number"
											placeholder="Min"
											value={axisRanges[metric]?.min || ''}
											onChange={(e) => setAxisRanges(prev => ({
												...prev,
												[metric]: { ...prev[metric], min: e.target.value }
											}))}
										/>
										<span className="separator">-</span>
										<input
											type="number"
											placeholder="Max"
											value={axisRanges[metric]?.max || ''}
											onChange={(e) => setAxisRanges(prev => ({
												...prev,
												[metric]: { ...prev[metric], max: e.target.value }
											}))}
										/>
									</div>
								</div>
							))}
						</div>
					)}
				</aside>

				<section className="chart-area glass-panel">
					{!selectedDate && (
						<div className="empty-state">
							<Upload size={64} className="accent-color floating" />
							<h2>开始分析</h2>
							<p>支持拖拽文件、点击导入或粘贴文本数据</p>
							<div className="support-tips">
								<span>CSV</span> • <span>JSON</span> • <span>TXT</span>
							</div>
						</div>
					)}
					<div
						ref={chartRef}
						className="chart-container"
						style={{
							flex: 1,
							width: '100%',
							height: '100%',
							opacity: selectedDate ? 1 : 0
						}}
					></div>
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

// 辅助函数：生成不同颜色
function getUserColor(index) {
	const colors = [
		'#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
		'#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'
	];
	return colors[index % colors.length];
}

export default App;
