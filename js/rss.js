/* ================================================================
   js/rss.js – الإشعارات التلقائية عبر RSS
   ------------------------------------------------------------
   - إدارة خطط RSS لكل موقع
   - فحص خلاصة Blogger لاكتشاف التدوينات الجديدة
   - إنشاء حملات تلقائية (فورية أو مسودة)
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();
  const FV = () => firebase.firestore.FieldValue;

  let mySites = [];
  let myFeeds = [];

  window.bp.onReady(async function () {
    window.bp.initPageChrome();
    window.bp.hideLoader();
    await loadSites();
    await loadFeeds();
    renderFeeds();
  });

  // ============================================================
  // تحميل المواقع لاختيار الموقع
  // ============================================================
  async function loadSites() {
    try {
      const snap = await db().collection('websites')
        .where('userId', '==', window.bp.user.uid).get();
      mySites = [];
      snap.forEach(d => mySites.push({ id: d.id, ...d.data() }));

      const select = document.getElementById('rssSiteSelect');
      select.innerHTML = '<option value="">— اختر موقعاً —</option>' +
        mySites.map(s => '<option value="' + s.id + '">' + (s.siteName || s.siteUrl) + '</option>').join('');
    } catch (e) {
      console.error('❌ خطأ تحميل المواقع:', e);
    }
  }

  // تعبئة رابط الفيد تلقائياً عند اختيار موقع (Blogger الافتراضي)
  document.getElementById('rssSiteSelect').addEventListener('change', function () {
    const site = mySites.find(s => s.id === this.value);
    const urlInput = document.getElementById('rssFeedUrl');
    if (site && site.siteUrl && !urlInput.value) {
      const base = site.siteUrl.replace(/\/+$/, '');
      // صيغة خلاصة Blogger الافتراضية
      if (base.includes('blogspot.com') || true) {
        urlInput.value = base + '/feeds/posts/default?alt=json';
      }
    }
  });

  // ============================================================
  // تحميل خطط RSS الخاصة بي
  // ============================================================
  async function loadFeeds() {
    try {
      const snap = await db().collection('rssFeeds')
        .where('userId', '==', window.bp.user.uid).get();
      myFeeds = [];
      snap.forEach(d => myFeeds.push({ id: d.id, ...d.data() }));
      myFeeds.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() || 0;
        const dbb = b.createdAt?.toDate?.()?.getTime() || 0;
        return dbb - da;
      });
    } catch (e) {
      console.error('❌ خطأ تحميل الخطط:', e);
    }
  }

  // ============================================================
  // إضافة خطة RSS
  // ============================================================
  document.getElementById('addRssForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const siteId = document.getElementById('rssSiteSelect').value;
    const feedUrl = document.getElementById('rssFeedUrl').value.trim();
    const mode = document.getElementById('rssMode').value;
    const btn = document.getElementById('addRssBtn');

    if (!siteId) { window.bp.showToast('اختر موقعاً أولاً', 'error'); return; }
    if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) {
      window.bp.showToast('أدخل رابط خلاصة صحيح يبدأ بـ http', 'error');
      return;
    }
    if (myFeeds.some(f => f.siteId === siteId)) {
      window.bp.showToast('هذا الموقع لديه خطة RSS بالفعل — عدّلها من البطاقة', 'warning');
      return;
    }

    const site = mySites.find(s => s.id === siteId);
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإضافة...';

    try {
      await db().collection('rssFeeds').add({
        userId: window.bp.user.uid,
        siteId: siteId,
        siteName: site?.siteName || site?.siteUrl || 'موقع',
        siteUrl: site?.siteUrl || '',
        feedUrl: feedUrl,
        mode: mode,                 // auto | draft
        enabled: true,
        lastPostUrl: '',
        lastCheckedAt: null,
        autoCount: 0,
        createdAt: FV().serverTimestamp()
      });
      window.bp.showToast('تم إضافة خطة RSS بنجاح ✅', 'success');
      document.getElementById('rssFeedUrl').value = '';
      document.getElementById('rssSiteSelect').value = '';
      await loadFeeds();
      renderFeeds();
    } catch (err) {
      window.bp.showToast('فشل الإضافة: ' + err.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus"></i> إضافة';
  });

  // ============================================================
  // عرض الخطط
  // ============================================================
  function renderFeeds() {
    const box = document.getElementById('feedsList');

    if (myFeeds.length === 0) {
      box.innerHTML =
        '<div class="empty-state" style="text-align:center;padding:50px;background:var(--color-white);border:1px dashed var(--color-light);border-radius:var(--radius-lg);">' +
        '<i class="fas fa-rss" style="font-size:46px;color:var(--color-gray);display:block;margin-bottom:16px;"></i>' +
        '<h3 style="font-size:19px;margin-bottom:6px;">لا توجد خطط RSS بعد</h3>' +
        '<p style="color:var(--color-mid);font-size:14px;">أضف موقعاً من صفحة المواقع أولاً، ثم أضف خطة RSS من النموذج أعلاه</p>' +
        '</div>';
      return;
    }

    box.innerHTML = myFeeds.map(f => {
      const modeBadge = f.mode === 'auto'
        ? '<span class="status-badge success">إرسال فوري</span>'
        : '<span class="status-badge warning">مسودة تنتظر موافقتي</span>';
      const enabledBadge = f.enabled
        ? '<span class="status-badge" style="background:#EFF6FF;color:#3B82F6;">مفعّلة</span>'
        : '<span class="status-badge" style="background:#F7F8FA;color:#4A4A5A;">متوقفة</span>';

      return '<div class="feed-card">' +
        '<div class="feed-head">' +
        '<div><div class="f-name"><i class="fas fa-rss" style="color:#F59E0B;"></i> ' + esc(f.siteName) + '</div>' +
        '<div class="f-url">' + esc(f.feedUrl) + '</div></div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' + modeBadge + enabledBadge + '</div>' +
        '</div>' +
        '<div class="feed-meta">' +
        '<div class="item"><div class="lbl">آخر فحص</div><div class="val">' + window.bp.fmtDate(f.lastCheckedAt, true) + '</div></div>' +
        '<div class="item"><div class="lbl">إشعارات أنشأتها</div><div class="val">' + (f.autoCount || 0).toLocaleString('ar-EG') + '</div></div>' +
        '<div class="item"><div class="lbl">آخر تدوينة مكتشفة</div><div class="val" style="font-size:12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(f.lastPostTitle || '—') + '</div></div>' +
        '</div>' +
        '<div class="row-actions" style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn-sm primary" onclick="rssPage.checkNow(\'' + f.id + '\')"><i class="fas fa-magnifying-glass"></i> فحص الآن</button>' +
        '<button class="btn-sm" onclick="rssPage.toggleEnabled(\'' + f.id + '\')">' +
        (f.enabled ? '<i class="fas fa-pause"></i> إيقاف مؤقت' : '<i class="fas fa-play"></i> تفعيل') + '</button>' +
        '<button class="btn-sm" onclick="rssPage.changeMode(\'' + f.id + '\')"><i class="fas fa-shuffle"></i> تبديل النمط</button>' +
        '<button class="btn-sm danger" onclick="rssPage.deleteFeed(\'' + f.id + '\')"><i class="fas fa-trash-alt"></i> حذف</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ============================================================
  // فحص الخلاصة الآن (اكتشاف التدوينات الجديدة)
  // ============================================================
  async function checkNow(feedId) {
    const feed = myFeeds.find(f => f.id === feedId);
    if (!feed) return;

    window.bp.showToast('⏳ جاري فحص الخلاصة...', 'info');

    try {
      const items = await fetchFeed(feed.feedUrl);
      if (items.length === 0) {
        window.bp.showToast('لم نتمكن من قراءة الخلاصة — تأكد من الرابط', 'error');
        return;
      }

      const latest = items[0]; // الأحدث أولاً
      const isNew = latest.link !== feed.lastPostUrl;

      // تحديث حالة الفحص
      await db().collection('rssFeeds').doc(feedId).update({
        lastCheckedAt: FV().serverTimestamp(),
        lastPostUrl: isNew ? latest.link : feed.lastPostUrl,
        lastPostTitle: isNew ? latest.title : (feed.lastPostTitle || '')
      });

      if (!isNew) {
        window.bp.showToast('لا توجد تدوينات جديدة — آخر تدوينة مكتشفة سابقاً', 'info');
        await loadFeeds(); renderFeeds();
        return;
      }

      // إنشاء حملة من التدوينة الجديدة
      const isAuto = feed.mode === 'auto';
      await db().collection('campaigns').add({
        userId: window.bp.user.uid,
        siteId: feed.siteId,
        siteName: feed.siteName,
        title: latest.title,
        body: 'تدوينة جديدة: ' + latest.title,
        url: latest.link,
        type: 'rss-auto',
        status: isAuto ? 'sent' : 'draft',
        source: 'rss',
        delivered: isAuto ? 0 : undefined,
        opens: 0,
        clicks: 0,
        createdAt: FV().serverTimestamp(),
        sentAt: isAuto ? FV().serverTimestamp() : null
      });

      await db().collection('rssFeeds').doc(feedId).update({
        autoCount: (feed.autoCount || 0) + 1
      });

      window.bp.showToast(
        isAuto
          ? '🚀 تم اكتشاف تدوينة جديدة وإرسال الإشعار!'
          : '📝 تم اكتشاف تدوينة جديدة — أنشأنا مسودة تنتظر موافقتك في صفحة الحملات',
        'success'
      );

      await loadFeeds(); renderFeeds();
    } catch (e) {
      console.error('❌ فحص الخلاصة:', e);
      window.bp.showToast('فشل فحص الخلاصة: ' + e.message, 'error');
    }
  }

  // ============================================================
  // قراءة خلاصة RSS/Atom (عبر وسيط CORS)
  // ============================================================
  async function fetchFeed(url) {
    const proxies = [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
      'https://corsproxy.io/?' + encodeURIComponent(url)
    ];

    let xml = null;
    for (const p of proxies) {
      try {
        const res = await fetch(p, { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        if (text && text.length > 100) { xml = text; break; }
      } catch (e) { /* المحاولة التالية */ }
    }
    if (!xml) throw new Error('تعذر الوصول للخلاصة (جرّب لاحقاً)');

    // دعم RSS 2.0 و Atom
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = [];

    doc.querySelectorAll('item').forEach(item => {
      items.push({
        title: item.querySelector('title')?.textContent || 'بدون عنوان',
        link: item.querySelector('link')?.textContent || ''
      });
    });
    if (items.length === 0) {
      doc.querySelectorAll('entry').forEach(entry => {
        items.push({
          title: entry.querySelector('title')?.textContent || 'بدون عنوان',
          link: entry.querySelector('link')?.getAttribute('href') || ''
        });
      });
    }
    return items;
  }

  // ============================================================
  // إجراءات الخطط
  // ============================================================
  async function toggleEnabled(feedId) {
    const f = myFeeds.find(x => x.id === feedId);
    try {
      await db().collection('rssFeeds').doc(feedId).update({ enabled: !f.enabled });
      window.bp.showToast(f.enabled ? 'تم إيقاف الخطة مؤقتاً' : 'تم تفعيل الخطة ✅', 'success');
      await loadFeeds(); renderFeeds();
    } catch (e) { window.bp.showToast('فشل: ' + e.message, 'error'); }
  }

  async function changeMode(feedId) {
    const f = myFeeds.find(x => x.id === feedId);
    const newMode = f.mode === 'auto' ? 'draft' : 'auto';
    try {
      await db().collection('rssFeeds').doc(feedId).update({ mode: newMode });
      window.bp.showToast(newMode === 'auto' ? 'النمط: إرسال فوري' : 'النمط: مسودة تنتظر موافقتك', 'success');
      await loadFeeds(); renderFeeds();
    } catch (e) { window.bp.showToast('فشل: ' + e.message, 'error'); }
  }

  async function deleteFeed(feedId) {
    if (!confirm('حذف خطة RSS هذه؟ لن تتأثر حملاتك الموجودة.')) return;
    try {
      await db().collection('rssFeeds').doc(feedId).delete();
      window.bp.showToast('تم الحذف', 'success');
      await loadFeeds(); renderFeeds();
    } catch (e) { window.bp.showToast('فشل: ' + e.message, 'error'); }
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.rssPage = { checkNow, toggleEnabled, changeMode, deleteFeed };

  console.log('✅ rss.js جاهز');
});
