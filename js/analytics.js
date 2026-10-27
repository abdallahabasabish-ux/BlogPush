/* ================================================================
   js/analytics.js – التحليلات المتقدمة
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  const db = () => window.db || firebase.firestore();
  let charts = {};

  window.bp.onReady(async function () {
    window.bp.initPageChrome();
    window.bp.hideLoader();
    await loadAnalytics();
  });

  async function loadAnalytics() {
    const uid = window.bp.user.uid;
    try {
      const [subsSnap, campsSnap, sitesSnap] = await Promise.all([
        db().collection('subscribers').where('userId', '==', uid).get(),
        db().collection('campaigns').where('userId', '==', uid).get(),
        db().collection('websites').where('userId', '==', uid).get()
      ]);

      const subscribers = [];
      subsSnap.forEach(d => subscribers.push(d.data()));
      const campaigns = [];
      campsSnap.forEach(d => campaigns.push({ id: d.id, ...d.data() }));
      const sites = [];
      sitesSnap.forEach(d => sites.push({ id: d.id, ...d.data() }));

      renderStats(campaigns, subscribers);
      renderGrowth12(subscribers);
      renderDevices(subscribers);
      renderTopSites(sites, subscribers);
      renderPerfTable(campaigns, sites);
    } catch (e) {
      console.error('❌ خطأ التحليلات:', e);
      document.getElementById('perfTable').innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--color-danger);">فشل تحميل البيانات — ' + e.message + '</td></tr>';
    }
  }

  // ================== الإحصائيات العامة ==================
  function renderStats(campaigns, subscribers) {
    const sent = campaigns.filter(c => c.status === 'sent');
    let opens = 0, clicks = 0;
    sent.forEach(c => {
      opens += Number(c.opens || c.delivered || 0);
      clicks += Number(c.clicks || 0);
    });
    const ctr = opens > 0 ? ((clicks / opens) * 100).toFixed(1) : '0';

    document.getElementById('anSent').textContent = sent.length.toLocaleString('ar-EG');
    document.getElementById('anOpens').textContent = opens.toLocaleString('ar-EG');
    document.getElementById('anClicks').textContent = clicks.toLocaleString('ar-EG');
    document.getElementById('anCtr').textContent = ctr + '٪';
  }

  // ================== نمو 12 شهر ==================
  function renderGrowth12(subscribers) {
    const ctx = document.getElementById('growth12Chart');
    if (!ctx) return;

    const byMonth = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      byMonth[key] = 0;
    }
    subscribers.forEach(s => {
      const date = s.subscribedAt?.toDate?.() || s.createdAt?.toDate?.();
      if (!date) return;
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      if (key in byMonth) byMonth[key]++;
    });

    const labels = [], cumulative = [];
    let total = 0;
    Object.keys(byMonth).forEach(k => {
      const [y, m] = k.split('-');
      labels.push(new Date(y, m - 1, 1).toLocaleDateString('ar-EG', { month: 'short' }));
      total += byMonth[k];
      cumulative.push(total);
    });

    if (charts.growth) charts.growth.destroy();
    charts.growth = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'إجمالي المشتركين',
          data: cumulative,
          borderColor: '#1A1A2E',
          backgroundColor: 'rgba(26,26,46,0.06)',
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#1A1A2E',
          pointRadius: 3
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

  // ================== توزيع الأجهزة ==================
  function renderDevices(subscribers) {
    const ctx = document.getElementById('deviceChart');
    if (!ctx) return;

    const data = { mobile: 0, desktop: 0, tablet: 0, other: 0 };
    subscribers.forEach(s => {
      const dev = String(s.device || s.userAgent || '').toLowerCase();
      if (dev.includes('mobile') || dev.includes('phone') || dev.includes('android')) data.mobile++;
      else if (dev.includes('tablet') || dev.includes('ipad')) data.tablet++;
      else if (dev.includes('desktop') || dev.includes('windows') || dev.includes('mac')) data.desktop++;
      else data.other++;
    });

    if (charts.device) charts.device.destroy();
    charts.device = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['الهواتف', 'الحواسيب', 'الأجهزة اللوحية', 'أخرى'],
        datasets: [{
          data: [data.mobile, data.desktop, data.tablet, data.other],
          backgroundColor: ['#1A1A2E', '#10B981', '#F59E0B', '#E2E4E8'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: 'Cairo', size: 13 }, padding: 14, usePointStyle: true, pointStyle: 'circle' }
          }
        },
        cutout: '72%'
      }
    });
  }

  // ================== أفضل المواقع ==================
  function renderTopSites(sites, subscribers) {
    const box = document.getElementById('topSites');
    if (!box) return;

    const counts = {};
    subscribers.forEach(s => {
      const key = s.siteId || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });

    const rows = sites.map(s => ({
      name: s.siteName || s.siteUrl || 'موقع',
      count: counts[s.siteId] || s.subscriberCount || 0
    })).sort((a, b) => b.count - a.count).slice(0, 5);

    const max = Math.max(1, ...rows.map(r => r.count));

    if (rows.length === 0) {
      box.innerHTML = '<div class="empty-state" style="text-align:center;padding:30px;"><i class="fas fa-globe" style="font-size:36px;color:var(--color-gray);display:block;margin-bottom:10px;"></i>لا توجد مواقع بعد — <a href="websites.html">أضف موقعك الأول</a></div>';
      return;
    }

    box.innerHTML = rows.map(r =>
      '<div class="perf-bar">' +
      '<div class="lbl"><i class="fas fa-globe" style="color:var(--color-gray);"></i> ' + r.name + '</div>' +
      '<div class="track"><div class="fill" style="width:' + Math.round((r.count / max) * 100) + '%"></div></div>' +
      '<div class="val">' + r.count.toLocaleString('ar-EG') + '</div>' +
      '</div>'
    ).join('');
  }

  // ================== جدول أداء الحملات ==================
  function renderPerfTable(campaigns, sites) {
    const siteMap = {};
    sites.forEach(s => { siteMap[s.siteId] = s.siteName || s.siteUrl; });

    const rows = campaigns
      .sort((a, b) => {
        const da = a.sentAt?.toDate?.()?.getTime() || a.createdAt?.toDate?.()?.getTime() || 0;
        const dbb = b.sentAt?.toDate?.()?.getTime() || b.createdAt?.toDate?.()?.getTime() || 0;
        return dbb - da;
      })
      .slice(0, 12);

    const tbody = document.getElementById('perfTable');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:44px;"><i class="fas fa-paper-plane" style="font-size:40px;color:var(--color-gray);display:block;margin-bottom:12px;"></i>لا توجد حملات بعد — <a href="campaigns.html">أطلق حملتك الأولى</a></td></tr>';
      return;
    }

    const statusMap = {
      sent: '<span class="status-badge success">مرسلة</span>',
      scheduled: '<span class="status-badge warning">مجدولة</span>',
      draft: '<span class="status-badge" style="background:#F7F8FA;color:#4A4A5A;">مسودة</span>',
      failed: '<span class="status-badge danger">فشلت</span>'
    };

    tbody.innerHTML = rows.map(c => {
      const delivered = Number(c.delivered || c.totalSubscribers || 0);
      const clicks = Number(c.clicks || 0);
      const ctr = delivered > 0 ? ((clicks / delivered) * 100).toFixed(1) + '٪' : '—';
      const date = c.sentAt?.toDate?.() || c.createdAt?.toDate?.();
      return '<tr>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);font-weight:600;">' + (c.title || 'بدون عنوان') + '</td>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);font-size:13px;">' + (siteMap[c.siteId] || c.siteName || '—') + '</td>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);">' + (statusMap[c.status] || c.status) + '</td>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);">' + delivered.toLocaleString('ar-EG') + '</td>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);">' + clicks.toLocaleString('ar-EG') + '</td>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);font-weight:700;">' + ctr + '</td>' +
        '<td style="padding:13px 8px;border-bottom:1px solid var(--color-bg);font-size:13px;">' + window.bp.fmtDate(date) + '</td>' +
        '</tr>';
    }).join('');
  }

  console.log('✅ analytics.js جاهز');
});
