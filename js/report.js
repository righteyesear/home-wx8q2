/**
 * 分析レポートページ - JavaScript
 * JSON レポートの読み込み、表示、ナビゲーションを管理
 */

// =============================================================================
// 状態管理
// =============================================================================
const state = {
    reportType: 'weekly',       // 'weekly' | 'monthly'
    currentPeriod: null,        // 現在表示中のレポート期間キー
    reportIndex: null,          // reports/index.json のデータ
    currentReport: null,        // 現在読み込まれたレポート
    charts: {},                 // Chart.js インスタンス
    listOpen: false,            // レポート一覧の表示状態
};


// =============================================================================
// 初期化
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadReportIndex();
    loadLatestReport();
});


// =============================================================================
// テーマ
// =============================================================================
function toggleReportTheme() {
    document.documentElement.classList.toggle('light-mode');
    const isLight = document.documentElement.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');

    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.innerHTML = isLight
            ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
            : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }

    // チャートの色を更新
    updateChartColors();
}


// =============================================================================
// データ読み込み
// =============================================================================
async function loadReportIndex() {
    try {
        const resp = await fetch('reports/index.json');
        if (!resp.ok) throw new Error('index.json not found');
        state.reportIndex = await resp.json();
    } catch (e) {
        console.warn('Report index load failed:', e);
        state.reportIndex = { weekly: [], monthly: [] };
    }
}


