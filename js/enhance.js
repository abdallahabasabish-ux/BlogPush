/* ============================================================
   enhance.js — BlogPush Design System 2.0
   حقن أزرار الرجوع ومسار التنقل في الصفحات العامة وصفحات الدخول
   (صفحات اللوحة تستخدم core.js — هذا الملف للبقية)
   يعمل تلقائياً بدون أي إعدادات.
   ============================================================ */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  /* ----------------------------------------------------------
     1) أنماط ذاتية لصفحات الدخول/التسجيل (لا تحمّل style.css)
     ---------------------------------------------------------- */
  function ensureCss() {
    if (document.querySelector('link[href*="style.css"]')) return; // الأنماط موجودة
    var css = document.createElement('style');
    css.id = 'bp-enhance-css';
    css.textContent =
      ':root{--bp-grad:linear-gradient(135deg,#6366F1 0%,#8B5CF6 55%,#A855F7 100%);--bp-shadow:0 8px 22px rgba(99,102,241,.30)}' +
      '.bp-float-back{position:fixed;top:22px;inset-inline-start:22px;z-index:9999;display:inline-flex;align-items:center;gap:9px;' +
      'height:46px;padding:0 20px 0 16px;border-radius:999px;background:rgba(255,255,255,.82);backdrop-filter:blur(12px);' +
      '-webkit-backdrop-filter:blur(12px);border:1px solid rgba(26,26,46,.08);color:#1A1A2E;font-family:Cairo,Inter,sans-serif;' +
      'font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 20px rgba(26,26,46,.10);transition:all .25s ease}' +
      '.bp-float-back i{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;' +
      'background:var(--bp-grad);color:#fff;font-size:12px;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}' +
      '.bp-float-back:hover{transform:translateY(-2px);box-shadow:var(--bp-shadow);color:#6366F1}' +
      '.bp-float-back:hover i{transform:translateX(4px)}' +
      '@media(max-width:768px){.bp-float-back span{display:none}.bp-float-back{width:48px;padding:0;justify-content:center;top:14px;inset-inline-start:14px}}';
    document.head.appendChild(css);
  }

  /* ----------------------------------------------------------
     2) الرجوع الذكي: تاريخ المتصفح الداخلي، وإلا الرئيسية
     ---------------------------------------------------------- */
  function smartBack(fallbackUrl) {
    if (history.length > 1 && document.referrer && document.referrer.indexOf(location.host) > -1) {
      history.back();
    } else {
      location.href = fallbackUrl;
    }
  }

  /* ----------------------------------------------------------
     3) مسار تنقل + زر رجوع داخل page-hero (الصفحات العامة)
     ---------------------------------------------------------- */
  function injectBreadcrumb() {
    var heroContainer = document.querySelector('.page-hero > .container');
    if (!heroContainer || document.querySelector('.bp-crumbbar')) return;

    var label = '';
    var tag = document.querySelector('.page-hero .tag');
    if (tag && tag.textContent.trim()) {
      label = tag.textContent.trim();
    } else {
      var h1 = document.querySelector('.page-hero h1');
      label = h1 ? h1.textContent.trim().split(/\s+/).slice(0, 3).join(' ') : 'الصفحة';
    }

    var bar = document.createElement('div');
    bar.className = 'bp-crumbbar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'مسار التنقل');

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'bp-crumb';
    back.setAttribute('aria-label', 'الرجوع للصفحة السابقة');
    back.innerHTML = '<i class="fas fa-arrow-right" aria-hidden="true"></i> رجوع';
    back.addEventListener('click', function () { smartBack('index.html'); });

    var sep1 = document.createElement('span');
    sep1.className = 'bp-crumb-sep';
    sep1.textContent = '/';

    var home = document.createElement('a');
    home.className = 'bp-crumb';
    home.href = 'index.html';
    home.innerHTML = '<i class="fas fa-home" aria-hidden="true"></i> الرئيسية';

    var sep2 = document.createElement('span');
    sep2.className = 'bp-crumb-sep';
    sep2.textContent = '/';

    var current = document.createElement('span');
    current.className = 'bp-crumb current';
    current.textContent = label;
    current.setAttribute('aria-current', 'page');

    bar.appendChild(back);
    bar.appendChild(sep1);
    bar.appendChild(home);
    bar.appendChild(sep2);
    bar.appendChild(current);

    heroContainer.insertBefore(bar, heroContainer.firstChild);
  }

  /* ----------------------------------------------------------
     4) زر رجوع عائم لصفحات الدخول والتسجيل
     ---------------------------------------------------------- */
  function injectFloatBack() {
    if (document.querySelector('.bp-float-back')) return;
    var isAuth = document.querySelector('.auth-container, .auth-card, .auth-form-wrapper');
    if (!isAuth) return;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bp-float-back';
    b.title = 'العودة للصفحة الرئيسية';
    b.setAttribute('aria-label', 'العودة للصفحة الرئيسية');
    b.innerHTML = '<i class="fas fa-arrow-right" aria-hidden="true"></i><span>الرئيسية</span>';
    b.addEventListener('click', function () { smartBack('index.html'); });
    document.body.appendChild(b);
  }

  /* ----------------------------------------------------------
     5) التشغيل
     ---------------------------------------------------------- */
  function init() {
    if (page === 'index.html') return; // الصفحة الرئيسية لا تحتاج رجوع
    ensureCss();
    injectBreadcrumb();
    injectFloatBack();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
