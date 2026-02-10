// =====================================================
// charts.js - グラフ描画
// =====================================================
// 修正時: 時間範囲切替・週間・月間・年間グラフの表示設定
//
// 主要関数:
// - updateCharts() - 全グラフ更新
// - updateChart24h(hours) - 時間範囲グラフ（前の時間帯比較付き）
// - updateChartWeek() - 週間グラフ
// - updateChartMonthly() - 月間グラフ
// - updateChartYearly() - 年間グラフ
//
// 依存: config.js (recentData, weeklyData, dailyData, charts)

// 現在選択中の時間範囲（localStorage から復元）
let currentChartHours = parseInt(localStorage.getItem('chartHours')) || 24;

function updateCharts() { updateChart24h(currentChartHours); updateChartWeek(); updateChartMonthly(); updateChartYearly(); }

const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        intersect: false,
        mode: 'index',
        axis: 'x'
    },
    animation: {
        duration: 150
    },
    hover: {
        animationDuration: 0,
        mode: 'index',
        intersect: false
    },
    resizeDelay: 100,
    layout: {
        padding: { left: 5, right: 10, top: 5, bottom: 5 }
    },
    elements: {
        point: {
            radius: 0,
            hoverRadius: 5,
            hitRadius: 10
        },
        line: {
            tension: 0.3
        }
    },
    plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11, weight: '500' }, usePointStyle: true, padding: 20 } },
        tooltip: {
            enabled: true,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(99, 102, 241, 0.4)',
            borderWidth: 1,
            padding: 14,
            cornerRadius: 12,
            displayColors: true,
            titleFont: { weight: '600' },
            animation: {
                duration: 80,
                easing: 'easeOutQuart'
            },
            position: 'nearest',
            callbacks: {
                label: function (context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    if (context.parsed.y !== null) {
                        const unit = label.includes('湿度') ? '%' : '°C';
                        label += context.parsed.y.toFixed(1) + unit;
                    }
                    return label;
                }
            }
        }
    },
    scales: {
        x: { grid: { color: 'rgba(148, 163, 184, 0.06)' }, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 } },
        y: { grid: { color: 'rgba(148, 163, 184, 0.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: function (value) { return value + '°C'; } } }
    }
};

const crosshairPlugin = {
    id: 'crosshair',
    afterDraw: (chart) => {
        if (chart.tooltip?._active?.length) {
            const ctx = chart.ctx;
            const x = chart.tooltip._active[0].element.x;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, chart.chartArea.top);
            ctx.lineTo(x, chart.chartArea.bottom);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.restore();
        }
    }
};

function updateChart24h(hours = 24) {
    const sourceData = weeklyData.length > 0 ? weeklyData : recentData;
    if (!sourceData.length) return;

    // 現在の選択状態を保存
    currentChartHours = hours;

    const now = Date.now();
    const cutoffMain = new Date(now - hours * 60 * 60 * 1000);
    const cutoffPrev = new Date(now - hours * 2 * 60 * 60 * 1000);

    // 選択範囲の2倍分のデータをソート
    let chartData = sourceData.filter(d => d.date >= cutoffPrev);
    chartData.sort((a, b) => a.date - b.date);

    // 表示範囲のデータ
    const mainData = chartData.filter(d => d.date >= cutoffMain);
    const tempData = mainData.map(d => ({ x: d.date, y: d.temperature }));
    const humidData = mainData.map(d => ({ x: d.date, y: d.humidity }));

    // 前の時間帯のデータ（選択範囲分だけシフトして比較用に使用）
    const prevData = chartData
        .filter(d => d.date < cutoffMain)
        .map(d => ({
            x: new Date(d.date.getTime() + hours * 60 * 60 * 1000),
            y: d.temperature
        }));

    // 時間範囲に応じたラベル設定
    const prevLabel = hours === 24 ? '前日の気温' : `前の${hours}時間の気温`;
    const titleText = `直近${hours}時間の気温・湿度`;

    // タイトル更新
    const titleEl = document.getElementById('chart24hTitle');
    if (titleEl) titleEl.textContent = titleText;

    const isMobile = window.innerWidth <= 600;
    const tickFontSize = isMobile ? 8 : 10;
    const showAxisTitle = !isMobile;

    // 時間範囲に応じたX軸設定
    const ticksConfig = {
        3: { maxTicks: isMobile ? 4 : 7, format: 'H:mm' },
        6: { maxTicks: isMobile ? 4 : 7, format: 'H:mm' },
        12: { maxTicks: isMobile ? 5 : 8, format: 'H:mm' },
        24: { maxTicks: isMobile ? 6 : 12, format: 'M/d H時' }
    };
    const xConfig = ticksConfig[hours] || ticksConfig[24];

    const ctx = document.getElementById('chart24h').getContext('2d');
    if (charts.chart24h) charts.chart24h.destroy();
    charts.chart24h = new Chart(ctx, {
        type: 'line',
        plugins: [crosshairPlugin],
        data: {
            datasets: [
                {
                    label: '気温',
                    data: tempData,
                    borderColor: '#fb923c',
                    backgroundColor: 'rgba(251, 146, 60, 0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    yAxisID: 'y',
                    order: 1
                },
                {
                    label: prevLabel,
                    data: prevData,
                    borderColor: '#94a3b8',
                    borderDash: [4, 4],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                    order: 2,
                    spanGaps: true
                },
                {
                    label: '湿度',
                    data: humidData,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(34, 211, 238, 0.12)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    pointHitRadius: 0,
                    yAxisID: 'y1',
                    order: 3
                }
            ]
        },
        options: {
            ...baseOptions,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: xConfig.format,
                            day: 'M/d'
                        },
                        tooltipFormat: 'M/d H:mm'
                    },
                    min: cutoffMain,
                    max: new Date(now),
                    ticks: {
                        color: '#94a3b8',
                        font: { size: tickFontSize },
                        maxTicksLimit: xConfig.maxTicks,
                        maxRotation: 0
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.06)' }
                },
                y: {
                    grid: { color: 'rgba(148, 163, 184, 0.06)' },
                    position: 'left',
                    title: { display: showAxisTitle, text: '°C', color: '#fb923c', font: { size: 11, weight: '600' } },
                    ticks: {
                        color: '#fb923c',
                        font: { size: tickFontSize },
                        callback: function (value) { return value + '°'; }
                    }
                },
                y1: {
                    grid: { drawOnChartArea: false },
                    position: 'right',
                    title: { display: showAxisTitle, text: '%', color: '#22d3ee', font: { size: 11, weight: '600' } },
                    ticks: {
                        color: '#22d3ee',
                        font: { size: tickFontSize },
                        callback: function (value) { return value + '%'; }
                    }
                }
            },
            plugins: {
                ...baseOptions.plugins,
                tooltip: {
                    ...baseOptions.plugins.tooltip,
                    filter: function (tooltipItem) {
                        return tooltipItem.dataset.label === '気温' || tooltipItem.dataset.label === '湿度';
                    },
                    callbacks: {
                        ...baseOptions.plugins.tooltip.callbacks,
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null && context.parsed.y !== undefined) {
                                const unit = label.includes('湿度') ? '%' : '°C';
                                label += context.parsed.y.toFixed(1) + unit;
                            }
                            return label;
                        },
                        afterBody: function (tooltipItems) {
                            if (!tooltipItems.length) return '';
                            const hoveredTime = tooltipItems[0].parsed.x;
                            const prevPoint = prevData.find(d => {
                                const dataTime = d.x.getTime ? d.x.getTime() : d.x;
                                return Math.abs(dataTime - hoveredTime) < 2 * 60 * 1000;
                            });
                            if (prevPoint) {
                                return `■ ${prevLabel}: ${prevPoint.y.toFixed(1)}°C`;
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });
}

