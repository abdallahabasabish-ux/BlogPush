/* ================================================================
   js/popups.js – منشئ النوافذ المنبثقة
   ------------------------------------------------------------
   - تصميم نافذة اشتراك مع معاينة حية
   - حفظ النوافذ في Firestore + توليد كود التضمين
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();
  const FV = () => firebase.firestore.FieldValue;

  let myPopups = [];

  window.bp.onReady(async function () {
    window.bp.initPageChrome();
    window.bp.hideLoader();
    await loadPopups();
    renderPopups();
  });

  // ============================================================
  // المعاينة الحية
  // ============================================================
  const fields = [
    { input: 'ppTitle', update: v => { document.getElementById('pvTitle').textContent = v || '—'; } },
    { input: 'ppMsg', update: v => { document.getElementById('pvMsg').textContent = v || '—'; } },
    { input: 'ppBtnText', update: v => { document.getElementById('pvBtn').textContent = v || '—'; } }
  ];
  fields.forEach(f => {
    document.getElementById(f.input).addEventListener('input', e => f.update(e.target.value));
  });

  function updateColors() {
    const bg = document.getElementById('ppBgColor').value;
    const btn = document.getElementById('ppBtnColor').value;
    const title = document.getElementById('ppTitleColor').value;
    const pv = document.getElementById('popupPreview');
    pv.style.background = bg;
    document.getElementById('pvTitle').style.color = title;
    document.getElementById('pvMsg').style.color = title;
    document.getElementById('pvMsg').style.opacity = '0.8';
    document.getElementById('pvBtn').style.background = btn;
    // تباين الأيقونة مع الخلفية
    document.getElementById('pvIcon').textContent = isDark(bg) ? '🔔' : '📣';
  }
  function isDark(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  ['ppBgColor', 'ppBtnColor', 'ppTitleColor'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateColors);
  });
  updateColors();

  // ============================================================
  // حفظ النافذة
  // ============================================================
  document.getElementById('popupForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('ppSubmitBtn');

    const config = {
      name: document.getElementById('ppName').value.trim(),
      title: document.getElementById('ppTitle').value.trim(),
      message: document.getElementById('ppMsg').value.trim(),
      buttonText: document.getElementById('ppBtnText').value.trim(),
      bgColor: document.getElementById('ppBgColor').value,
      btnColor: document.getElementById('ppBtnColor').value,
      titleColor: document.getElementById('ppTitleColor').value,
      position: document.getElementById('ppPosition').value,
      delay: Math.max(0, Number(document.getElementById('ppDelay').value) || 0)
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    try {
      await db().collection('popups').add({
        userId: window.bp.user.uid,
        ...config,
        views: 0,
        conversions: 0,
        createdAt: FV().serverTimestamp()
      });
      window.bp.showToast('تم حفظ النافذة — انسخ كود التضمين من القائمة أدناه ✅', 'success');
      document.getElementById('ppName').value = '';
      await loadPopups();
      renderPopups();
    } catch (err) {
      window.bp.showToast('فشل الحفظ: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-floppy-disk"></i> حفظ النافذة وإنشاء الكود';
  });

  // ============================================================
  // تحميل وعرض النوافذ المحفوظة
  // ============================================================
  async function loadPopups() {
    try {
      const snap = await db().collection('popups')
        .where('userId', '==', window.bp.user.uid).get();
      myPopups = [];
      snap.forEach(d => myPopups.push({ id: d.id, ...d.data() }));
      myPopups.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() || 0;
        const dbb = b.createdAt?.toDate?.()?.getTime() || 0;
        return dbb - da;
      });
    } catch (e) {
      console.error('❌ خطأ تحميل النوافذ:', e);
    }
  }

  function renderPopups() {
    const box = document.getElementById('popupsList');

    if (myPopups.length === 0) {
      box.innerHTML =
        '<div class="empty-state" style="text-align:center;padding:44px;">' +
        '<i class="fas fa-palette" style="font-size:42px;color:var(--color-gray);display:block;margin-bottom:14px;"></i>' +
        '<div style="font-weight:700;font-size:16px;">لا توجد نوافذ محفوظة بعد</div>' +
        '<div style="color:var(--color-mid);font-size:13.5px;margin-top:4px;">صمم نافذتك الأولى من النموذج أعلاه</div>' +
        '</div>';
      return;
    }

    box.innerHTML = myPopups.map(p => {
      const code = buildSnippet(p);
      const encoded = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<div class="popup-item">' +
        '<div class="p-info">' +
        '<div class="t"><i class="fas fa-window-restore" style="color:var(--color-gray);"></i> ' + esc(p.name || 'نافذة') + '</div>' +
        '<div class="s">' + esc(p.title) + ' — ' + (p.position === 'center' ? 'وسط الشاشة' : 'أسفل الشاشة') +
        ' — تأخير ' + (p.delay || 0) + 'ث</div>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn-sm primary" onclick="popupsPage.toggleCode(\'' + p.id + '\')"><i class="fas fa-code"></i> كود التضمين</button>' +
        '<button class="btn-sm danger" onclick="popupsPage.deletePopup(\'' + p.id + '\')"><i class="fas fa-trash-alt"></i> حذف</button>' +
        '</div>' +
        '<div id="code-' + p.id + '" style="display:none;width:100%;">' +
        '<div class="code-block">' + encoded +
        '<button class="copy-btn" onclick="popupsPage.copyCode(this)">نسخ</button>' +
        '</div></div>' +
        '</div>';
    }).join('');
  }

  // ============================================================
  // توليد كود التضمين (سكربت مستقل يعمل داخل Blogger)
  // ============================================================
  function buildSnippet(p) {
    const cfg = {
      title: p.title,
      message: p.message,
      buttonText: p.buttonText,
      bgColor: p.bgColor,
      btnColor: p.btnColor,
      titleColor: p.titleColor,
      position: p.position,
      delay: p.delay
    };
    return '<!-- BlogPush Popup -->\n' +
      '<div id="bp-popup" style="display:none;position:fixed;' +
      (p.position === 'center'
        ? 'top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;'
        : 'bottom:20px;left:20px;right:20px;max-width:380px;margin:0 auto;z-index:99999;') +
      'background:' + p.bgColor + ';color:' + p.titleColor + ';border-radius:18px;padding:30px 28px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.3);direction:rtl;font-family:Cairo,sans-serif;">\n' +
      '  <div style="font-size:28px;margin-bottom:10px;">🔔</div>\n' +
      '  <div style="font-size:19px;font-weight:800;margin-bottom:8px;color:' + p.titleColor + ';">' + p.title + '</div>\n' +
      '  <div style="font-size:13.5px;opacity:.85;margin-bottom:16px;line-height:1.8;">' + p.message + '</div>\n' +
      '  <button onclick="bpSubscribe()" style="background:' + p.btnColor + ';color:#fff;border:none;border-radius:12px;padding:12px 26px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">' + p.buttonText + '</button>\n' +
      '  <button onclick="document.getElementById(\'bp-popup\').style.display=\'none\'" style="position:absolute;top:10px;left:14px;background:none;border:none;color:' + p.titleColor + ';font-size:18px;cursor:pointer;opacity:.6;">×</button>\n' +
      '</div>\n' +
      '<script>\n' +
      'var BP_CFG = ' + JSON.stringify(cfg) + ';\n' +
      'setTimeout(function(){var el=document.getElementById("bp-popup");if(el){el.style.display="block";}},' + ((p.delay || 0) * 1000) + ');\n' +
      'function bpSubscribe(){\n' +
      '  if (window.Notification && Notification.permission !== "granted") Notification.requestPermission();\n' +
      '  document.getElementById("bp-popup").style.display="none";\n' +
      '}\n' +
      '<\/script>';
  }

  // ============================================================
  // إجراءات
  // ============================================================
  function toggleCode(id) {
    const el = document.getElementById('code-' + id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  function copyCode(btn) {
    // استخراج الكود من العنصر (بدون نص زر النسخ)
    const block = btn.parentElement.cloneNode(true);
    block.querySelector('.copy-btn')?.remove();
    const text = block.textContent;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ تم النسخ!';
        setTimeout(() => btn.textContent = 'نسخ', 2000);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); btn.textContent = '✅ تم النسخ!'; setTimeout(() => btn.textContent = 'نسخ', 2000); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  async function deletePopup(id) {
    if (!confirm('حذف هذه النافذة نهائياً؟')) return;
    try {
      await db().collection('popups').doc(id).delete();
      window.bp.showToast('تم الحذف', 'success');
      await loadPopups(); renderPopups();
    } catch (e) { window.bp.showToast('فشل: ' + e.message, 'error'); }
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.popupsPage = { toggleCode, copyCode, deletePopup };

  console.log('✅ popups.js جاهز');
});