function loadLatestReport() {
    const list = state.reportIndex[state.reportType] || [];
    if (list.length === 0) {
        showError('レポートがまだ生成されていません。');
        return;
    }

    const now = new Date();
    let currentPeriodStr;

    if (state.reportType === 'weekly') {
        // 現在のISO週番号を計算
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayNum = d.getDay() || 7;
        d.setDate(d.getDate() + 4 - dayNum);
        const year = d.getFullYear();
        const week = Math.ceil((((d - new Date(year, 0, 1)) / 86400000) + 1) / 7);
        currentPeriodStr = `${year}-W${week.toString().padStart(2, '0')}`;
    } else {
        // 月次
        currentPeriodStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    // リスト内から完全に終了した期間（現在の期間より前）を探す
    let targetIndex = 0;
    for (let i = 0; i < list.length; i++) {
        if (list[i].period < currentPeriodStr) {
            targetIndex = i;
            break;
        }
    }

    loadReport(list[targetIndex].period);
}


async function loadReport(period) {
    showLoading();
    state.currentPeriod = period;

    const list = state.reportIndex[state.reportType] || [];
    const entry = list.find(e => e.period === period);
    if (!entry) {
        showError(`期間 ${period} のレポートが見つかりません。`);
        return;
    }

    try {
        const resp = await fetch(`reports/${entry.file}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        state.currentReport = await resp.json();
        renderReport(state.currentReport);
    } catch (e) {
        console.error('Report load error:', e);
        showError(`レポートの読み込みに失敗しました: ${e.message}`);
    }
}


// =============================================================================
// UI 表示制御
// =============================================================================
function showLoading() {
    document.getElementById('reportLoading').style.display = 'flex';
    document.getElementById('reportError').style.display = 'none';
    document.getElementById('reportContent').style.display = 'none';
}

function showError(message) {
    document.getElementById('reportLoading').style.display = 'none';
    document.getElementById('reportError').style.display = 'flex';
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('reportContent').style.display = 'none';
    updatePeriodLabel('--');
}

function showContent() {
    document.getElementById('reportLoading').style.display = 'none';
    document.getElementById('reportError').style.display = 'none';
    document.getElementById('reportContent').style.display = 'block';
}


// =============================================================================
// レポートタイプ切り替え
// =============================================================================
function switchReportType(type) {
    state.reportType = type;

    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    closeReportList();
    loadLatestReport();
}


// =============================================================================
// 期間ナビゲーション
// =============================================================================
function navigateReport(direction) {
    const list = state.reportIndex[state.reportType] || [];
    const currentIdx = list.findIndex(e => e.period === state.currentPeriod);
    if (currentIdx < 0) return;

    // list は降順（最新が先頭）なので、direction = -1 → 前の期間 = index + 1
    const newIdx = currentIdx - direction;
    if (newIdx >= 0 && newIdx < list.length) {
        loadReport(list[newIdx].period);
    }
}


function updatePeriodLabel(label) {
    document.getElementById('periodLabel').textContent = label;
    updateNavButtons();
}


function updateNavButtons() {
    const list = state.reportIndex[state.reportType] || [];
    const currentIdx = list.findIndex(e => e.period === state.currentPeriod);

    // 次（新しい方）: idx - 1
    document.getElementById('nextBtn').disabled = currentIdx <= 0;
    // 前（古い方）: idx + 1
    document.getElementById('prevBtn').disabled = currentIdx >= list.length - 1;
}


// =============================================================================
// レポート一覧
// =============================================================================
function toggleReportList() {
    state.listOpen = !state.listOpen;
    const dropdown = document.getElementById('reportListDropdown');

    if (state.listOpen) {
        renderReportList();
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

function closeReportList() {
    state.listOpen = false;
    document.getElementById('reportListDropdown').style.display = 'none';
}

function renderReportList() {
    const list = state.reportIndex[state.reportType] || [];
    const container = document.getElementById('reportListContent');

    if (list.length === 0) {
        container.innerHTML = '<div class="no-events">レポートがありません</div>';
        return;
    }

    container.innerHTML = list.map(entry => `
        <div class="report-list-item ${entry.period === state.currentPeriod ? 'active' : ''}"
             onclick="selectReport('${entry.period}')">
            <span>${entry.label}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted)">${entry.period}</span>
        </div>
    `).join('');
}

function selectReport(period) {
    closeReportList();
    loadReport(period);
}


// =============================================================================
// レポート描画
// =============================================================================
function renderReport(data) {
    const sections = data.sections;
    const period = data.period;

    // 期間ラベル
    updatePeriodLabel(period.label);

    // セクションタイトル
    document.getElementById('summaryTitle').textContent = sections.summary?.title || 'サマリー';

    // サマリーハイライト
    renderHighlights(sections.summary?.highlights || []);

    // AIコメント - サマリー
    renderAiComment('summaryAiText', sections.summary?.ai_comment);

    // 統計
    renderStatistics(sections.statistics || {});

    // グラフ
    renderDailyChart(data.chart_data?.daily_temps);

    // 前年比較
    const compSection = document.getElementById('comparisonSection');
    if (data.chart_data?.prev_year_comparison) {
        compSection.style.display = 'block';
        renderComparisonChart(data.chart_data.prev_year_comparison);
        renderAiComment('comparisonAiText', sections.comparison?.ai_comment);
    } else {
        compSection.style.display = 'none';
    }

    // ベースライン
    renderBaseline(sections.baseline || {});

    // イベント
    renderEvents(sections.events || {});

    // 季節
    renderMilestones(sections.season?.milestones || []);

    // 気温推移のAI分析
    const trendComment = document.getElementById('trendComment');
    if (trendComment) {
        trendComment.style.display = 'block';
        renderAiComment('trendAiText', sections.trend_analysis?.ai_comment || '');
    }

    // ヒートマップ
    renderHeatmap(sections.heatmap?.data || {});

    // フッター
    const genAt = data.generated_at ? new Date(data.generated_at).toLocaleString('ja-JP') : '--';
    document.getElementById('generatedAt').textContent = genAt;

    showContent();
}


// =============================================================================
// セクション描画関数
// =============================================================================

function renderAiComment(elementId, comment) {
    const el = document.getElementById(elementId);
    if (el) {
        const text = comment || 'AI分析はまだ生成されていません。';
        // XSSを防ぐためにHTMLエスケープ → 改行文字をHTMLの改行に変換
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // 段落区切り（空行）を <br><br> に、単純な改行を <br> に変換
        el.innerHTML = escaped
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
    }
}


function renderHighlights(highlights) {
    const container = document.getElementById('summaryHighlights');
    container.innerHTML = highlights
        .map(h => `<span class="highlight-chip">${h}</span>`)
        .join('');
}


function renderStatistics(stats) {
    // 数値を小数点第一位に統一するヘルパー
    const fmt = (v) => (v != null ? Number(v).toFixed(1) : null);

    const items = [];

    if (stats.avg_temp != null) {
        items.push({ label: '平均気温', value: fmt(stats.avg_temp), unit: '℃' });
    }
    if (stats.max_temp != null) {
        let sub = stats.max_temp_date ? `(${stats.max_temp_date})` : '';
        items.push({ label: '最高気温', value: fmt(stats.max_temp), unit: '℃', sub });
    }
    if (stats.min_temp != null) {
        let sub = stats.min_temp_date ? `(${stats.min_temp_date})` : '';
        items.push({ label: '最低気温', value: fmt(stats.min_temp), unit: '℃', sub });
    }
    if (stats.avg_daily_range != null) {
        items.push({ label: '平均日較差', value: fmt(stats.avg_daily_range), unit: '℃' });
    }
    if (stats.prev_week_diff != null) {
        const v = fmt(stats.prev_week_diff);
        const diffClass = stats.prev_week_diff > 0 ? 'stat-diff-positive' : 'stat-diff-negative';
        items.push({
            label: '前週比',
            value: (stats.prev_week_diff > 0 ? '+' : '') + v,
            unit: '℃',
            className: diffClass,
        });
    }
    if (stats.prev_month_diff != null) {
        const v = fmt(stats.prev_month_diff);
        const diffClass = stats.prev_month_diff > 0 ? 'stat-diff-positive' : 'stat-diff-negative';
        items.push({
            label: '前月比',
            value: (stats.prev_month_diff > 0 ? '+' : '') + v,
            unit: '℃',
            className: diffClass,
        });
    }
    if (stats.prev_year_diff != null) {
        const v = fmt(stats.prev_year_diff);
        const diffClass = stats.prev_year_diff > 0 ? 'stat-diff-positive' : 'stat-diff-negative';
        items.push({
            label: '前年比',
            value: (stats.prev_year_diff > 0 ? '+' : '') + v,
            unit: '℃',
            className: diffClass,
        });
    }
    // ※ データ日数（days）は週次・月次では自明なため表示しない

    const grid = document.getElementById('statsGrid');
    grid.innerHTML = items.map(item => `
        <div class="stat-item">
            <div class="stat-item-label">${item.label}</div>
            <div class="stat-item-value ${item.className || ''}">${item.value}<span class="stat-item-unit">${item.unit}</span></div>
            ${item.sub ? `<div class="stat-item-sub">${item.sub}</div>` : ''}
        </div>
    `).join('');
}


function renderBaseline(baseline) {
    const container = document.getElementById('baselineDisplay');
    const avg = baseline.baseline_avg;
    const deviation = baseline.current_deviation;

    if (avg == null || deviation == null) {
        container.innerHTML = '<div class="no-events">ベースラインデータなし</div>';
        return;
    }

    const isPositive = deviation > 0;
    const color = isPositive ? 'var(--accent-red)' : 'var(--accent-blue)';
    const position = Math.min(90, Math.max(10, 50 + deviation * 5));

    const yearsCount = baseline.years_count;
    const yearsLabel = yearsCount != null ? `${yearsCount}年平均` : '過去平均';

    // ベースラインセクションのタイトルを更新
    const titleEl = document.getElementById('baselineTitle');
    if (titleEl) titleEl.textContent = `📏 ${yearsLabel}との比較`;

    container.innerHTML = `
        <div style="flex:1;">
            <div class="baseline-bar">
                <div class="baseline-marker" style="left:50%; background: var(--text-muted);">基</div>
                <div class="baseline-marker" style="left:${position}%; background: ${color};">今</div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:16px; font-size:0.75rem; color:var(--text-muted);">
                <span>低い</span>
                <span>${yearsLabel} ${Number(avg).toFixed(1)}℃</span>
                <span>高い</span>
            </div>
        </div>
        <div class="baseline-label">
            <div class="baseline-value" style="color:${color}">${isPositive ? '+' : ''}${Number(deviation).toFixed(1)}℃</div>
            <div class="baseline-desc">平均からの偏差</div>
        </div>
    `;
}


function renderEvents(events) {
    const timeline = document.getElementById('eventsTimeline');
    const items = events.items || [];

    if (items.length === 0) {
        timeline.innerHTML = '<div class="no-events">この期間に特筆すべきイベントはありませんでした</div>';
    } else {
        timeline.innerHTML = items.map(e => `
            <div class="event-item">
                <div class="event-dot ${e.type}"></div>
                <div class="event-date">${e.date}</div>
                <div class="event-desc">${e.description}</div>
            </div>
        `).join('');
    }
}


function renderMilestones(milestones) {
    const container = document.getElementById('milestonesList');

    if (!milestones || milestones.length === 0) {
        container.innerHTML = '<div class="no-events">マイルストーンデータなし</div>';
        return;
    }

    container.innerHTML = milestones.map(m => {
        const years = Object.entries(m)
            .filter(([k]) => k !== 'label')
            .map(([year, dateVal]) => {
                const display = dateVal || '未到達';
                return `<span class="milestone-year"><strong>${year}:</strong> ${display}</span>`;
            })
            .join('');

        return `
            <div class="milestone-item">
                <div class="milestone-label">${m.label}</div>
                <div class="milestone-years">${years}</div>
            </div>
        `;
    }).join('');
}


function renderHeatmap(data) {
    const container = document.getElementById('heatmapContainer');
    const legend = document.getElementById('heatmapLegend');

    const years = Object.keys(data).sort();
    if (years.length === 0) {
        container.innerHTML = '<div class="no-events">ヒートマップデータなし</div>';
        legend.innerHTML = '';
        return;
    }

    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const cols = months.length + 1; // +1 for year label

    let html = `<div class="heatmap-grid" style="grid-template-columns: 60px repeat(${months.length}, 1fr);">`;

    // ヘッダー行
    html += '<div class="heatmap-label"></div>';
    months.forEach(m => {
        html += `<div class="heatmap-label">${m}</div>`;
    });

    // データ行
    years.forEach(year => {
        html += `<div class="heatmap-label">${year}</div>`;
        for (let m = 1; m <= 12; m++) {
            const val = data[year]?.[String(m)];
            if (val != null) {
                const bg = tempToColor(val);
                const textColor = val > 20 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
                html += `<div class="heatmap-cell" style="background:${bg}; color:${textColor};" title="${year}年${m}月: ${val}℃">${val}</div>`;
            } else {
                html += `<div class="heatmap-cell" style="background:rgba(128,128,128,0.1); color:var(--text-muted);">-</div>`;
            }
        }
    });

    html += '</div>';
    container.innerHTML = html;

    // 凡例
    const legendTemps = [-5, 0, 5, 10, 15, 20, 25, 30, 35];
    legend.innerHTML = '<span>低</span>' +
        legendTemps.map(t => `<div class="heatmap-legend-cell" style="background:${tempToColor(t)}" title="${t}℃"></div>`).join('') +
        '<span>高</span>';
}


function tempToColor(temp) {
    // 気温に応じた色を返す（寒色→暖色）
    if (temp <= -5) return 'hsl(240, 70%, 35%)';
    if (temp <= 0) return 'hsl(220, 70%, 45%)';
    if (temp <= 5) return 'hsl(200, 65%, 50%)';
    if (temp <= 10) return 'hsl(180, 55%, 50%)';
    if (temp <= 15) return 'hsl(120, 45%, 50%)';
    if (temp <= 20) return 'hsl(80, 55%, 50%)';
    if (temp <= 25) return 'hsl(50, 70%, 55%)';
    if (temp <= 30) return 'hsl(30, 80%, 55%)';
    if (temp <= 35) return 'hsl(15, 85%, 50%)';
    return 'hsl(0, 90%, 45%)';
}


// =============================================================================
// Chart.js グラフ
// =============================================================================

function getChartTextColor() {
    return document.documentElement.classList.contains('light-mode')
        ? '#334155'
        : '#94a3b8';
}

function getChartGridColor() {
    return document.documentElement.classList.contains('light-mode')
        ? 'rgba(0, 0, 0, 0.06)'
        : 'rgba(255, 255, 255, 0.06)';
}

function destroyChart(name) {
    if (state.charts[name]) {
        state.charts[name].destroy();
        state.charts[name] = null;
    }
}

function updateChartColors() {
    Object.values(state.charts).forEach(chart => {
        if (!chart) return;
        const textColor = getChartTextColor();
        const gridColor = getChartGridColor();

        Object.values(chart.options.scales || {}).forEach(scale => {
            if (scale.ticks) scale.ticks.color = textColor;
            if (scale.grid) scale.grid.color = gridColor;
        });
        if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        chart.update('none');
    });
}


function renderDailyChart(chartData) {
    if (!chartData) return;
    destroyChart('dailyTemp');

    const ctx = document.getElementById('dailyTempChart').getContext('2d');
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();

    state.charts.dailyTemp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: '最高',
                    data: chartData.highs,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: '+1',
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                },
                {
                    label: '最低',
                    data: chartData.lows,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                },
                {
                    label: '平均',
                    data: chartData.avgs,
                    borderColor: '#a855f7',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderWidth: 1.5,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    labels: { color: textColor, usePointStyle: true, padding: 16 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}℃`,
                    },
                },
            },
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: {
                    ticks: { color: textColor, callback: v => v + '℃' },
                    grid: { color: gridColor },
                },
            },
        },
    });
}


