/**
 * Analysis report page
 * Loads completed reports plus the current weekly draft. Drafts show observed
 * values and charts, while narrative analysis stays hidden until the week closes.
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
    setupThemeSync();
    setupReportTablistKeyboard();
    setupHistoryDropdownDismiss();
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
// Theme & Accessible Controls
// =============================================================================

function isLightThemeActive() {
    return Boolean(typeof document !== 'undefined' && document.documentElement?.classList?.contains('light-mode'));
}

function syncThemeMetadata(isLight) {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (schemeMeta) schemeMeta.setAttribute('content', isLight ? 'light' : 'dark');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', isLight ? '#edf1f5' : '#08111f');
}

function syncThemeIcon() {
    const isLight = isLightThemeActive();
    syncThemeMetadata(isLight);
    if (typeof document === 'undefined') return;
    const use = document.getElementById?.('themeIconUse');
    if (use) use.setAttribute('href', isLight ? '#icon-moon' : '#icon-sun');
    const toggleBtn = document.querySelector?.('.report-theme-toggle');
    if (toggleBtn) {
        const label = isLight ? 'ダークモードに切り替え' : 'ライトモードに切り替え';
        toggleBtn.setAttribute('aria-label', label);
        toggleBtn.setAttribute('title', label);
    }
}

function toggleReportTheme() {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!root?.classList) return;
    root.classList.toggle('light-mode');
    const isLight = root.classList.contains('light-mode');
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        }
    } catch { /* ignore storage access restrictions */ }
    syncThemeIcon();
    updateChartColors();
}

function setupThemeSync() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('storage', event => {
        if (event?.key !== 'theme') return;
        const isLight = event.newValue === 'light';
        document.documentElement?.classList?.toggle('light-mode', isLight);
        syncThemeIcon();
        updateChartColors();
    });
}

function syncReportTabAttributes(activeType) {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('.report-tab').forEach(tab => {
        const active = tab.dataset?.type === activeType;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.setAttribute('tabindex', active ? '0' : '-1');
    });
}

function setupReportTablistKeyboard() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const tablist = document.querySelector('.report-tabs[role="tablist"]');
    if (!tablist || typeof tablist.addEventListener !== 'function') return;
    syncReportTabAttributes(state.reportType);
    tablist.addEventListener('keydown', event => {
        const tabs = Array.from(tablist.querySelectorAll?.('.report-tab') || []);
        const current = event.target?.closest?.('.report-tab');
        const index = tabs.indexOf(current);
        if (index < 0 || !tabs.length) return;
        const nextByKey = {
            ArrowRight: (index + 1) % tabs.length,
            ArrowLeft: (index - 1 + tabs.length) % tabs.length,
            Home: 0,
            End: tabs.length - 1,
        };
        if (!(event.key in nextByKey)) return;
        event.preventDefault();
        const nextTab = tabs[nextByKey[event.key]];
        nextTab?.focus?.();
        const nextType = nextTab?.dataset?.type;
        if (nextType && nextType !== state.reportType) {
            switchReportType(nextType);
        }
    });
}

function setupHistoryDropdownDismiss() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('click', event => {
        if (!state.listOpen) return;
        const dropdown = document.getElementById?.('reportListDropdown');
        const button = document.getElementById?.('historyBtn');
        const target = event.target;
        if (dropdown?.contains?.(target) || button?.contains?.(target)) return;
        closeReportList({ restoreFocus: false });
    });
    document.addEventListener('keydown', event => {
        if (!state.listOpen || event.key !== 'Escape') return;
        event.preventDefault();
        closeReportList({ restoreFocus: true });
    });
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
    if (typeof entry.is_final === 'boolean') {
        return entry.is_final || (type === 'weekly' && entry.status === 'draft');
    }
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
    // 初期表示は文章分析まで確定した最新期間。今週の暫定値は次矢印・履歴一覧から開く。
    const latestComplete = list.find(entry => (
        entry.is_final !== false
        && entry.analysis_available !== false
        && entry.coverage_complete !== false
    )) || list.find(entry => entry.is_final !== false) || list[0];
    loadReport(latestComplete.period);
}

