/* ================================================================
   js/payments.js – صفحة "فواتيري" (سجل مدفوعات المستخدم)
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();
  const tableBody = document.getElementById('paymentsTableBody');

  let allPayments = [];

  window.bp.onReady(async function () {
    window.bp.initPageChrome();
    window.bp.hideLoader();
    await loadPayments();
    renderTable();
    renderStats();
  });

  // ============================================================
  // تحميل مدفوعاتي
  // ============================================================
  async function loadPayments() {
    try {
      const uid = window.bp.user.uid;
      const snap = await db().collection('payments')
        .where('userId', '==', uid)
        .get();

      allPayments = [];
      snap.forEach(doc => allPayments.push({ id: doc.id, ...doc.data() }));

      // ترتيب تنازلي بالتاريخ
      allPayments.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() || 0;
        const dbb = b.createdAt?.toDate?.()?.getTime() || 0;
        return dbb - da;
      });
    } catch (error) {
      console.error('❌ خطأ تحميل المدفوعات:', error);
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-danger);">فشل تحميل المدفوعات — ' + error.message + '</td></tr>';
    }
  }

  // ============================================================
  // شارة الحالة
  // ============================================================
  function statusBadge(status) {
    const map = {
      pending: '<span class="status-badge warning"><i class="fas fa-hourglass-half"></i> قيد المراجعة</span>',
      approved: '<span class="status-badge success"><i class="fas fa-circle-check"></i> معتمدة</span>',
      rejected: '<span class="status-badge danger"><i class="fas fa-circle-xmark"></i> مرفوضة</span>'
    };
    return map[status] || '<span class="status-badge">غير معروف</span>';
  }

  // ============================================================
  // طريقة الدفع
  // ============================================================
  function methodTag(method) {
    if (method === 'paypal') {
      return '<span class="method-tag"><i class="fab fa-paypal" style="color:#003087;"></i> PayPal</span>';
    }
    return '<span class="method-tag"><i class="fas fa-mobile-screen" style="color:#9B1C31;"></i> فودافون كاش</span>';
  }

  // ============================================================
  // خلية التفاصيل (معرف العملية أو صورة الإيصال)
  // ============================================================
  function detailsCell(p) {
    let html = '';
    if (p.method === 'paypal') {
      html = '<div class="details-cell"><i class="fas fa-hashtag"></i> ' + (p.captureId || p.paypalOrderId || '—') +
             (p.payerEmail ? '<br><i class="fas fa-envelope"></i> ' + p.payerEmail : '') + '</div>';
    } else {
      html = '<div style="display:flex;align-items:center;gap:10px;">';
      if (p.receiptBase64) {
        html += '<img class="receipt-thumb" src="' + p.receiptBase64 + '" alt="الإيصال" onclick="myPayments.viewReceipt(\'' + p.id + '\')">';
      } else {
        html += '<span style="font-size:12px;color:var(--color-mid);">بدون إيصال</span>';
      }
      html += '<div class="details-cell">' +
        (p.senderName ? '<i class="fas fa-user"></i> ' + p.senderName + '<br>' : '') +
        (p.senderPhone ? '<i class="fas fa-phone" dir="ltr"></i> <span dir="ltr">' + p.senderPhone + '</span><br>' : '') +
        (p.reference ? '<i class="fas fa-hashtag"></i> <span dir="ltr">' + p.reference + '</span>' : '') +
        '</div></div>';
    }
    if (p.status === 'rejected' && p.rejectReason) {
      html += '<div class="reject-reason"><i class="fas fa-comment-dots"></i> ' + p.rejectReason + '</div>';
    }
    return html;
  }

  // ============================================================
  // الجدول مع الفلاتر
  // ============================================================
  function renderTable() {
    const status = document.getElementById('filterStatus').value;
    const method = document.getElementById('filterMethod').value;

    const rows = allPayments.filter(p =>
      (!status || p.status === status) && (!method || p.method === method)
    );

    if (rows.length === 0) {
      const filtered = status || method;
      tableBody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:48px;">' +
        '<i class="fas fa-receipt" style="font-size:44px;color:var(--color-gray);display:block;margin-bottom:14px;"></i>' +
        '<div style="font-weight:700;font-size:17px;">' + (filtered ? 'لا توجد نتائج مطابقة للفلتر' : 'لا توجد مدفوعات بعد') + '</div>' +
        '<div style="color:var(--color-mid);font-size:14px;margin-top:6px;">' + (filtered ? 'جرّب تغيير الفلاتر' : 'قم بالترقية من صفحة الاشتراك وستظهر فواتيرك هنا') + '</div>' +
        (filtered ? '' : '<a href="billing.html" class="btn btn-primary" style="margin-top:16px;padding:10px 24px;">الاشتراك الآن</a>') +
        '</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map(p => {
      const amount = p.method === 'vodafone' && p.amountEGP
        ? '$' + p.amountUSD + ' <span style="font-size:11px;color:var(--color-mid);">(≈ ' + p.amountEGP.toLocaleString('ar-EG') + ' ج.م)</span>'
        : '$' + (p.amountUSD || 0);
      return '<tr>' +
        '<td style="padding:14px 8px;border-bottom:1px solid var(--color-bg);font-size:13.5px;">' + window.bp.fmtDate(p.createdAt, true) + '</td>' +
        '<td style="padding:14px 8px;border-bottom:1px solid var(--color-bg);font-weight:600;">' + (p.planName || window.bp.planName(p.plan)) + '</td>' +
        '<td style="padding:14px 8px;border-bottom:1px solid var(--color-bg);font-weight:700;">' + amount + '</td>' +
        '<td style="padding:14px 8px;border-bottom:1px solid var(--color-bg);">' + methodTag(p.method) + '</td>' +
        '<td style="padding:14px 8px;border-bottom:1px solid var(--color-bg);">' + detailsCell(p) + '</td>' +
        '<td style="padding:14px 8px;border-bottom:1px solid var(--color-bg);">' + statusBadge(p.status) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ============================================================
  // الإحصائيات
  // ============================================================
  function renderStats() {
    let approved = 0, pending = 0, rejected = 0, totalUSD = 0;
    allPayments.forEach(p => {
      if (p.status === 'approved') { approved++; totalUSD += Number(p.amountUSD) || 0; }
      else if (p.status === 'pending') pending++;
      else if (p.status === 'rejected') rejected++;
    });
    document.getElementById('statApproved').textContent = approved.toLocaleString('ar-EG');
    document.getElementById('statPending').textContent = pending.toLocaleString('ar-EG');
    document.getElementById('statRejected').textContent = rejected.toLocaleString('ar-EG');
    document.getElementById('statTotal').textContent = '$' + totalUSD.toLocaleString('en-US');
  }

  // ============================================================
  // عارض الإيصال
  // ============================================================
  function viewReceipt(id) {
    const p = allPayments.find(x => x.id === id);
    if (!p || !p.receiptBase64) return;
    document.getElementById('receiptModalImg').src = p.receiptBase64;
    document.getElementById('receiptModal').classList.add('open');
  }

  function closeReceipt() {
    document.getElementById('receiptModal').classList.remove('open');
  }

  // الفلاتر
  document.getElementById('filterStatus').addEventListener('change', renderTable);
  document.getElementById('filterMethod').addEventListener('change', renderTable);
  document.getElementById('receiptModal').addEventListener('click', function (e) {
    if (e.target === this) closeReceipt();
  });

  window.myPayments = { viewReceipt, closeReceipt };

  console.log('✅ payments.js جاهز');
});
