// =====================================================
// init.js - 初期化・イベント処理
// =====================================================
// 修正時: アプリ起動時の初期化処理、リサイズ対応、ドラッグ&ドロップ等
//
// 主要関数:
// - init() - メイン初期化
// - initChartReordering() - グラフカード並べ替え
// - setupSpotlight() - スポットライト効果
// - animateNumber() - 数値アニメーション
//
// 依存: すべての他ファイル（最後に読み込み）

async function init() {
    await fetchAll();
    loadSunTimes();
    nextUpdateTime = Date.now() + UPDATE_INTERVAL;
    setInterval(updateCountdown, 1000);
    setInterval(() => { fetchAll(); nextUpdateTime = Date.now() + UPDATE_INTERVAL; }, UPDATE_INTERVAL);

    // Fix chart resize issue
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => { updateCharts(); }, 250);
    });
}

// =====================================================
// CHART CARD DRAG & DROP REORDERING
// =====================================================
function initChartReordering() {
    const chartsGrid = document.getElementById('chartsGrid');
    if (!chartsGrid) return;

    let draggedElement = null;
    let placeholder = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let longPressTimer = null;
    let isTouchDragging = false;
    let originalRect = null;

    // Load saved order from localStorage
    const savedOrder = localStorage.getItem('chartOrder');
    if (savedOrder) {
        try {
            const order = JSON.parse(savedOrder);
            const cards = Array.from(chartsGrid.querySelectorAll('.chart-card'));
            const sortedCards = order.map(id => cards.find(c => c.dataset.chartId === id)).filter(Boolean);
            cards.forEach(card => {
                if (!sortedCards.includes(card)) sortedCards.push(card);
            });
            sortedCards.forEach(card => chartsGrid.appendChild(card));
            console.log('[Charts] Loaded saved order:', order);
        } catch (e) {
            console.log('[Charts] Failed to load saved order');
        }
    }

    function createPlaceholder(height) {
        const ph = document.createElement('div');
        ph.className = 'drag-placeholder';
        ph.style.height = height + 'px';
        return ph;
    }

    function vibrate() {
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    function animateDrop(card) {
        card.classList.add('drop-animation');
        setTimeout(() => card.classList.remove('drop-animation'), 400);
    }

    // PC MOUSE DRAG
    chartsGrid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.chart-card');
        if (!card) return;

        draggedElement = card;
        originalRect = card.getBoundingClientRect();
        placeholder = createPlaceholder(originalRect.height);
        card.parentNode.insertBefore(placeholder, card.nextSibling);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.chartId);

        if (e.dataTransfer.setDragImage) {
            const clone = card.cloneNode(true);
            clone.style.opacity = '0.8';
            clone.style.position = 'absolute';
            clone.style.top = '-9999px';
            document.body.appendChild(clone);
            e.dataTransfer.setDragImage(clone, originalRect.width / 2, 30);
            setTimeout(() => document.body.removeChild(clone), 0);
        }
    });

    chartsGrid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.chart-card');
        if (card) {
            card.classList.remove('dragging');
            animateDrop(card);
        }

        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder);
            placeholder = null;
        }

        document.querySelectorAll('.chart-card.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        draggedElement = null;
        saveChartOrder();
    });

    chartsGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const afterElement = getDragAfterElement(chartsGrid, e.clientY);
        const dragging = chartsGrid.querySelector('.dragging');

        if (!dragging) return;

        if (placeholder) {
            if (afterElement == null) {
                chartsGrid.appendChild(placeholder);
            } else {
                chartsGrid.insertBefore(placeholder, afterElement);
            }
        }

        if (afterElement == null) {
            chartsGrid.appendChild(dragging);
        } else {
            chartsGrid.insertBefore(dragging, afterElement);
        }
    });

    chartsGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        document.querySelectorAll('.chart-card.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    });

    // MOBILE TOUCH DRAG
    const dragHandles = chartsGrid.querySelectorAll('.drag-handle');

    dragHandles.forEach(handle => {
        handle.addEventListener('touchstart', (e) => {
            const card = handle.closest('.chart-card');
            if (!card) return;

            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;

            longPressTimer = setTimeout(() => {
                isTouchDragging = true;
                draggedElement = card;
                originalRect = card.getBoundingClientRect();

                vibrate();
                card.classList.add('touch-ready');

                placeholder = createPlaceholder(originalRect.height);
                card.parentNode.insertBefore(placeholder, card.nextSibling);

                card.classList.add('touch-dragging');
                card.style.width = originalRect.width + 'px';
                card.style.left = originalRect.left + 'px';
                card.style.top = originalRect.top + 'px';

                setTimeout(() => card.classList.remove('touch-ready'), 300);
            }, 500);
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
            if (!isTouchDragging || !draggedElement) return;

            e.preventDefault();

            const touch = e.touches[0];
            const deltaY = touch.clientY - touchStartY;
            const deltaX = touch.clientX - touchStartX;

            draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.02)`;

            const afterElement = getDragAfterElement(chartsGrid, touch.clientY);

            if (placeholder) {
                if (afterElement == null) {
                    chartsGrid.appendChild(placeholder);
                } else if (afterElement !== draggedElement) {
                    chartsGrid.insertBefore(placeholder, afterElement);
                }
            }
        }, { passive: false });

        handle.addEventListener('touchend', (e) => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (!isTouchDragging || !draggedElement) return;

            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(draggedElement, placeholder);
                placeholder.parentNode.removeChild(placeholder);
                placeholder = null;
            }

            draggedElement.classList.remove('touch-dragging');
            draggedElement.style.width = '';
            draggedElement.style.left = '';
            draggedElement.style.top = '';
            draggedElement.style.transform = '';

            animateDrop(draggedElement);
            vibrate();

            isTouchDragging = false;
            draggedElement = null;

            saveChartOrder();
        }, { passive: true });

        handle.addEventListener('touchcancel', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (draggedElement) {
                draggedElement.classList.remove('touch-dragging', 'touch-ready');
                draggedElement.style.width = '';
                draggedElement.style.left = '';
                draggedElement.style.top = '';
                draggedElement.style.transform = '';
            }

            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.removeChild(placeholder);
                placeholder = null;
            }

            isTouchDragging = false;
            draggedElement = null;
        }, { passive: true });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.chart-card:not(.dragging):not(.touch-dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveChartOrder() {
    const chartsGrid = document.getElementById('chartsGrid');
    if (!chartsGrid) return;

    const order = Array.from(chartsGrid.querySelectorAll('.chart-card'))
        .map(card => card.dataset.chartId)
        .filter(Boolean);

    localStorage.setItem('chartOrder', JSON.stringify(order));
    console.log('[Charts] Saved order:', order);
}

// ========== ANIMATION HELPERS ==========

// Smooth count-up animation for numbers
window.animateNumber = function (elementId, newValue, suffix = '') {
    const element = document.getElementById(elementId);
    if (!element) return;

    const currentText = element.innerText.replace(/[^0-9.-]/g, '');
    const startValue = parseFloat(currentText) || 0;
    const endValue = parseFloat(newValue);

    if (isNaN(endValue)) {
        element.innerHTML = newValue + suffix;
        return;
    }

    if (Math.abs(startValue - endValue) < 0.1) {
        element.innerHTML = newValue + suffix;
        return;
    }

    const duration = 1200;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = startValue + (endValue - startValue) * ease;
        const decimals = (newValue.toString().split('.')[1] || '').length;
        element.innerText = current.toFixed(decimals) + suffix;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.innerHTML = newValue + suffix;
            const card = element.closest('.stat-card, .weather-hero');
            if (card) {
                card.classList.remove('flash-active');
                void card.offsetWidth;
                card.classList.add('flash-active');
            }
        }
    }

    requestAnimationFrame(update);
}

// Spotlight Effect Setup
function setupSpotlight() {
    const cards = document.querySelectorAll('.stat-card, .chart-card, .weather-hero, .comment-card, .precipitation-card, .ai-advisor-section');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--spotlight-x', `${x}px`);
            card.style.setProperty('--spotlight-y', `${y}px`);
        });
    });
}

// Init animations on load
document.addEventListener('DOMContentLoaded', () => {
    setupSpotlight();
    initChartReordering();
    setInterval(setupSpotlight, 5000);
});

// Start the app
init();
