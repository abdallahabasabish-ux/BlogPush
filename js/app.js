/**
 * ═══════════════════════════════════════════════════════════════
 *  NilePush – مكتبة التطبيق الأساسية
 *  الإصدار: 2.0.0 (نسخة GitHub Pages)
 *  الهوية المصرية © 2026
 * ═══════════════════════════════════════════════════════════════
 */

// ─── 1. الإعدادات الأساسية ────────────────────────────────────
// 🔴 استبدل هذا الرابط برابط Apps Script الخاص بك بعد النشر
const API_BASE_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
const TOKEN_KEY = 'nilepush_session_token';
const USER_KEY = 'nilepush_user_data';

// ─── 2. دوال إدارة الجلسة ──────────────────────────────────────
function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch(e) { return null; }
}

function setToken(token, userData) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        if (userData) localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch(e) {}
}

function removeToken() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch(e) {}
}

function getUserData() {
    try {
        const data = localStorage.getItem(USER_KEY);
        return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
}

function isLoggedIn() {
    return !!getToken();
}

// ─── 3. استدعاء API ────────────────────────────────────────────
async function apiCall(action, method = 'GET', body = null, requiresAuth = true) {
    try {
        const url = API_BASE_URL + '?action=' + encodeURIComponent(action);
        const headers = { 'Content-Type': 'application/json' };

        if (requiresAuth) {
            const token = getToken();
            if (!token) throw new Error('يجب تسجيل الدخول أولاً');
            headers['Authorization'] = 'Bearer ' + token;
        }

        const options = { method, headers, redirect: 'follow' };
        if (method === 'POST' && body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);
        const text = await response.text();

        let data;
        try { data = JSON.parse(text); }
        catch (e) { throw new Error('استجابة غير صالحة من الخادم'); }

        if (data && data.success === false) {
            throw new Error(data.error || 'حدث خطأ في الخادم');
        }
        return data;
    } catch (error) {
        console.error('❌ apiCall error:', error.message);
        throw error;
    }
}

// ─── 4. تسجيل الدخول والخروج ──────────────────────────────────
async function login(email, displayName = '', photoURL = '') {
    const result = await apiCall('auth', 'POST', { email, displayName, photoURL }, false);
    if (result.success && result.token) {
        setToken(result.token, result.user);
        return result.user;
    }
    throw new Error(result.error || 'فشل تسجيل الدخول');
}

async function logout() {
    try { await apiCall('logout', 'POST', {}, true); } catch(e) {}
    removeToken();
    window.location.href = 'login.html';
    return true;
}

// ─── 5. التوجيه (Routing) ─────────────────────────────────────
function redirectTo(page) {
    const map = {
        login: 'login.html',
        dashboard: 'index.html',
        websites: 'websites.html',
        subscribers: 'subscribers.html',
        campaigns: 'campaigns.html',
        analytics: 'analytics.html',
        settings: 'settings.html'
    };
    window.location.href = map[page] || 'index.html';
}

// ─── 6. دوال عرض الرسائل (Toast) ──────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:12px;max-width:380px;width:100%;pointer-events:none;';
        document.body.appendChild(container);
    }

    const colors = {
        success: '#28a745',
        error: '#CE1126',
        info: '#C9A84C',
        warning: '#ffc107'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
        padding:14px 20px;
        border-radius:12px;
        color:#fff;
        background:${colors[type] || colors.info};
        box-shadow:0 8px 25px rgba(0,0,0,0.15);
        font-size:15px;
        font-weight:500;
        word-wrap:break-word;
        opacity:0;
        transform:translateX(30px);
        transition:all 0.35s cubic-bezier(0.25,0.46,0.45,0.94);
        pointer-events:auto;
        direction:rtl;
        text-align:right;
        border:1px solid rgba(255,255,255,0.2);
        font-family:'Cairo', sans-serif;
    `;
    toast.textContent = message;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
    }, duration);
}

function showSuccess(msg, dur) { showToast(msg, 'success', dur); }
function showError(msg, dur) { showToast(msg, 'error', dur || 5000); }
function showInfo(msg, dur) { showToast(msg, 'info', dur); }

// ─── 7. دوال مساعدة ─────────────────────────────────────────────
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getUrlParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

// ─── 8. حماية الصفحات (تحقق من الجلسة) ──────────────────────
function protectPage() {
    if (!isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ─── 9. تهيئة التطبيق ──────────────────────────────────────────
function initApp() {
    // إنشاء حاوية Toasts
    if (!document.getElementById('toast-container')) {
        const c = document.createElement('div');
        c.id = 'toast-container';
        c.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:12px;max-width:380px;width:100%;pointer-events:none;';
        document.body.appendChild(c);
    }

    // مستمع حدث زر تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
                await logout();
                showSuccess('تم تسجيل الخروج بنجاح');
            } catch(err) {
                showError('حدث خطأ أثناء تسجيل الخروج');
            }
        });
    }

    // عرض بيانات المستخدم في العناصر المخصصة
    const user = getUserData();
    if (user) {
        const nameEl = document.getElementById('userName');
        const emailEl = document.getElementById('userEmail');
        const avatarEl = document.getElementById('userAvatar');
        if (nameEl) nameEl.textContent = user.displayName || user.email;
        if (emailEl) emailEl.textContent = user.email || '';
        if (avatarEl) avatarEl.textContent = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    }

    console.log('✅ NilePush app initialized');
}

// ─── 10. تصدير الكائن العام ────────────────────────────────────
window.app = {
    API_BASE_URL,
    getToken, setToken, removeToken, getUserData, isLoggedIn,
    apiCall, login, logout, redirectTo,
    showToast, showSuccess, showError, showInfo,
    isValidEmail, getUrlParam, protectPage, initApp
};

// تهيئة تلقائية عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);
