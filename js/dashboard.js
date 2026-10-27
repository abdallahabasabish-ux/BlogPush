/**
 * dashboard.js – لوحة التحكم مع بيانات حقيقية
 * الإصدار: 3.0.0 (نهائي)
 */

document.addEventListener('DOMContentLoaded', function() {

  const loadingOverlay = document.getElementById('loadingOverlay');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const menuToggle = document.getElementById('menuToggle');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const greetingText = document.getElementById('greetingText');
  const dateText = document.getElementById('dateText');
  const logoutBtn = document.getElementById('logoutBtn');
  const userCard = document.getElementById('userCard');
  const logoutMenu = document.getElementById('logoutMenu');

  if (typeof firebase === 'undefined') {
    loadingOverlay.innerHTML = '<div style="color:red;text-align:center;padding:50px;">لم يتم تحميل Firebase</div>';
    return;
  }

  const db = window.db || firebase.firestore();

  firebase.auth().onAuthStateChanged(async function(user) {
    if (user) {
      const displayName = user.displayName || user.email || 'مستخدم';
      const email = user.email || '';
      userName.textContent = displayName;
      userEmail.textContent = email;
      userAvatar.textContent = displayName.charAt(0).toUpperCase();
      greetingText.textContent = 'مرحباً، ' + displayName + ' 👋';
      const now = new Date();
      dateText.textContent = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      loadingOverlay.style.display = 'none';
      await loadStats(user.uid);
      await loadRecentCampaigns(user.uid);
      await loadCharts(user.uid);
    } else {
      window.location.href = 'login.html';
    }
  });

  async function loadStats(userId) {
    try {
      const websites = await db.collection('websites').where('userId', '==', userId).get();
      const subscribers = await db.collection('subscribers').where('userId', '==', userId).get();
      const campaigns = await db.collection('campaigns').where('userId', '==', userId).get();

      document.getElementById('statWebsites').textContent = websites.size;
      document.getElementById('statSubscribers').textContent = subscribers.size.toLocaleString('ar-EG');
      document.getElementById('statCampaigns').textContent = campaigns.size;

      let totalOpens = 0, totalDelivered = 0;
      campaigns.forEach(doc => {
        const data = doc.data();
        if (data.status === 'sent') {
          totalOpens += data.opens || 0;
          totalDelivered += data.delivered || data.totalSubscribers || 0;
        }
      });
      const ctr = totalDelivered > 0 ? ((totalOpens / totalDelivered) * 100).toFixed(1) : '٠';
      document.getElementById('statCtr').textContent = ctr + '٪';
    } catch (error) {
      console.error('❌ خطأ في الإحصائيات:', error);
    }
  }

  async function loadRecentCampaigns(userId) {
    try {
      const snapshot = await db.collection('campaigns')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(4)
        .get();

      const tbody = document.querySelector('.recent-table tbody');
      if (!tbody) return;

      if (snapshot.empty) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;">لا توجد حملات</td></tr>`;
        return;
      }

      let html = '';
      snapshot.forEach(doc => {
        const data = doc.data();
        const statusMap = {
          'sent': '<span class="status-badge success">مرسلة</span>',
          'scheduled': '<span class="status-badge warning">قيد الانتظار</span>',
          'draft': '<span class="status-badge draft">مسودة</span>',
          'failed': '<span class="status-badge danger">فشلت</span>'
        };
        const statusHtml = statusMap[data.status] || '<span class="status-badge">غير معروف</span>';
        const sentDate = data.sentAt?.toDate?.() ? data.sentAt.toDate().toLocaleDateString('ar-EG') : '—';
        const ctrDisplay = data.clicks && data.delivered ? ((data.clicks / data.delivered) * 100).toFixed(1) + '٪' : '—';
        html += `<tr><td>${data.title || 'بدون عنوان'}</td><td>${data.siteName || 'غير محدد'}</td><td>${statusHtml}</td><td>${ctrDisplay}</td><td>${sentDate}</td></tr>`;
      });
      tbody.innerHTML = html;
    } catch (error) {
      console.error('❌ خطأ في الحملات:', error);
    }
  }

  async function loadCharts(userId) {
    try {
      const snapshot = await db.collection('subscribers').where('userId', '==', userId).get();
      const monthlyData = {};
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);

      snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.subscribedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date();
        if (date >= sixMonthsAgo) {
          const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
          monthlyData[key] = (monthlyData[key] || 0) + 1;
        }
      });

      const months = [], counts = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push(d.toLocaleDateString('ar-EG', { month: 'short' }));
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        counts.push(monthlyData[key] || 0);
      }

      const growthCtx = document.getElementById('growthChart');
      if (growthCtx) {
        new Chart(growthCtx, {
          type: 'line',
          data: {
            labels: months,
            datasets: [{
              label: 'المشتركين الجدد',
              data: counts,
              borderColor: '#1A1A2E',
              backgroundColor: 'rgba(26,26,46,0.05)',
              tension: 0.3,
              fill: true,
              pointBackgroundColor: '#1A1A2E',
              pointRadius: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } }
          }
        });
      }

      const deviceData = { 'الهواتف': 0, 'الحواسيب': 0, 'الأجهزة اللوحية': 0, 'أخرى': 0 };
      snapshot.forEach(doc => {
        const data = doc.data();
        const device = data.device || 'أخرى';
        if (device.includes('mobile') || device.includes('phone')) deviceData['الهواتف']++;
        else if (device.includes('desktop') || device.includes('computer')) deviceData['الحواسيب']++;
        else if (device.includes('tablet')) deviceData['الأجهزة اللوحية']++;
        else deviceData['أخرى']++;
      });

      const deviceCtx = document.getElementById('deviceChart');
      if (deviceCtx) {
        new Chart(deviceCtx, {
          type: 'doughnut',
          data: {
            labels: ['الهواتف', 'الحواسيب', 'الأجهزة اللوحية', 'أخرى'],
            datasets: [{
              data: [deviceData['الهواتف'], deviceData['الحواسيب'], deviceData['الأجهزة اللوحية'], deviceData['أخرى']],
              backgroundColor: ['#1A1A2E', '#4A4A5A', '#A0A0B0', '#E2E4E8'],
              borderWidth: 0,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  font: { family: 'Cairo', size: 13 },
                  padding: 16,
                  usePointStyle: true,
                  pointStyle: 'circle'
                }
              }
            },
            cutout: '75%',
          }
        });
      }
    } catch (error) {
      console.error('❌ خطأ في المخططات:', error);
    }
  }

  function toggleSidebar(open) {
    if (open) { sidebar.classList.add('open'); sidebarOverlay.classList.add('open'); }
    else { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); }
  }
  menuToggle.addEventListener('click', () => toggleSidebar(!sidebar.classList.contains('open')));
  sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

  userCard.addEventListener('click', () => {
    logoutMenu.style.display = logoutMenu.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if (!userCard.contains(e.target) && !logoutMenu.contains(e.target)) {
      logoutMenu.style.display = 'none';
    }
  });
  logoutBtn.addEventListener('click', () => {
    firebase.auth().signOut().then(() => window.location.href = 'login.html');
  });

  console.log('✅ لوحة التحكم جاهزة');
});
