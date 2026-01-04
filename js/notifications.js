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

async function toggleNotifications() {
    const btn = document.getElementById('notificationToggle');
    const icon = document.getElementById('notificationIcon');

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
            // Already subscribed - unsubscribe
            await subscription.unsubscribe();
            // Notify server to remove subscription
            await fetch(PUSH_SUBSCRIBE_URL, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
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

                // Send subscription to server
                await fetch(PUSH_SUBSCRIBE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSubscription)
                });

                updateNotificationUI(true);
                console.log('[Notification] Subscribed:', newSubscription);
            } else {
                updateNotificationUI(false, result === 'denied');
            }
        }
    } catch (err) {
        console.error('[Notification] Error:', err);
        alert('通知の設定中にエラー: ' + err.message);
    }
}

function updateNotificationUI(enabled, denied = false) {
    const btn = document.getElementById('notificationToggle');
    const icon = document.getElementById('notificationIcon');

    if (denied) {
        btn.classList.add('denied');
        btn.classList.remove('enabled');
        icon.textContent = '🔕';
        btn.title = '通知がブロックされています';
    } else if (enabled) {
        btn.classList.add('enabled');
        btn.classList.remove('denied');
        icon.textContent = '🔔';
        btn.title = '通知をオフにする';
    } else {
        btn.classList.remove('enabled', 'denied');
        icon.textContent = '🔕';
        btn.title = '通知をオンにする';
    }
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
        updateNotificationUI(!!subscription);
    } catch (err) {
        console.log('[Notification] Init error:', err);
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
