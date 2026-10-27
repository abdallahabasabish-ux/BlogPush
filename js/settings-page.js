/* ================================================================
   js/settings-page.js – إعدادات الحساب
   ------------------------------------------------------------
   - الملف الشخصي، كلمة المرور، الخطة، التفضيلات
   - كود التكامل مع Blogger
   - منطقة الخطر (حذف الحساب)
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();
  const FV = () => firebase.firestore.FieldValue;

  window.bp.onReady(async function () {
    window.bp.initPageChrome();
    window.bp.hideLoader();
    fillProfile();
    fillPlan();
    loadPrefs();
    renderIntegrationCode();
  });

  // ============================================================
  // الملف الشخصي
  // ============================================================
  function fillProfile() {
    const user = window.bp.user;
    document.getElementById('setName').value = user.displayName || '';
    document.getElementById('setEmail').value = user.email || '';
  }

  document.getElementById('profileForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('setName').value.trim();
    if (name.length < 2) { window.bp.showToast('الاسم قصير جداً', 'error'); return; }

    try {
      await window.bp.user.updateProfile({ displayName: name });
      await db().collection('users').doc(window.bp.user.uid).update({
        displayName: name,
        updatedAt: FV().serverTimestamp()
      });
      // تحديث الواجهة
      document.getElementById('userName').textContent = name;
      const av = document.getElementById('userAvatar');
      if (av) av.textContent = name.charAt(0).toUpperCase();
      window.bp.showToast('تم حفظ الملف الشخصي ✅', 'success');
    } catch (err) {
      window.bp.showToast('فشل الحفظ: ' + err.message, 'error');
    }
  });

  // ============================================================
  // الخطة
  // ============================================================
  function fillPlan() {
    const plan = window.bp.effectivePlan();
    document.getElementById('setPlanName').textContent =
      plan === 'trial' ? 'تجربة مجانية' : window.bp.planName(plan);

    let statusHtml = '';
    let details = '';
    if (plan === 'trial') {
      statusHtml = '<span class="status-badge" style="background:#EFF6FF;color:#3B82F6;">متبقي ' + window.bp.trialDaysLeft() + ' يوم</span>';
      details = 'أنت تستخدم مميزات خطة مبتدئ مجاناً خلال فترة التجربة. حد المشتركين: ' +
        window.bp.subscriberLimit().toLocaleString('ar-EG');
    } else if (plan === 'free') {
      statusHtml = '<span class="status-badge" style="background:#F7F8FA;color:#4A4A5A;">مجاني</span>';
      details = 'حد المشتركين في خطتك: ' + window.bp.subscriberLimit().toLocaleString('ar-EG') +
        ' — ارفع خطتك لتوسيع الحدود والوصول لمميزات أكثر.';
    } else {
      const expiry = window.bp.profile?.planExpiry?.toDate?.();
      statusHtml = '<span class="status-badge success">نشط</span>';
      details = 'اشتراكك ينتهي في ' + window.bp.fmtDate(expiry) + ' (متبقي ' +
        window.bp.paidDaysLeft() + ' يوم) — حد المشتركين: ' + window.bp.subscriberLimit().toLocaleString('ar-EG');
    }
    document.getElementById('setPlanStatus').innerHTML = statusHtml;
    document.getElementById('setPlanDetails').textContent = details;
  }

  // ============================================================
  // كلمة المرور
  // ============================================================
  document.getElementById('passwordForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const current = document.getElementById('pwdCurrent').value;
    const newPwd = document.getElementById('pwdNew').value;
    const confirm = document.getElementById('pwdConfirm').value;

    if (newPwd !== confirm) { window.bp.showToast('كلمتا المرور غير متطابقتين', 'error'); return; }
    if (newPwd.length < 6) { window.bp.showToast('كلمة المرور قصيرة (6 أحرف على الأقل)', 'error'); return; }

    const user = window.bp.user;
    try {
      // إعادة المصادقة ثم التغيير
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(newPwd);
      window.bp.showToast('تم تغيير كلمة المرور بنجاح ✅', 'success');
      document.getElementById('passwordForm').reset();
    } catch (err) {
      let msg = 'فشل تغيير كلمة المرور: ' + err.message;
      if (err.code === 'auth/wrong-password') msg = 'كلمة المرور الحالية غير صحيحة';
      if (err.code === 'auth/no-such-user' || err.code === 'auth/user-mismatch') msg = 'حسابك مسجل عبر Google — لا توجد كلمة مرور';
      if (err.code === 'auth/requires-recent-login') msg = 'يرجى تسجيل الخروج والدخول ثم المحاولة مجدداً';
      window.bp.showToast(msg, 'error');
    }
  });

  // ============================================================
  // التفضيلات
  // ============================================================
  function loadPrefs() {
    const prefs = window.bp.profile?.preferences || {};
    document.getElementById('prefNewSub').checked = prefs.notifyNewSubscriber !== false;
    document.getElementById('prefRss').checked = prefs.notifyRss !== false;
    document.getElementById('prefWeekly').checked = prefs.weeklyReport === true;
  }

  async function savePrefs() {
    try {
      await db().collection('users').doc(window.bp.user.uid).update({
        preferences: {
          notifyNewSubscriber: document.getElementById('prefNewSub').checked,
          notifyRss: document.getElementById('prefRss').checked,
          weeklyReport: document.getElementById('prefWeekly').checked
        },
        updatedAt: FV().serverTimestamp()
      });
      window.bp.showToast('تم حفظ التفضيلات ✅', 'success');
    } catch (e) {
      window.bp.showToast('فشل الحفظ: ' + e.message, 'error');
    }
  }

  // ============================================================
  // كود التكامل مع Blogger
  // ============================================================
  async function renderIntegrationCode() {
    const el = document.getElementById('integCode');
    try {
      // أول موقع موثق للمستخدم
      const snap = await db().collection('websites')
        .where('userId', '==', window.bp.user.uid).limit(1).get();

      let siteId = 'SITE_ID';
      if (!snap.empty) {
        const d = snap.docs[0].data();
        siteId = d.siteId || 'SITE_ID';
      }

      const code =
        '<!-- BlogPush SDK -->\n' +
        '<script src="https://blogpush.example.com/sdk.js" data-site="' + siteId + '" defer><\/script>';

      el.innerHTML = '<button class="copy-btn" onclick="settingsPage.copyCode(this)">نسخ</button>' +
        code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    } catch (e) {
      el.textContent = 'تعذر توليد الكود — أضف موقعاً أولاً من صفحة المواقع';
    }
  }

  function copyCode(btn) {
    const block = btn.parentElement.cloneNode(true);
    block.querySelector('.copy-btn')?.remove();
    const text = block.textContent;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ تم النسخ!';
        setTimeout(() => btn.textContent = 'نسخ', 2000);
      });
    }
  }

  // ============================================================
  // منطقة الخطر
  // ============================================================
  async function deleteAccount() {
    const email = window.bp.user.email;
    if (!confirm('⚠️ تحذير: سيتم حذف حسابك وكل بياناتك (المواقع، المشتركين، الحملات، النوافذ) نهائياً!\n\nهل تريد المتابعة؟')) return;
    const value = prompt('للتأكيد النهائي — اكتب بريدك الإلكتروني (' + email + ') بالكامل:', '');
    if (value !== email) {
      window.bp.showToast('البريد غير مطابق — تم إلغاء العملية', 'error');
      return;
    }

    try {
      const uid = window.bp.user.uid;
      const batch = db().batch();
      // حذف بيانات المستخدم
      const collections = ['websites', 'subscribers', 'campaigns', 'popups', 'rssFeeds'];
      for (const col of collections) {
        const snap = await db().collection(col).where('userId', '==', uid).limit(500).get();
        snap.forEach(doc => batch.delete(doc.ref));
      }
      batch.delete(db().collection('users').doc(uid));
      await batch.commit();
      // حذف حساب المصادقة
      await window.bp.user.delete();
      window.location.href = 'index.html';
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        window.bp.showToast('لتأمين حسابك: سجل الخروج ثم الدخول، ثم أعد المحاولة', 'warning');
      } else {
        window.bp.showToast('فشل الحذف: ' + e.message, 'error');
      }
    }
  }

  window.settingsPage = { savePrefs, copyCode, deleteAccount };

  console.log('✅ settings-page.js جاهز');
});
