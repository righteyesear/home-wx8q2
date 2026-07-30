const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stageRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(__dirname, 'fixtures', 'jma', 'derived');
const rawFixtureRoot = path.resolve(__dirname, 'fixtures', 'jma', 'raw');

function loadJson(name) {
    return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function loadRawJson(name) {
    return JSON.parse(fs.readFileSync(path.join(rawFixtureRoot, name), 'utf8'));
}

function loadUiNormalizer() {
    const source = fs.readFileSync(path.join(stageRoot, 'js', 'ui.js'), 'utf8');
    const context = vm.createContext({ console });
    vm.runInContext(`${source}\nglobalThis.__normalizeJmaAlerts = normalizeJmaAlerts;`, context);
    return context.__normalizeJmaAlerts;
}

function loadWorker() {
    const source = fs
        .readFileSync(path.join(stageRoot, 'cloudflare-push-worker.js'), 'utf8')
        .replace('export default {', 'globalThis.__worker = {');
    const context = vm.createContext({
        console,
        Date,
        JSON,
        Set,
        Map,
        fetch: undefined
    });
    vm.runInContext(source, context);
    return { worker: context.__worker, context };
}

const expectedCases = [
    ['no-warning-katsushika.json', 0, null],
    ['advisory-katsushika.json', 2, 'レベル2 大雨注意報'],
    ['level3-katsushika.json', 3, 'レベル3 大雨警報'],
    ['level4-katsushika.json', 4, 'レベル4 大雨危険警報'],
    ['level5-katsushika.json', 5, 'レベル5 大雨特別警報'],
    ['continuing-katsushika.json', 3, 'レベル3 大雨警報'],
    ['downgraded-katsushika.json', 2, 'レベル2 大雨注意報'],
    ['released-katsushika.json', 0, null]
];

const normalizeUi = loadUiNormalizer();
const { worker, context } = loadWorker();

for (const [file, level, name] of expectedCases) {
    const data = loadJson(file);
    const uiAlerts = normalizeUi(data, '1312200');
    const workerAlerts = worker.normalizeJMAWarnings(data, '1312200').active;

    assert.equal(uiAlerts.length, level === 0 ? 0 : 1, `UI count: ${file}`);
    assert.equal(workerAlerts.length, level === 0 ? 0 : 1, `Worker count: ${file}`);
    if (level > 0) {
        assert.equal(uiAlerts[0].level, level, `UI level: ${file}`);
        assert.equal(workerAlerts[0].level, level, `Worker level: ${file}`);
        assert.equal(uiAlerts[0].name, name, `UI name: ${file}`);
        assert.equal(workerAlerts[0].name, name, `Worker name: ${file}`);
    }
}

assert.throws(
    () => normalizeUi({ areaTypes: [] }, '1312200'),
    /Unexpected JMA warning response schema/
);
assert.throws(
    () => worker.normalizeJMAWarnings({ areaTypes: [] }, '1312200'),
    /Unexpected JMA warning response schema/
);

const rawLevel2 = normalizeUi(
    loadRawJson('archive-r8-130000-2026060218-level2.json'),
    '1312200'
);
assert(rawLevel2.some(alert => alert.id === 'VPWW55:10' && alert.status === '発表'));

const rawLevel3 = normalizeUi(
    loadRawJson('archive-r8-130000-2026060303-level3-level4-continuing.json'),
    '1312200'
);
assert(rawLevel3.some(alert => alert.id === 'VPWW55:03' && alert.status === '継続'));

const rawDowngrade = normalizeUi(
    loadRawJson('archive-r8-130000-2026060306-downgrade.json'),
    '1312200'
);
assert(rawDowngrade.some(
    alert => alert.id === 'VPWW55:10' && alert.status === '警報から注意報'
));

// Worker notification state: new -> continuing -> downgrade -> release -> reissue.
const kvStore = new Map();
const env = {
    KV: {
        async get(key) {
            return kvStore.get(key) ?? null;
        },
        async put(key, value) {
            kvStore.set(key, value);
        }
    }
};
const notifications = [];
worker.sendToAll = async (_env, payload) => {
    notifications.push(payload);
    return { sent: 1, failed: 0, cleaned: 0 };
};

let responseData = loadJson('level3-katsushika.json');
context.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
        return responseData;
    }
});

(async () => {
    await worker.checkJMAWarnings(env);
    assert.equal(notifications.length, 1, 'new level 3 must notify once');

    responseData = loadJson('continuing-katsushika.json');
    await worker.checkJMAWarnings(env);
    assert.equal(notifications.length, 1, 'continuing warning must not notify again');

    responseData = loadJson('downgraded-katsushika.json');
    await worker.checkJMAWarnings(env);
    assert.equal(notifications.length, 2, 'downgrade must notify once');
    assert.match(notifications[1].title, /切替/);

    responseData = loadJson('released-katsushika.json');
    await worker.checkJMAWarnings(env);
    assert.equal(notifications.length, 2, 'advisory release must not create urgent notification');

    responseData = loadJson('level3-katsushika.json');
    responseData[0].controlDatetime = '2026-06-03T08:31:05Z';
    responseData[0].reportDatetime = '2026-06-03T17:31:00+09:00';
    await worker.checkJMAWarnings(env);
    assert.equal(notifications.length, 3, 'reissue after release must notify');

    console.log(`JavaScript JMA tests passed: ${expectedCases.length} cases + raw fixtures + state transitions`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
