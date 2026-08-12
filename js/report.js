/**
 * Analysis report page
 * Loads completed report JSON files and renders evidence, comparisons and charts.
 */

const state = {
    reportType: 'weekly',
    currentPeriod: null,
    reportIndex: null,
    currentReport: null,
    charts: {},
    listOpen: false,
    heatmapData: {},
    heatmapMode: 'avg',
    comparisonMode: 'avg',
    comparisonChartData: null,
    deviationChartData: null,
};

function loadChartLibrary() {
    if (typeof Chart !== 'undefined' || document.querySelector('script[data-chart-loader]')) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.async = true;
    script.dataset.chartLoader = 'true';
    script.onload = () => {
        window.chartJsLoaded = true;
        window.dispatchEvent(new Event('chartjs-ready'));
    };
    script.onerror = () => {
        window.chartJsLoaded = false;
        console.warn('Chart.jsを読み込めなかったため、グラフ以外のレポートを表示します。');
    };
    document.head.appendChild(script);
}


async function initializeReport() {
    syncThemeIcon();
    await loadReportIndex();
    loadLatestReport();
    loadChartLibrary();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeReport, { once: true });
} else {
    initializeReport();
}

window.addEventListener('chartjs-ready', () => {
    if (!state.currentReport || typeof Chart === 'undefined') return;
    renderDailyChart(state.currentReport.chart_data?.daily_temps);
    if (state.comparisonMode === 'deviation') {
        _buildDeviationChart(state.currentReport.chart_data?.deviation);
    } else if (state.currentReport.chart_data?.prev_year_comparison) {
        _buildComparisonChart(
            state.currentReport.chart_data.prev_year_comparison,
            state.comparisonMode,
        );
    }
});


// =============================================================================
// Theme
// =============================================================================

function syncThemeIcon() {
    const use = document.getElementById('themeIconUse');
    if (!use) return;
    const isLight = document.documentElement.classList.contains('light-mode');
    use.setAttribute('href', isLight ? '#icon-moon' : '#icon-sun');
}

function toggleReportTheme() {
    document.documentElement.classList.toggle('light-mode');
    const isLight = document.documentElement.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    syncThemeIcon();
    updateChartColors();
}


// =============================================================================
// Data loading and completed-period guard
// =============================================================================