async function loadReport(period) {
    showLoading();
    state.currentPeriod = period;
    const entry = getAvailableReports().find(item => item.period === period);
    if (!entry) {
        showError(`期間 ${period} は公開対象外です。`);
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
    syncReportTabAttributes(type);
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
    const dropdown = document.getElementById?.('reportListDropdown');
    const button = document.getElementById?.('historyBtn');
    if (dropdown) dropdown.hidden = !state.listOpen;
    if (button) button.setAttribute('aria-expanded', String(state.listOpen));
    if (state.listOpen) {
        renderReportList();
        const focusTarget = dropdown?.querySelector?.('.report-list-item.active, .report-list-item');
        focusTarget?.focus?.();
    }
}

function closeReportList({ restoreFocus = false } = {}) {
    const wasOpen = state.listOpen;
    state.listOpen = false;
    const dropdown = document.getElementById?.('reportListDropdown');
    const button = document.getElementById?.('historyBtn');
    if (dropdown) dropdown.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
    if (wasOpen && restoreFocus) button?.focus?.();
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
            closeReportList({ restoreFocus: true });
            loadReport(entry.period);
        });
        const label = document.createElement('span');
        label.textContent = entry.label;
        const key = document.createElement('small');
        key.textContent = entry.is_final === false
            ? `${entry.period} · 暫定 ${entry.observed_days}/${entry.expected_days}日`
            : entry.period;
        if (entry.is_final === false) button.classList.add('is-draft');
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
    if (meta.source === 'codex' || meta.source === 'local') return '観測データ分析';
    if (meta.source === 'gemini') return 'AI補助分析';
    if (meta.source === 'draft') return '分析は週終了後';
    if (meta.source === 'pending') return '分析待ち';
    return '旧形式の分析';
}

function makeIcon(iconId) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
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
    document.getElementById('heroDescription').textContent = !completeness.periodClosed
        ? '今週ここまでの観測値です。統計とグラフは更新し、文章分析は週の終了後に確定します。'
        : data.type === 'monthly'
            ? '1か月の観測を確定後に集計し、前月・前年・過去同時期と比較します。'
            : '終了した1週間の観測を集計し、日々の変化と複数の比較軸から読み解きます。';

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
    appendMetaChip(metaContainer, meta.source === 'draft' ? 'icon-clock' : 'icon-analysis', analysisSourceLabel(meta));

    const provenance = document.getElementById('analysisProvenance');
    provenance.replaceChildren(
        makeIcon(meta.source === 'draft' ? 'icon-clock' : 'icon-database'),
        document.createTextNode(meta.source === 'draft' ? '文章分析は期間確定後' : `分析方式 ${analysisSourceLabel(meta)}`),
    );
}


// =============================================================================
// Report rendering
// =============================================================================

