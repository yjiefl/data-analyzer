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
			// 尝试访问可能存在的 API（此处为模拟）
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

		// 如果当前选中的日期已不存在，则自动切换
		if (selectedDate && !dates.includes(selectedDate)) {
			setSelectedDate(dates.length > 0 ? dates[0] : '');
		}
	}, [series]);

	// 4. 初始化主维度（当数据导入或日期变化时）
	useEffect(() => {
		const daySeries = series.filter(s => s.date === selectedDate);
		const dims = [...new Set(daySeries.flatMap(s => Object.keys(s.dimensions)))];
		if (dims.length > 0 && !activeDimension) {
			setActiveDimension(dims[0]);
		}
		// 重置选中的维度值
		setSelectedDimensionValues([]);
	}, [selectedDate, series.length === 0]);

	// 5. 处理维度值全选 (当主维度切换时)
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
	 * 侧边栏缩放处理
	 */
	const handleMouseDown = (e) => {
		isResizing.current = true;
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	};

	const handleMouseMove = (e) => {
		if (isResizing.current) {
			const newWidth = e.clientX - 10;
			if (newWidth >= 240 && newWidth <= 600) {
				setSidebarWidth(newWidth);
			}
		}
	};

	const handleMouseUp = () => {
		isResizing.current = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
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
	 * 计算曲线积分 (梯形法则)
	 * @param {Array} data - [{time, value}]
	 * @returns {string} 积分值 (单位: 数值*小时)
	 */
	const calculateIntegral = (data) => {
		if (!data || data.length < 2) return '0.00';
		let total = 0;
		// 按时间对齐排序
		const sorted = [...data].sort((a, b) => a.time.getTime() - b.time.getTime());

		for (let i = 0; i < sorted.length - 1; i++) {
			const p1 = sorted[i];
			const p2 = sorted[i + 1];
			const dt = (p2.time.getTime() - p1.time.getTime()) / (1000 * 3600); // 间隔小时数
			total += (p1.value + p2.value) * dt / 2;
		}
		const unitStr = data[0]?.unit ? `${data[0].unit}·h` : '项';
		return `${total.toFixed(2)} ${unitStr}`;
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
		const activeSeries = series.filter(s => {
			if (s.date !== selectedDate) return false;
			if (!activeDimension || selectedDimensionValues.length === 0) return true;
			return selectedDimensionValues.includes(s.dimensions[activeDimension]);
		});
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

	const toggleTheme = () => {
		setTheme(prev => prev === 'dark' ? 'light' : 'dark');
	};

	return (
		<div
			className={`app-container ${isDragging ? 'dragging' : ''} ${theme === 'light' ? 'light-theme' : ''}`}
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
					<span><strong>数据曲线分析系统</strong></span>
					<div className={`backend-status-badge ${backendStatus}`}>
						<span className="status-dot"></span>
						{backendStatus === 'online' ? '后端: 在线' : (backendStatus === 'checking' ? '正在连接...' : '后端: 离线 (本地模式)')}
					</div>
				</div>
				<div className="nav-actions">
					<button className="theme-toggle" onClick={toggleTheme} title="切换主题">
						{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
					</button>
					<button className="nav-btn premium-button" onClick={() => setIsPasteModalOpen(true)}>
						<ClipboardPaste size={14} />
						粘贴数据
					</button>
					<label className="upload-btn premium-button">
						<Upload size={14} />
						导入文件
						<input type="file" accept=".csv,.json" onChange={handleFileUpload} hidden />
					</label>
					{selectedDate && (
						<button className="export-btn" onClick={exportData} title="导出当前视图数据">
							<Download size={14} />
							导出
						</button>
					)}
					<button className="clear-btn" onClick={clearAll} title="清空所有数据">
						<Trash2 size={14} />
					</button>
				</div>
			</nav>

			<main className="main-content">
				<aside
					className={`sidebar glass-panel ${isSidebarCollapsed ? 'collapsed' : ''}`}
					style={{ '--sidebar-width': `${sidebarWidth}px` }}
				>
					<div className="sidebar-resizer" onMouseDown={handleMouseDown} />
					<button
						className="collapse-toggle"
						onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
						title={isSidebarCollapsed ? "展开控制台" : "折叠控制台"}
					>
						{isSidebarCollapsed ? <Layout size={14} /> : <ChevronLeft size={14} />}
					</button>

					<h3>分析控制台</h3>
					<div className="help-guide glass-panel" style={{ padding: '8px', fontSize: '0.7rem', color: 'var(--text-mute)', marginBottom: '5px' }}>
						💡 提示：将鼠标悬停在曲线上可切换左侧坐标轴。
					</div>

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

					{selectedDate && (
						<div className="dimension-selector-outer">
							<div className="filter-group">
								<p className="label">分组维度切换</p>
								<select
									value={activeDimension}
									onChange={(e) => setActiveDimension(e.target.value)}
									className="styled-select-dim"
								>
									<option value="">-- 不进行维度拆分 --</option>
									{[...new Set(
										series
											.filter(s => s.date === selectedDate)
											.flatMap(s => Object.keys(s.dimensions))
									)].map(d => <option key={d} value={d}>{d}</option>)}
								</select>
							</div>

							{activeDimension && (
								<div className="filter-group">
									<p className="label">{activeDimension} 值选择 (类似图例切换)</p>
									<div className="dimension-tags">
										{[...new Set(
											series
												.filter(s => s.date === selectedDate)
												.map(s => s.dimensions[activeDimension])
												.filter(v => v !== undefined)
										)].map(v => {
											const isActive = selectedDimensionValues.includes(v);
											return (
												<button
													key={v}
													className={`dim-tag ${isActive ? 'active' : ''}`}
													onClick={() => setSelectedDimensionValues(prev =>
														isActive
															? prev.filter(item => item !== v)
															: [...prev, v]
													)}
												>
													{v}
												</button>
											);
										})}
									</div>
								</div>
							)}
						</div>
					)}

					<div className="analysis-options">
						<label className="checkbox-label">
							<input
								type="checkbox"
								checked={showIntegral}
								onChange={(e) => setShowIntegral(e.target.checked)}
							/>
							<span>显示积分值 (AUC)</span>
						</label>
					</div>

					<div className="series-list">
						<p className="label">已选系列 ({
							series.filter(s => {
								if (s.date !== selectedDate) return false;
								if (!activeDimension || selectedDimensionValues.length === 0) return true;
								return selectedDimensionValues.includes(s.dimensions[activeDimension]);
							}).length
						})</p>
						<ul>
							{series.filter(s => {
								if (s.date !== selectedDate) return false;
								if (!activeDimension || selectedDimensionValues.length === 0) return true;
								return selectedDimensionValues.includes(s.dimensions[activeDimension]);
							}).map(s => (
								<li key={s.id} className="series-item">
									<div className="series-info">
										<ChevronRight size={14} className="accent-color" />
										<div className="series-name-group">
											<span title={s.name}>{s.name}</span>
											{showIntegral && (
												<span className="series-auc">积分项: {calculateIntegral(s.data.map(d => ({ ...d, unit: s.unit })))}</span>
											)}
										</div>
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
							{[...new Set(
								series.filter(s => {
									if (s.date !== selectedDate) return false;
									if (!activeDimension || selectedDimensionValues.length === 0) return true;
									return selectedDimensionValues.includes(s.dimensions[activeDimension]);
								}).map(s => s.metricName || s.name)
							)].map(metric => {
								// 计算该指标及其在当前维度过滤下的真实数据范围
								const metricDataPoints = series
									.filter(s => {
										if (s.date !== selectedDate) return false;
										if (s.metricName !== metric && s.name !== metric) return false;
										if (!activeDimension || selectedDimensionValues.length === 0) return true;
										return selectedDimensionValues.includes(s.dimensions[activeDimension]);
									})
									.flatMap(s => s.data.map(d => d.value));

								const dataMin = metricDataPoints.length > 0 ? Math.min(...metricDataPoints).toFixed(1) : '-';
								const dataMax = metricDataPoints.length > 0 ? Math.max(...metricDataPoints).toFixed(1) : '-';

								return (
									<div key={metric} className="axis-row-compact glass-panel">
										<span className="axis-label-text" title={metric}>{metric}</span>
										<div className="axis-inputs">
											<input
												type="number"
												placeholder={dataMin}
												value={axisRanges[metric]?.min || ''}
												onChange={(e) => setAxisRanges(prev => ({
													...prev,
													[metric]: { ...prev[metric], min: e.target.value }
												}))}
											/>
											<span className="axis-sep">-</span>
											<input
												type="number"
												placeholder={dataMax}
												value={axisRanges[metric]?.max || ''}
												onChange={(e) => setAxisRanges(prev => ({
													...prev,
													[metric]: { ...prev[metric], max: e.target.value }
												}))}
											/>
										</div>
										<button
											className="axis-reset-icon-btn"
											onClick={() => setAxisRanges(prev => {
												const next = { ...prev };
												delete next[metric];
												return next;
											})}
											title={`重置到默认范围 (${dataMin} ~ ${dataMax})`}
										>
											<RotateCcw size={14} />
										</button>
									</div>
								);
							})}
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
				<p>© 2026 数据曲线分析系统 • 强大的曲线对比分析工具</p>
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
