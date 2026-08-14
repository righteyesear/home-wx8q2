const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function element() {
    const classes = new Set();
    return {
        classList: {
            add(...names) { names.forEach(name => classes.add(name)); },
            remove(...names) { names.forEach(name => classes.delete(name)); },
            contains(name) { return classes.has(name); }
        },
        dataset: {},
        style: {},
        textContent: '',
        innerHTML: ''
    };
}

const elements = {
    aiAdvisorSection: element(),
    aiAdvisorText: element(),
    aiAdvisorTime: element(),
    aiAdvisorExpand: element()
};
let responseData;
const context = {
    console: { log() {} },
    document: { getElementById(id) { return elements[id] || element(); } },
    fetch: async () => ({ ok: true, json: async () => responseData }),
    summaryData: { currentTemp: 37.7 },
    simpleMarkdownToHtml: value => value.replace(/\n/g, '<br>'),
    setTimeout,
    Date,
    Object,
    Number,
    Math
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, '..', 'js/weather-api.js'), 'utf8'),
    context,
    { filename: 'js/weather-api.js' }
);

assert.strictEqual(context.optionalFiniteNumber(null), null);
assert.strictEqual(context.optionalFiniteNumber(''), null);
assert.strictEqual(context.optionalFiniteNumber('34.6'), 34.6);

(async () => {
    responseData = {
        generated_at: new Date().toISOString(),
        advice: '夕方の雷雨に注意してください。',
        data_summary: { outdoor_temp: null }
    };
    await context.loadAIComment();
    assert(elements.aiAdvisorSection.classList.contains('show'));
    assert(!elements.aiAdvisorSection.classList.contains('is-waiting'));
    assert.match(elements.aiAdvisorText.innerHTML, /夕方の雷雨/);

    responseData = {
        generated_at: new Date().toISOString(),
        advice: '現在の状況です。\n\n今後の見通しです。\n\n行動の目安です。',
        data_summary: { outdoor_temp: null }
    };
    await context.loadAIComment();
    assert.match(
        elements.aiAdvisorText.innerHTML,
        /現在の状況です。<br><br>今後の見通しです。<br><br>行動の目安です。/,
        'blank lines between the three paragraphs must survive rendering'
    );

    responseData = {
        generated_at: '2026-01-01T00:00:00+09:00',
        advice: '古い助言',
        data_summary: { outdoor_temp: 10 }
    };
    await context.loadAIComment();
    assert(elements.aiAdvisorSection.classList.contains('show'));
    assert(elements.aiAdvisorSection.classList.contains('is-waiting'));
    assert.match(elements.aiAdvisorText.textContent, /次の生成を待っています/);
    console.log('AI advisor display tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
