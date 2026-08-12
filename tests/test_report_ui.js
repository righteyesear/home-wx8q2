const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'js', 'report.js'), 'utf8');
const context = vm.createContext({
    console,
    Date,
    Intl,
    document: {
        readyState: 'loading',
        addEventListener() {},
        querySelector() { return null; },
    },
    window: { addEventListener() {} },
});

vm.runInContext(`${source}
globalThis.__reportUi = {
    state,
    isClosedIndexEntry,
    getAvailableReports,
    loadLatestReport,
    navigateReport,
    analysisSourceLabel,
    replaceLoader(loader) { loadReport = loader; }
};`, context);

const ui = context.__reportUi;
ui.state.reportType = 'weekly';
ui.state.reportIndex = {
    weekly: [
        {
            period: '2026-W33',
            is_final: false,
            status: 'draft',
            analysis_available: false,
            coverage_complete: false,
        },
        {
            period: '2026-W32',
            is_final: true,
            status: 'final',
            analysis_available: true,
            coverage_complete: true,
        },
    ],
    monthly: [],
};

assert.equal(ui.getAvailableReports().length, 2, 'current weekly draft must remain navigable');
assert.equal(ui.isClosedIndexEntry(ui.state.reportIndex.weekly[0], 'weekly'), true);
assert.equal(ui.isClosedIndexEntry({ period: '2026-08', is_final: false, status: 'draft' }, 'monthly'), false);

let loadedPeriod = null;
ui.replaceLoader(period => { loadedPeriod = period; });
ui.loadLatestReport();
assert.equal(loadedPeriod, '2026-W32', 'initial report must be the latest completed analysis');

ui.state.currentPeriod = '2026-W32';
ui.navigateReport(1);
assert.equal(loadedPeriod, '2026-W33', 'newer navigation must open the current weekly draft');

assert.equal(ui.analysisSourceLabel({ source: 'codex' }), '観測データ分析');
assert.equal(ui.analysisSourceLabel({ source: 'draft' }), '分析は週終了後');

console.log('report UI tests passed');
