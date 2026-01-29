import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import Papa from 'papaparse';
import { Upload, FileText, ChevronRight, BarChart3, Trash2, ClipboardPaste, X, Download, RotateCcw, Moon, Sun, ChevronLeft, Layout } from 'lucide-react';
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
	const [showIntegral, setShowIntegral] = useState(false);
	const [hoveredMetric, setHoveredMetric] = useState(null);
	const [backendStatus, setBackendStatus] = useState('offline'); // online | offline | checking

	const [activeDimension, setActiveDimension] = useState(''); // 当前选中的分组维度字段，如 '城市'
	const [selectedDimensionValues, setSelectedDimensionValues] = useState([]); // 选中的维度值列表，如 ['北京', '上海']

	// 新增 UI 状态
	const [theme, setTheme] = useState('dark'); // dark | light
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
	const [sidebarWidth, setSidebarWidth] = useState(320);
	const isResizing = useRef(false);

	// 1. 生命周期管理：初始化与销毁
	useEffect(() => {
		if (chartRef.current) {
			const initChart = () => {
				if (chartInstance.current) {
					chartInstance.current.dispose();
				}
				chartInstance.current = echarts.init(chartRef.current, theme === 'dark' ? 'dark' : null);

				// 鼠标移动监听：用于切换左侧纵坐标
				chartInstance.current.on('mouseover', (params) => {
					if (params.seriesName) {
						const metric = params.seriesName.split(' (')[0];
						setHoveredMetric(metric);
					}
				});

				chartInstance.current.on('mouseout', () => {
					setHoveredMetric(null);
				});

				// 恢复之前的数据渲染（如果有）
				if (series.length > 0) {
					updateChart();
				}
			};

			initChart();

			const handleResize = () => {
				chartInstance.current?.resize();
			};
			window.addEventListener('resize', handleResize);
			checkBackend();

			return () => {
				window.removeEventListener('resize', handleResize);
				chartInstance.current?.dispose();
				chartInstance.current = null;
			};
		}
	}, [theme]); // 主题切换时重新初始化

	/**
	 * 模拟检测后端
	 */
	const checkBackend = async () => {
		try {
			setBackendStatus('checking');
			const res = await fetch('/api/health').catch(() => ({ ok: false }));
			setBackendStatus(res.ok ? 'online' : 'offline');
		} catch (e) {
			setBackendStatus('offline');
		}
	};

	// 2. 数据驱动：更新图表内容 (多轴支持)
	const updateChart = () => {
		if (!chartInstance.current || chartInstance.current.isDisposed()) return;

		const activeSeries = series.filter(s => {
			if (s.date !== selectedDate) return false;
			if (!activeDimension || selectedDimensionValues.length === 0) return true;
			return selectedDimensionValues.includes(s.dimensions[activeDimension]);
		});

		if (activeSeries.length === 0 || !selectedDate) {
			chartInstance.current.clear();
			return;
		}

		const uniqueMetrics = [...new Set(activeSeries.map(s => s.metricName || s.name))];
		const isLight = theme === 'light';

		const yAxisConfig = uniqueMetrics.map((metric, index) => {
			const customRange = axisRanges[metric] || {};
			const isActive = hoveredMetric ? (metric === hoveredMetric) : (index === 0);

			return {
				type: 'value',
				name: metric,
				nameTextStyle: {
					color: isActive ? getUserColor(index) : 'transparent',
					padding: [0, 0, 0, 10]
				},
				position: 'left',
				show: isActive,
				scale: true,
				min: customRange.min !== '' && customRange.min !== undefined ? parseFloat(customRange.min) : null,
				max: customRange.max !== '' && customRange.max !== undefined ? parseFloat(customRange.max) : null,
				axisLine: {
					show: true,
					lineStyle: { color: getUserColor(index) }
				},
				axisLabel: {
					show: true,
					color: isLight ? '#666' : '#ccc'
				},
				splitLine: {
					show: isActive,
					lineStyle: { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.05)' }
				}
			};
		});

		const option = {
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'axis',
				backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(13, 13, 18, 0.9)',
				borderColor: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)',
				textStyle: { color: isLight ? '#333' : '#fff' },
				axisPointer: { type: 'cross' }
			},
			legend: {
				data: activeSeries.map(s => s.name),
				textStyle: { color: isLight ? '#666' : '#ccc', fontSize: 11 },
				top: 5,
				type: 'scroll',
				pageTextStyle: { color: isLight ? '#333' : '#fff' },
				formatter: (name) => name.split(' (')[0]
			},
			grid: {
				top: '80', // 适当下移，避免图例重合
				left: '40',
				right: '40',
				bottom: '40',
				containLabel: true
			},
			xAxis: {
				type: 'time',
				axisLine: { lineStyle: { color: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255, 255, 255, 0.2)' } },
				axisLabel: { color: isLight ? '#666' : '#ccc' },
				splitLine: { show: false }
			},
			yAxis: yAxisConfig,
			series: activeSeries.map((s, idx) => {
				const metricKey = s.metricName || s.name;
				const axisIndex = uniqueMetrics.indexOf(metricKey);

				return {
					name: s.name,
					type: 'line',
					yAxisIndex: axisIndex,
					smooth: true,
					showSymbol: true,
					symbol: 'circle',
					symbolSize: 6,
					data: s.data.map(d => [d.time, d.value]),
					lineStyle: { width: 2 },
					itemStyle: {
						color: getUserColor(axisIndex),
						borderWidth: 1
					}
				};
			})
		};

		chartInstance.current.setOption(option, true);
	};

	useEffect(() => {
		updateChart();
		const timer = setTimeout(() => chartInstance.current?.resize(), 300);
		return () => clearTimeout(timer);
	}, [series, selectedDate, axisRanges, hoveredMetric, activeDimension, selectedDimensionValues, sidebarWidth, isSidebarCollapsed]);

	// 3. 自动同步可用日期列表
	useEffect(() => {
		const dates = [...new Set(series.map(s => s.date))].sort();
		setAvailableDates(dates);
		if (selectedDate && !dates.includes(selectedDate)) {
			setSelectedDate(dates.length > 0 ? dates[0] : '');
		}
	}, [series]);

	// 4. 初始化主维度
	useEffect(() => {
		const daySeries = series.filter(s => s.date === selectedDate);
		const dims = [...new Set(daySeries.flatMap(s => Object.keys(s.dimensions)))];
		if (dims.length > 0 && !activeDimension) {
			setActiveDimension(dims[0]);
		}
		setSelectedDimensionValues([]);
	}, [selectedDate, series.length === 0]);

	// 5. 处理维度值全选
	useEffect(() => {
		if (activeDimension) {
			const values = [...new Set(
				series
					.filter(s => s.date === selectedDate)
					.map(s => s.dimensions[activeDimension])
					.filter(v => v !== undefined)
			)];
			setSelectedDimensionValues(values);
		}
	}, [activeDimension, selectedDate]);

	const handleFileUpload = (e) => {
		let file = (e && e.target && e.target.files) ? e.target.files[0] : e;
		if (!file || !(file instanceof File || file instanceof Blob)) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target.result;
			if (file.name.endsWith('.csv')) {
				parseCSV(content, file.name);
			} else if (file.name.endsWith('.json')) {
				parseJSON(content, file.name);
			} else {
				if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
					parseJSON(content, file.name);
				} else {
					parseCSV(content, file.name);
				}
			}
		};
		reader.readAsText(file);
	};

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

	const handleMouseDown = (e) => {
		isResizing.current = true;
		document.body.style.cursor = 'col-resize';
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	};

	const handleMouseMove = (e) => {
		if (isResizing.current) {
			window.requestAnimationFrame(() => {
				const newWidth = e.clientX - 10;
				if (newWidth >= 200 && newWidth <= 800) {
					setSidebarWidth(newWidth);
				}
			});
		}
	};

	const handleMouseUp = () => {
		isResizing.current = false;
		document.body.style.cursor = 'default';
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	};

	const onDrop = (e) => {
		e.preventDefault(); e.stopPropagation();
		setIsDragging(false);
		const files = e.dataTransfer.files;
		if (files.length > 0) handleFileUpload(files[0]);
	};
	const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
	const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
	const onDragLeave = (e) => {
		e.preventDefault(); e.stopPropagation();
		if (e.currentTarget === e.target) setIsDragging(false);
	};

	const parseCSV = (csvContent, fileName) => {
		Papa.parse(csvContent, {
			header: true, skipEmptyLines: true,
			complete: (results) => processData(results.data, fileName)
		});
	};

	const parseJSON = (jsonContent, fileName) => {
		try { processData(JSON.parse(jsonContent), fileName); } catch (err) { console.error(err); }
	};

	const processData = (rawData, fileName) => {
		const newSeries = processDataLogic(rawData, fileName);
		if (newSeries.length === 0) {
			alert(`无法从 ${fileName} 中解析出有效的曲线数据。`);
			return;
		}
		setSeries(prev => [...prev, ...newSeries]);
		if (!selectedDate && newSeries.length > 0) setSelectedDate(newSeries[0].date);
	};

	const calculateIntegral = (data) => {
		if (!data || data.length < 2) return '0.00';
		let total = 0;
		const sorted = [...data].sort((a, b) => a.time.getTime() - b.time.getTime());
		for (let i = 0; i < sorted.length - 1; i++) {
			const p1 = sorted[i]; const p2 = sorted[i + 1];
			const dt = (p2.time.getTime() - p1.time.getTime()) / (1000 * 3600);
			total += (p1.value + p2.value) * dt / 2;
		}
		const unitStr = data[0]?.unit ? `${data[0].unit}·h` : '项';
		return `${total.toFixed(2)} ${unitStr}`;
	};

	const removeSeries = (id) => setSeries(prev => prev.filter(s => s.id !== id));

	const exportData = () => {
		const activeSeries = series.filter(s => {
			if (s.date !== selectedDate) return false;
			if (!activeDimension || selectedDimensionValues.length === 0) return true;
			return selectedDimensionValues.includes(s.dimensions[activeDimension]);
		});
		if (activeSeries.length === 0) return;
		const allTimestamps = new Set();
		activeSeries.forEach(s => s.data.forEach(d => allTimestamps.add(d.time.getTime())));
		const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);
		const headers = ['时间', ...activeSeries.map(s => s.name)];
		const rows = [headers];
		sortedTimestamps.forEach(ts => {
			const timeStr = format(new Date(ts), 'yyyy-MM-dd HH:mm:ss');
			const row = [timeStr];
			activeSeries.forEach(s => {
				const point = s.data.find(d => d.time.getTime() === ts);
				row.push(point ? point.value : '');
			});
			rows.push(row);
		});
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

	const clearAll = () => { setSeries([]); setAvailableDates([]); setSelectedDate(''); };
	const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

	return (
		<div className={`app-container ${isDragging ? 'dragging' : ''} ${theme === 'light' ? 'light-theme' : ''}`}>
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
					<button className="sidebar-toggle-btn" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} title={isSidebarCollapsed ? "展开" : "折叠"}>
						<Layout size={20} />
					</button>
					<BarChart3 className="logo-icon" />
					<span><strong>数据曲线分析系统</strong></span>
					<div className={`backend-status-badge ${backendStatus}`}>
						<span className="status-dot"></span>
						{backendStatus === 'online' ? '后端: 在线' : '后端: 离线'}
					</div>
				</div>
				<div className="nav-actions">
					<button className="theme-toggle" onClick={toggleTheme}>
						{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
					</button>
					<button className="nav-btn premium-button" onClick={() => setIsPasteModalOpen(true)}>
						<ClipboardPaste size={14} /> 粘贴数据
					</button>
					<label className="upload-btn premium-button">
						<Upload size={14} /> 导入文件
						<input type="file" onChange={handleFileUpload} hidden />
					</label>
					{selectedDate && (
						<button className="export-btn" onClick={exportData}>
							<Download size={14} /> 导出
						</button>
					)}
					<button className="clear-btn" onClick={clearAll}><Trash2 size={14} /></button>
				</div>
			</nav>

			<main className="main-content">
				<aside className={`sidebar glass-panel ${isSidebarCollapsed ? 'collapsed' : ''}`} style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}>
					{!isSidebarCollapsed && (
						<>
							<div className="sidebar-resizer" onMouseDown={handleMouseDown} />
							<div className="sidebar-header"><h3>分析控制台</h3></div>
							<div className="sidebar-scroll-area">
								<div className="date-selector section-item">
									<p className="label">日期筛选</p>
									<select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="styled-select">
										<option value="">-- 请选择日期 --</option>
										{availableDates.map(date => <option key={date} value={date}>{date}</option>)}
									</select>
								</div>

								{selectedDate && (
									<div className="dimension-selector-outer section-item">
										<div className="filter-group">
											<p className="label">分组维度切换</p>
											<select value={activeDimension} onChange={(e) => setActiveDimension(e.target.value)} className="styled-select-dim">
												<option value="">-- 不分拆 --</option>
												{[...new Set(series.filter(s => s.date === selectedDate).flatMap(s => Object.keys(s.dimensions)))].map(d => <option key={d} value={d}>{d}</option>)}
											</select>
										</div>
										{activeDimension && (
											<div className="filter-group" style={{ marginTop: '10px' }}>
												<p className="label">{activeDimension} 值选择</p>
												<div className="dimension-tags">
													{[...new Set(series.filter(s => s.date === selectedDate).map(s => s.dimensions[activeDimension]).filter(v => v !== undefined))].map(v => (
														<button
															key={v}
															className={`dim-tag ${selectedDimensionValues.includes(v) ? 'active' : ''}`}
															onClick={() => setSelectedDimensionValues(prev => prev.includes(v) ? prev.filter(i => i !== v) : [...prev, v])}
														>
															{v}
														</button>
													))}
												</div>
											</div>
										)}
									</div>
								)}

								<div className="analysis-options section-item">
									<label className="checkbox-label">
										<input type="checkbox" checked={showIntegral} onChange={(e) => setShowIntegral(e.target.checked)} />
										<span>显示积分值 (AUC)</span>
									</label>
								</div>

								<div className="series-list section-item">
									<p className="label">已选系列 ({series.filter(s => s.date === selectedDate).length})</p>
									<ul>
										{series.filter(s => s.date === selectedDate).map(s => (
											<li key={s.id} className="series-item">
												<div className="series-info">
													<ChevronRight size={14} className="accent-color" />
													<div className="series-name-row">
														<span className="name-text" title={s.name}>{s.name}</span>
														{showIntegral && <span className="series-auc">{calculateIntegral(s.data.map(d => ({ ...d, unit: s.unit })))}</span>}
													</div>
												</div>
												<button className="delete-series-btn" onClick={() => removeSeries(s.id)}><X size={14} /></button>
											</li>
										))}
									</ul>
								</div>
							</div>

							{selectedDate && (
								<div className="axis-section">
									<p className="label fixed-header">坐标轴设置</p>
									<div className="axis-list-scrollable">
										{[...new Set(series.filter(s => s.date === selectedDate).map(s => s.metricName || s.name))].map(metric => {
											const vals = series.filter(s => s.date === selectedDate && (s.metricName === metric || s.name === metric)).flatMap(s => s.data.map(d => d.value));
											const dMin = vals.length ? Math.min(...vals).toFixed(1) : '-';
											const dMax = vals.length ? Math.max(...vals).toFixed(1) : '-';
											return (
												<div key={metric} className="axis-row-compact glass-panel">
													<span className="axis-label-text" title={metric}>{metric}</span>
													<div className="axis-inputs">
														<input type="number" placeholder={dMin} value={axisRanges[metric]?.min || ''} onChange={(e) => setAxisRanges(prev => ({ ...prev, [metric]: { ...prev[metric], min: e.target.value } }))} />
														<span>-</span>
														<input type="number" placeholder={dMax} value={axisRanges[metric]?.max || ''} onChange={(e) => setAxisRanges(prev => ({ ...prev, [metric]: { ...prev[metric], max: e.target.value } }))} />
													</div>
													<button onClick={() => setAxisRanges(prev => { const n = { ...prev }; delete n[metric]; return n; })}><RotateCcw size={14} /></button>
												</div>
											);
										})}
									</div>
								</div>
							)}
						</>
					)}
				</aside>

				<section className="chart-area glass-panel">
					{!selectedDate && <div className="empty-state"><h2>开始分析</h2><p>支持拖拽文件或粘贴数据</p></div>}
					<div ref={chartRef} className="chart-container" style={{ flex: 1, width: '100%', height: '100%', opacity: selectedDate ? 1 : 0 }}></div>
				</section>
			</main>

			{isPasteModalOpen && (
				<div className="modal-overlay">
					<div className="modal-content glass-panel">
						<div className="modal-header"><h3>粘贴数据导入</h3><button onClick={() => setIsPasteModalOpen(false)}><X size={20} /></button></div>
						<textarea className="paste-area" placeholder="在此处粘贴您的数据..." value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} />
						<div className="modal-actions">
							<button onClick={() => setIsPasteModalOpen(false)}>取消</button>
							<button className="premium-button" onClick={handlePasteSubmit}>确认导入</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function getUserColor(index) {
	const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];
	return colors[index % colors.length];
}

export default App;
