// =====================================================
// notifications.js - プッシュ通知システム
// =====================================================
// 修正時: 通知の有効化/無効化、VAPID設定、購読処理など
//
// 依存: config.js (notificationsEnabled, TEMP_ALERT_THRESHOLD)

// Request notification permission on load
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
            if (p === 'granted') {
                notificationsEnabled = true;
                localStorage.setItem('notifications', 'true');
            }
        });
    }
}

// Send notification if conditions are met
function checkAndNotify(temp) {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    if (temp >= TEMP_ALERT_THRESHOLD) {
        new Notification('🌡️ 外気温モニター', {
            body: `${temp.toFixed(1)}°C - 猛暑警報！熱中症に注意してください`,
            icon: '🌡️',
            tag: 'temp-alert'
        });
    } else if (temp <= 0) {
        new Notification('🌡️ 外気温モニター', {
            body: `${temp.toFixed(1)}°C - 氷点下です。凍結に注意`,
            icon: '❄️',
            tag: 'temp-alert'
        });
    }
}

// =====================================================
// PUSH NOTIFICATION MANAGEMENT
// =====================================================

// VAPID public key for Web Push
const VAPID_PUBLIC_KEY = 'BPcLliQGMqx_XC_LpymDjhVNerzB1TJb9oqAfpeS9VyTxW7Ab3Heo5Yx_cvItV8HAZnO6NPLcbvtTU6IiAF-I4E';

// Your Cloudflare Worker subscription endpoint
const PUSH_SUBSCRIBE_URL = 'https://push-notifications.miurayukimail.workers.dev/api/subscribe';
let notificationSyncFailed = false;

async function syncPushSubscription(subscription) {
    const response = await fetch(PUSH_SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) {
        throw new Error(result.error || `購読サーバーエラー (${response.status})`);
    }
    return result;
}

async function toggleNotifications() {
    // Check if notifications are supported
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        alert('このブラウザはプッシュ通知に対応していません');
        return;
    }

    // Check if VAPID key is set
    if (!VAPID_PUBLIC_KEY || !PUSH_SUBSCRIBE_URL) {
        alert('通知機能はまだ設定中です。しばらくお待ちください。');
        return;
    }

    const permission = Notification.permission;

    if (permission === 'denied') {
        alert('通知がブロックされています。ブラウザの設定から許可してください。');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            if (notificationSyncFailed) {
                await syncPushSubscription(subscription);
                updateNotificationUI(true);
                console.log('[Notification] Subscription re-synced');
                return;
            }
            // Already subscribed - unsubscribe
            await subscription.unsubscribe();
            // Notify server to remove subscription
            const response = await fetch(PUSH_SUBSCRIBE_URL, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            if (!response.ok) {
                console.warn('[Notification] Server unsubscribe failed:', response.status);
            }
            updateNotificationUI(false);
            console.log('[Notification] Unsubscribed');
        } else {
            // Not subscribed - request permission and subscribe
            const result = await Notification.requestPermission();

            if (result === 'granted') {
                const newSubscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });

                try {
                    // Server registration is part of successful subscription.
                    await syncPushSubscription(newSubscription);
                } catch (syncError) {
                    await newSubscription.unsubscribe().catch(() => {});
                    throw syncError;
                }

                updateNotificationUI(true);
                console.log('[Notification] Subscribed and synced');
            } else {
                updateNotificationUI(false, result === 'denied');
            }
        }
    } catch (err) {
        console.error('[Notification] Error:', err);
        updateNotificationUI(false, false, true);
        alert('通知の設定中にエラー: ' + err.message);
    }
}

function updateNotificationUI(enabled, denied = false, syncError = false) {
    const btn = document.getElementById('notificationToggle');
    const icon = document.getElementById('notificationIcon');
    const text = document.getElementById('notificationText');
    if (!btn || !icon) return;

    if (denied) {
        notificationSyncFailed = false;
        btn.classList.add('denied');
        btn.classList.remove('enabled');
        icon.textContent = '🔕';
        if (text) text.textContent = '通知ブロック中';
        btn.title = '通知がブロックされています';
        notificationsEnabled = false;
    } else if (syncError) {
        notificationSyncFailed = true;
        btn.classList.add('denied');
        btn.classList.remove('enabled');
        icon.textContent = '⚠️';
        if (text) text.textContent = '通知再登録が必要';
        btn.title = '通知サーバーとの同期に失敗しました。押して再登録してください';
        notificationsEnabled = false;
    } else if (enabled) {
        notificationSyncFailed = false;
        btn.classList.add('enabled');
        btn.classList.remove('denied');
        icon.textContent = '🔔';
        if (text) text.textContent = '通知ON';
        btn.title = '通知をオフにする';
        notificationsEnabled = true;
    } else {
        notificationSyncFailed = false;
        btn.classList.remove('enabled', 'denied');
        icon.textContent = '🔕';
        if (text) text.textContent = '通知OFF';
        btn.title = '通知をオンにする';
        notificationsEnabled = false;
    }
    localStorage.setItem('notifications', String(notificationsEnabled));
}

// Check notification state on page load
async function initNotificationState() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        document.getElementById('notificationToggle').style.display = 'none';
        return;
    }

    if (Notification.permission === 'denied') {
        updateNotificationUI(false, true);
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            // Worker再配置やKV消失後も、ページ表示時にサーバー側購読を復元する。
            await syncPushSubscription(subscription);
            updateNotificationUI(true);
        } else {
            updateNotificationUI(false);
        }
    } catch (err) {
        console.error('[Notification] Init/sync error:', err);
        updateNotificationUI(false, false, true);
    }
}

// Helper: Convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Initialize notification state after page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationState);
} else {
    initNotificationState();
}