function renderComparisonChart(chartData) {
    if (!chartData) return;

    // チャートデータをstateに保存しておき、切り替え時に参照する
    state.comparisonChartData = chartData;
    state.comparisonMode = state.comparisonMode || 'avg';

    _buildComparisonChart(chartData, state.comparisonMode);
}

function _buildComparisonChart(chartData, mode) {
    destroyChart('comparison');

    const ctx = document.getElementById('comparisonChart').getContext('2d');
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();

    // モードに合わせてデータ系列を選択
    const modeConfig = {
        avg: { thisKey: 'this_year', lastKey: 'last_year', label: '平均気温', emoji: '📊', thisColor: '#8b5cf6', lastColor: '#64748b' },
        high: { thisKey: 'this_year_high', lastKey: 'last_year_high', label: '最高気温', emoji: '🌡️', thisColor: '#ef4444', lastColor: '#f87171' },
        low: { thisKey: 'this_year_low', lastKey: 'last_year_low', label: '最低気温', emoji: '❄️', thisColor: '#3b82f6', lastColor: '#93c5fd' },
    };
    const cfg = modeConfig[mode] || modeConfig['avg'];
    const thisYearData = chartData[cfg.thisKey] || chartData['this_year'];
    const lastYearData = chartData[cfg.lastKey] || chartData['last_year'];

    state.charts.comparison = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: `今年（${cfg.label}）`,
                    data: thisYearData,
                    borderColor: cfg.thisColor,
                    backgroundColor: cfg.thisColor + '1a',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                },
                {
                    label: `昨年（${cfg.label}）`,
                    data: lastYearData,
                    borderColor: cfg.lastColor,
                    backgroundColor: cfg.lastColor + '0d',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    labels: { color: textColor, usePointStyle: true, padding: 16 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) : '--'}℃`,
                    },
                },
            },
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: {
                    ticks: { color: textColor, callback: v => v + '℃' },
                    grid: { color: gridColor },
                },
            },
        },
    });
}

function switchComparisonMode(mode) {
    if (!state.comparisonChartData) return;

    state.comparisonMode = mode;

    // タイトルを更新
    const titleMap = { avg: '平均気温', high: '最高気温', low: '最低気温' };
    const titleEl = document.getElementById('comparisonTitle');
    if (titleEl) titleEl.textContent = `📆 前年比較（${titleMap[mode] || ''}）`;

    // アクティブボタンを切り替える
    document.querySelectorAll('#comparisonToggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // グラフを再描画
    _buildComparisonChart(state.comparisonChartData, mode);
}

