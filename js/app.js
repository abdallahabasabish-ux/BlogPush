// ================================================================
// js/app.js – المكتبة الأساسية للمنصة
// ================================================================

// 🔴 هام: استبدل هذا الرابط برابط Web App الخاص بك بعد النشر
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxEwdUmc-Cyi0AkxHqTIUwqp-XrcNi0R4tn52kHmMNCE5D1F4gl6vqd3jlR2kzxCkr8gQ/exec';

const TOKEN_KEY = 'blogpush_session_token';
const USER_KEY = 'blogpush_user_data';

// ---------- إدارة الجلسة ----------
function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

function setToken(token, user) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {}
}

function removeToken() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
}

function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}

function isLoggedIn() {
    return !!getToken();
}

// ---------- استدعاء API (العمود الفقري) ----------
async function apiCall(action, method = 'GET', body = null, requiresAuth = true) {
    try {
        const url = API_BASE_URL + '?action=' + encodeURIComponent(action);
        const headers = { 'Content-Type': 'application/json' };

        if (requiresAuth) {
            const token = getToken();
            if (!token) throw new Error('الرجاء تسجيل الدخول أولاً');
            headers['Authorization'] = 'Bearer ' + token;
        }

        const options = { method, headers, redirect: 'follow' };
        if (method === 'POST' && body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (e) {
            throw new Error('استجابة غير صالحة من الخادم');
        }

        if (data && data.success === false) {
            throw new Error(data.error || 'حدث خطأ في الخادم');
        }
        return data;
    } catch (error) {
        console.error('❌ API Error:', error.message);
        throw error;
    }
}

// ---------- دوال المصادقة ----------
async function login(email, displayName = '') {
    const result = await apiCall('auth', 'POST', { email, displayName }, false);
    if (result.success && result.token) {
        setToken(result.token, result.user);
        return result.user;
    }
    throw new Error(result.error || 'فشل تسجيل الدخول');
}

async function logout() {
    try { await apiCall('logout', 'POST', {}, true); } catch (e) {}
    removeToken();
    window.location.href = '/login.html';
}

// ---------- دوال مساعدة ----------
function redirectTo(page) {
    const pages = {
        login: 'login.html',
        dashboard: 'index.html',
        websites: 'websites.html',
        subscribers: 'subscribers.html',
        campaigns: 'campaigns.html',
        analytics: 'analytics.html',
        settings: 'settings.html'
    };
    window.location.href = pages[page] || 'index.html';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// تصدير الكائن العام لاستخدامه في الصفحات
window.app = {
    API_BASE_URL,
    getToken,
    setToken,
    removeToken,
    getUser,
    isLoggedIn,
    apiCall,
    login,
    logout,
    redirectTo,
    isValidEmail
};

console.log('✅ مكتبة التطبيق (app.js) جاهزة');
