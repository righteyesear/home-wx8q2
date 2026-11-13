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

    const MAIN_ORDER_SELECTORS = [
        '#pullRefreshIndicator',
        '#alertBanner',
        '#weatherHero',
        '.main-stats',
        '#greetingSection',
        '#aiAdvisorSection',
        '#forecastBrief',
        '#precipitationCard',
        '.history-intro',
        '#chartsGrid',
        '#reportLinkCard'
    ];

    const FOOTER_ORDER_SELECTORS = [
        '.footer-stats',
        '.footer-notification-area',
        '.version-info'
    ];

    function readStorage(key, fallback) {
        try {
            return typeof localStorage !== 'undefined' ? (localStorage.getItem(key) || fallback) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, value);
            }
        } catch (e) {}
    }

    function hasCharts() {
        return typeof charts !== 'undefined' && Boolean(charts) && Object.keys(charts).length > 0;
    }

    function resizeVisibleCharts() {
        window.setTimeout(function () {
            if (typeof charts === 'undefined' || !charts) return;
            Object.values(charts).forEach(function (chart) {
                if (chart && typeof chart.resize === 'function') chart.resize();
            });
        }, 60);
    }

    function scrollButtonIntoViewIfNeeded(button) {
        if (!button || typeof button.scrollIntoView !== 'function') return;
        const prefersReducedMotion = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        button.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });
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

        writeStorage('chartView', selected);
        resizeVisibleCharts();
    }

    function initChartViews() {
        const buttons = Array.from(document.querySelectorAll('.chart-view-btn'));
        if (!buttons.length) return;
        const switcher = document.querySelector('.chart-view-switcher');

        buttons.forEach(function (button, index) {
            button.addEventListener('click', function () {
                selectChartView(button.dataset.chartView);
                if (switcher && switcher.scrollWidth > switcher.clientWidth) {
                    scrollButtonIntoViewIfNeeded(button);
                }
            });

            button.addEventListener('keydown', function (event) {
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

                let nextIndex = -1;
                if (event.key === 'ArrowRight') {
                    nextIndex = (index + 1) % buttons.length;
                } else if (event.key === 'ArrowLeft') {
                    nextIndex = (index - 1 + buttons.length) % buttons.length;
                } else if (event.key === 'Home') {
                    nextIndex = 0;
                } else if (event.key === 'End') {
                    nextIndex = buttons.length - 1;
                }

                if (nextIndex < 0) return;
                event.preventDefault();
                const target = buttons[nextIndex];
                if (!target) return;
                try {
                    target.focus({ preventScroll: true });
                } catch (e) {
                    target.focus();
                }
                scrollButtonIntoViewIfNeeded(target);
                selectChartView(target.dataset.chartView);
            });
        });

        selectChartView(readStorage('chartView', 'recent'));
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
            writeStorage('fontSize', large ? 'large' : 'standard');
            if (hasCharts()) resizeVisibleCharts();
        }

        apply(readStorage('fontSize', 'standard'));
        button.addEventListener('click', function () {
            apply(document.documentElement.classList.contains('font-large') ? 'standard' : 'large');
        });
    }

    function alignReadingOrderWithVisualOrder() {
        const container = document.querySelector('.container');
        if (!container) return;

        const mainTarget = document.getElementById('mainContent') || container;
        const footerTarget = container.querySelector('.dashboard-footer') || container;

        if (mainTarget === container) {
            const skipLink = container.querySelector('.skip-link');
            const header = container.querySelector('header');
            if (skipLink) container.appendChild(skipLink);
            if (header) container.appendChild(header);
        }

        MAIN_ORDER_SELECTORS.forEach(function (selector) {
            const element = container.querySelector(selector);
            if (element) mainTarget.appendChild(element);
        });

        FOOTER_ORDER_SELECTORS.forEach(function (selector) {
            const element = container.querySelector(selector);
            if (element) footerTarget.appendChild(element);
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
