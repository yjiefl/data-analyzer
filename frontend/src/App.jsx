import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import Papa from 'papaparse';
import { Upload, FileText, ChevronRight, BarChart3, Trash2, ClipboardPaste, X, Download, RotateCcw, Moon, Sun, ChevronLeft, Layout, Archive, History, PlayCircle, Activity } from 'lucide-react';
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
			if (!saved) return defaultVal;
			const parsed = JSON.parse(saved);

			// 如果是 series，需要将字符串日期恢复为 Date 对象
			if (key === 'series' && Array.isArray(parsed)) {
				return parsed.map(s => ({
					...s,
					data: s.data.map(d => ({
						...d,
						time: new Date(d.time)
					}))
				}));
			}
			return parsed;
		} catch { return defaultVal; }
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
	const [showIntegral, setShowIntegral] = useState(() => getInitialState('showIntegral', true));
	const [axisAdjustmentFactor, setAxisAdjustmentFactor] = useState(() => getInitialState('axisAdjustmentFactor', 1.0));
	const [isFocusMode, setIsFocusMode] = useState(() => getInitialState('isFocusMode', true));
	const [hoveredMetric, setHoveredMetric] = useState(null);
	const [backendStatus, setBackendStatus] = useState('offline');

	const [activeDimension, setActiveDimension] = useState(() => getInitialState('activeDimension', ''));
	const [selectedDimensionValues, setSelectedDimensionValues] = useState(() => getInitialState('selectedDimensionValues', []));
	const [legendSelected, setLegendSelected] = useState(() => getInitialState('legendSelected', {}));
	const [chartTypes, setChartTypes] = useState(() => getInitialState('chartTypes', {}));
	const [historyRecords, setHistoryRecords] = useState([]); // 从后端动态加载
	const [historySearchTerm, setHistorySearchTerm] = useState(''); // 新增：存单搜索
	const [customMetricColors, setCustomMetricColors] = useState(() => getInitialState('customMetricColors', {}));

	// 新增 UI 状态
	const [theme, setTheme] = useState(() => getInitialState('theme', 'dark'));
	const [activeTab, setActiveTab] = useState('controls'); // controls | history
	const [isCompareOverlap, setIsCompareOverlap] = useState(() => getInitialState('isCompareOverlap', false)); // 多日期重叠对比
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
	const [isSidebarWide, setIsSidebarWide] = useState(false);
	const [granularity, setGranularity] = useState(() => getInitialState('granularity', 'hour')); // hour | day | month
	const [isLogModalOpen, setIsLogModalOpen] = useState(false);
	const [accessLogs, setAccessLogs] = useState([]);
	const [logType, setLogType] = useState('access'); // access | error
	const [logSearchTerm, setLogSearchTerm] = useState('');
	const [rangeConfig, setRangeConfig] = useState(() => getInitialState('rangeConfig', {
		hour: { start: 0, end: 23 },
		day: { start: 1, end: 31 },
		month: { start: 1, end: 12 }
	}));
	const [isDataEditorOpen, setIsDataEditorOpen] = useState(false);
	const [editingSeriesId, setEditingSeriesId] = useState(null);
	const [editingSeriesName, setEditingSeriesName] = useState('');
	const [editingMetricName, setEditingMetricName] = useState('');
	const [editingDataText, setEditingDataText] = useState('');

	const activeSeries = series.filter(s => {
		const dateMatch = selectedDates.includes(s.date);
		const dimMatch = activeDimension ? selectedDimensionValues.includes(s.dimensions[activeDimension]) : true;
		return dateMatch && dimMatch;
	});

	const uniqueMetrics = [...new Set(activeSeries.map(s => s.metricName || s.name.split(' (')[0]))];

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
			loadSnapshotsFromBackend();

			return () => {
				resizeObserver.disconnect();
				chartInstance.current?.dispose();
				chartInstance.current = null;
			};
		}
	}, [theme]); // 主题切换时重新初始化

	/**
	 * 从后端加载历史存单
	 */
	const loadSnapshotsFromBackend = async () => {
		try {
			const res = await fetch('/api/snapshots');
			if (res.ok) {
				const data = await res.json();
				setHistoryRecords(data);
			}
		} catch (e) {
			console.error('加载历史存单失败:', e);
		}
	};

	/**
	 * 模拟检测后端
	 */
	const checkBackend = async () => {
		try {
			setBackendStatus('checking');
			const res = await fetch('/api/health').catch(() => ({ ok: false }));
			setBackendStatus(res.ok ? 'online' : 'offline');
		} catch {
			setBackendStatus('offline');
		}
	};

	// 2. 数据驱动：更新图表内容 (多轴支持)
	const updateChart = () => {
		if (!chartInstance.current || chartInstance.current.isDisposed()) return;

		if (activeSeries.length === 0) {
			chartInstance.current.clear();
			return;
		}

		const isLight = theme === 'light';

		const legendItems = [...new Set(activeSeries.map(s => {
			const nameWithoutDate = s.name.split(' (')[0];
			return nameWithoutDate;
		}))];

		const yAxisConfig = uniqueMetrics.map((metric, index) => {
			const customRange = axisRanges[metric] || {};
			const firstVisibleMetric = uniqueMetrics.find(m => legendSelected[m] !== false) || uniqueMetrics[0];
			const isActive = (hoveredMetric && legendSelected[hoveredMetric] !== false)
				? (metric === hoveredMetric)
				: (metric === firstVisibleMetric);

			const isIrradiance = metric.includes('辐照度') || metric.toLowerCase().includes('irradiance');
			const factor = parseFloat(axisAdjustmentFactor) || 1.0;

			let finalMin = customRange.min !== '' && customRange.min !== undefined ? parseFloat(customRange.min) : null;
			let finalMax = customRange.max !== '' && customRange.max !== undefined ? parseFloat(customRange.max) : null;

			// 辐照度缺省范围 0-1000
			if (finalMin === null && isIrradiance) finalMin = 0;
			if (finalMax === null && isIrradiance) finalMax = 1000;

			if (finalMin === null || finalMax === null) {
				const metricSeries = activeSeries.filter(s => (s.metricName || s.name.split(' (')[0]) === metric);
				const vals = metricSeries.flatMap(s => s.data.map(d => d.value));
				if (vals.length) {
					const dataMax = Math.max(...vals);
					const dataMin = Math.min(...vals);
					if (finalMin === null) {
						finalMin = dataMin < 0 ? dataMin * 1.1 : dataMin - (Math.abs(dataMax - dataMin) * 0.05 || 1);
					}
					if (finalMax === null) {
						finalMax = dataMax > 0 ? dataMax * 1.1 : dataMax + (Math.abs(dataMax - dataMin) * 0.05 || 1);
					}
				}
			}

			// 应用全局调节系数
			if (finalMin !== null) finalMin *= factor;
			if (finalMax !== null) finalMax *= factor;

			return {
				type: 'value',
				name: metric,
				nameTextStyle: {
					color: isActive ? (customMetricColors[metric] || getUserColor(index)) : 'transparent',
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
					lineStyle: { color: customMetricColors[metric] || getUserColor(index), width: 2 }
				},
				axisTick: { show: isActive },
				axisLabel: {
					show: true,
					color: isLight ? '#1d1d1f' : '#ccc',
					margin: 12,
					width: 75,
					overflow: 'truncate',
					align: 'right',
					formatter: (val) => parseFloat(val.toFixed(2)).toString()
				},
				splitLine: {
					show: isActive,
					lineStyle: { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.05)' }
				}
			};
		});

		// 数据聚合逻辑
		const getAggregatedData = (data, gran) => {
			if (gran === 'hour') return data.map(d => [d.time, d.value]); // 日视图：原始精度 (通常到分钟)
			
			const groups = {};
			data.forEach(d => {
				let key;
				const dt = new Date(d.time);
				if (gran === 'day') key = format(dt, 'yyyy-MM-dd'); // 月视图：按天聚合
				else if (gran === 'month') key = format(dt, 'yyyy-MM'); // 年视图：按月聚合
				
				if (!groups[key]) groups[key] = { sum: 0, count: 0, firstTime: dt };
				groups[key].sum += d.value;
				groups[key].count += 1;
			});
			
			return Object.entries(groups).map(([, info]) => {
				const date = new Date(info.firstTime);
				if (gran === 'day') date.setHours(0, 0, 0, 0); // 对齐到天
				else if (gran === 'month') {
					date.setDate(1); // 对齐到月
					date.setHours(0, 0, 0, 0);
				}
				return [date, info.sum / info.count];
			}).sort((a, b) => a[0] - b[0]);
		};

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
					if (!params.length) return '';
					const textColor = isLight ? '#000' : '#fff';
					let html = `<div style="padding: 10px; min-width: 200px; color: ${textColor};"><div style="margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid ${isLight ? '#eee' : '#333'}; padding-bottom: 5px;">${params[0].axisValueLabel}</div>`;
					params.forEach(item => {
						const color = item.color;
						const sIdx = item.seriesIndex;
						const fullSeriesName = activeSeries[sIdx]?.name || item.seriesName;
						const rawVal = item.value[1];
						const displayVal = typeof rawVal === 'number' ? parseFloat(rawVal.toFixed(2)).toString() : rawVal;
						html += `<div style="display: flex; align-items: center; margin-top: 5px;">
							<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; margin-right: 8px;"></span>
							<span style="flex: 1; margin-right: 20px; font-size: 12px; color: ${textColor}; opacity: 0.9;">${fullSeriesName}</span>
							<span style="font-weight: bold; font-family: monospace; color: ${textColor};">${displayVal}</span>
						</div>`;
					});
					html += '</div>';
					return html;
				}
			},
			legend: {
				data: legendItems,
				selected: legendSelected,
				textStyle: { color: isLight ? '#333' : '#ccc', fontSize: 11 },
				top: 5,
				type: 'scroll',
				pageTextStyle: { color: isLight ? '#000' : '#fff' }
			},
			grid: {
				top: '50',
				left: '80',
				right: '25',
				bottom: '30',
				containLabel: false
			},
			xAxis: {
				type: 'time',
				axisLine: { lineStyle: { color: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255, 255, 255, 0.2)' } },
				splitNumber: granularity === 'hour' ? 12 : (granularity === 'day' ? 10 : 12),
				axisLabel: {
					color: isLight ? '#1d1d1f' : '#ccc',
					formatter: (val) => {
						const dt = new Date(val);
						if (isCompareOverlap) {
							if (granularity === 'day') return format(dt, 'd日');
							if (granularity === 'month') return format(dt, 'M月');
							return format(dt, 'HH:mm');
						}
						if (granularity === 'hour') {
							return selectedDates.length > 1 ? format(dt, 'MM-dd HH:mm') : format(dt, 'HH:mm');
						}
						if (granularity === 'day') return format(dt, 'MM-dd');
						if (granularity === 'month') return format(dt, 'yyyy-MM');
						return format(dt, 'yyyy');
					}
				},
				min: (value) => {
					if (isCompareOverlap) {
						const d = new Date(2000, 0, 1);
						if (granularity === 'hour') d.setHours(rangeConfig.hour.start, 0, 0);
						else if (granularity === 'day') d.setDate(rangeConfig.day.start);
						else if (granularity === 'month') d.setMonth(rangeConfig.month.start - 1, 1);
						return d;
					}
					if (granularity === 'hour') {
						const d = new Date(value.min);
						d.setHours(rangeConfig.hour.start, 0, 0, 0);
						return d;
					}
					if (granularity === 'day') {
						const d = new Date(value.min);
						return new Date(d.getFullYear(), d.getMonth(), rangeConfig.day.start, 0, 0, 0);
					}
					if (granularity === 'month') {
						const d = new Date(value.min);
						return new Date(d.getFullYear(), rangeConfig.month.start - 1, 1, 0, 0, 0);
					}
					return null;
				},
				max: (value) => {
					if (isCompareOverlap) {
						const d = new Date(2000, 0, 1);
						if (granularity === 'hour') d.setHours(rangeConfig.hour.end, 59, 59, 999);
						else if (granularity === 'day') d.setDate(rangeConfig.day.end);
						else if (granularity === 'month') d.setMonth(rangeConfig.month.end - 1, 31);
						return d;
					}
					if (granularity === 'hour') {
						const d = new Date(value.max);
						d.setHours(rangeConfig.hour.end, 59, 59, 999);
						return d;
					}
					if (granularity === 'day') {
						const d = new Date(value.max);
						return new Date(d.getFullYear(), d.getMonth(), rangeConfig.day.end, 23, 59, 59, 999);
					}
					if (granularity === 'month') {
						const d = new Date(value.max);
						return new Date(d.getFullYear(), rangeConfig.month.end - 1, 31, 23, 59, 59, 999);
					}
					return null;
				},
				splitLine: { show: false }
			},
			yAxis: yAxisConfig,
			series: activeSeries.map((s) => {
				const nameWithoutDate = s.name.split(' (')[0];
				const metricKey = s.metricName || nameWithoutDate;
				const axisIndex = uniqueMetrics.indexOf(metricKey);
				const color = customMetricColors[metricKey] || getUserColor(axisIndex);
				const type = chartTypes[metricKey] || 'line';
				const sameMetricSeries = activeSeries.filter(as => (as.metricName || as.name.split(' (')[0]) === metricKey);
				const metricIdx = sameMetricSeries.findIndex(as => as.id === s.id);
				const isDashed = metricIdx > 0;

				let plotData = getAggregatedData(s.data, granularity);
				if (isCompareOverlap) {
					plotData = plotData.map(d => {
						const dTime = d[0];
						const baseDate = new Date(2000, 0, 1);
						// 在重叠对比模式下，根据当前粒度映射时间
						if (granularity === 'hour') {
							baseDate.setHours(dTime.getHours(), dTime.getMinutes(), dTime.getSeconds());
						} else if (granularity === 'day') {
							baseDate.setDate(dTime.getDate());
						} else if (granularity === 'month') {
							baseDate.setMonth(dTime.getMonth());
						}
						return [baseDate, d[1]];
					});
				}

				return {
					name: nameWithoutDate,
					type: type,
					yAxisIndex: axisIndex,
					smooth: type === 'line',
					barMaxWidth: 20,
					showSymbol: granularity === 'hour' || plotData.length < 50,
					symbol: 'circle',
					symbolSize: 8,
					data: plotData,
					lineStyle: {
						width: 2.5,
						type: isDashed ? 'dashed' : 'solid'
					},
					itemStyle: {
						color: color,
						borderWidth: 1.5
					},
					emphasis: {
						focus: isFocusMode ? 'series' : 'none',
						scale: true,
						symbolSize: 24, // 进一步放大
						itemStyle: {
							shadowBlur: 20,
							shadowColor: 'rgba(0,0,0,0.5)',
							borderWidth: isLight ? 2 : 0,
							borderColor: '#fff' // 浅色模式下加白边
						}
					},
					blur: {
						lineStyle: { opacity: isFocusMode ? 0.1 : 1 },
						itemStyle: { opacity: isFocusMode ? 0.1 : 1 }
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
			historyRecords, isFocusMode, isCompareOverlap, granularity, legendSelected, rangeConfig, axisAdjustmentFactor
		};
		Object.entries(stateToSave).forEach(([key, val]) => {
			localStorage.setItem(`da_${key}`, JSON.stringify(val));
		});
		updateChart();
	}, [series, selectedDates, axisRanges, hoveredMetric, activeDimension, selectedDimensionValues, theme, chartTypes, legendSelected, showIntegral, historyRecords, isFocusMode, isCompareOverlap, granularity, rangeConfig, axisAdjustmentFactor]);

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

	const calculateTotal = (seriesItem) => {
		const { data, metricName, name, unit } = seriesItem;
		if (!data || data.length < 2) return '0';
		
		const mKey = (metricName || name).toLowerCase();
		const isWindSpeed = mKey.includes('风速') || (unit && unit.toLowerCase() === 'm/s');
		
		if (isWindSpeed) {
			const avg = data.reduce((sum, d) => sum + d.value, 0) / data.length;
			return `${parseFloat(avg.toFixed(2)).toString()} m/s (均值)`;
		}

		let total = 0;
		const sorted = [...data].sort((a, b) => a.time.getTime() - b.time.getTime());
		for (let i = 0; i < sorted.length - 1; i++) {
			const p1 = sorted[i]; const p2 = sorted[i + 1];
			const dt = (p2.time.getTime() - p1.time.getTime()) / (1000 * 3600);
			total += (p1.value + p2.value) * dt / 2;
		}

		let unitStr = unit ? `${unit}·h` : '项';
		let finalValue = total;

		// 业务逻辑转换
		const isPower = mKey.includes('实际功率') || mKey.includes('负荷') || mKey.includes('预测') || mKey.includes('出清') || (unit && unit.toUpperCase() === 'MW');
		if (isPower) {
			unitStr = 'MWh';
		} else if (mKey.includes('辐照度')) {
			unitStr = 'MJ/m²';
			finalValue = total * 0.0036; // Wh/m2 -> MJ/m2 (3600/1e6)
		}
		
		return `${parseFloat(finalValue.toFixed(2)).toString()} ${unitStr}`;
	};

	const removeSeries = (id) => setSeries(prev => prev.filter(s => s.id !== id));

	const openDataEditor = (s) => {
		setEditingSeriesId(s.id);
		setEditingSeriesName(s.name);
		setEditingMetricName(s.metricName || '');
		setEditingDataText(JSON.stringify(s.data.map(d => ({ 
			time: format(new Date(d.time), 'yyyy-MM-dd HH:mm:ss'), 
			value: d.value 
		})), null, 2));
		setIsDataEditorOpen(true);
	};

	const saveEditedData = () => {
		try {
			const newData = JSON.parse(editingDataText).map(d => ({
				...d,
				time: new Date(d.time)
			}));
			setSeries(prev => prev.map(s => s.id === editingSeriesId ? { 
				...s, 
				name: editingSeriesName, 
				metricName: editingMetricName,
				data: newData 
			} : s));
			setIsDataEditorOpen(false);
		} catch (err) {
			alert('JSON 解析失败，请检查格式。支持编辑 time (yyyy-MM-dd HH:mm:ss) 和 value。');
		}
	};

	const exportData = () => {
		const activeSeries = series.filter(s => {
			const dateMatch = selectedDates.includes(s.date);
			const dimMatch = activeDimension ? selectedDimensionValues.includes(s.dimensions[activeDimension]) : true;
			return dateMatch && dimMatch;
		});

		if (activeSeries.length === 0) return;

		// 1. 自动收集所有维度和指标
		const dimensionKeys = new Set();
		const metricNames = new Set();
		activeSeries.forEach(s => {
			Object.keys(s.dimensions).forEach(k => dimensionKeys.add(k));
			metricNames.add(s.metricName);
		});

		const dimKeyList = Array.from(dimensionKeys).sort();
		const metricNameList = Array.from(metricNames).sort();

		// 2. 按时间、日期和维度组合数据
		const dataRows = {}; // key: date|time|dimValues

		activeSeries.forEach(s => {
			s.data.forEach(d => {
				const dateStr = s.date;
				const timeStr = format(d.time, 'HH:mm:ss');
				const dimValuesJoined = dimKeyList.map(k => s.dimensions[k] || '').join('|');
				const rowKey = `${dateStr}|${timeStr}|${dimValuesJoined}`;

				if (!dataRows[rowKey]) {
					dataRows[rowKey] = {
						date: dateStr,
						time: timeStr,
						dims: { ...s.dimensions },
						metrics: {}
					};
				}
				dataRows[rowKey].metrics[s.metricName] = d.value;
			});
		});

		// 3. 构建 CSV 内容
		const headers = ['日期', '时间', ...dimKeyList, ...metricNameList];
		const rows = [headers];

		// 按日期和时间排序
		const sortedRowKeys = Object.keys(dataRows).sort();

		sortedRowKeys.forEach(key => {
			const rowData = dataRows[key];
			const row = [
				rowData.date,
				rowData.time,
				...dimKeyList.map(k => rowData.dims[k] || ''),
				...metricNameList.map(m => rowData.metrics[m] !== undefined ? rowData.metrics[m] : '')
			];
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
		if (!confirm("确定要清空所有当前加载的数据吗？(历史存单将被保留)")) return;
		setSeries([]);
		setAvailableDates([]);
		setSelectedDates([]);
		resetSettings();
		
		// 彻底清理相关 LocalStorage
		['series', 'selectedDates'].forEach(key => localStorage.removeItem(`da_${key}`));
	};

	const resetSettings = () => {
		setAxisRanges({});
		setChartTypes({});
		setCustomMetricColors({});
		setLegendSelected({});
		setGranularity('hour');
		setShowIntegral(false);
		setIsFocusMode(true);
		
		setRangeConfig({
			hour: { start: 0, end: 23 },
			day: { start: 1, end: 31 },
			month: { start: 1, end: 12 }
		});
		const keysToReset = ['axisRanges', 'chartTypes', 'customMetricColors', 'legendSelected', 'granularity', 'showIntegral', 'isFocusMode', 'rangeConfig', 'activeDimension', 'selectedDimensionValues'];
		keysToReset.forEach(key => localStorage.removeItem(`da_${key}`));
	};

	const fetchAccessLogs = async (type = logType) => {
		try {
			const res = await fetch(`/api/logs?type=${type}`);
			if (res.ok) {
				const data = await res.json();
				setAccessLogs(data.logs || []);
				setLogType(type);
				setIsLogModalOpen(true);
			}
		} catch (e) {
			console.error('获取日志失败:', e);
		}
	};

	const exportLogs = () => {
		const blob = new Blob([accessLogs.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${logType}_logs_${format(new Date(), 'yyyyMMdd_HHmm')}.txt`;
		a.click();
	};

	const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

	const saveSnapshot = async () => {
		const name = prompt("请输入历史记录名称:", `记录_${format(new Date(), 'MM-dd HH:mm')}`);
		if (!name) return;

		// 捕捉当前视角下的所有系列数据，实现“调阅”功能
		const capturedSeries = series.filter(s => selectedDates.includes(s.date));

		const record = {
			id: Date.now().toString(),
			name,
			selectedDates,
			activeDimension,
			selectedDimensionValues,
			axisRanges,
			chartTypes,
			rangeConfig, // 保存微调范围
			capturedSeries // 保存数据副本
		};

		try {
			const res = await fetch('/api/snapshots', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(record)
			});
			if (res.ok) {
				setHistoryRecords(prev => [record, ...prev]);
			}
		} catch (e) {
			console.error('保存失败:', e);
			// 降级使用 LocalStorage (暂不实现，避免数据不一致)
		}
	};

	const loadSnapshot = (rec) => {
		// 如果记录里有数据备份，将其合并进当前的 series 中（去重）
		if (rec.capturedSeries && rec.capturedSeries.length > 0) {
			setSeries(prev => {
				const existingIds = new Set(prev.map(s => s.id));
				const revitalizedNew = rec.capturedSeries.map(s => ({
					...s,
					data: s.data.map(d => ({ ...d, time: new Date(d.time) }))
				}));
				const filteredNew = revitalizedNew.filter(s => !existingIds.has(s.id));
				return [...prev, ...filteredNew];
			});
		}

		setTimeout(() => {
			setSelectedDates(rec.selectedDates);
			setActiveDimension(rec.activeDimension);
			setSelectedDimensionValues(rec.selectedDimensionValues);
			setAxisRanges(rec.axisRanges);
			setChartTypes(rec.chartTypes);
			if (rec.rangeConfig) setRangeConfig(rec.rangeConfig);
			setActiveTab('controls'); // 自动切回控制台
		}, 0);
	};

	const deleteSnapshot = async (e, id) => {
		e.stopPropagation(); // 阻止事件冒泡到父级 onClick
		if (!confirm("确定要删除这条历史存单吗？")) return;
		try {
			const res = await fetch(`/api/snapshots/${id}`, { method: 'DELETE' });
			if (res.ok) {
				setHistoryRecords(prev => prev.filter(r => r.id !== id));
			}
		} catch (error) {
			console.error('删除失败:', error);
		}
	};

	const clearAllHistory = async () => {
		if (!confirm("确定要清空所有历史存单吗？此操作不可撤销！")) return;
		try {
			const res = await fetch('/api/snapshots', { method: 'DELETE' });
			if (res.ok) {
				setHistoryRecords([]);
				alert("历史存单已成功清空");
			} else {
				throw new Error("后端响应异常");
			}
		} catch (e) {
			console.error('清空历史失败:', e);
			alert("清空失败: " + e.message);
		}
	};

	const setAllLegends = (status) => {
		if (!chartInstance.current) return;
		const newSelected = {};
		uniqueMetrics.forEach(m => { newSelected[m] = status; });
		setLegendSelected(newSelected);
	};

	const toggleMetricLegend = (metric) => {
		setLegendSelected(prev => ({
			...prev,
			[metric]: prev[metric] === false ? true : false
		}));
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
					<label className="upload-btn premium-button" title="从本地选取 CSV/JSON 文件">
						<Upload size={14} /> 导入文件
						<input type="file" onChange={handleFileUpload} hidden />
					</label>
					<button className="nav-btn premium-button" onClick={() => setIsPasteModalOpen(true)} title="粘贴文本数据">
						<ClipboardPaste size={14} /> 粘贴导入
					</button>
					<div className="nav-divider"></div>
					<button className="premium-button" onClick={saveSnapshot} title="保存当前画面快照">
						<Archive size={15} /> 存入历史
					</button>
					<button className="icon-btn-mini" onClick={resetSettings} title="恢复默认面板设置 (不删除数据)">
						<RotateCcw size={15} /> 重置面板
					</button>
					<button className="clear-btn" onClick={clearAll} title="清空当前所有图表数据">
						<Trash2 size={15} /> 清空当前
					</button>
					<div className="nav-divider"></div>
					{selectedDates.length > 0 && (
						<button className="export-btn" onClick={exportData} title="导出当前显示的数据为 CSV">
							<Download size={14} /> 导出 CSV
						</button>
					)}
					<div className="nav-divider"></div>
					<button className="icon-btn-mini" onClick={() => fetchAccessLogs('access')} title="查看系统运行日志">
						<Activity size={18} />
					</button>
					<button className="theme-toggle" onClick={toggleTheme} title="切换深/浅色主题">
						{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
					</button>
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

					<div className="sidebar-header-improved">
						<div className="sidebar-title-row">
							<h3>{activeTab === 'controls' ? '分析控制台' : '历史快照库'}</h3>
							<div className="header-actions">
								<button className="icon-btn-mini" onClick={() => setIsSidebarWide(!isSidebarWide)} title={isSidebarWide ? "折叠宽度" : "增加宽度"}>
									<Layout size={14} />
								</button>
								{activeTab === 'history' && historyRecords.length > 0 && (
									<button className="delete-all-btn-styled-large" onClick={clearAllHistory} title="清空所有存单记录">
										<Trash2 size={12} style={{ marginRight: '4px' }} /> 清空历史
									</button>
								)}
							</div>
						</div>
						{activeTab === 'history' && (
							<div className="header-search-row">
								<History size={14} className="search-icon" />
								<input
									type="text"
									placeholder="搜索存单名称或日期..."
									value={historySearchTerm}
									onChange={(e) => setHistorySearchTerm(e.target.value)}
								/>
								{historySearchTerm && <button className="clear-search" onClick={() => setHistorySearchTerm('')}><X size={12} /></button>}
							</div>
						)}
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
									<div className="granularity-selector">
										<p className="label">时间粒度</p>
										<div className="mini-toggle-group">
											{['hour', 'day', 'month'].map(g => (
												<button 
													key={g} 
													className={granularity === g ? 'active' : ''} 
													onClick={() => setGranularity(g)}
												>
													{g === 'hour' ? '日' : g === 'day' ? '月' : '年'}
												</button>
											))}
										</div>
									</div>
									<div className="range-fine-tune">
										<p className="label">范围微调 ({granularity === 'hour' ? '时' : granularity === 'day' ? '日' : '月'})</p>
										<div className="tune-inputs">
											<select 
												value={rangeConfig[granularity].start} 
												onChange={(e) => setRangeConfig(prev => ({ ...prev, [granularity]: { ...prev[granularity], start: parseInt(e.target.value) } }))}
											>
												{Array.from({ length: granularity === 'hour' ? 24 : (granularity === 'day' ? 31 : 12) }, (_, i) => i + (granularity === 'hour' ? 0 : 1)).map(v => (
													<option key={v} value={v}>{v}</option>
												))}
											</select>
											<span>至</span>
											<select 
												value={rangeConfig[granularity].end} 
												onChange={(e) => setRangeConfig(prev => ({ ...prev, [granularity]: { ...prev[granularity], end: parseInt(e.target.value) } }))}
											>
												{Array.from({ length: granularity === 'hour' ? 24 : (granularity === 'day' ? 31 : 12) }, (_, i) => i + (granularity === 'hour' ? 0 : 1)).map(v => (
													<option key={v} value={v}>{v}</option>
												))}
											</select>
										</div>
									</div>
									<label className="checkbox-label">
										<input type="checkbox" checked={showIntegral} onChange={(e) => setShowIntegral(e.target.checked)} />
										<span>显示总计 (积分/均值)</span>
									</label>
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
								<div className="series-list-header">
									<p className="label">选中数据详情 ({series.filter(s => selectedDates.includes(s.date)).length} 项)</p>
									<div className="legend-bulk-actions">
										<button onClick={() => setAllLegends(true)}>全选</button>
										<button onClick={() => setAllLegends(false)}>全消</button>
									</div>
								</div>
								<ul>
									{series.filter(s => selectedDates.includes(s.date)).map(s => {
										const metricKey = s.metricName || s.name.split(' (')[0];
										const isHidden = legendSelected[metricKey] === false;
										return (
											<li key={s.id} className={`series-item ${isHidden ? 'hidden' : ''}`} onClick={() => toggleMetricLegend(metricKey)} style={{ cursor: 'pointer' }}>
												<div className="series-main-info">
													<span className="series-color-dot" style={{ 
														backgroundColor: isHidden ? 'transparent' : (customMetricColors[metricKey] || getUserColor(uniqueMetrics.indexOf(metricKey))),
														border: isHidden ? '1px solid #666' : 'none'
													}}></span>
													<div className="series-text-main">
														<div className="series-name-row">
															<span className="s-name">{s.name}</span>
															<div className="series-actions-right">
																{showIntegral && <span className="series-auc">{calculateTotal(s)}</span>}
																<button className="delete-btn" onClick={(e) => { e.stopPropagation(); openDataEditor(s); }} title="手动修改此数据序列"><FileText size={12} /></button>
																<button className="delete-btn" onClick={(e) => { e.stopPropagation(); removeSeries(s.id); }} title="移除此系列"><X size={12} /></button>
															</div>
														</div>
														<div className="series-meta">
															<span>{s.date}</span>
															{Object.entries(s.dimensions).map(([k, v]) => (
																<span key={k} className="dim-info">{k}: {v}</span>
															))}
														</div>
													</div>
												</div>
											</li>
										);
									})}
								</ul>
							</div>
						</div>
					) : (
						<div className="sidebar-scroll-area">
							<div className="history-section-full">
								<div className="history-list-large">
									{historyRecords
										.filter(rec => rec.name.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
											rec.selectedDates.some(d => d.includes(historySearchTerm)))
										.length === 0 ? (
										<div className="empty-mini">未找到匹配存单</div>
									) : (
										historyRecords
											.filter(rec => rec.name.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
												rec.selectedDates.some(d => d.includes(historySearchTerm)))
											.map(rec => (
												<div key={rec.id} className="history-item-compact glass-panel">
													<div className="history-content-row" onClick={() => loadSnapshot(rec)}>
														<div className="h-avatar">{rec.name.charAt(0)}</div>
														<div className="history-text">
															<span className="h-name">{rec.name}</span>
															<span className="h-date">{rec.selectedDates.join(', ')}</span>
														</div>
													</div>
													<button className="delete-history-btn" onClick={(e) => deleteSnapshot(e, rec.id)}><X size={14} /></button>
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
								{(() => {
									const currentActiveSeries = series.filter(s => selectedDates.includes(s.date));
									const uniqueMetricsInView = [...new Set(currentActiveSeries.map(s => s.metricName || s.name))];
									const powerMetrics = uniqueMetricsInView.filter(m => {
										const low = m.toLowerCase();
										return low.includes('功率') || low.includes('power') || low.includes('预测') || low.includes('出清') || low.includes('负荷');
									});

									return (
										<>
											<div className="axis-row-compact global-adjuster-slim glass-panel" style={{ marginBottom: '8px', gap: '12px', padding: '4px 12px', borderLeft: 'none' }}>
												<input type="range" min="0.5" max="1.5" step="0.05" value={axisAdjustmentFactor} onChange={(e) => setAxisAdjustmentFactor(parseFloat(e.target.value))} style={{ flex: 1, padding: 0 }} title={`全局 Y 轴缩放: x${axisAdjustmentFactor.toFixed(2)}`} />
												<button className="icon-btn-text" style={{ padding: '2px 8px', fontSize: '10px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', borderRadius: '4px', fontWeight: 600, border: '1px solid var(--border-color)' }} onClick={() => setAxisAdjustmentFactor(1.0)}>重置</button>
											</div>
											{powerMetrics.length > 1 && (
												<div className="axis-row-compact power-unified-box glass-panel" style={{ marginBottom: '8px', padding: '4px 12px', borderLeft: 'none', gap: '12px', display: 'flex', alignItems: 'center' }}>
													<span style={{ flex: 'none', fontSize: '14px', opacity: 0.8 }}>⚡</span>
													<div className="axis-inputs" style={{ flex: 1, justifyContent: 'flex-start' }}>
														<input 
															type="number"
															placeholder="最小" 
															onChange={(e) => {
																const val = e.target.value;
																setAxisRanges(prev => {
																	const next = { ...prev };
																	powerMetrics.forEach(pm => next[pm] = { ...next[pm], min: val });
																	return next;
																});
															}}
														/>
														<span>-</span>
														<input 
															type="number"
															placeholder="最大"
															onChange={(e) => {
																const val = e.target.value;
																setAxisRanges(prev => {
																	const next = { ...prev };
																	powerMetrics.forEach(pm => next[pm] = { ...next[pm], max: val });
																	return next;
																});
															}}
														/>
													</div>
												</div>
											)}
											{uniqueMetricsInView.map((metric, index) => {
												const isHidden = legendSelected[metric] === false;
												const metricColor = customMetricColors[metric] || getUserColor(index);
												const metricColorAlpha = isHidden ? 'transparent' : (metricColor + '22');
												const isIrradiance = metric.includes('辐照度') || metric.toLowerCase().includes('irradiance');

												const vals = currentActiveSeries.filter(s => (s.metricName === metric || s.name.startsWith(metric))).flatMap(s => s.data.map(d => d.value));
												const dataMin = vals.length ? Math.min(...vals) : 0;
												const dataMax = vals.length ? Math.max(...vals) : 100;
												
												// 计算默认缓冲轴界 (与 updateChart 逻辑一致)
												let bufferedMin = dataMin < 0 ? dataMin * 1.1 : dataMin - (Math.abs(dataMax - dataMin) * 0.05 || 1);
												let bufferedMax = dataMax > 0 ? dataMax * 1.1 : dataMax + (Math.abs(dataMax - dataMin) * 0.05 || 1);

												if (isIrradiance && axisRanges[metric]?.min === undefined) bufferedMin = 0;
												if (isIrradiance && axisRanges[metric]?.max === undefined) bufferedMax = 1000;

												const dMinDisplay = parseFloat(bufferedMin.toFixed(2));
												const dMaxDisplay = parseFloat(bufferedMax.toFixed(2));
										
										const stepVal = (Math.max(Math.abs(dataMin), Math.abs(dataMax)) * 0.05).toFixed(2);
										const finalStep = stepVal > 0 ? stepVal : 0.1;

										return (
											<div
												key={metric}
												className={`axis-row-compact glass-panel ${isHidden ? 'is-hidden-metric' : ''}`}
												style={{
													borderLeftColor: isHidden ? 'transparent' : metricColor,
													'--metric-color-alpha': metricColorAlpha,
													opacity: isHidden ? 0.5 : 1
												}}
											>
												<span className="axis-label-text" title={metric} style={{ color: isHidden ? '#888' : (theme === 'light' ? '#1d1d1f' : 'inherit'), fontWeight: 600 }}>{metric}</span>
												<div className="axis-inputs">
													<input
														type="number"
														placeholder={dMinDisplay}
														step={finalStep}
														value={axisRanges[metric]?.min !== undefined ? axisRanges[metric]?.min : dMinDisplay}
														onChange={(e) => setAxisRanges(prev => ({ ...prev, [metric]: { ...prev[metric], min: e.target.value } }))}
														onKeyDown={(e) => {
															if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
																e.preventDefault();
																const currentRaw = axisRanges[metric]?.min;
																const step = parseFloat(finalStep);
																let startVal;
																if (currentRaw === '' || currentRaw === undefined) {
																	startVal = dMinDisplay;
																} else {
																	startVal = parseFloat(currentRaw);
																}
																const newVal = e.key === 'ArrowUp' ? startVal + step : startVal - step;
																setAxisRanges(prev => ({ ...prev, [metric]: { ...prev[metric], min: parseFloat(newVal.toFixed(2)).toString() } }));
															}
														}}
														style={{ borderBottomColor: metricColor, borderBottomStyle: 'solid' }}
													/>
													<span>-</span>
													<input
														type="number"
														placeholder={dMaxDisplay}
														step={finalStep}
														value={axisRanges[metric]?.max !== undefined ? axisRanges[metric]?.max : dMaxDisplay}
														onChange={(e) => setAxisRanges(prev => ({ ...prev, [metric]: { ...prev[metric], max: e.target.value } }))}
														onKeyDown={(e) => {
															if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
																e.preventDefault();
																const currentRaw = axisRanges[metric]?.max;
																const step = parseFloat(finalStep);
																let startVal;
																if (currentRaw === '' || currentRaw === undefined) {
																	startVal = dMaxDisplay;
																} else {
																	startVal = parseFloat(currentRaw);
																}
																const newVal = e.key === 'ArrowUp' ? startVal + step : startVal - step;
																setAxisRanges(prev => ({ ...prev, [metric]: { ...prev[metric], max: parseFloat(newVal.toFixed(2)).toString() } }));
															}
														}}
														style={{ borderBottomColor: metricColor, borderBottomStyle: 'solid' }}
													/>
												</div>
												<div className="axis-actions">
													<input
														type="color"
														value={metricColor}
														onChange={(e) => setCustomMetricColors(prev => ({ ...prev, [metric]: e.target.value }))}
														className="color-picker-mini"
														title="调整指标颜色"
													/>
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
								</>
								);
							})()}
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
								<div className="guide-step"><span>1</span> 导入 CSV/JSON <a href="/sample_weather.csv" download className="sample-link">下载范例文件</a></div>
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
			{isLogModalOpen && (
				<div className="modal-overlay">
					<div className="modal-content log-modal large-glass">
						<div className="modal-header">
							<div className="header-left">
								<Activity size={20} className="pulse-icon" />
								<h3>系统运行日志</h3>
								<div className="log-type-tabs">
									<button className={logType === 'access' ? 'active' : ''} onClick={() => { setLogSearchTerm(''); fetchAccessLogs('access'); }}>访问</button>
									<button className={logType === 'error' ? 'active' : ''} onClick={() => { setLogSearchTerm(''); fetchAccessLogs('error'); }}>告警</button>
								</div>
							</div>
							<div className="header-actions">
								<div className="search-box-mini">
									<input 
										type="text" 
										placeholder="搜索日志内容..." 
										value={logSearchTerm} 
										onChange={(e) => setLogSearchTerm(e.target.value)} 
									/>
								</div>
								<button className="icon-btn-text" onClick={exportLogs} title="导出当前日志">
									<Download size={16} /> 导出
								</button>
								<button className="icon-btn" onClick={() => setIsLogModalOpen(false)}><X size={20} /></button>
							</div>
						</div>
						<div className="log-area coder-style">
							{accessLogs
								.filter(log => log.toLowerCase().includes(logSearchTerm.toLowerCase()))
								.map((log, i) => (
									<div key={i} className={`log-line ${log.includes('ERROR') ? 'error-line' : ''}`}>{log}</div>
								))
							}
							{accessLogs.length === 0 && <div className="empty-mini">暂无当前类型的日志记录</div>}
						</div>
					</div>
				</div>
			)}
			{isDataEditorOpen && (
				<div className="modal-overlay">
					<div className="modal-content log-modal large-glass">
						<div className="modal-header">
							<h3>编辑序列源数据</h3>
							<button className="icon-btn" onClick={() => setIsDataEditorOpen(false)}><X size={20} /></button>
						</div>
						<div className="editor-top-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '0 20px', marginBottom: '15px' }}>
							<div>
								<p className="label">系列显示名称</p>
								<input 
									type="text" className="styled-select" 
									value={editingSeriesName} 
									onChange={(e) => setEditingSeriesName(e.target.value)} 
								/>
							</div>
							<div>
								<p className="label">核心指标名称 (影响坐标轴分组)</p>
								<input 
									type="text" className="styled-select" 
									value={editingMetricName} 
									onChange={(e) => setEditingMetricName(e.target.value)} 
								/>
							</div>
						</div>
						<p className="label" style={{ padding: '0 20px', marginBottom: '10px' }}>源数据点调整 (JSON 格式)</p>
						<textarea 
							className="paste-area coder-style" 
							style={{ height: '400px', fontSize: '12px', fontFamily: 'monospace' }}
							value={editingDataText} 
							onChange={(e) => setEditingDataText(e.target.value)} 
						/>
						<div className="modal-actions" style={{ padding: '20px' }}>
							<button onClick={() => setIsDataEditorOpen(false)}>取消</button>
							<button className="premium-button" onClick={saveEditedData}>应用修改</button>
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