async function loadReportIndex() {
    try {
        const response = await fetch('reports/index.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.reportIndex = await response.json();
    } catch (error) {
        console.warn('Report index load failed:', error);
        state.reportIndex = { weekly: [], monthly: [] };
    }
}

function getCurrentIsoWeekKey(now = new Date()) {
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = target.getDay() || 7;
    target.setDate(target.getDate() + 4 - day);
    const year = target.getFullYear();
    const first = new Date(year, 0, 1);
    const week = Math.ceil((((target - first) / 86400000) + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function getCurrentMonthKey(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isClosedIndexEntry(entry, type, now = new Date()) {
    if (!entry || !entry.period) return false;
    // 新形式のindexでは生成側が終了判定済み。ブラウザ時計には依存させない。
    if (typeof entry.is_final === 'boolean') return entry.is_final;
    // 旧indexとの後方互換: is_finalがない場合のみ現在期間キーで判定する。
    const currentKey = type === 'monthly' ? getCurrentMonthKey(now) : getCurrentIsoWeekKey(now);
    return entry.period < currentKey;
}

function getAvailableReports(type = state.reportType) {
    const list = state.reportIndex?.[type] || [];
    return list.filter(entry => isClosedIndexEntry(entry, type));
}

function loadLatestReport() {
    const list = getAvailableReports();
    if (!list.length) {
        showError('終了済み期間のレポートはまだありません。');
        return;
    }
    // 最新期間に欠測がある場合は、最も新しい観測充足済みレポートを初期表示する。
    const latestComplete = list.find(entry => entry.coverage_complete !== false) || list[0];
    loadReport(latestComplete.period);
}

async function loadReport(period) {
    showLoading();
    state.currentPeriod = period;
    const entry = getAvailableReports().find(item => item.period === period);
    if (!entry) {
        showError(`期間 ${period} は未終了、または公開対象外です。`);
        return;
    }

    try {
        const response = await fetch(`reports/${entry.file}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.currentReport = await response.json();
        renderReport(state.currentReport, entry);
    } catch (error) {
        console.error('Report load error:', error);
        showError(`レポートの読み込みに失敗しました（${error.message}）。`);
    }
}


// =============================================================================
// UI state and navigation
// =============================================================================

function showLoading() {
    document.getElementById('reportLoading').hidden = false;
    document.getElementById('reportError').hidden = true;
    document.getElementById('reportContent').hidden = true;
}

function showError(message) {
    document.getElementById('reportLoading').hidden = true;
    document.getElementById('reportError').hidden = false;
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('reportContent').hidden = true;
    updatePeriodLabel('--');
    document.getElementById('heroPeriod').textContent = 'レポートを表示できません';
    document.getElementById('reportMeta').replaceChildren();
}

function showContent() {
    document.getElementById('reportLoading').hidden = true;
    document.getElementById('reportError').hidden = true;
    document.getElementById('reportContent').hidden = false;
}

function switchReportType(type) {
    if (!['weekly', 'monthly'].includes(type)) return;
    state.reportType = type;
    document.querySelectorAll('.report-tab').forEach(tab => {
        const active = tab.dataset.type === type;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    });
    closeReportList();
    loadLatestReport();
}

function navigateReport(direction) {
    const list = getAvailableReports();
    const currentIndex = list.findIndex(entry => entry.period === state.currentPeriod);
    if (currentIndex < 0) return;
    // 降順: 古い期間は index + 1、新しい期間は index - 1
    const nextIndex = currentIndex - direction;
    if (nextIndex >= 0 && nextIndex < list.length) loadReport(list[nextIndex].period);
}

function updatePeriodLabel(label) {
    document.getElementById('periodLabel').textContent = label;
    updateNavButtons();
}

function updateNavButtons() {
    const list = getAvailableReports();
    const index = list.findIndex(entry => entry.period === state.currentPeriod);
    document.getElementById('nextBtn').disabled = index <= 0;
    document.getElementById('prevBtn').disabled = index < 0 || index >= list.length - 1;
}

function toggleReportList() {
    state.listOpen = !state.listOpen;
    const dropdown = document.getElementById('reportListDropdown');
    const button = document.getElementById('historyBtn');
    dropdown.hidden = !state.listOpen;
    button.setAttribute('aria-expanded', String(state.listOpen));
    if (state.listOpen) renderReportList();
}

function closeReportList() {
    state.listOpen = false;
    document.getElementById('reportListDropdown').hidden = true;
    document.getElementById('historyBtn').setAttribute('aria-expanded', 'false');
}

function renderReportList() {
    const list = getAvailableReports();
    const container = document.getElementById('reportListContent');
    container.replaceChildren();
    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'no-events';
        empty.textContent = '終了済み期間のレポートはありません';
        container.appendChild(empty);
        return;
    }

    list.forEach(entry => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `report-list-item${entry.period === state.currentPeriod ? ' active' : ''}`;
        button.addEventListener('click', () => {
            closeReportList();
            loadReport(entry.period);
        });
        const label = document.createElement('span');
        label.textContent = entry.label;
        const key = document.createElement('small');
        key.textContent = entry.period;
        button.append(label, key);
        container.appendChild(button);
    });
}


// =============================================================================
// Report overview and provenance
// =============================================================================

function expectedDays(data) {
    const start = new Date(`${data.period?.start_date}T00:00:00`);
    const end = new Date(`${data.period?.end_date}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
    return Math.round((end - start) / 86400000) + 1;
}

function getReportCompleteness(data, entry = {}) {
    const observed = Number(data.analysis_meta?.observed_days ?? entry.observed_days ?? data.sections?.statistics?.days ?? 0);
    const expected = Number(data.analysis_meta?.expected_days ?? entry.expected_days ?? expectedDays(data));
    const periodClosed = data.analysis_meta?.period_closed ?? entry.is_final ?? true;
    return {
        observed,
        expected,
        periodClosed: Boolean(periodClosed),
        coverageComplete: observed >= expected && expected > 0,
    };
}

function analysisSourceLabel(meta = {}) {
    if (meta.source === 'codex') return 'Codex再分析';
    if (meta.source === 'gemini') return meta.model || 'Gemini分析';
    if (meta.source === 'local') return 'ローカル分析';
    if (meta.source === 'pending') return '分析待ち';
    return '旧形式の分析';
}

function makeIcon(iconId) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${iconId}`);
    svg.appendChild(use);
    return svg;
}

function appendMetaChip(container, iconId, text, className = '') {
    const chip = document.createElement('span');
    chip.className = `meta-chip ${className}`.trim();
    chip.append(makeIcon(iconId), document.createTextNode(text));
    container.appendChild(chip);
}

function renderOverview(data, entry) {
    const period = data.period || {};
    const completeness = getReportCompleteness(data, entry);
    const meta = data.analysis_meta || {};
    document.getElementById('heroPeriod').textContent = period.label || entry.period;
    document.getElementById('heroDescription').textContent = data.type === 'monthly'
        ? '1か月の観測を確定後に集計し、前月・前年・過去同時期と比較します。'
        : '終了した1週間の観測を集計し、日々の変化と過去比較を読み解きます。';

    const metaContainer = document.getElementById('reportMeta');
    metaContainer.replaceChildren();
    appendMetaChip(
        metaContainer,
        completeness.periodClosed ? 'icon-calendar' : 'icon-warning',
        completeness.periodClosed ? '確定期間' : '暫定期間',
        completeness.periodClosed ? 'is-final' : 'is-warning',
    );
    appendMetaChip(
        metaContainer,
        completeness.coverageComplete ? 'icon-database' : 'icon-warning',
        `観測 ${completeness.observed}/${completeness.expected}日`,
        completeness.coverageComplete ? '' : 'is-warning',
    );
    appendMetaChip(metaContainer, 'icon-analysis', analysisSourceLabel(meta));

    const provenance = document.getElementById('analysisProvenance');
    provenance.replaceChildren(makeIcon('icon-database'), document.createTextNode(`分析元 ${analysisSourceLabel(meta)}`));
}


// =============================================================================
// Report rendering
// =============================================================================

function renderReport(data, entry) {
    const sections = data.sections || {};
    updatePeriodLabel(data.period?.label || entry.period);
    renderOverview(data, entry);
    document.getElementById('summaryTitle').textContent = sections.summary?.title || 'サマリー';

    renderHighlights(sections.summary?.highlights || []);
    renderAiComment('summaryAiText', sections.summary?.ai_comment, data.analysis_meta);
    renderStatistics(sections.statistics || {});
    renderDailyChart(data.chart_data?.daily_temps);

    const comparisonSection = document.getElementById('comparisonSection');
    if (data.chart_data?.prev_year_comparison) {
        comparisonSection.hidden = false;
        state.deviationChartData = data.chart_data.deviation || null;
        renderComparisonChart(data.chart_data.prev_year_comparison);
        renderAiComment('comparisonAiText', sections.comparison?.ai_comment, data.analysis_meta);
    } else {
        comparisonSection.hidden = true;
    }

    renderBaseline(sections.baseline || {});
    renderEvents(sections.events || {});
    renderMilestones(sections.season?.milestones || []);
    renderAiComment('trendAiText', sections.trend_analysis?.ai_comment, data.analysis_meta);
    renderHeatmap(sections.heatmap?.data || {});

    const generated = data.generated_at ? new Date(data.generated_at) : null;
    document.getElementById('generatedAt').textContent = generated && Number.isFinite(generated.getTime())
        ? generated.toLocaleString('ja-JP')
        : '--';
    showContent();
}

function renderAiComment(elementId, comment, meta = {}) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const text = String(comment || '').trim();
    element.textContent = text || 'この期間の分析コメントはまだ生成されていません。';
    const card = element.closest('.analysis-card');
    const badge = card?.querySelector('[data-analysis-badge]');
    if (badge) badge.textContent = analysisSourceLabel(meta);
}

function renderHighlights(highlights) {
    const container = document.getElementById('summaryHighlights');
    container.replaceChildren();
    highlights.forEach(value => {
        const chip = document.createElement('span');
        chip.className = 'highlight-chip';
        chip.textContent = String(value);
        container.appendChild(chip);
    });
}

function renderStatistics(stats) {
    const format = value => value != null ? Number(value).toFixed(1) : null;
    const items = [];
    if (stats.avg_temp != null) items.push({ label: '平均気温', value: format(stats.avg_temp), unit: '℃' });
    if (stats.max_temp != null) items.push({ label: '最高気温', value: format(stats.max_temp), unit: '℃', sub: stats.max_temp_date || '' });
    if (stats.min_temp != null) items.push({ label: '最低気温', value: format(stats.min_temp), unit: '℃', sub: stats.min_temp_date || '' });
    if (stats.avg_daily_range != null) items.push({ label: '平均日較差', value: format(stats.avg_daily_range), unit: '℃' });

    [
        ['prev_week_diff', '前週比'],
        ['prev_month_diff', '前月比'],
        ['prev_year_diff', '前年比'],
    ].forEach(([key, label]) => {
        if (stats[key] == null) return;
        const value = Number(stats[key]);
        items.push({
            label,
            value: `${value > 0 ? '+' : ''}${value.toFixed(1)}`,
            unit: '℃',
            className: value > 0 ? 'stat-diff-positive' : value < 0 ? 'stat-diff-negative' : '',
        });
    });

    const grid = document.getElementById('statsGrid');
    grid.replaceChildren();
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'stat-item';
        const label = document.createElement('div');
        label.className = 'stat-item-label';
        label.textContent = item.label;
        const value = document.createElement('div');
        value.className = `stat-item-value ${item.className || ''}`.trim();
        value.append(document.createTextNode(item.value));
        const unit = document.createElement('span');
        unit.className = 'stat-item-unit';
        unit.textContent = item.unit;
        value.appendChild(unit);
        card.append(label, value);
        if (item.sub) {
            const sub = document.createElement('div');
            sub.className = 'stat-item-sub';
            sub.textContent = item.sub;
            card.appendChild(sub);
        }
        grid.appendChild(card);
    });
}

function renderBaseline(baseline) {
    const container = document.getElementById('baselineDisplay');
    container.replaceChildren();
    const average = Number(baseline.baseline_avg);
    const deviation = Number(baseline.current_deviation);
    if (!Number.isFinite(average) || !Number.isFinite(deviation)) {
        const empty = document.createElement('div');
        empty.className = 'no-events';
        empty.textContent = '比較可能な過去同時期データがありません';
        container.appendChild(empty);
        return;
    }

    const years = baseline.years_count;
    const yearsLabel = years ? `${years}年平均` : '過去平均';
    document.getElementById('baselineTitle').textContent = `${yearsLabel}との比較`;
    const position = Math.min(90, Math.max(10, 50 + deviation * (40 / 3)));
    const color = deviation > 0 ? 'var(--ui-accent)' : 'var(--ui-blue)';

    const bar = document.createElement('div');
    bar.className = 'baseline-bar';
    const baseMarker = document.createElement('div');
    baseMarker.className = 'baseline-marker baseline-marker--base';
    baseMarker.style.left = '50%';
    baseMarker.textContent = '基';
    const nowMarker = document.createElement('div');
    nowMarker.className = 'baseline-marker baseline-marker--now';
    nowMarker.style.left = `${position}%`;
    nowMarker.style.background = color;
    nowMarker.textContent = '今';
    const chip = document.createElement('span');
    chip.className = 'baseline-chip';
    chip.style.color = color;
    chip.textContent = `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}℃`;
    nowMarker.appendChild(chip);
    bar.append(baseMarker, nowMarker);

    const axis = document.createElement('div');
    axis.className = 'baseline-axis';
    ['低い', `${yearsLabel} ${average.toFixed(1)}℃`, '高い'].forEach(text => {
        const span = document.createElement('span');
        span.textContent = text;
        axis.appendChild(span);
    });
    container.append(bar, axis);
}

function renderEvents(events) {
    const timeline = document.getElementById('eventsTimeline');
    timeline.replaceChildren();
    const items = Array.isArray(events.items) ? events.items : [];
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'no-events';
        empty.textContent = 'この期間に基準を超える特筆イベントはありませんでした';
        timeline.appendChild(empty);
        return;
    }

    items.forEach(event => {
        const item = document.createElement('div');
        item.className = 'event-item';
        const dot = document.createElement('span');
        dot.className = `event-dot ${String(event.type || '')}`.trim();
        const dateElement = document.createElement('span');
        dateElement.className = 'event-date';
        dateElement.textContent = String(event.date || '');
        const description = document.createElement('span');
        description.className = 'event-desc';
        description.textContent = String(event.description || '');
        item.append(dot, dateElement, description);
        timeline.appendChild(item);
    });
}

function renderMilestones(milestones) {
    const container = document.getElementById('milestonesList');
    container.replaceChildren();
    if (!Array.isArray(milestones) || !milestones.length) {
        const empty = document.createElement('div');
        empty.className = 'no-events';
        empty.textContent = '季節マイルストーンの比較データがありません';
        container.appendChild(empty);
        return;
    }

    milestones.forEach(milestone => {
        const item = document.createElement('div');
        item.className = 'milestone-item';
        const label = document.createElement('div');
        label.className = 'milestone-label';
        label.textContent = String(milestone.label || '');
        const years = document.createElement('div');
        years.className = 'milestone-years';
        Object.entries(milestone).filter(([key]) => key !== 'label').forEach(([year, value]) => {
            const chip = document.createElement('span');
            chip.className = 'milestone-year';
            const strong = document.createElement('strong');
            strong.textContent = `${year}: `;
            chip.append(strong, document.createTextNode(String(value || '未到達')));
            years.appendChild(chip);
        });
        item.append(label, years);
        container.appendChild(item);
    });
}


// =============================================================================
// Heatmap
// =============================================================================

function renderHeatmap(data) {
    state.heatmapData = data || {};
    _buildHeatmap(state.heatmapData, state.heatmapMode);
}

function switchHeatmapMode(mode) {
    state.heatmapMode = ['avg', 'high', 'low'].includes(mode) ? mode : 'avg';
    document.querySelectorAll('#heatmapToggle .toggle-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === state.heatmapMode);
    });
    _buildHeatmap(state.heatmapData, state.heatmapMode);
}

function interpolateColor(start, end, ratio) {
    const values = start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
    return `rgb(${values.join(',')})`;
}

function tempToColor(temperature) {
    const value = Math.max(-5, Math.min(38, Number(temperature)));
    const cool = [58, 117, 197];
    const neutral = [82, 96, 118];
    const warm = [230, 107, 61];
    if (value <= 17) return interpolateColor(cool, neutral, (value + 5) / 22);
    return interpolateColor(neutral, warm, (value - 17) / 21);
}

function heatmapTextColor(temperature) {
    return Number(temperature) > 28 ? '#231710' : '#f8fafc';
}

function _buildHeatmap(data, mode) {
    const container = document.getElementById('heatmapContainer');
    const legend = document.getElementById('heatmapLegend');
    container.replaceChildren();
    legend.replaceChildren();
    const years = Object.keys(data || {}).sort();
    if (!years.length) {
        const empty = document.createElement('div');
        empty.className = 'no-events';
        empty.textContent = 'ヒートマップデータがありません';
        container.appendChild(empty);
        return;
    }

    const months = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
    const labels = { avg: '平均', high: '最高', low: '最低' };
    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';
    grid.style.gridTemplateColumns = '60px repeat(12, 1fr)';
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'heatmap-label' }));
    months.forEach(month => {
        const cell = document.createElement('div');
        cell.className = 'heatmap-label';
        cell.textContent = month;
        grid.appendChild(cell);
    });

    years.forEach(year => {
        const yearLabel = document.createElement('div');
        yearLabel.className = 'heatmap-label';
        yearLabel.textContent = year;
        grid.appendChild(yearLabel);
        for (let month = 1; month <= 12; month += 1) {
            const source = data[year]?.[String(month)];
            const value = source == null ? null : typeof source === 'object' ? source[mode] : source;
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            if (value == null) {
                cell.style.background = 'var(--ui-surface-soft)';
                cell.style.color = 'var(--ui-text-muted)';
                cell.textContent = '—';
            } else {
                cell.style.background = tempToColor(value);
                cell.style.color = heatmapTextColor(value);
                cell.textContent = Number(value).toFixed(1);
                cell.title = `${year}年${month}月（${labels[mode]}）: ${Number(value).toFixed(1)}℃`;
            }
            grid.appendChild(cell);
        }
    });
    container.appendChild(grid);

    const low = document.createElement('span');
    low.textContent = '低温';
    const bar = document.createElement('div');
    bar.className = 'heatmap-legend-bar';
    const high = document.createElement('span');
    high.textContent = '高温';
    legend.append(low, bar, high);
}


// =============================================================================
// Chart.js
// =============================================================================

function getChartTextColor() {
    return document.documentElement.classList.contains('light-mode') ? '#506078' : '#a9b4c6';
}

function getChartGridColor() {
    return document.documentElement.classList.contains('light-mode')
        ? 'rgba(30, 41, 59, 0.08)'
        : 'rgba(203, 213, 225, 0.08)';
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
            if (scale.border) scale.border.color = gridColor;
        });
        if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = textColor;
        chart.update('none');
    });
}

function sharedChartOptions() {
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: { color: textColor, usePointStyle: true, boxWidth: 7, padding: 15, font: { size: 11 } },
            },
            tooltip: {
                backgroundColor: 'rgba(5, 11, 20, 0.94)',
                titleColor: '#f5f7fb',
                bodyColor: '#dbe3ee',
                borderColor: 'rgba(203, 213, 225, 0.14)',
                borderWidth: 1,
                padding: 11,
            },
        },
        scales: {
            x: {
                ticks: { color: textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } },
                grid: { display: false },
                border: { color: gridColor },
            },
            y: {
                grace: '8%',
                ticks: { color: textColor, callback: value => `${value}℃`, font: { size: 10 } },
                grid: { color: gridColor },
                border: { display: false },
            },
        },
    };
}

function renderDailyChart(chartData) {
    destroyChart('dailyTemp');
    if (!chartData || typeof Chart === 'undefined') return;
    const labels = chartData.labels || [];
    const pointRadius = labels.length > 14 ? 2 : 3.5;
    const options = sharedChartOptions();
    options.plugins.tooltip.callbacks = {
        label: context => `${context.dataset.label}: ${context.parsed.y != null ? context.parsed.y.toFixed(1) : '--'}℃`,
    };
    state.charts.dailyTemp = new Chart(document.getElementById('dailyTempChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '最高',
                    data: chartData.highs,
                    borderColor: '#e66b3d',
                    backgroundColor: 'rgba(230, 107, 61, 0.08)',
                    fill: '+1',
                    tension: 0.32,
                    pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
                {
                    label: '最低',
                    data: chartData.lows,
                    borderColor: '#3a75c5',
                    backgroundColor: 'rgba(58, 117, 197, 0.07)',
                    fill: false,
                    tension: 0.32,
                    pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
                {
                    label: '平均',
                    data: chartData.avgs,
                    borderColor: '#8391a7',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.32,
                    pointRadius: labels.length > 14 ? 1 : 2.5,
                    pointHoverRadius: 4,
                    borderWidth: 1.6,
                },
            ],
        },
        options,
    });
}

function renderComparisonChart(chartData) {
    if (!chartData) return;
    state.comparisonChartData = chartData;
    _buildComparisonChart(chartData, state.comparisonMode);
}

function _buildComparisonChart(chartData, mode) {
    destroyChart('comparison');
    if (typeof Chart === 'undefined') return;
    const configs = {
        avg: { current: 'this_year', previous: 'last_year', label: '平均気温' },
        high: { current: 'this_year_high', previous: 'last_year_high', label: '最高気温' },
        low: { current: 'this_year_low', previous: 'last_year_low', label: '最低気温' },
    };
    const config = configs[mode] || configs.avg;
    const labels = chartData.labels || [];
    const pointRadius = labels.length > 14 ? 2 : 3;
    const options = sharedChartOptions();
    options.plugins.tooltip.callbacks = {
        label: context => `${context.dataset.label}: ${context.parsed.y != null ? context.parsed.y.toFixed(1) : '--'}℃`,
    };
    state.charts.comparison = new Chart(document.getElementById('comparisonChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `今年 ${config.label}`,
                    data: chartData[config.current] || chartData.this_year,
                    borderColor: '#e66b3d',
                    backgroundColor: 'rgba(230, 107, 61, 0.08)',
                    fill: false,
                    tension: 0.3,
                    pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2.3,
                },
                {
                    label: `前年 ${config.label}`,
                    data: chartData[config.previous] || chartData.last_year,
                    borderColor: '#6aa9ff',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.3,
                    pointRadius: Math.max(1, pointRadius - 1),
                    pointHoverRadius: 5,
                    borderWidth: 1.7,
                    borderDash: [6, 5],
                },
            ],
        },
        options,
    });
}

function switchComparisonMode(mode) {
    if (!state.comparisonChartData) return;
    state.comparisonMode = mode;
    const titles = { avg: '平均気温', high: '最高気温', low: '最低気温', deviation: '過去平均との差' };
    document.getElementById('comparisonTitle').textContent = `前年比較 — ${titles[mode] || ''}`;
    document.querySelectorAll('#comparisonToggle .toggle-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === mode);
    });
    const comparison = document.getElementById('comparisonChartWrapper');
    const deviation = document.getElementById('deviationChartWrapper');
    if (mode === 'deviation') {
        comparison.hidden = true;
        deviation.hidden = false;
        _buildDeviationChart(state.deviationChartData);
    } else {
        comparison.hidden = false;
        deviation.hidden = true;
        _buildComparisonChart(state.comparisonChartData, mode);
    }
}

function _buildDeviationChart(data) {
    destroyChart('deviation');
    if (!data?.deviations || typeof Chart === 'undefined') return;
    const options = sharedChartOptions();
    options.plugins.tooltip.callbacks = {
        label: context => `偏差: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(1)}℃`,
    };
    options.scales.y.ticks.callback = value => `${value >= 0 ? '+' : ''}${value}℃`;
    options.scales.y.grid = {
        color: context => context.tick.value === 0 ? getChartTextColor() : getChartGridColor(),
        lineWidth: context => context.tick.value === 0 ? 1.5 : 1,
    };
    state.charts.deviation = new Chart(document.getElementById('deviationChart'), {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: `過去平均 ${data.baseline_avg}℃からの偏差`,
                data: data.deviations,
                backgroundColor: data.deviations.map(value => value == null ? 'transparent' : value >= 0 ? 'rgba(230, 107, 61, 0.72)' : 'rgba(58, 117, 197, 0.72)'),
                borderColor: data.deviations.map(value => value == null ? 'transparent' : value >= 0 ? '#e66b3d' : '#3a75c5'),
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options,
    });
}
