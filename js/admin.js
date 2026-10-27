/* ================================================================
   js/admin.js – لوحة تحكم الأدمن
   ------------------------------------------------------------
   الأقسام: نظرة عامة، المدفوعات (اعتماد/رفض)، المستخدمون،
   الاشتراكات، إعدادات المنصة
   ملاحظة: لا يتم تفعيل أي اشتراك إلا بموافقة الأدمن يدوياً
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();
  const FV = () => firebase.firestore.FieldValue;

  // البيانات المحملة
  let users = [];
  let payments = [];
  let platformCounts = { subscribers: 0, websites: 0, campaigns: 0 };
  let charts = {};

  // ============================================================
  // التهيئة والتحقق من الصلاحيات
  // ============================================================
  window.bp.onReady(async function () {
    window.bp.initPageChrome();

    // حماية: الصفحة للأدمن فقط
    if (!window.bp.isAdmin) {
      window.bp.showToast('هذه الصفحة مخصصة للأدمن فقط.', 'error');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
      return;
    }

    window.bp.hideLoader();
    await refreshAll();
  });

  // ============================================================
  // تحميل كل البيانات
  // ============================================================
  async function refreshAll() {
    try {
      await Promise.all([loadUsers(), loadPayments(), loadPlatformCounts()]);
      renderOverview();
      renderPaymentsTable();
      renderUsersTable();
      renderSubsTable();
      fillSettingsForm();
    } catch (e) {
      console.error('❌ خطأ تحميل بيانات الأدمن:', e);
      window.bp.showToast('فشل تحميل بعض البيانات: ' + e.message, 'error');
    }
  }

  async function loadUsers() {
    users = [];
    try {
      const snap = await db().collection('users').limit(1000).get();
      snap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
      users.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() || 0;
        const dbb = b.createdAt?.toDate?.()?.getTime() || 0;
        return dbb - da;
      });
    } catch (e) {
      console.error('❌ خطأ تحميل المستخدمين:', e);
      window.bp.showToast('تعذر تحميل المستخدمين — تأكد من نشر قواعد Firestore الخاصة بالأدمن', 'error');
    }
  }

  async function loadPayments() {
    payments = [];
    try {
      const snap = await db().collection('payments').limit(1000).get();
      snap.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));
      payments.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() || 0;
        const dbb = b.createdAt?.toDate?.()?.getTime() || 0;
        return dbb - da;
      });
    } catch (e) {
      console.error('❌ خطأ تحميل المدفوعات:', e);
    }
  }

  async function loadPlatformCounts() {
    platformCounts = { subscribers: 0, websites: 0, campaigns: 0 };
    try {
      const [subs, sites, camps] = await Promise.all([
        db().collection('subscribers').limit(2000).get(),
        db().collection('websites').limit(2000).get(),
        db().collection('campaigns').limit(2000).get()
      ]);
      platformCounts.subscribers = subs.size;
      platformCounts.websites = sites.size;
      platformCounts.campaigns = camps.size;
    } catch (e) { /* تجاهل */ }
  }

  // ============================================================
  // التنقل بين التبويبات
  // ============================================================
  function switchTab(tab) {
    document.querySelectorAll('.admin-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.admin-section').forEach(s => {
      s.classList.toggle('active', s.id === 'tab-' + tab);
    });
    // إعادة رسم المخططات عند فتح نظرة عامة (يحتاج القسم ظاهراً)
    if (tab === 'overview') renderCharts();
  }

  // ============================================================
  // نظرة عامة
  // ============================================================
  function renderOverview() {
    const paidUsers = users.filter(u => u.plan && u.plan !== 'free' && isActiveSub(u));
    const pending = payments.filter(p => p.status === 'pending');
    const revenue = payments
      .filter(p => p.status === 'approved')
      .reduce((s, p) => s + (Number(p.amountUSD) || 0), 0);

    document.getElementById('ovUsers').textContent = users.length.toLocaleString('ar-EG');
    document.getElementById('ovPaid').textContent = paidUsers.length.toLocaleString('ar-EG');
    document.getElementById('ovPending').textContent = pending.length.toLocaleString('ar-EG');
    document.getElementById('ovRevenue').textContent = '$' + revenue.toLocaleString('en-US');
    document.getElementById('ovSubscribers').textContent = platformCounts.subscribers.toLocaleString('ar-EG');

    // شارة عدد المعلقات على التبويب
    const badge = document.getElementById('pendingCountBadge');
    badge.textContent = pending.length.toLocaleString('ar-EG');
    badge.style.display = pending.length > 0 ? 'inline-block' : 'none';

    // جدول أحدث المعلقات
    const tbody = document.getElementById('ovPendingTable');
    if (pending.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-mini"><i class="fas fa-circle-check"></i> لا توجد مدفوعات معلقة — كل شيء تحت السيطرة ✨</td></tr>';
    } else {
      tbody.innerHTML = pending.slice(0, 5).map(p => {
        const u = users.find(x => x.id === p.userId);
        return '<tr>' +
          '<td>' + window.bp.fmtDate(p.createdAt) + '</td>' +
          '<td><div class="cell-user"><div class="u-name">' + esc(p.userName || '—') + '</div><div class="u-mail">' + esc(p.userEmail || '') + '</div></div></td>' +
          '<td>' + esc(p.planName || window.bp.planName(p.plan)) + '</td>' +
          '<td><b>' + window.bp.fmtUSD(p.amountUSD) + '</b>' + (p.method === 'vodafone' && p.amountEGP ? '<div style="font-size:11px;color:var(--color-mid);">≈ ' + p.amountEGP.toLocaleString('ar-EG') + ' ج.م</div>' : '') + '</td>' +
          '<td>' + methodLabel(p.method) + '</td>' +
          '<td>' + (p.receiptBase64
            ? '<img class="receipt-thumb" src="' + p.receiptBase64 + '" onclick="adminPanel.viewReceipt(\'' + p.id + '\')" alt="الإيصال">'
            : '<span style="font-size:12px;color:var(--color-mid);">—</span>') + '</td>' +
          '<td><button class="act-btn green" onclick="adminPanel.approvePayment(\'' + p.id + '\')"><i class="fas fa-check"></i> اعتماد</button></td>' +
          '</tr>';
      }).join('');
    }

    renderCharts();
  }

  function isActiveSub(u) {
    if (!u.planExpiry) return false;
    const t = u.planExpiry?.toDate?.() || new Date(u.planExpiry);
    return t.getTime() > Date.now();
  }

  function methodLabel(method) {
    return method === 'paypal'
      ? '<span style="font-weight:600;"><i class="fab fa-paypal" style="color:#003087;"></i> PayPal</span>'
      : '<span style="font-weight:600;"><i class="fas fa-mobile-screen" style="color:#9B1C31;"></i> فودافون كاش</span>';
  }

  // ============================================================
  // المخططات
  // ============================================================
  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // --- الإيرادات الشهرية ---
    const revCanvas = document.getElementById('revenueChart');
    if (revCanvas) {
      const months = [];
      const totals = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        months.push(d.toLocaleDateString('ar-EG', { month: 'short' }));
        const total = payments
          .filter(p => {
            if (p.status !== 'approved') return false;
            const pd = p.reviewedAt?.toDate?.() || p.createdAt?.toDate?.();
            if (!pd) return false;
            return pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0') === key;
          })
          .reduce((s, p) => s + (Number(p.amountUSD) || 0), 0);
        totals.push(total);
      }
      if (charts.revenue) charts.revenue.destroy();
      charts.revenue = new Chart(revCanvas, {
        type: 'bar',
        data: {
          labels: months,
          datasets: [{
            label: 'الإيراد ($)',
            data: totals,
            backgroundColor: 'rgba(26,26,46,0.85)',
            borderRadius: 8,
            maxBarThickness: 42
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // --- نمو المستخدمين ---
    const usersCanvas = document.getElementById('usersChart');
    if (usersCanvas) {
      const months = [];
      const counts = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        months.push(d.toLocaleDateString('ar-EG', { month: 'short' }));
        const c = users.filter(u => {
          const ud = u.createdAt?.toDate?.();
          return ud && ud.getFullYear() + '-' + String(ud.getMonth() + 1).padStart(2, '0') === key;
        }).length;
        counts.push(c);
      }
      if (charts.users) charts.users.destroy();
      charts.users = new Chart(usersCanvas, {
        type: 'line',
        data: {
          labels: months,
          datasets: [{
            label: 'مستخدمون جدد',
            data: counts,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,0.08)',
            tension: 0.35,
            fill: true,
            pointBackgroundColor: '#10B981',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  // ============================================================
  // تبويب المدفوعات
  // ============================================================
  function renderPaymentsTable() {
    const status = document.getElementById('payFilterStatus').value;
    const method = document.getElementById('payFilterMethod').value;
    const q = document.getElementById('paySearch').value.trim().toLowerCase();

    const rows = payments.filter(p => {
      if (status && p.status !== status) return false;
      if (method && p.method !== method) return false;
      if (q && !((p.userEmail || '').toLowerCase().includes(q) || (p.userName || '').toLowerCase().includes(q))) return false;
      return true;
    });

    const tbody = document.getElementById('paymentsAdminTable');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-mini"><i class="fas fa-inbox"></i> لا توجد مدفوعات مطابقة</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(p => {
      const statusBadge = p.status === 'pending'
        ? '<span class="status-badge warning">قيد المراجعة</span>'
        : p.status === 'approved'
          ? '<span class="status-badge success">معتمدة</span>'
          : '<span class="status-badge danger">مرفوضة</span>' + (p.rejectReason ? '<div style="font-size:11px;color:var(--color-danger);margin-top:4px;">' + esc(p.rejectReason) + '</div>' : '');

      let details = '';
      if (p.method === 'paypal') {
        details = '<div style="font-size:12px;color:var(--color-mid);direction:ltr;text-align:right;">' +
          (p.captureId ? '<div>Capture: ' + esc(p.captureId) + '</div>' : '') +
          (p.paypalOrderId ? '<div>Order: ' + esc(p.paypalOrderId) + '</div>' : '') +
          (p.payerEmail ? '<div>' + esc(p.payerEmail) + '</div>' : '') +
          '</div>';
      } else {
        details = '<div style="display:flex;align-items:center;gap:10px;">' +
          (p.receiptBase64 ? '<img class="receipt-thumb" src="' + p.receiptBase64 + '" onclick="adminPanel.viewReceipt(\'' + p.id + '\')" alt="الإيصال">' : '') +
          '<div style="font-size:12px;color:var(--color-mid);">' +
          (p.senderName ? '<div><b>' + esc(p.senderName) + '</b></div>' : '') +
          (p.senderPhone ? '<div dir="ltr">' + esc(p.senderPhone) + '</div>' : '') +
          (p.reference ? '<div dir="ltr">REF: ' + esc(p.reference) + '</div>' : '') +
          '</div></div>';
      }

      const actions = p.status === 'pending'
        ? '<div class="row-actions">' +
          '<button class="act-btn green" onclick="adminPanel.approvePayment(\'' + p.id + '\')"><i class="fas fa-check"></i> اعتماد وتفعيل</button>' +
          '<button class="act-btn red" onclick="adminPanel.rejectPayment(\'' + p.id + '\')"><i class="fas fa-xmark"></i> رفض</button>' +
          '</div>'
        : '<span style="font-size:12px;color:var(--color-mid);">' +
          (p.reviewedBy ? 'راجعها: ' + esc(p.reviewedBy) : '') + '</span>';

      return '<tr>' +
        '<td style="white-space:nowrap;">' + window.bp.fmtDate(p.createdAt) + '</td>' +
        '<td><div class="cell-user"><div class="u-name">' + esc(p.userName || '—') + '</div><div class="u-mail">' + esc(p.userEmail || '') + '</div></div></td>' +
        '<td>' + esc(p.planName || window.bp.planName(p.plan)) + '</td>' +
        '<td><b>' + window.bp.fmtUSD(p.amountUSD) + '</b>' + (p.method === 'vodafone' && p.amountEGP ? '<div style="font-size:11px;color:var(--color-mid);">≈ ' + p.amountEGP.toLocaleString('ar-EG') + ' ج.م</div>' : '') + '</td>' +
        '<td>' + methodLabel(p.method) + '</td>' +
        '<td>' + details + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  // ============================================================
  // اعتماد / رفض المدفوعات
  // ============================================================
  async function approvePayment(id) {
    const p = payments.find(x => x.id === id);
    if (!p || p.status !== 'pending') return;

    const ok = confirm(
      '⚠️ تأكيد اعتماد الدفعة\n\n' +
      'المستخدم: ' + (p.userEmail || p.userName) + '\n' +
      'الخطة: ' + (p.planName || window.bp.planName(p.plan)) + '\n' +
      'المبلغ: $' + p.amountUSD + '\n' +
      'الطريقة: ' + (p.method === 'paypal' ? 'PayPal' : 'فودافون كاش') + '\n\n' +
      'سيتم تفعيل اشتراك المستخدم لمدة ' + (window.bp.settings.subscriptionDays || 30) + ' يوم فوراً.'
    );
    if (!ok) return;

    try {
      await db().collection('payments').doc(id).update({
        status: 'approved',
        reviewedAt: FV().serverTimestamp(),
        reviewedBy: window.bp.user.email || 'admin'
      });
      await upgradeUserPlan(p.userId, p.plan, window.bp.settings.subscriptionDays || 30);
      window.bp.showToast('تم اعتماد الدفعة وتفعيل الاشتراك ✅', 'success');
      await refreshAll();
    } catch (e) {
      console.error(e);
      window.bp.showToast('فشل الاعتماد: ' + e.message, 'error');
    }
  }

  async function rejectPayment(id) {
    const p = payments.find(x => x.id === id);
    if (!p || p.status !== 'pending') return;

    const reason = prompt('سبب رفض الدفعة (سيظهر للمستخدم في صفحة فواتيري):', 'لم نتمكن من التحقق من التحويل');
    if (reason === null) return;

    try {
      await db().collection('payments').doc(id).update({
        status: 'rejected',
        rejectReason: reason.trim() || 'غير محدد',
        reviewedAt: FV().serverTimestamp(),
        reviewedBy: window.bp.user.email || 'admin'
      });
      window.bp.showToast('تم رفض الدفعة', 'info');
      await refreshAll();
    } catch (e) {
      console.error(e);
      window.bp.showToast('فشل الرفض: ' + e.message, 'error');
    }
  }

  // تفعيل/تجديد خطة مستخدم
  async function upgradeUserPlan(userId, plan, days) {
    if (!plan || plan === 'free') {
      await db().collection('users').doc(userId).update({
        plan: 'free', planExpiry: null, planStartedAt: FV().serverTimestamp()
      });
      return;
    }
    const u = users.find(x => x.id === userId);
    const current = u?.planExpiry?.toDate?.();
    const base = (current && current.getTime() > Date.now()) ? current : new Date();
    const expiry = new Date(base.getTime() + (days || 30) * 86400000);

    await db().collection('users').doc(userId).update({
      plan: plan,
      planStartedAt: u?.planStartedAt || FV().serverTimestamp(),
      planExpiry: firebase.firestore.Timestamp.fromDate(expiry),
      planActivatedBy: window.bp.user.email || 'admin'
    });
  }

  // ============================================================
  // تبويب المستخدمين
  // ============================================================
  function renderUsersTable() {
    const q = document.getElementById('userSearch').value.trim().toLowerCase();
    const plan = document.getElementById('userFilterPlan').value;
    const status = document.getElementById('userFilterStatus').value;

    const rows = users.filter(u => {
      if (plan && (u.plan || 'free') !== plan) return false;
      if (status && (u.status || 'active') !== status) return false;
      if (q && !((u.email || '').toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))) return false;
      return true;
    });

    document.getElementById('usersCount').textContent = users.length.toLocaleString('ar-EG');

    const tbody = document.getElementById('usersTable');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-mini"><i class="fas fa-users-slash"></i> لا يوجد مستخدمون مطابقون</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(u => {
      const planBadge = window.bp.planBadge(u.plan || 'free');
      const expiry = u.planExpiry?.toDate?.();
      const expiryTxt = (u.plan && u.plan !== 'free' && expiry)
        ? window.bp.fmtDate(expiry) + (isActiveSub(u) ? '' : ' <span class="status-badge danger">منتهية</span>')
        : '—';
      const statusBadge = (u.status || 'active') === 'active'
        ? '<span class="status-badge success">نشط</span>'
        : '<span class="status-badge danger">محظور</span>';
      const roleBadge = u.role === 'admin'
        ? '<span class="status-badge" style="background:#F3E8FF;color:#7C3AED;"><i class="fas fa-user-shield"></i> أدمن</span>'
        : '<span class="status-badge" style="background:#F7F8FA;color:#4A4A5A;">مستخدم</span>';

      const isBlocked = (u.status || 'active') === 'blocked';
      const isMe = u.id === window.bp.user.uid;

      return '<tr>' +
        '<td><div class="cell-user"><div class="u-name">' + esc(u.displayName || '—') + (isMe ? ' <span style="font-size:11px;color:var(--color-info);">(أنت)</span>' : '') + '</div><div class="u-mail">' + esc(u.email || '') + '</div></div></td>' +
        '<td>' + planBadge + '</td>' +
        '<td style="white-space:nowrap;">' + expiryTxt + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + roleBadge + '</td>' +
        '<td style="white-space:nowrap;">' + window.bp.fmtDate(u.createdAt) + '</td>' +
        '<td><div class="row-actions">' +
        (isBlocked
          ? '<button class="act-btn green" onclick="adminPanel.setUserStatus(\'' + u.id + '\',\'active\')"><i class="fas fa-unlock"></i> رفع الحظر</button>'
          : '<button class="act-btn red" onclick="adminPanel.setUserStatus(\'' + u.id + '\',\'blocked\')" ' + (isMe ? 'disabled style="opacity:.4;cursor:not-allowed;"' : '') + '><i class="fas fa-ban"></i> حظر</button>') +
        '<select onchange="adminPanel.changePlan(\'' + u.id + '\', this.value)" style="padding:6px 10px;border:1px solid var(--color-light);border-radius:8px;font-family:var(--font-primary);font-size:12px;background:#fff;cursor:pointer;">' +
        '<option value="">تغيير الخطة...</option>' +
        '<option value="free">مجاني</option>' +
        '<option value="starter">مبتدئ (+30 يوم)</option>' +
        '<option value="pro">احترافي (+30 يوم)</option>' +
        '</select>' +
        '<button class="act-btn blue" onclick="adminPanel.extendSub(\'' + u.id + '\')" title="تمديد 30 يوماً"><i class="fas fa-calendar-plus"></i> +30ي</button>' +
        (u.role === 'admin'
          ? '<button class="act-btn amber" onclick="adminPanel.toggleAdmin(\'' + u.id + '\')" ' + (isMe ? 'disabled style="opacity:.4;cursor:not-allowed;"' : '') + '><i class="fas fa-user-minus"></i> إزالة الإدارة</button>'
          : '<button class="act-btn amber" onclick="adminPanel.toggleAdmin(\'' + u.id + '\')"><i class="fas fa-user-shield"></i> ترقية لأدمن</button>') +
        '<button class="act-btn red" onclick="adminPanel.deleteUser(\'' + u.id + '\')" ' + (isMe ? 'disabled style="opacity:.4;cursor:not-allowed;"' : '') + ' title="حذف ملف المستخدم من Firestore (حساب Auth يحذف من Console)"><i class="fas fa-trash-alt"></i></button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  async function setUserStatus(uid, status) {
    const u = users.find(x => x.id === uid);
    if (status === 'blocked' && !confirm('حظر المستخدم: ' + (u?.email || uid) + '؟\nسيتم منعه من الدخول فوراً.')) return;
    try {
      await db().collection('users').doc(uid).update({ status: status });
      window.bp.showToast(status === 'blocked' ? 'تم حظر المستخدم' : 'تم رفع الحظر', 'success');
      await loadUsers();
      renderUsersTable();
      renderSubsTable();
    } catch (e) {
      window.bp.showToast('فشل: ' + e.message, 'error');
    }
  }

  async function changePlan(uid, plan) {
    if (!plan) return;
    const u = users.find(x => x.id === uid);
    if (!confirm('تغيير خطة ' + (u?.email || uid) + ' إلى "' + window.bp.planName(plan) + '"؟' +
        (plan !== 'free' ? '\nسيتم تفعيلها لمدة ' + (window.bp.settings.subscriptionDays || 30) + ' يوم.' : ''))) {
      renderUsersTable();
      return;
    }
    try {
      await upgradeUserPlan(uid, plan, window.bp.settings.subscriptionDays || 30);
      window.bp.showToast('تم تغيير الخطة ✅', 'success');
      await loadUsers();
      renderUsersTable();
      renderSubsTable();
      renderOverview();
    } catch (e) {
      window.bp.showToast('فشل: ' + e.message, 'error');
    }
    renderUsersTable();
  }

  async function extendSub(uid) {
    try {
      await upgradeUserPlan(uid, users.find(x => x.id === uid)?.plan || 'starter', window.bp.settings.subscriptionDays || 30);
      window.bp.showToast('تم تمديد الاشتراك +30 يوم ✅', 'success');
      await loadUsers();
      renderUsersTable();
      renderSubsTable();
    } catch (e) {
      window.bp.showToast('فشل: ' + e.message, 'error');
    }
  }

  async function toggleAdmin(uid) {
    const u = users.find(x => x.id === uid);
    if (!u) return;
    const makeAdmin = u.role !== 'admin';
    if (!confirm((makeAdmin ? 'ترقية ' : 'إزالة صلاحيات الأدمن من ') + (u.email || uid) + '؟')) return;
    try {
      await db().collection('users').doc(uid).update({ role: makeAdmin ? 'admin' : 'user' });
      window.bp.showToast(makeAdmin ? 'تمت الترقية لأدمن ✅' : 'تمت إزالة الصلاحيات', 'success');
      await loadUsers();
      renderUsersTable();
    } catch (e) {
      window.bp.showToast('فشل: ' + e.message, 'error');
    }
  }

  async function deleteUser(uid) {
    const u = users.find(x => x.id === uid);
    if (!confirm('⚠️ حذف ملف المستخدم ' + (u?.email || uid) + ' من قاعدة البيانات نهائياً؟\n\nملاحظة: حساب المصادقة (Auth) الخاص به يُحذف من Firebase Console → Authentication.')) return;
    if (!confirm('تأكيد أخير: هل أنت متأكد 100%؟')) return;
    try {
      await db().collection('users').doc(uid).delete();
      window.bp.showToast('تم حذف ملف المستخدم', 'success');
      await loadUsers();
      renderUsersTable();
      renderOverview();
    } catch (e) {
      window.bp.showToast('فشل: ' + e.message, 'error');
    }
  }

  // ============================================================
  // تبويب الاشتراكات
  // ============================================================
  function renderSubsTable() {
    const paid = users.filter(u => u.plan && u.plan !== 'free');
    const starter = paid.filter(u => u.plan === 'starter' && isActiveSub(u)).length;
    const pro = paid.filter(u => u.plan === 'pro' && isActiveSub(u)).length;
    const expiring = paid.filter(u => {
      if (!isActiveSub(u)) return false;
      const t = u.planExpiry?.toDate?.();
      return t && (t.getTime() - Date.now()) < 7 * 86400000;
    }).length;

    document.getElementById('subStarter').textContent = starter.toLocaleString('ar-EG');
    document.getElementById('subPro').textContent = pro.toLocaleString('ar-EG');
    document.getElementById('subExpiring').textContent = expiring.toLocaleString('ar-EG');

    const active = paid.filter(isActiveSub).sort((a, b) => {
      const ta = a.planExpiry?.toDate?.()?.getTime() || 0;
      const tb = b.planExpiry?.toDate?.()?.getTime() || 0;
      return ta - tb;
    });

    const tbody = document.getElementById('subsTable');
    if (active.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-mini"><i class="fas fa-crown"></i> لا توجد اشتراكات مدفوعة نشطة بعد</td></tr>';
      return;
    }

    tbody.innerHTML = active.map(u => {
      const t = u.planExpiry?.toDate?.();
      const daysLeft = Math.max(0, Math.ceil((t.getTime() - Date.now()) / 86400000));
      const urgent = daysLeft <= 7;
      return '<tr>' +
        '<td><div class="cell-user"><div class="u-name">' + esc(u.displayName || '—') + '</div><div class="u-mail">' + esc(u.email || '') + '</div></div></td>' +
        '<td>' + window.bp.planBadge(u.plan) + '</td>' +
        '<td>' + window.bp.fmtDate(u.planStartedAt) + '</td>' +
        '<td style="white-space:nowrap;">' + window.bp.fmtDate(t) + '</td>' +
        '<td><span class="status-badge ' + (urgent ? 'danger' : daysLeft <= 14 ? 'warning' : 'success') + '">' + daysLeft + ' يوم</span></td>' +
        '<td><div class="row-actions">' +
        '<button class="act-btn blue" onclick="adminPanel.extendSub(\'' + u.id + '\')"><i class="fas fa-calendar-plus"></i> تمديد</button>' +
        '<button class="act-btn red" onclick="adminPanel.cancelSub(\'' + u.id + '\')"><i class="fas fa-ban"></i> إلغاء الاشتراك</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  async function cancelSub(uid) {
    const u = users.find(x => x.id === uid);
    if (!confirm('إلغاء اشتراك ' + (u?.email || uid) + ' وإعادته للخطة المجانية؟')) return;
    try {
      await db().collection('users').doc(uid).update({
        plan: 'free', planExpiry: null,
        planEndedAt: FV().serverTimestamp(),
        planEndedBy: window.bp.user.email || 'admin'
      });
      window.bp.showToast('تم إلغاء الاشتراك', 'info');
      await loadUsers();
      renderSubsTable();
      renderUsersTable();
      renderOverview();
    } catch (e) {
      window.bp.showToast('فشل: ' + e.message, 'error');
    }
  }

  // ============================================================
  // تبويب الإعدادات
  // ============================================================
  function fillSettingsForm() {
    const s = window.bp.settings;
    if (!s) return;
    document.getElementById('setAdminEmails').value = (s.adminEmails || []).join(', ');
    document.getElementById('setPriceStarter').value = s.prices?.starter ?? 19;
    document.getElementById('setPricePro').value = s.prices?.pro ?? 49;
    document.getElementById('setUsdToEgp').value = s.usdToEgp ?? 50;
    document.getElementById('setVodafoneNumber').value = s.vodafoneNumber || '';
    document.getElementById('setVodafoneName').value = s.vodafoneName || '';
    document.getElementById('setPaypalClientId').value = s.paypalClientId || '';
    document.getElementById('setPaypalCurrency').value = s.paypalCurrency || 'USD';
    document.getElementById('setLimitFree').value = s.limits?.free ?? 1000;
    document.getElementById('setLimitStarter').value = s.limits?.starter ?? 10000;
    document.getElementById('setLimitPro').value = s.limits?.pro ?? 100000;
    document.getElementById('setTrialDays').value = s.trialDays ?? 14;
    document.getElementById('setSubDays').value = s.subscriptionDays ?? 30;
    document.getElementById('setSupportEmail').value = s.supportEmail || '';
  }

  async function saveSettings() {
    const adminEmails = document.getElementById('setAdminEmails').value
      .split(/[,\n]/).map(x => x.trim()).filter(x => x && x.includes('@'));

    if (adminEmails.length === 0) {
      window.bp.showToast('يجب إدخال بريد أدمن واحد على الأقل!', 'error');
      return;
    }

    const btn = document.querySelector('.save-bar button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    try {
      await db().collection('settings').doc('platform').set({
        adminEmails: adminEmails,
        prices: {
          starter: Number(document.getElementById('setPriceStarter').value) || 19,
          pro: Number(document.getElementById('setPricePro').value) || 49
        },
        usdToEgp: Number(document.getElementById('setUsdToEgp').value) || 50,
        vodafoneNumber: document.getElementById('setVodafoneNumber').value.trim(),
        vodafoneName: document.getElementById('setVodafoneName').value.trim() || 'BlogPush',
        paypalClientId: document.getElementById('setPaypalClientId').value.trim(),
        paypalCurrency: document.getElementById('setPaypalCurrency').value,
        limits: {
          free: Number(document.getElementById('setLimitFree').value) || 1000,
          starter: Number(document.getElementById('setLimitStarter').value) || 10000,
          pro: Number(document.getElementById('setLimitPro').value) || 100000
        },
        trialDays: Number(document.getElementById('setTrialDays').value) || 14,
        subscriptionDays: Number(document.getElementById('setSubDays').value) || 30,
        supportEmail: document.getElementById('setSupportEmail').value.trim(),
        updatedAt: FV().serverTimestamp(),
        updatedBy: window.bp.user.email || 'admin'
      }, { merge: true });

      await window.bp.reloadSettings();
      window.bp.showToast('تم حفظ الإعدادات وتطبيقها على كل المنصة ✅', 'success');
    } catch (e) {
      console.error(e);
      window.bp.showToast('فشل الحفظ: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> حفظ الإعدادات';
  }

  // ============================================================
  // عارض الإيصال
  // ============================================================
  function viewReceipt(id) {
    const p = payments.find(x => x.id === id);
    if (!p || !p.receiptBase64) {
      window.bp.showToast('لا يوجد إيصال مرفق بهذه الدفعة', 'info');
      return;
    }
    document.getElementById('receiptModalTitle').textContent =
      'إيصال تحويل — ' + (p.userEmail || p.userName || '') + ' — $' + p.amountUSD;
    document.getElementById('receiptModalImg').src = p.receiptBase64;
    document.getElementById('receiptModal').classList.add('open');
  }

  function closeReceipt() {
    document.getElementById('receiptModal').classList.remove('open');
  }

  // حماية من XSS في الأسماء والنصوص المعروضة
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============================================================
  // ربط الأحداث + التصدير
  // ============================================================
  document.getElementById('payFilterStatus').addEventListener('change', renderPaymentsTable);
  document.getElementById('payFilterMethod').addEventListener('change', renderPaymentsTable);
  document.getElementById('paySearch').addEventListener('input', renderPaymentsTable);
  document.getElementById('userSearch').addEventListener('input', renderUsersTable);
  document.getElementById('userFilterPlan').addEventListener('change', renderUsersTable);
  document.getElementById('userFilterStatus').addEventListener('change', renderUsersTable);
  document.getElementById('receiptModal').addEventListener('click', function (e) {
    if (e.target === this) closeReceipt();
  });

  window.adminPanel = {
    switchTab, refreshAll, approvePayment, rejectPayment,
    viewReceipt, closeReceipt,
    setUserStatus, changePlan, extendSub, toggleAdmin, deleteUser, cancelSub,
    saveSettings
  };

  console.log('✅ admin.js جاهز');
});
