// =====================================================
// redesign.js - display-only enhancements
// Existing weather fetching, calculations and element ids are untouched.
// =====================================================

(function () {
    const VIEW_CARD_IDS = {
        recent: ['chart24h'],
        week: ['chartWeek'],
        long: ['chartMonthly', 'chartYearly'],
        moon: ['moonCard']
    };

    function resizeVisibleCharts() {
        window.setTimeout(function () {
            if (typeof charts === 'undefined' || !charts) return;
            Object.values(charts).forEach(function (chart) {
                if (chart && typeof chart.resize === 'function') chart.resize();
            });
        }, 60);
    }

    function selectChartView(view) {
        const selected = VIEW_CARD_IDS[view] ? view : 'recent';
        const visibleIds = new Set(VIEW_CARD_IDS[selected]);

        document.querySelectorAll('#chartsGrid .chart-card').forEach(function (card) {
            card.hidden = !visibleIds.has(card.dataset.chartId);
        });

        document.querySelectorAll('.chart-view-btn').forEach(function (button) {
            const active = button.dataset.chartView === selected;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        localStorage.setItem('chartView', selected);
        resizeVisibleCharts();
    }

    function initChartViews() {
        const buttons = document.querySelectorAll('.chart-view-btn');
        if (!buttons.length) return;

        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                selectChartView(button.dataset.chartView);
            });
        });

        selectChartView(localStorage.getItem('chartView') || 'recent');
    }

    function improveAccessibleLabels() {
        const themeToggle = document.getElementById('themeToggle');
        const fontSizeToggle = document.getElementById('fontSizeToggle');
        const notificationToggle = document.getElementById('notificationToggle');
        const modeToggle = document.getElementById('modeToggle');

        if (themeToggle) themeToggle.setAttribute('aria-label', 'ライト・ダークテーマを切り替える');
        if (fontSizeToggle) fontSizeToggle.setAttribute('aria-label', '文字サイズを切り替える');
        if (notificationToggle) notificationToggle.setAttribute('aria-label', 'プッシュ通知を切り替える');
        if (modeToggle) modeToggle.setAttribute('aria-label', '表示する情報量を切り替える');
    }

    function initFontSizeToggle() {
        const button = document.getElementById('fontSizeToggle');
        const text = document.getElementById('fontSizeText');
        if (!button) return;

        function apply(size) {
            const large = size === 'large';
            document.documentElement.classList.toggle('font-large', large);
            button.setAttribute('aria-pressed', String(large));
            if (text) text.textContent = large ? '文字 大' : '文字';
            localStorage.setItem('fontSize', large ? 'large' : 'standard');
        }

        apply(localStorage.getItem('fontSize') || 'standard');
        button.addEventListener('click', function () {
            apply(document.documentElement.classList.contains('font-large') ? 'standard' : 'large');
        });
    }

    function alignReadingOrderWithVisualOrder() {
        const container = document.querySelector('.container');
        if (!container) return;

        [
            'header',
            '#pullRefreshIndicator',
            '#alertBanner',
            '#weatherHero',
            '.main-stats',
            '#greetingSection',
            '#forecastBrief',
            '#precipitationCard',
            '#aiAdvisorSection',
            '.history-intro',
            '#chartsGrid',
            '#reportLinkCard',
            '.footer-stats',
            '.footer-notification-area',
            '.version-info'
        ].forEach(function (selector) {
            const element = container.querySelector(selector);
            if (element) container.appendChild(element);
        });
    }

    function initRedesign() {
        alignReadingOrderWithVisualOrder();
        initChartViews();
        initFontSizeToggle();
        improveAccessibleLabels();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRedesign, { once: true });
    } else {
        initRedesign();
    }
})();
