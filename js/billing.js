/* ================================================================
   js/billing.js – صفحة الاشتراك والدفع
   ------------------------------------------------------------
   المسؤول عن:
   1. عرض الخطة الحالية ونسبة استخدام المشتركين
   2. عرض الخطط والأسعار (من إعدادات المنصة)
   3. الدفع عبر PayPal (SDK حقيقي - يُفعَّل بإدخال Client ID)
   4. الدفع عبر فودافون كاش (تحويل + رفع إيصال)
   5. إنشاء طلب دفع حالة "قيد المراجعة" حتى يعتمده الأدمن
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();

  // حالة الصفحة
  let currentPlanKey = 'free';      // الخطة المعروضة في النافذة
  let receiptData = null;           // base64 للإيصال
  let pendingByPlan = {};           // plan -> يوجد طلب معلق؟
  let paypalRendered = false;
  let paypalLoading = false;
  let mySubscribers = 0;

  // ============================================================
  // الانتظار حتى جاهزية النظام (المصادقة + الإعدادات)
  // ============================================================
  window.bp.onReady(async function (state) {
    window.bp.initPageChrome();
    window.bp.hideLoader();
    renderAll();
    await checkPendingPayments();
    await countMySubscribers();
    renderAll(); // إعادة الرسم بعد معرفة عدد المشتركين
  });

  // ============================================================
  // رسم الصفحة كاملة
  // ============================================================
  function renderAll() {
    const profile = window.bp.profile;
    const settings = window.bp.settings;
    if (!profile || !settings) return;

    const plan = window.bp.effectivePlan();
    const limit = window.bp.subscriberLimit();
    const isTrial = plan === 'trial';

    // ---- لافتة التجربة ----
    const banner = document.getElementById('trialBanner');
    if (isTrial) {
      banner.style.display = 'flex';
      document.getElementById('trialText').textContent =
        'متبقي ' + window.bp.trialDaysLeft() + ' يوم على انتهاء التجربة — ارفع خطتك للاستمرار بدون انقطاع.';
    } else {
      banner.style.display = 'none';
    }

    // ---- بطاقة الخطة الحالية ----
    const paidPlan = profile.plan && profile.plan !== 'free';
    const expiry = profile.planExpiry?.toDate?.();
    document.getElementById('currentPlanStatus').innerHTML =
      plan === 'trial'
        ? window.bp.planBadge('trial')
        : (paidPlan
          ? '<span class="status-badge success">' + window.bp.planName(plan) + ' — نشط</span>'
          : '<span class="status-badge" style="background:#F7F8FA;color:#4A4A5A;">مجاني</span>');

    document.getElementById('usageText').textContent =
      mySubscribers.toLocaleString('ar-EG') + ' من ' + limit.toLocaleString('ar-EG');
    const pct = Math.min(100, Math.round((mySubscribers / Math.max(limit, 1)) * 100));
    const fill = document.getElementById('usageFill');
    fill.style.width = pct + '%';
    fill.className = 'fill' + (pct >= 95 ? ' danger' : pct >= 80 ? ' warn' : '');

    document.getElementById('metaPlanName').textContent = isTrial ? 'تجربة (مميزات مبتدئ)' : window.bp.planName(plan);
    document.getElementById('metaLimit').textContent = limit.toLocaleString('ar-EG');
    document.getElementById('metaExpiry').textContent = paidPlan && expiry
      ? window.bp.fmtDate(expiry) + ' (متبقي ' + window.bp.paidDaysLeft() + ' يوم)'
      : (isTrial ? 'التجربة قيد التشغيل' : 'غير محدد — خطة مجانية');

    // ---- شبكة الخطط ----
    const plans = [
      {
        key: 'free',
        name: 'مجاني',
        price: 0,
        desc: 'مثالي للمدونين الهواة الذين بدأوا للتو.',
        features: ['١٠٠٠ مشترك', 'حملات غير محدودة', 'إشعارات RSS التلقائية', 'تحليلات أساسية', 'دعم عبر البريد الإلكتروني']
      },
      {
        key: 'starter',
        name: 'مبتدئ',
        price: settings.prices.starter,
        desc: 'للمدونات المتنامية التي تملك جمهوراً متفاعلاً.',
        popular: true,
        features: ['١٠,٠٠٠ مشترك', 'حملات غير محدودة', 'إشعارات RSS التلقائية', 'تحليلات متقدمة', 'عضو فريق واحد', 'دعم ذو أولوية']
      },
      {
        key: 'pro',
        name: 'احترافي',
        price: settings.prices.pro,
        desc: 'للناشرين المحترفين والوكالات.',
        features: ['١٠٠,٠٠٠ مشترك', 'كل مميزات خطة مبتدئ', 'وصول API كامل', '٥ أعضاء فريق', 'تقارير تصدير متقدمة', 'دعم مخصص VIP']
      }
    ];

    const grid = document.getElementById('plansGrid');
    grid.innerHTML = plans.map(p => {
      const isCurrent = (plan === p.key) || (isTrial && p.key === 'starter');
      const hasPending = pendingByPlan[p.key];
      let btnHtml = '';

      if (p.key === 'free') {
        if (plan === 'free' && !isTrial) {
          btnHtml = '<button class="btn btn-secondary" disabled style="opacity:.6;justify-content:center;">خطتك الحالية</button>';
        } else {
          btnHtml = '<button class="btn btn-secondary" disabled style="opacity:.6;justify-content:center;" title="تنتقل إليها تلقائياً عند انتهاء اشتراكك">خطة الأساس</button>';
        }
      } else if (isCurrent) {
        btnHtml = '<button class="btn btn-primary" disabled style="opacity:.6;justify-content:center;"><i class="fas fa-check"></i> خطتك الحالية</button>';
      } else if (hasPending) {
        btnHtml = '<div class="pending-note"><i class="fas fa-hourglass-half"></i> طلبك لهذه الخطة قيد المراجعة</div>';
      } else if (paidPlan && profile.plan === p.key) {
        // تجديد نفس الخطة
        btnHtml = '<button class="btn btn-primary" onclick="billing.openModal(\'' + p.key + '\')" style="justify-content:center;"><i class="fas fa-rotate"></i> تجديد 30 يوماً</button>';
      } else {
        btnHtml = '<button class="btn ' + (p.popular ? 'btn-primary' : 'btn-primary') + '" onclick="billing.openModal(\'' + p.key + '\')" style="justify-content:center;">' +
          (paidPlan ? 'الترقية لهذه الخطة' : 'اشترك الآن') + ' <i class="fas fa-arrow-left"></i></button>';
      }

      return '' +
        '<div class="bp-plan-card' + (p.popular ? ' popular' : '') + (isCurrent ? ' current' : '') + '">' +
        (p.popular ? '<div class="pop-badge">الأكثر استخداماً</div>' : '') +
        (isCurrent ? '<div class="pop-badge" style="background:var(--color-success);">خطتك</div>' : '') +
        '<div class="plan-name">' + p.name + '</div>' +
        '<div class="plan-price">' + (p.price === 0 ? '٠' : '$' + p.price) + ' <span>/ شهرياً</span></div>' +
        '<div class="plan-desc">' + p.desc + '</div>' +
        '<ul>' + p.features.map(f => '<li><i class="fas fa-check-circle"></i> ' + f + '</li>').join('') + '</ul>' +
        btnHtml +
        '</div>';
    }).join('');
  }

  // ============================================================
  // فحص الطلبات المعلقة الخاصة بي
  // ============================================================
  async function checkPendingPayments() {
    try {
      const uid = window.bp.user.uid;
      const snap = await db().collection('payments')
        .where('userId', '==', uid)
        .where('status', '==', 'pending')
        .get();
      pendingByPlan = {};
      snap.forEach(doc => {
        const d = doc.data();
        if (d.plan) pendingByPlan[d.plan] = true;
      });
    } catch (e) {
      console.warn('⚠️ تعذر فحص المدفوعات المعلقة:', e.message);
    }
  }

  // ============================================================
  // عداد مشتركيّ الحساب
  // ============================================================
  async function countMySubscribers() {
    try {
      const uid = window.bp.user.uid;
      const snap = await db().collection('subscribers').where('userId', '==', uid).get();
      mySubscribers = snap.size;
    } catch (e) { /* تجاهل */ }
  }

  // ============================================================
  // نافذة الدفع
  // ============================================================
  function openModal(planKey) {
    const settings = window.bp.settings;
    currentPlanKey = planKey;
    const price = planKey === 'starter' ? settings.prices.starter : settings.prices.pro;

    document.getElementById('modalPlanName').textContent = window.bp.planName(planKey);
    document.getElementById('modalPlanPrice').textContent = '$' + price + ' / شهرياً';

    // إعادة ضبط الواجهة
    document.getElementById('payMain').style.display = 'block';
    document.getElementById('paySuccess').style.display = 'none';
    switchMethod('paypal');

    // تعبئة بيانات فودافون
    document.getElementById('vfNumber').textContent = settings.vodafoneNumber || 'غير مضبوط — راجع الإدارة';
    document.getElementById('vfName').textContent = settings.vodafoneName || 'BlogPush';
    document.getElementById('vfAmount').textContent =
      '$' + price + ' ≈ ' + window.bp.fmtEGP(price * (settings.usdToEgp || 50));

    document.getElementById('payModal').classList.add('open');
    document.body.style.overflow = 'hidden';

    // تجهيز PayPal
    preparePaypal(price);
  }

  function closeModal() {
    document.getElementById('payModal').classList.remove('open');
    document.body.style.overflow = '';
  }

  function switchMethod(method) {
    document.getElementById('tabPaypal').classList.toggle('active', method === 'paypal');
    document.getElementById('tabVodafone').classList.toggle('active', method === 'vodafone');
    document.getElementById('panePaypal').classList.toggle('active', method === 'paypal');
    document.getElementById('paneVodafone').classList.toggle('active', method === 'vodafone');
  }

  // ============================================================
  // PayPal – بوابة دفع حقيقية
  // ============================================================
  function preparePaypal(price) {
    const settings = window.bp.settings;
    const area = document.getElementById('paypalArea');
    const clientId = settings.paypalClientId;

    // غير مفعّل: لا يوجد Client ID
    if (!clientId) {
      area.innerHTML =
        '<div class="pp-disabled">' +
        '<i class="fab fa-paypal" style="font-size:34px;margin-bottom:10px;"></i><br>' +
        '<b>الدفع عبر PayPal غير مفعّل حالياً</b><br>' +
        'صاحب المنصة لم يضبط مفاتيح PayPal بعد. يمكنك استخدام فودافون كاش،' +
        ' أو تواصل معنا على: ' + (settings.supportEmail || '') +
        '</div>';
      document.getElementById('paypalTabHint').textContent = 'غير مفعّل حالياً';
      document.getElementById('paypalTabHint').className = 't2 off';
      return;
    }
    document.getElementById('paypalTabHint').textContent = 'دفع آمن بالدولار';
    document.getElementById('paypalTabHint').className = 't2';

    // محمّل مسبقاً؟ أعد الرسم فقط
    if (window.paypal && paypalRendered) {
      area.innerHTML = '<div id="paypalButtons"></div>';
      renderPaypalButtons(price);
      return;
    }

    area.innerHTML = '<div class="pp-loading"><i class="fas fa-spinner fa-spin"></i> جاري تحميل بوابة PayPal...</div>';

    if (window.paypal) {
      area.innerHTML = '<div id="paypalButtons"></div>';
      renderPaypalButtons(price);
      return;
    }

    if (paypalLoading) return; // يتم التحميل بالفعل
    paypalLoading = true;

    const sdk = document.createElement('script');
    sdk.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
              '&currency=' + (settings.paypalCurrency || 'USD') + '&intent=capture';
    sdk.onload = function () {
      paypalLoading = false;
      // لو غيّر المستخدم الخطة أثناء التحميل
      if (document.getElementById('payModal').classList.contains('open')) {
        area.innerHTML = '<div id="paypalButtons"></div>';
        renderPaypalButtons(planPrice());
      }
    };
    sdk.onerror = function () {
      paypalLoading = false;
      area.innerHTML =
        '<div class="pp-disabled">' +
        '<i class="fas fa-triangle-exclamation" style="font-size:30px;margin-bottom:10px;"></i><br>' +
        '<b>تعذر تحميل بوابة PayPal</b><br>' +
        'تحقق من اتصالك بالإنترنت أو من صحة الـ Client ID من لوحة الأدمن.<br>' +
        'يمكنك الدفع عبر فودافون كاش بدلاً من ذلك.' +
        '</div>';
    };
    document.head.appendChild(sdk);
  }

  // سعر الخطة المعروضة حالياً في النافذة
  function planPrice() {
    const settings = window.bp.settings;
    return currentPlanKey === 'starter' ? settings.prices.starter : settings.prices.pro;
  }

  function renderPaypalButtons(price) {
    if (!window.paypal) return;
    const settings = window.bp.settings;
    try {
      paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 45 },
        createOrder: function (data, actions) {
          return actions.order.create({
            purchase_units: [{
              description: 'BlogPush - ' + window.bp.planName(currentPlanKey) + ' Plan (30 days)',
              amount: {
                value: Number(price).toFixed(2),
                currency_code: settings.paypalCurrency || 'USD'
              },
              custom_id: window.bp.user.uid,
              description: 'اشتراك شهر - ' + (window.bp.user.email || '')
            }]
          });
        },
        onApprove: async function (data, actions) {
          try {
            const details = await actions.order.capture();
            const capture = details?.purchase_units?.[0]?.payments?.captures?.[0];
            await createPayment({
              method: 'paypal',
              amountUSD: Number(price),
              paypalOrderId: data.orderID,
              captureId: capture?.id || '',
              payerEmail: details?.payer?.email_address || window.bp.user.email || '',
              payerName: (details?.payer?.name?.given_name || '') + ' ' + (details?.payer?.name?.surname || '')
            });
          } catch (err) {
            console.error('❌ فشل اعتماد الدفع:', err);
            window.bp.showToast('فشل إتمام عملية الدفع: ' + (err.message || 'خطأ غير معروف'), 'error');
          }
        },
        onError: function (err) {
          console.error('❌ PayPal error:', err);
          window.bp.showToast('حدث خطأ في بوابة PayPal. حاول مرة أخرى.', 'error');
        },
        onCancel: function () {
          window.bp.showToast('تم إلغاء عملية الدفع.', 'info');
        }
      }).render('#paypalButtons').catch(function (err) {
        console.error('❌ تعذر عرض أزرار PayPal:', err);
        document.getElementById('paypalArea').innerHTML =
          '<div class="pp-disabled">تعذر عرض أزرار الدفع. تأكد من صحة الـ Client ID.</div>';
      });
      paypalRendered = true;
    } catch (e) {
      console.error('❌ PayPal init:', e);
    }
  }

  // ============================================================
  // فودافون كاش – رفع الإيصال
  // ============================================================

  // نسخ الرقم
  function copyNumber() {
    const num = document.getElementById('vfNumber').textContent.trim();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(num).then(() => window.bp.showToast('تم نسخ الرقم ✅', 'success'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = num;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); window.bp.showToast('تم نسخ الرقم ✅', 'success'); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // ضغط صورة الإيصال وتحويلها base64
  function handleReceipt(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.bp.showToast('الملف المرفوع يجب أن يكون صورة', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        // تصغير الصورة لعرض أقصى 1200 بكسل
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // ضغط تدريجي حتى يصغر عن 900 كيلوبايت
        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 900 * 1024 && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        receiptData = dataUrl;
        document.getElementById('receiptImg').src = dataUrl;
        document.getElementById('receiptName').textContent = file.name;
        document.getElementById('receiptPreview').style.display = 'flex';
        window.bp.showToast('تم إرفاق الإيصال بنجاح', 'success');
      };
      img.onerror = function () {
        window.bp.showToast('تعذر قراءة الصورة — جرّب صورة أخرى', 'error');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function clearReceipt() {
    receiptData = null;
    document.getElementById('receiptInput').value = '';
    document.getElementById('receiptPreview').style.display = 'none';
  }

  // إرسال طلب فودافون كاش
  async function submitVodafone(e) {
    e.preventDefault();
    const settings = window.bp.settings;
    const price = planPrice();

    const senderName = document.getElementById('vfSenderName').value.trim();
    const senderPhone = document.getElementById('vfSenderPhone').value.trim();
    const reference = document.getElementById('vfReference').value.trim();

    // التحقق من المدخلات
    let valid = true;
    const phoneError = document.getElementById('vfPhoneError');
    if (!/^01[0125][0-9]{8}$/.test(senderPhone)) {
      phoneError.classList.add('show');
      valid = false;
    } else {
      phoneError.classList.remove('show');
    }
    if (!receiptData) {
      window.bp.showToast('الرجاء إرفاق صورة إيصال التحويل', 'error');
      valid = false;
    }
    if (!valid) return;

    const btn = document.getElementById('vfSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

    try {
      await createPayment({
        method: 'vodafone',
        amountUSD: Number(price),
        amountEGP: Math.round(price * (settings.usdToEgp || 50)),
        usdToEgp: settings.usdToEgp || 50,
        senderName: senderName,
        senderPhone: senderPhone,
        reference: reference,
        receiptBase64: receiptData
      });
      clearReceipt();
      document.getElementById('vfForm').reset();
    } catch (err) {
      console.error('❌ خطأ إرسال الطلب:', err);
      window.bp.showToast('فشل إرسال الطلب: ' + (err.message || 'خطأ غير معروف'), 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال طلب الاعتماد';
  }

  // ============================================================
  // إنشاء مستند طلب الدفع (مشترك بين الطريقتين)
  // ============================================================
  async function createPayment(details) {
    const user = window.bp.user;
    const profile = window.bp.profile;
    const settings = window.bp.settings;

    const doc = {
      userId: user.uid,
      userEmail: user.email || '',
      userName: profile.displayName || (user.email || 'مستخدم'),
      plan: currentPlanKey,
      planName: window.bp.planName(currentPlanKey),
      amountUSD: details.amountUSD,
      currency: settings.paypalCurrency || 'USD',
      method: details.method,
      methodLabel: details.method === 'paypal' ? 'PayPal' : 'فودافون كاش',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: '',
      rejectReason: ''
    };

    if (details.method === 'paypal') {
      doc.paypalOrderId = details.paypalOrderId;
      doc.captureId = details.captureId;
      doc.payerEmail = details.payerEmail;
      doc.payerName = details.payerName;
    } else {
      doc.amountEGP = details.amountEGP;
      doc.usdToEgp = details.usdToEgp;
      doc.senderName = details.senderName;
      doc.senderPhone = details.senderPhone;
      doc.reference = details.reference || '';
      doc.receiptBase64 = details.receiptBase64;
    }

    await db().collection('payments').add(doc);

    // عرض شاشة النجاح
    document.getElementById('payMain').style.display = 'none';
    document.getElementById('paySuccess').style.display = 'block';
    document.getElementById('successTitle').textContent =
      details.method === 'paypal'
        ? 'تم استلام دفعتك عبر PayPal بنجاح! 🎉'
        : 'تم إرسال طلب الدفع بنجاح!';

    document.getElementById('successText').textContent =
      'طلب تفعيل خطة "' + window.bp.planName(currentPlanKey) + '" بقيمة $' + details.amountUSD +
      ' الآن قيد المراجعة من إدارة المنصة. سيتم تفعيل اشتراكك لمدة 30 يوماً فور الاعتماد —' +
      ' تابع الحالة من صفحة "فواتيري".';

    await checkPendingPayments();
    renderAll();
    window.bp.showToast('تم استلام طلب الدفع ✅ بانتظار المراجعة', 'success');
  }

  // ============================================================
  // تصدير الدوال المستخدمة في onclick
  // ============================================================
  window.billing = {
    openModal, closeModal, switchMethod, copyNumber, clearReceipt,
    submitVodafone: function (e) { return submitVodafone(e); }
  };

  // ربط الأحداث
  document.getElementById('vfForm').addEventListener('submit', submitVodafone);
  document.getElementById('receiptInput').addEventListener('change', function (e) {
    handleReceipt(e.target.files[0]);
  });
  // إغلاق النافذة بالنقر على الخلفية
  document.getElementById('payModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  console.log('✅ billing.js جاهز');
});
