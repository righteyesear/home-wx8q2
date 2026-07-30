const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadNotifications() {
    const source = fs.readFileSync(
        path.join(projectRoot, 'js', 'notifications.js'),
        'utf8'
    );
    const elements = new Map([
        ['notificationToggle', {
            classList: {
                values: new Set(),
                add(value) { this.values.add(value); },
                remove(...values) { values.forEach(value => this.values.delete(value)); }
            },
            style: {},
            title: ''
        }],
        ['notificationIcon', { textContent: '' }],
        ['notificationText', { textContent: '' }]
    ]);
    const subscription = {
        endpoint: 'https://push.example/subscription',
        keys: { p256dh: 'public-key', auth: 'auth-key' },
        async unsubscribe() { return true; }
    };
    const fetchCalls = [];
    let fetchResult = { ok: true, status: 200, body: { success: true } };

    const context = vm.createContext({
        console,
        Notification: { permission: 'granted', requestPermission: async () => 'granted' },
        navigator: {
            serviceWorker: {
                ready: Promise.resolve({
                    pushManager: {
                        async getSubscription() { return subscription; }
                    }
                })
            }
        },
        document: {
            readyState: 'loading',
            getElementById(id) { return elements.get(id) || null; },
            addEventListener() {}
        },
        localStorage: {
            values: new Map(),
            setItem(key, value) { this.values.set(key, value); }
        },
        window: {
            Notification: true,
            atob(value) { return Buffer.from(value, 'base64').toString('binary'); }
        },
        alert() {},
        TEMP_ALERT_THRESHOLD: 35,
        notificationsEnabled: false,
        Uint8Array,
        fetch: async (...args) => {
            fetchCalls.push(args);
            return {
                ok: fetchResult.ok,
                status: fetchResult.status,
                async json() { return fetchResult.body; }
            };
        }
    });
    vm.runInContext(
        `${source}
        globalThis.__notificationTest = {
            initNotificationState,
            toggleNotifications,
            syncPushSubscription
        };`,
        context
    );
    return {
        api: context.__notificationTest,
        elements,
        fetchCalls,
        setFetchResult(result) { fetchResult = result; }
    };
}

function loadWorker() {
    const source = fs
        .readFileSync(path.join(projectRoot, 'cloudflare-push-worker.js'), 'utf8')
        .replace('export default {', 'globalThis.__worker = {');
    const context = vm.createContext({
        console,
        Date,
        JSON,
        Set,
        Map,
        URL,
        Request,
        Response,
        Headers,
        TextEncoder,
        crypto
    });
    vm.runInContext(source, context);
    return context.__worker;
}

function createKv() {
    const values = new Map();
    return {
        values,
        api: {
            async get(key) { return values.get(key) ?? null; },
            async put(key, value) { values.set(key, value); },
            async delete(key) { values.delete(key); },
            async list({ prefix = '' } = {}) {
                return {
                    keys: [...values.keys()]
                        .filter(key => key.startsWith(prefix))
                        .map(name => ({ name }))
                };
            }
        }
    };
}

(async () => {
    const notificationTest = loadNotifications();
    await notificationTest.api.initNotificationState();
    assert.equal(notificationTest.fetchCalls.length, 1);
    assert.equal(notificationTest.fetchCalls[0][1].method, 'POST');
    assert.equal(
        notificationTest.elements.get('notificationText').textContent,
        '通知ON'
    );

    notificationTest.setFetchResult({
        ok: false,
        status: 500,
        body: { error: 'KV unavailable' }
    });
    await notificationTest.api.initNotificationState();
    assert.equal(
        notificationTest.elements.get('notificationText').textContent,
        '通知再登録が必要'
    );

    notificationTest.setFetchResult({
        ok: true,
        status: 200,
        body: { success: true }
    });
    await notificationTest.api.toggleNotifications();
    assert.equal(
        notificationTest.elements.get('notificationText').textContent,
        '通知ON'
    );

    const worker = loadWorker();
    const kv = createKv();

    let response = await worker.fetch(
        new Request('https://worker.example/api/test', { method: 'POST' }),
        { KV: kv.api }
    );
    assert.equal(response.status, 503, 'admin endpoint requires configured token');

    response = await worker.fetch(
        new Request('https://worker.example/api/test', { method: 'POST' }),
        { KV: kv.api, ADMIN_TOKEN: 'secret' }
    );
    assert.equal(response.status, 401, 'admin endpoint rejects missing bearer token');

    response = await worker.fetch(
        new Request('https://worker.example/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'invalid' })
        }),
        { KV: kv.api }
    );
    assert.equal(response.status, 400, 'invalid subscription is rejected');

    const subscription = {
        endpoint: 'https://push.example/valid',
        keys: { p256dh: 'public-key', auth: 'auth-key' }
    };
    response = await worker.fetch(
        new Request('https://worker.example/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        }),
        { KV: kv.api }
    );
    assert.equal(response.status, 200);

    worker.sendWebPush = async () => ({ success: true, gone: false });
    const delivery = await worker.sendToAll(
        { KV: kv.api },
        { title: 'Test delivery', body: 'body' }
    );
    assert.equal(delivery.sent, 1);
    assert.equal(delivery.failed, 0);
    assert(kv.values.has('push_last_delivery'));

    kv.values.set('cron_last_run', new Date().toISOString());
    response = await worker.getDetailedStatus(
        {
            KV: kv.api,
            YAHOO_PROXY: {},
            VAPID_PUBLIC_KEY: 'public',
            VAPID_PRIVATE_KEY: 'private',
            ADMIN_TOKEN: 'secret'
        },
        {}
    );
    const status = await response.json();
    assert.equal(status.subscribers, 1);
    assert.equal(status.configuration.adminToken, true);
    assert(status.cron.ageMinutes <= 1);
    assert.equal(status.lastDelivery.sent, 1);

    const newMoonAge = worker.calculateMoonAge({
        getFullYear: () => 2026,
        getMonth: () => 6,
        getDate: () => 14,
        getHours: () => 18,
        getMinutes: () => 44
    });
    assert(newMoonAge < 1, 'NAOJ 2026-07-14 new moon should be near age 0');

    const fullMoonAge = worker.calculateMoonAge({
        getFullYear: () => 2026,
        getMonth: () => 6,
        getDate: () => 29,
        getHours: () => 8,
        getMinutes: () => 0
    });
    assert(
        fullMoonAge >= 13.5 && fullMoonAge < 15.5,
        'NAOJ 2026-07-29 full moon day should be inside notification window'
    );

    worker.sendWebPush = async () => ({ success: false, gone: false });
    await assert.rejects(
        () => worker.sendToAll(
            { KV: kv.api },
            { title: 'Failed delivery', body: 'body' }
        ),
        /All push deliveries failed/
    );

    console.log('Push notification tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
