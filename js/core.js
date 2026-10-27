/* ================================================================
   js/core.js – النواة المشتركة للمنصة
   ------------------------------------------------------------
   هذه المكتبة تعمل في كل صفحات لوحة التحكم وهي مسؤولة عن:
   1. التأكد من وجود ملف المستخدم في Firestore (users/{uid})
   2. تحديد صلاحيات الأدمن تلقائياً (حسب بريد الأدمن المحدد)
   3. تحميل إعدادات المنصة من Firestore (settings/platform)
   4. حظر المستخدمين المحظورين ومنعهم من الدخول
   5. إظهار/إخفاء عناصر الأدمن (عناصر بـ class="admin-only")
   6. أدوات مشتركة: رسائل Toast، تنسيق التواريخ والأموال، الخطط
   ================================================================ */

(function () {
  'use strict';

  // ============================================================
  // حالة النظام العامة (تُملأ بعد تسجيل الدخول)
  // ============================================================
  const state = {
    user: null,          // مستخدم Firebase Auth
    profile: null,       // ملف المستخدم من Firestore
    settings: null,      // إعدادات المنصة من Firestore
    isAdmin: false,      // هل المستخدم أدمن؟
    ready: false,        // هل اكتمل التحميل؟
    listeners: []        // نداءات تنتظر جاهزية النظام
  };

  // ============================================================
  // دوال مساعدة عامة
  // ============================================================

  // رسالة منبثقة (Toast) موحدة لكل الصفحات
  function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:12px;max-width:380px;width:100%;pointer-events:none;';
      document.body.appendChild(container);
    }
    const colors = { success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B' };
    const toast = document.createElement('div');
    toast.style.cssText = `
      padding:14px 20px;border-radius:12px;color:#fff;
      background:${colors[type] || colors.info};
      box-shadow:0 8px 25px rgba(0,0,0,0.15);
      font-size:15px;font-weight:500;font-family:'Cairo',sans-serif;
      opacity:0;transform:translateX(30px);
      transition:all 0.35s cubic-bezier(0.25,0.46,0.45,0.94);
      pointer-events:auto;direction:rtl;text-align:right;
      border:1px solid rgba(255,255,255,0.2);
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
    }, 4500);
  }

  // تنسيق التاريخ بالعربية
  function fmtDate(dateLike, withTime = false) {
    if (!dateLike) return '—';
    let d = null;
    if (dateLike?.toDate) d = dateLike.toDate();
    else if (dateLike instanceof Date) d = dateLike;
    else if (typeof dateLike === 'string' || typeof dateLike === 'number') d = new Date(dateLike);
    if (!d || isNaN(d.getTime())) return '—';
    const opts = { year: 'numeric', month: 'short', day: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return d.toLocaleDateString('ar-EG', opts);
  }

  // تنسيق المبالغ بالدولار
  function fmtUSD(amount) {
    const n = Number(amount) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // تنسيق المبالغ بالجنيه
  function fmtEGP(amount) {
    const n = Number(amount) || 0;
    return n.toLocaleString('ar-EG', { maximumFractionDigits: 0 }) + ' ج.م';
  }

  // اسم الخطة بالعربية
  function planName(plan) {
    const names = (window.SITE_CONFIG && window.SITE_CONFIG.PLAN_NAMES) || { free: 'مجاني', starter: 'مبتدئ', pro: 'احترافي' };
    return names[plan] || 'مجاني';
  }

  // ألوان شارات الخطة
  function planBadge(plan) {
    const map = {
      free: '<span class="status-badge" style="background:#F7F8FA;color:#4A4A5A;">مجاني</span>',
      starter: '<span class="status-badge warning">مبتدئ</span>',
      pro: '<span class="status-badge success">احترافي</span>',
      trial: '<span class="status-badge" style="background:#EFF6FF;color:#3B82F6;">تجربة مجانية</span>'
    };
    return map[plan] || map.free;
  }

  // ================== مهلة زمنية للأمان ==================
  // تمنع تعليق الصفحة إذا تعطل الاتصال بقاعدة البيانات
  function withTimeout(promise, ms, fallbackValue) {
    return new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(fallbackValue); }
      }, ms || 6000);
      promise.then(v => {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }).catch(() => {
        if (!done) { done = true; clearTimeout(timer); resolve(fallbackValue); }
      });
    });
  }

  // ================== تحميل إعدادات المنصة ==================
  // الإعدادات تُقرأ من Firestore (settings/platform) وتتجاوز
  // القيم الافتراضية الموجودة في site-config.js
  async function loadSettings(db) {
    const defaults = {
      adminEmails: (window.SITE_CONFIG.ADMIN_EMAILS || []).slice(),
      paypalClientId: window.SITE_CONFIG.PAYPAL_CLIENT_ID || '',
      paypalCurrency: window.SITE_CONFIG.PAYPAL_CURRENCY || 'USD',
      vodafoneNumber: window.SITE_CONFIG.VODAFONE_NUMBER || '',
      vodafoneName: window.SITE_CONFIG.VODAFONE_NAME || 'BlogPush',
      prices: Object.assign({ starter: 19, pro: 49 }, window.SITE_CONFIG.PRICES || {}),
      usdToEgp: window.SITE_CONFIG.USD_TO_EGP || 50,
      limits: Object.assign({ free: 1000, starter: 10000, pro: 100000 }, window.SITE_CONFIG.LIMITS || {}),
      trialDays: window.SITE_CONFIG.TRIAL_DAYS || 14,
      subscriptionDays: window.SITE_CONFIG.SUBSCRIPTION_DAYS || 30,
      supportEmail: window.SITE_CONFIG.SUPPORT_EMAIL || 'support@blogpush.com'
    };

    // ⚡ نضع الافتراضيات فوراً حتى لا تبقى الإعدادات null
    // ثم نحاول جلب التجاوزات من Firestore (إن تعطل الاتصال تبقى الافتراضية)
    state.settings = defaults;

    try {
      const doc = await withTimeout(db.collection('settings').doc('platform').get(), 2500, { exists: false });
      if (doc.exists) {
        const data = doc.data() || {};
        // دمج الإعدادات المحفوظة فوق الافتراضية
        if (Array.isArray(data.adminEmails) && data.adminEmails.length) defaults.adminEmails = data.adminEmails;
        if (typeof data.paypalClientId === 'string') defaults.paypalClientId = data.paypalClientId;
        if (typeof data.paypalCurrency === 'string' && data.paypalCurrency) defaults.paypalCurrency = data.paypalCurrency;
        if (typeof data.vodafoneNumber === 'string') defaults.vodafoneNumber = data.vodafoneNumber;
        if (typeof data.vodafoneName === 'string' && data.vodafoneName) defaults.vodafoneName = data.vodafoneName;
        if (data.prices && typeof data.prices === 'object') defaults.prices = Object.assign(defaults.prices, data.prices);
        if (typeof data.usdToEgp === 'number' && data.usdToEgp > 0) defaults.usdToEgp = data.usdToEgp;
        if (data.limits && typeof data.limits === 'object') defaults.limits = Object.assign(defaults.limits, data.limits);
        if (typeof data.trialDays === 'number') defaults.trialDays = data.trialDays;
        if (typeof data.subscriptionDays === 'number') defaults.subscriptionDays = data.subscriptionDays;
        if (typeof data.supportEmail === 'string' && data.supportEmail) defaults.supportEmail = data.supportEmail;
      } else {
        // أول تشغيل: إنشاء مستند الإعدادات الافتراضية
        try {
          await withTimeout(db.collection('settings').doc('platform').set(Object.assign({}, defaults, {
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          })), 2500, null);
          console.log('✅ تم إنشاء إعدادات المنصة الافتراضية');
        } catch (e) {
          console.warn('⚠️ تعذر إنشاء مستند الإعدادات (قد تحتاج لضبط قواعد Firestore):', e.message);
        }
      }
    } catch (e) {
      console.warn('⚠️ فشل تحميل الإعدادات، سيتم استخدام القيم الافتراضية:', e.message);
    }

    state.settings = defaults;
    return defaults;
  }

  // ================== هل هذا البريد أدمن؟ ==================
  function isAdminEmail(email) {
    if (!email) return false;
    const list = (state.settings && state.settings.adminEmails) ||
                 (window.SITE_CONFIG && window.SITE_CONFIG.ADMIN_EMAILS) || [];
    return list.some(e => String(e).toLowerCase().trim() === String(email).toLowerCase().trim());
  }

  // ================== ضمان وجود ملف المستخدم ==================
  async function ensureUserDoc(db, user) {
    const ref = db.collection('users').doc(user.uid);
    const admin = isAdminEmail(user.email);
    const now = firebase.firestore.FieldValue.serverTimestamp();

    // ⚡ ملف محلي فوري — يضمن عمل الصفحات حتى لو تعطل Firestore
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + ((state.settings && state.settings.trialDays) || 14));
    state.profile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'مستخدم'),
      photoURL: user.photoURL || '',
      role: admin ? 'admin' : 'user',
      plan: 'free',
      planStartedAt: null,
      planExpiry: null,
      trialEndsAt: firebase.firestore.Timestamp.fromDate(trialEndsAt),
      status: 'active',
      createdAt: now,
      lastLoginAt: now
    };

    try {
      const snap = await withTimeout(ref.get(), 2500, { exists: false });

      if (snap.exists) {
        const existing = snap.data() || {};
        // دمج بيانات Firestore الحقيقية فوق الملف المحلي
        state.profile = Object.assign({}, state.profile, existing, { uid: user.uid });
        const updates = { lastLoginAt: now };
        if (admin && existing.role !== 'admin') updates.role = 'admin';
        try {
          await withTimeout(ref.update(updates), 2500, null);
        } catch (e) { /* غير حرج */ }
        state.profile = Object.assign({}, state.profile, updates);
      } else {
        // أول دخول: إنشاء الملف في Firestore
        try {
          await withTimeout(ref.set(state.profile, { merge: true }), 2500, null);
          console.log('✅ تم إنشاء ملف المستخدم في Firestore');
        } catch (e) {
          console.warn('⚠️ تعذر إنشاء ملف المستخدم (سيُعاد عند نشر القواعد):', e.message);
        }
      }
    } catch (e) {
      console.warn('⚠️ تعذر قراءة ملف المستخدم:', e.message);
    }

    state.isAdmin = (state.profile && state.profile.role === 'admin') || admin;

    // ================== فحص الحظر ==================
    if (state.profile.status === 'blocked') {
      showToast('تم حظر حسابك. تواصل مع الدعم للمزيد من المعلومات.', 'error');
      await firebase.auth().signOut();
      window.location.href = 'login.html?blocked=1';
      return false;
    }

    // ================== انتهاء صلاحية الخطة ==================
    await enforcePlanExpiry(db);

    return true;
  }

  // تحويل المستخدم تلقائياً للخطة المجانية عند انتهاء اشتراكه
  async function enforcePlanExpiry(db) {
    const p = state.profile;
    if (!p || p.plan === 'free' || !p.planExpiry) return;
    const expiry = p.planExpiry?.toDate ? p.planExpiry.toDate() : new Date(p.planExpiry);
    if (expiry && expiry.getTime() < Date.now()) {
      try {
        await withTimeout(db.collection('users').doc(p.uid).update({
          plan: 'free',
          planExpiry: null,
          planEndedAt: firebase.firestore.FieldValue.serverTimestamp()
        }), 2500, null);
        p.plan = 'free';
        p.planExpiry = null;
        showToast('انتهت صلاحية اشتراكك — تمت إعادتك للخطة المجانية.', 'warning');
      } catch (e) { /* غير حرج */ }
    }
  }

  // ================== الخطة الفعلية (تشمل التجربة) ==================
  function effectivePlan() {
    const p = state.profile;
    if (!p) return 'free';
    if (p.plan && p.plan !== 'free') return p.plan;
    if (p.trialEndsAt) {
      const t = p.trialEndsAt?.toDate ? p.trialEndsAt.toDate() : new Date(p.trialEndsAt);
      if (t && t.getTime() > Date.now()) return 'trial';
    }
    return 'free';
  }

  // حد المشتركين حسب الخطة الفعلية
  function subscriberLimit() {
    const plan = effectivePlan();
    const limits = (state.settings && state.settings.limits) || { free: 1000, starter: 10000, pro: 100000 };
    if (plan === 'trial') return limits.starter || 10000;
    return limits[plan] || 1000;
  }

  // أيام التجربة المتبقية
  function trialDaysLeft() {
    const p = state.profile;
    if (!p || !p.trialEndsAt) return 0;
    const t = p.trialEndsAt?.toDate ? p.trialEndsAt.toDate() : new Date(p.trialEndsAt);
    if (!t) return 0;
    const diff = Math.ceil((t.getTime() - Date.now()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  // أيام اشتراك مدفوع متبقية
  function paidDaysLeft() {
    const p = state.profile;
    if (!p || p.plan === 'free' || !p.planExpiry) return 0;
    const t = p.planExpiry?.toDate ? p.planExpiry.toDate() : new Date(p.planExpiry);
    if (!t) return 0;
    const diff = Math.ceil((t.getTime() - Date.now()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  // ============================================================
  // إظهار/إخفاء عناصر الأدمن + شارة الخطة في كل الصفحات
  // ============================================================
  function applyUiState() {
    // عناصر تظهر للأدمن فقط
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = state.isAdmin ? '' : 'none';
    });
    // شارة اسم الخطة إن وُجد عنصر planBadgeEl
    const badge = document.getElementById('planBadge');
    if (badge) {
      const plan = effectivePlan();
      badge.innerHTML = plan === 'trial'
        ? '<span class="status-badge" style="background:#EFF6FF;color:#3B82F6;">تجربة ' + trialDaysLeft() + ' يوم</span>'
        : planBadge(plan);
    }
  }

  // ============================================================
  // التشغيل التلقائي: مراقبة حالة تسجيل الدخول
  // ============================================================
  function boot() {
    if (typeof firebase === 'undefined') {
      console.error('❌ core.js: Firebase غير محمل — تأكد من تضمين firebase-config.js أولاً');
      return;
    }
    const db = window.db || firebase.firestore();

    // حقن زر الرجوع فوراً — لا يحتاج انتظار المصادقة
    injectBackButton();

    firebase.auth().onAuthStateChanged(async function (user) {
      if (!user) {
        // غير مسجل → توجيه لصفحة الدخول (عدا الصفحات العامة)
        if (document.body.hasAttribute('data-public-page')) return;
        if (!document.body.hasAttribute('data-auth-optional')) {
          window.location.href = 'login.html';
        }
        return;
      }

      state.user = user;
      // مهلة إجمالية: تضمن جاهزية النظام حتى لو تعطل الاتصال بقاعدة البيانات
      await Promise.race([
        Promise.all([
          loadSettings(db),
          ensureUserDoc(db, user)
        ]),
        new Promise(r => setTimeout(r, 6500))
      ]);

      applyUiState();
      state.ready = true;

      // تنفيذ النداءات المنتظرة
      const listeners = state.listeners.splice(0);
      listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });

      // تحديث عناصر المستخدم الشائعة إن وجدت
      const name = user.displayName || (user.email ? user.email.split('@')[0] : 'مستخدم');
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('userName', name);
      set('userEmail', user.email || '');
      const av = document.getElementById('userAvatar');
      if (av) av.textContent = name.charAt(0).toUpperCase();
    });

    // إغلاق قائمة الخروج عند النقر خارجها (سلوك مشترك)
    document.addEventListener('click', (e) => {
      const card = document.getElementById('userCard');
      const menu = document.getElementById('logoutMenu');
      if (card && menu && !card.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = 'none';
      }
    });
  }

  // ============================================================
  // تسجيل خروج موحد
  // ============================================================
  function logout() {
    firebase.auth().signOut().then(() => { window.location.href = 'login.html'; });
  }

  // ============================================================
  // زر الرجوع الذكي — يُحقن تلقائياً في الشريط العلوي
  // لكل صفحات اللوحة ما عدا dashboard.html (الصفحة الرئيسية)
  // المنطق: يعود لتاريخ المتصفح إن وُجد، وإلا → dashboard.html
  // ============================================================
  function injectBackButton() {
    const page = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    if (page === 'dashboard.html') return;

    const topBar = document.querySelector('.main-content .top-bar, .top-bar');
    if (!topBar || topBar.querySelector('.back-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-btn';
    btn.setAttribute('aria-label', 'الرجوع للصفحة السابقة');
    btn.title = 'رجوع';
    btn.innerHTML = '<span class="bp-arrow"><i class="fas fa-arrow-right" aria-hidden="true"></i></span>' +
                    '<span class="bp-label">رجوع</span>';

    btn.addEventListener('click', () => {
      // رجوع ذكي: فقط إذا كان السجل داخلياً (من نفس الموقع)
      if (history.length > 1 && document.referrer && document.referrer.includes(location.host)) {
        history.back();
      } else {
        location.href = 'dashboard.html';
      }
    });

    topBar.insertBefore(btn, topBar.firstChild);
  }

  // ============================================================
  // تهيئة عناصر الصفحة المشتركة (القائمة الجانبية، الخروج)
  // تُستخدم في الصفحات الجديدة لتجنب تكرار الكود
  // ============================================================
  function initPageChrome() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.getElementById('menuToggle');
    const userCard = document.getElementById('userCard');
    const logoutMenu = document.getElementById('logoutMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    function toggleSidebar(open) {
      if (!sidebar) return;
      if (open) { sidebar.classList.add('open'); if (sidebarOverlay) sidebarOverlay.classList.add('open'); }
      else { sidebar.classList.remove('open'); if (sidebarOverlay) sidebarOverlay.classList.remove('open'); }
    }
    if (menuToggle && sidebar) {
      menuToggle.addEventListener('click', () => toggleSidebar(!sidebar.classList.contains('open')));
    }
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    if (userCard && logoutMenu) {
      userCard.addEventListener('click', () => {
        logoutMenu.style.display = logoutMenu.style.display === 'block' ? 'none' : 'block';
      });
    }
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  // إخفاء طبقة التحميل
  function hideLoader() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
  }

  // ============================================================
  // واجهة عامة window.bp
  // ============================================================
  window.bp = {
    // انتظر جاهزية النظام (المصادقة + الملف + الإعدادات)
    onReady(fn) {
      if (state.ready) { setTimeout(() => fn(state), 0); }
      else state.listeners.push(fn);
    },
    get state() { return state; },
    get user() { return state.user; },
    get profile() { return state.profile; },
    get settings() { return state.settings; },
    get isAdmin() { return state.isAdmin; },
    db() { return window.db || firebase.firestore(); },
    effectivePlan, subscriberLimit, trialDaysLeft, paidDaysLeft,
    showToast, fmtDate, fmtUSD, fmtEGP, planName, planBadge,
    logout, initPageChrome, hideLoader, injectBackButton,
    // إعادة تحميل الإعدادات (بعد تعديلها من لوحة الأدمن)
    async reloadSettings() { return loadSettings(window.db || firebase.firestore()); }
  };

  // بدء التشغيل
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('✅ core.js v1.0 جاهز');
})();
