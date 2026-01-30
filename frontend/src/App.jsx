import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import Papa from 'papaparse';
import { Upload, FileText, ChevronRight, BarChart3, Trash2, ClipboardPaste, X, Download, RotateCcw, Moon, Sun, ChevronLeft, Layout, Archive, History, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import { processDataLogic } from './utils/dataProcessor';
import './App.css';

/**
 * 数据文件解析与曲线展示主应用
 * @returns {JSX.Element}
 */
function App() {
	// 从 LocalStorage 加载初始数据
	const getInitialState = (key, defaultVal) => {
		try {
			const saved = localStorage.getItem(`da_${key}`);
			return saved ? JSON.parse(saved) : defaultVal;
		} catch (e) { return defaultVal; }
	};

	const [series, setSeries] = useState(() => getInitialState('series', []));
	const [selectedDates, setSelectedDates] = useState(() => getInitialState('selectedDates', []));
	const [availableDates, setAvailableDates] = useState([]);
	const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
	const [pasteContent, setPasteContent] = useState('');
	const [isDragging, setIsDragging] = useState(false);

	const chartRef = useRef(null);
	const chartInstance = useRef(null);

	// 轴范围设置：{ metricName: { min: '', max: '' } }
	const [axisRanges, setAxisRanges] = useState(() => getInitialState('axisRanges', {}));
	const [showIntegral, setShowIntegral] = useState(() => getInitialState('showIntegral', false));
	const [isFocusMode, setIsFocusMode] = useState(() => getInitialState('isFocusMode', true));
	const [hoveredMetric, setHoveredMetric] = useState(null);
	const [backendStatus, setBackendStatus] = useState('offline');

	const [activeDimension, setActiveDimension] = useState(() => getInitialState('activeDimension', ''));
	const [selectedDimensionValues, setSelectedDimensionValues] = useState(() => getInitialState('selectedDimensionValues', []));
	const [legendSelected, setLegendSelected] = useState({});
	const [chartTypes, setChartTypes] = useState(() => getInitialState('chartTypes', {}));
	const [historyRecords, setHistoryRecords] = useState(() => getInitialState('historyRecords', []));

	// 新增 UI 状态
	const [theme, setTheme] = useState(() => getInitialState('theme', 'dark'));
	const [activeTab, setActiveTab] = useState('controls'); // controls | history
	const [isCompareOverlap, setIsCompareOverlap] = useState(() => getInitialState('isCompareOverlap', false)); // 多日期重叠对比
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
	const [isSidebarWide, setIsSidebarWide] = useState(false);

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
					// 移除悬停时的自动切换，防止曲线跳动
				});

				// 点击圆点切换纵坐标（满足用户 64 行建议）
				chartInstance.current.on('click', (params) => {
					if (params.seriesName) {
						const metric = params.seriesName.split(' (')[0];
						setHoveredMetric(metric);
					}
				});

				// 监听图例变化，将其保存到 React 状态
				chartInstance.current.on('legendselectchanged', (params) => {
					setLegendSelected(params.selected);
				});

				// 恢复之前的数据渲染（如果有）
				if (series.length > 0) {
					updateChart();
				}
			};

			initChart();

			// 使用 ResizeObserver 替代 window resize 监听，更精准且平滑
			const resizeObserver = new ResizeObserver(() => {
				requestAnimationFrame(() => {
					chartInstance.current?.resize();
				});
			});
			resizeObserver.observe(chartRef.current);

			checkBackend();

			return () => {
				resizeObserver.disconnect();
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
			const dateMatch = selectedDates.includes(s.date);
			const dimMatch = activeDimension ? selectedDimensionValues.includes(s.dimensions[activeDimension]) : true;
			return dateMatch && dimMatch;
		});

		if (activeSeries.length === 0) {
			chartInstance.current.clear();
			return;
		}

		// 如果选中了多个日期，要在指标名中体现日期
		const showDateInName = selectedDates.length > 1;

		const uniqueMetrics = [...new Set(activeSeries.map(s => s.metricName || s.name))];
		const isLight = theme === 'light';

		const yAxisConfig = uniqueMetrics.map((metric, index) => {
			const customRange = axisRanges[metric] || {};

			// 智能判断活跃轴：
			// 1. 如果有点击选中的轴且该指标未被隐藏，则使用该轴
			// 2. 否则，自动寻找第一个未被隐藏（图例开启）的指标作为默认轴
			const firstVisibleMetric = uniqueMetrics.find(m => legendSelected[m] !== false) || uniqueMetrics[0];
			const isActive = (hoveredMetric && legendSelected[hoveredMetric] !== false)
				? (metric === hoveredMetric)
				: (metric === firstVisibleMetric);

			// 极致坐标轴精度改进：上下的精度为最大值的5%
			let finalMin = customRange.min !== '' && customRange.min !== undefined ? parseFloat(customRange.min) : null;
			let finalMax = customRange.max !== '' && customRange.max !== undefined ? parseFloat(customRange.max) : null;

			if (finalMin === null || finalMax === null) {
				const metricSeries = activeSeries.filter(s => s.metricName === metric || s.name.startsWith(metric));
				const vals = metricSeries.flatMap(s => s.data.map(d => d.value));
				if (vals.length) {
					const dataMax = Math.max(...vals);
					const dataMin = Math.min(...vals);
					// 严格遵循：上下的精度为最大值的5%
					const padding = Math.abs(dataMax) * 0.05 || 1;
					if (finalMin === null) finalMin = dataMin - padding;
					if (finalMax === null) finalMax = dataMax + padding;
				}
			}

			return {
				type: 'value',
				name: metric,
				nameTextStyle: {
					color: isActive ? getUserColor(index) : 'transparent',
					padding: [0, 0, 0, 0]
				},
				nameGap: 8,
				position: 'left',
				show: isActive,
				scale: true,
				min: finalMin,
				max: finalMax,
				axisLine: {
					show: isActive,
					lineStyle: { color: getUserColor(index) }
				},
				axisTick: { show: isActive },
				axisLabel: {
					show: true,
					color: isLight ? '#666' : '#ccc',
					margin: 12,
					width: 75, // 稍微再加宽一点，确保长数字不跳动
					overflow: 'truncate',
					align: 'right'
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
				backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(13, 13, 18, 0.9)',
				borderColor: isLight ? '#ddd' : 'rgba(255, 255, 255, 0.2)',
				borderWidth: 1,
				textStyle: { color: isLight ? '#000' : '#fff' },
				axisPointer: { type: 'cross' },
				formatter: (params) => {
					const textColor = isLight ? '#000' : '#fff';
					const subColor = isLight ? '#666' : '#94a3b8';
					let html = `<div style="padding: 10px; min-width: 200px; color: ${textColor};"><div style="margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid ${isLight ? '#eee' : '#333'}; padding-bottom: 5px;">${params[0].axisValueLabel}</div>`;
					params.forEach(item => {
						const color = item.color;
						const fullSeriesName = activeSeries[item.seriesIndex]?.name || item.seriesName;
						html += `<div style="display: flex; align-items: center; margin-top: 5px;">
							<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; margin-right: 8px;"></span>
							<span style="flex: 1; margin-right: 20px; font-size: 12px; color: ${textColor}; opacity: 0.9;">${fullSeriesName}</span>
							<span style="font-weight: bold; font-family: monospace; color: ${textColor};">${item.value[1]}</span>
						</div>`;
					});
					html += '</div>';
					return html;
				}
			},
			legend: {
				data: activeSeries.map((s, idx) => {
					const nameWithoutDate = s.name.split(' (')[0];
					return showDateInName ? `${s.date} ${nameWithoutDate}` : nameWithoutDate;
				}),
				selected: legendSelected, // 关键：应用保存的图例状态
				textStyle: { color: isLight ? '#333' : '#ccc', fontSize: 11 },
				top: 5,
				type: 'scroll',
				pageTextStyle: { color: isLight ? '#000' : '#fff' }
			},
			grid: {
				top: '50',
				left: '80', // 极致锁死，为任何大数留足空间
				right: '25', // 稍微增加右边距平衡视觉
				bottom: '30',
				containLabel: false
			},
			xAxis: {
				type: 'time',
				axisLine: { lineStyle: { color: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255, 255, 255, 0.2)' } },
				axisLabel: {
					color: isLight ? '#666' : '#ccc',
					formatter: isCompareOverlap ? '{HH}:{mm}' : null
				},
				splitLine: { show: false }
			},
			yAxis: yAxisConfig,
			series: activeSeries.map((s, idx) => {
				const nameWithoutDate = s.name.split(' (')[0];
				const metricKey = s.metricName || nameWithoutDate;
				const axisIndex = uniqueMetrics.indexOf(metricKey);

				// 改进颜色分配：同一指标不同日期分配不同偏色（如果支持）
				// 或者简单点，让相同指标保持同色但虚实区分，或者完全异色
				const seriesIndex = activeSeries.findIndex(as => as.id === s.id);
				const color = getUserColor(showDateInName ? seriesIndex : axisIndex);

				const displayName = showDateInName ? `${s.date} ${nameWithoutDate}` : nameWithoutDate;
				const type = chartTypes[metricKey] || 'line';

				// 如果同一项有多个系列，使用虚线区分
				const sameMetricSeries = activeSeries.filter(as => (as.metricName || as.name.split(' (')[0]) === metricKey);
				const metricIdx = sameMetricSeries.findIndex(as => as.id === s.id);
				const isDashed = metricIdx > 0;

				// 重叠对比模式：将所有日期映射到同一个基准日期（2000-01-01）以实现 24h 重叠对比
				let plotData = s.data.map(d => [d.time, d.value]);
				if (isCompareOverlap) {
					plotData = s.data.map(d => {
						const baseDate = new Date(2000, 0, 1);
						baseDate.setHours(d.time.getHours(), d.time.getMinutes(), d.time.getSeconds());
						return [baseDate, d.value];
					});
				}

				return {
					name: displayName,
					type: type,
					yAxisIndex: axisIndex,
					smooth: type === 'line',
					barMaxWidth: 20,
					showSymbol: true,
					symbol: 'circle',
					symbolSize: 8,
					data: plotData,
					lineStyle: {
						width: 2.5,
						type: isDashed ? 'dashed' : 'solid' // 如果有重复图例，用虚线区别
					},
					itemStyle: {
						color: getUserColor(axisIndex),
						borderWidth: 1.5
					},
					emphasis: {
						focus: isFocusMode ? 'series' : 'none',
						scale: true,
						symbolSize: 24,
						itemStyle: {
							shadowBlur: 30,
							shadowColor: 'rgba(0,0,0,0.5)',
							borderWidth: 5,
							borderColor: '#fff'
						}
					},
					blur: {
						lineStyle: { opacity: isFocusMode ? 0.2 : 1 }, // 调亮一点，不再“隐身”
						itemStyle: { opacity: isFocusMode ? 0.2 : 1 }
					}
				};
			})
		};

		chartInstance.current.setOption(option, true);
	};

	// 监听状态变化并保存到 LocalStorage
	useEffect(() => {
		const stateToSave = {
			series, selectedDates, axisRanges, chartTypes,
			activeDimension, selectedDimensionValues, theme, showIntegral,
			historyRecords, isFocusMode, isCompareOverlap
		};
		Object.entries(stateToSave).forEach(([key, val]) => {
			localStorage.setItem(`da_${key}`, JSON.stringify(val));
		});
		updateChart();
	}, [series, selectedDates, axisRanges, hoveredMetric, activeDimension, selectedDimensionValues, theme, chartTypes, legendSelected, showIntegral, historyRecords, isFocusMode, isCompareOverlap]);

	// 3. 自动同步可用日期列表
	useEffect(() => {
		const dates = [...new Set(series.map(s => s.date))].sort();
		setAvailableDates(dates);
		// 如果没有任何选中日期，默认选中最新日期
		if (dates.length > 0 && selectedDates.length === 0) {
			setSelectedDates([dates[dates.length - 1]]);
		}
	}, [series]);

	// 4. 初始化主维度
	useEffect(() => {
		const daySeries = series.filter(s => selectedDates.includes(s.date));
		const dims = [...new Set(daySeries.flatMap(s => Object.keys(s.dimensions)))];
		if (dims.length > 0 && !activeDimension) {
			setActiveDimension(dims[0]);
		}
		// 重置维度值选择
		if (dims.length > 0 && selectedDates.length > 0) {
			// 如果没有选中值，默认全选由下一个 effect 处理
		} else {
			setSelectedDimensionValues([]);
		}
	}, [selectedDates, series.length]);

	// 5. 处理维度值更新
	useEffect(() => {
		if (activeDimension) {
			const values = [...new Set(
				series.filter(s => selectedDates.includes(s.date))
					.map(s => s.dimensions[activeDimension])
					.filter(v => v !== undefined)
			)];
			setSelectedDimensionValues(values);
		}
	}, [activeDimension, selectedDates]);

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
		// 新导入数据时，如果没选日期，自动选上
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
			if (!selectedDates.includes(s.date)) return false;
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
		const dateLabel = selectedDates.length > 1 ? 'multi_dates' : selectedDates[0];
		link.setAttribute('download', `exported_data_${dateLabel}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const clearAll = () => {
		setSeries([]);
		setAvailableDates([]);
		setSelectedDates([]);
		setHistoryRecords([]);
		localStorage.clear();
	};

	const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

	const saveSnapshot = () => {
		const name = prompt("请输入历史记录名称:", `记录_${format(new Date(), 'MM-dd HH:mm')}`);
		if (!name) return;

		// 捕捉当前视角下的所有系列数据，实现“调阅”功能
		const capturedSeries = series.filter(s => selectedDates.includes(s.date));

		const record = {
			id: Date.now(),
			name,
			selectedDates,
			activeDimension,
			selectedDimensionValues,
			axisRanges,
			chartTypes,
			capturedSeries // 保存数据副本
		};
		setHistoryRecords(prev => [record, ...prev]);
	};

	const loadSnapshot = (rec) => {
		// 如果记录里有数据备份，将其合并进当前的 series 中（去重）
		if (rec.capturedSeries && rec.capturedSeries.length > 0) {
			setSeries(prev => {
				const existingIds = new Set(prev.map(s => s.id));
				const newSeries = rec.capturedSeries.filter(s => !existingIds.has(s.id));
				return [...prev, ...newSeries];
			});
		}

		setTimeout(() => {
			setSelectedDates(rec.selectedDates);
			setActiveDimension(rec.activeDimension);
			setSelectedDimensionValues(rec.selectedDimensionValues);
			setAxisRanges(rec.axisRanges);
			setChartTypes(rec.chartTypes);
			setActiveTab('controls'); // 自动切回控制台
		}, 0);
	};

	const deleteSnapshot = (id) => {
		setHistoryRecords(prev => prev.filter(r => r.id !== id));
	};

	const toggleDate = (date) => {
		setSelectedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
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
					{selectedDates.length > 0 && (
						<button className="export-btn" onClick={exportData}>
							<Download size={14} /> 导出
						</button>
					)}
					<button className="clear-btn" onClick={clearAll}><Trash2 size={14} /></button>
				</div>
			</nav>

			<main className="main-content">
				<aside
					className={`sidebar glass-panel ${isSidebarCollapsed ? 'collapsed' : ''} ${isSidebarWide ? 'wide' : ''}`}
					style={{ width: isSidebarCollapsed ? 0 : (isSidebarWide ? 420 : 280) }}
				>
					<div className="sidebar-tabs">
						<button className={`tab-btn ${activeTab === 'controls' ? 'active' : ''}`} onClick={() => setActiveTab('controls')}>
							<Layout size={14} /> 控制台
						</button>
						<button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
							<History size={14} /> 历史存单
						</button>
					</div>

					<div className="sidebar-header" style={{ marginTop: '8px' }}>
						<h3>{activeTab === 'controls' ? '分析控制台' : '历史快照库'}</h3>
						<button className="width-toggle-btn" onClick={() => setIsSidebarWide(!isSidebarWide)} title={isSidebarWide ? "切换窄版" : "切换宽版"}>
							<Layout size={14} /> {isSidebarWide ? "窄版" : "宽版"}
						</button>
					</div>

					{activeTab === 'controls' ? (
						<div className="sidebar-scroll-area">
							<div className="date-selector section-item">
								<p className="label">日期筛选 (可多选对比)</p>
								<div className="dimension-tags">
									{availableDates.map(date => (
										<button
											key={date}
											className={`dim-tag ${selectedDates.includes(date) ? 'active' : ''}`}
											onClick={() => toggleDate(date)}
										>
											{date}
										</button>
									))}
								</div>
							</div>

							{selectedDates.length > 0 && (
								<div className="dimension-selector-outer section-item">
									<div className="filter-group">
										<p className="label">分组维度切换</p>
										<select value={activeDimension} onChange={(e) => setActiveDimension(e.target.value)} className="styled-select-dim">
											<option value="">-- 不分拆 --</option>
											{[...new Set(series.filter(s => selectedDates.includes(s.date)).flatMap(s => Object.keys(s.dimensions)))].map(d => <option key={d} value={d}>{d}</option>)}
										</select>
									</div>
									{activeDimension && (
										<div className="filter-group" style={{ marginTop: '10px' }}>
											<p className="label">{activeDimension} 值选择</p>
											<div className="dimension-tags">
												{[...new Set(series.filter(s => selectedDates.includes(s.date)).map(s => s.dimensions[activeDimension]).filter(v => v !== undefined))].map(v => (
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
								<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
										<label className="checkbox-label">
											<input type="checkbox" checked={showIntegral} onChange={(e) => setShowIntegral(e.target.checked)} />
											<span>显示积分值 (AUC)</span>
										</label>
										<button className="snapshot-btn" onClick={saveSnapshot} title="保存当前画面快照">
											<Archive size={14} /> 存入历史
										</button>
									</div>
									<label className="checkbox-label">
										<input type="checkbox" checked={isFocusMode} onChange={(e) => setIsFocusMode(e.target.checked)} />
										<span>启用悬停聚焦 (变暗背景)</span>
									</label>
									{selectedDates.length > 1 && (
										<label className="checkbox-label">
											<input type="checkbox" checked={isCompareOverlap} onChange={(e) => setIsCompareOverlap(e.target.checked)} />
											<span>多日 24h 重叠对比</span>
										</label>
									)}
								</div>
							</div>

							<div className="series-list section-item">
								<p className="label">选中数据详情 ({series.filter(s => selectedDates.includes(s.date)).length} 项)</p>
								<ul>
									{series.filter(s => selectedDates.includes(s.date)).map(s => (
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
					) : (
						<div className="sidebar-scroll-area">
							<div className="history-section-full">
								<div className="history-list-large">
									{historyRecords.length === 0 ? (
										<div className="empty-mini">暂无历史存单</div>
									) : (
										historyRecords.map(rec => (
											<div key={rec.id} className="history-item-large glass-panel">
												<div className="history-content-row" onClick={() => loadSnapshot(rec)}>
													<PlayCircle size={18} className="accent-color" />
													<div className="history-text">
														<span className="h-name">{rec.name}</span>
														<span className="h-date">{rec.selectedDates.join(', ')}</span>
													</div>
												</div>
												<button className="delete-history-btn" onClick={() => deleteSnapshot(rec.id)}><X size={16} /></button>
											</div>
										))
									)}
								</div>
							</div>
						</div>
					)}

					{selectedDates.length > 0 && (
						<div className="axis-section">
							<p className="label fixed-header">坐标轴与单位设置</p>
							<div className="axis-list-scrollable">
								{[...new Set(series.filter(s => selectedDates.includes(s.date)).map(s => s.metricName || s.name))].map(metric => {
									const vals = series.filter(s => selectedDates.includes(s.date) && (s.metricName === metric || s.name === metric)).flatMap(s => s.data.map(d => d.value));
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
											<div className="axis-actions">
												<button
													className={`type-toggle-btn ${chartTypes[metric] === 'bar' ? 'active' : ''}`}
													onClick={() => setChartTypes(prev => ({ ...prev, [metric]: prev[metric] === 'bar' ? 'line' : 'bar' }))}
													title="切换折线/柱状图"
												>
													{chartTypes[metric] === 'bar' ? <BarChart3 size={14} /> : <FileText size={14} />}
												</button>
												<button onClick={() => setAxisRanges(prev => { const n = { ...prev }; delete n[metric]; return n; })} title="恢复默认范围"><RotateCcw size={14} /></button>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</aside>

				<section className="chart-area glass-panel">
					{!selectedDates.length && (
						<div className="empty-state">
							<h2>开始分析</h2>
							<p>支持拖拽文件或粘贴数据</p>
							<div className="guide-box">
								<div className="guide-step"><span>1</span> 导入 CSV/JSON 数据</div>
								<div className="guide-step"><span>2</span> 在左侧勾选想要对比的日期</div>
								<div className="guide-step"><span>3</span> 点击图表上的圆点切换纵坐标</div>
								<div className="guide-step"><span>4</span> 点击设置中的图标切换线/柱图</div>
							</div>
						</div>
					)}
					<div ref={chartRef} className="chart-container" style={{ flex: 1, width: '100%', height: '100%', opacity: selectedDates.length ? 1 : 0 }}></div>
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