function renderReport(data, entry) {
    const sections = data.sections || {};
    updatePeriodLabel(data.period?.label || entry.period);
    renderOverview(data, entry);
    const analysisAvailable = data.analysis_meta?.analysis_available !== false;
    document.getElementById('summaryTitle').textContent = analysisAvailable
        ? sections.summary?.title || 'サマリー'
        : '今週の途中経過';

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
    const card = element.closest('.analysis-card');
    const analysisAvailable = meta.analysis_available !== false && meta.source !== 'draft';
    if (card) card.hidden = !analysisAvailable;
    if (!analysisAvailable) {
        element.textContent = '';
        return;
    }
    element.textContent = text || '比較に必要な分析データを確認中です。';
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
    document.querySelectorAll?.('#heatmapToggle .toggle-btn')?.forEach(button => {
        const active = button.dataset.mode === state.heatmapMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    _buildHeatmap(state.heatmapData, state.heatmapMode);
}

function interpolateRgb(start, end, ratio) {
    return start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
}

function tempToRgb(temperature) {
    const value = Math.max(-5, Math.min(38, Number(temperature)));
    const cool = [54, 110, 190];
    const neutral = [82, 96, 118];
    const warm = [230, 107, 61];
    if (value <= 17) return interpolateRgb(cool, neutral, (value + 5) / 22);
    return interpolateRgb(neutral, warm, (value - 17) / 21);
}

function relativeLuminance(rgb) {
    const [r, g, b] = rgb.map(channel => {
        const srgb = channel / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function tempToColor(temperature) {
    return `rgb(${tempToRgb(temperature).join(',')})`;
}

function heatmapTextColor(temperature) {
    return relativeLuminance(tempToRgb(temperature)) > 0.185 ? '#050a14' : '#ffffff';
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

function getChartColors() {
    const isLight = isLightThemeActive();
    return {
        isLight,
        text: isLight ? '#4b5a72' : '#c0cad9',
        grid: isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(203, 213, 225, 0.12)',
        zeroLine: isLight ? '#334155' : '#94a3b8',
        tooltipBg: isLight ? 'rgba(255, 255, 255, 0.97)' : 'rgba(7, 15, 29, 0.95)',
        tooltipTitle: isLight ? '#0f172a' : '#f5f7fb',
        tooltipBody: isLight ? '#334155' : '#dce5f2',
        tooltipBorder: isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(203, 213, 225, 0.18)',
        high: isLight ? '#c84b1e' : '#ff8c66',
        highFill: isLight ? 'rgba(200, 75, 30, 0.10)' : 'rgba(255, 140, 102, 0.12)',
        low: isLight ? '#2563eb' : '#6aa9ff',
        lowFill: isLight ? 'rgba(37, 99, 235, 0.08)' : 'rgba(106, 169, 255, 0.09)',
        avg: isLight ? '#64748b' : '#9aa8bd',
        prevYear: isLight ? '#1d4ed8' : '#7cb8ff',
        devPosBg: isLight ? 'rgba(200, 75, 30, 0.78)' : 'rgba(255, 134, 92, 0.78)',
        devPosBorder: isLight ? '#b8421e' : '#ff9873',
        devNegBg: isLight ? 'rgba(37, 99, 235, 0.74)' : 'rgba(94, 158, 255, 0.76)',
        devNegBorder: isLight ? '#1d4ed8' : '#7ab6ff',
    };
}

function getChartTextColor() {
    return getChartColors().text;
}

function getChartGridColor() {
    return getChartColors().grid;
}

function destroyChart(name) {
    if (state.charts[name]) {
        state.charts[name].destroy();
        state.charts[name] = null;
    }
}

function applyChartThemeToDatasets(chartName, chart, colors) {
    const datasets = chart?.data?.datasets || [];
    if (chartName === 'dailyTemp' && datasets.length >= 3) {
        datasets[0].borderColor = colors.high;
        datasets[0].backgroundColor = colors.highFill;
        datasets[1].borderColor = colors.low;
        datasets[1].backgroundColor = colors.lowFill;
        datasets[2].borderColor = colors.avg;
    } else if (chartName === 'comparison' && datasets.length >= 2) {
        datasets[0].borderColor = colors.high;
        datasets[0].backgroundColor = colors.highFill;
        datasets[1].borderColor = colors.prevYear;
    } else if (chartName === 'deviation' && datasets.length >= 1) {
        const values = datasets[0].data || [];
        datasets[0].backgroundColor = values.map(value =>
            value == null ? 'transparent' : value >= 0 ? colors.devPosBg : colors.devNegBg);
        datasets[0].borderColor = values.map(value =>
            value == null ? 'transparent' : value >= 0 ? colors.devPosBorder : colors.devNegBorder);
    }
}

function updateChartColors() {
    const colors = getChartColors();
    Object.entries(state.charts).forEach(([chartName, chart]) => {
        if (!chart) return;
        Object.values(chart.options.scales || {}).forEach(scale => {
            if (scale.ticks) scale.ticks.color = colors.text;
            if (scale.grid && typeof scale.grid.color !== 'function') scale.grid.color = colors.grid;
            if (scale.border) scale.border.color = colors.grid;
        });
        if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = colors.text;
        if (chart.options.plugins?.tooltip) {
            const tooltip = chart.options.plugins.tooltip;
            tooltip.backgroundColor = colors.tooltipBg;
            tooltip.titleColor = colors.tooltipTitle;
            tooltip.bodyColor = colors.tooltipBody;
            tooltip.borderColor = colors.tooltipBorder;
        }
        applyChartThemeToDatasets(chartName, chart, colors);
        chart.update('none');
    });
}

function sharedChartOptions() {
    const colors = getChartColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: { color: colors.text, usePointStyle: true, boxWidth: 8, padding: 15, font: { size: 12 } },
            },
            tooltip: {
                backgroundColor: colors.tooltipBg,
                titleColor: colors.tooltipTitle,
                bodyColor: colors.tooltipBody,
                borderColor: colors.tooltipBorder,
                borderWidth: 1,
                padding: 11,
            },
        },
        scales: {
            x: {
                ticks: { color: colors.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 11 } },
                grid: { display: false },
                border: { color: colors.grid },
            },
            y: {
                grace: '8%',
                ticks: { color: colors.text, callback: value => `${value}℃`, font: { size: 11 } },
                grid: { color: colors.grid },
                border: { display: false },
            },
        },
    };
}

function renderDailyChart(chartData) {
    destroyChart('dailyTemp');
    if (!chartData || typeof Chart === 'undefined') return;
    const colors = getChartColors();
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
                    borderColor: colors.high,
                    backgroundColor: colors.highFill,
                    fill: '+1',
                    tension: 0.32,
                    pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
                {
                    label: '最低',
                    data: chartData.lows,
                    borderColor: colors.low,
                    backgroundColor: colors.lowFill,
                    fill: false,
                    tension: 0.32,
                    pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
                {
                    label: '平均',
                    data: chartData.avgs,
                    borderColor: colors.avg,
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
    const colors = getChartColors();
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
                    borderColor: colors.high,
                    backgroundColor: colors.highFill,
                    fill: false,
                    tension: 0.3,
                    pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2.3,
                },
                {
                    label: `前年 ${config.label}`,
                    data: chartData[config.previous] || chartData.last_year,
                    borderColor: colors.prevYear,
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
    document.getElementById('comparisonTitle').textContent = `過去比較 — ${titles[mode] || ''}`;
    document.querySelectorAll?.('#comparisonToggle .toggle-btn')?.forEach(button => {
        const active = button.dataset.mode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
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
    const colors = getChartColors();
    const options = sharedChartOptions();
    options.plugins.tooltip.callbacks = {
        label: context => `偏差: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(1)}℃`,
    };
    options.scales.y.ticks.callback = value => `${value >= 0 ? '+' : ''}${value}℃`;
    options.scales.y.grid = {
        color: context => {
            const current = getChartColors();
            return context.tick.value === 0 ? current.zeroLine : current.grid;
        },
        lineWidth: context => context.tick.value === 0 ? 1.5 : 1,
    };
    state.charts.deviation = new Chart(document.getElementById('deviationChart'), {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: `過去平均 ${data.baseline_avg}℃からの偏差`,
                data: data.deviations,
                backgroundColor: data.deviations.map(value => value == null ? 'transparent' : value >= 0 ? colors.devPosBg : colors.devNegBg),
                borderColor: data.deviations.map(value => value == null ? 'transparent' : value >= 0 ? colors.devPosBorder : colors.devNegBorder),
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options,
    });
}