function updateChartWeek() {
    const sourceData = weeklyData.length > 0 ? weeklyData : recentData;
    if (!sourceData.length) return;
    const sampled = sourceData.filter((_, i) => i % 30 === 0);

    const ctx = document.getElementById('chartWeek').getContext('2d');
    if (charts.chartWeek) charts.chartWeek.destroy();
    charts.chartWeek = new Chart(ctx, {
        type: 'line',
        plugins: [crosshairPlugin],
        data: {
            labels: sampled.map(d => {
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                const date = d.date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                const day = days[d.date.getDay()];
                const time = d.date.toLocaleTimeString('ja-JP', { hour: '2-digit' });
                return `${date}(${day}) ${time}`;
            }),
            datasets: [{ label: '気温', data: sampled.map(d => d.temperature), borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5 }]
        },
        options: baseOptions
    });
}

function updateChartMonthly() {
    if (!dailyData.length) return;
    const monthly = {};
    dailyData.forEach(d => {
        const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthly[key]) monthly[key] = { temps: [], mins: [], date: new Date(d.date.getFullYear(), d.date.getMonth(), 1) };
        monthly[key].temps.push(d.max);
        monthly[key].mins.push(d.min);
    });
    const data = Object.values(monthly).map(m => ({ date: m.date, max: Math.max(...m.temps), min: Math.min(...m.mins) })).sort((a, b) => a.date - b.date);

    const ctx = document.getElementById('chartMonthly').getContext('2d');
    if (charts.chartMonthly) charts.chartMonthly.destroy();
    charts.chartMonthly = new Chart(ctx, {
        type: 'bar',
        plugins: [crosshairPlugin],
        data: {
            labels: data.map(d => d.date.toLocaleDateString('ja-JP', { year: '2-digit', month: 'short' })),
            datasets: [
                { label: '最高', data: data.map(d => d.max), backgroundColor: 'rgba(248, 113, 113, 0.75)', borderColor: '#f87171', borderWidth: 0, borderRadius: 6 },
                { label: '最低', data: data.map(d => d.min), backgroundColor: 'rgba(96, 165, 250, 0.75)', borderColor: '#60a5fa', borderWidth: 0, borderRadius: 6 }
            ]
        },
        options: baseOptions
    });
}

function updateChartYearly() {
    if (!dailyData.length) return;
    const ctx = document.getElementById('chartYearly').getContext('2d');
    if (charts.chartYearly) charts.chartYearly.destroy();
    charts.chartYearly = new Chart(ctx, {
        type: 'line',
        plugins: [crosshairPlugin],
        data: {
            labels: dailyData.map(d => {
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                const year = d.date.getFullYear();
                const date = d.date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                const day = days[d.date.getDay()];
                return `${year}/${date}(${day})`;
            }),
            datasets: [
                { label: '日最高', data: dailyData.map(d => d.max), borderColor: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.12)', fill: '+1', tension: 0.3, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
                { label: '日最低', data: dailyData.map(d => d.min), borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.08)', fill: false, tension: 0.3, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 }
            ]
        },
        options: baseOptions
    });
}

function updateCountdown() {
    if (!nextUpdateTime) return;
    const remaining = Math.max(0, nextUpdateTime - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    document.getElementById('nextUpdate').textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
}
