/* ShareDrop Digital OS v5.1 — application logic
   Single-page app, no build step. Persists to localStorage, queues writes
   for background sync, and talks to the Netlify Functions backend (/api/*) when online. */

(() => {
  'use strict';

  // ---------- Config ----------
  const API_URL = window.SHAREDROP_API_URL || '';
  const STORAGE_KEY = 'sharedrop_os_state_v5';
  const AUTH_KEY = 'sharedrop_auth_v1';

  // ---------- Auth ----------
  let auth = loadAuth(); // { token, user } | null

  function loadAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveAuth(a) {
    auth = a;
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTH_KEY);
    renderAccountLine();
  }
  function authHeaders() {
    return auth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
  }
  function renderAccountLine() {
    const el = document.getElementById('accountLine');
    if (!el) return;
    if (auth && auth.user) {
      el.innerHTML = `<span style="font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(auth.user.email)}</span><button class="btn small secondary" id="logoutBtn">Sign out</button>`;
      document.getElementById('logoutBtn').addEventListener('click', logout);
    } else {
      el.innerHTML = `<span style="font-size:.75rem;color:var(--muted);flex:1;">Offline demo mode</span><button class="btn small" id="signInAgainBtn">Sign in</button>`;
      document.getElementById('signInAgainBtn').addEventListener('click', () => openAuthModal());
    }
  }
  function logout() {
    saveAuth(null);
    toast('Signed out. Continuing in offline demo mode.');
  }
  function openAuthModal() {
    document.getElementById('authBackdrop').classList.add('open');
  }
  function closeAuthModal() {
    document.getElementById('authBackdrop').classList.remove('open');
  }

  let authMode = 'login'; // or 'register'
  function setAuthMode(mode) {
    authMode = mode;
    document.getElementById('authTitle').textContent = mode === 'login' ? 'Sign in to ShareDrop' : 'Create your ShareDrop account';
    document.getElementById('authNameField').style.display = mode === 'login' ? 'none' : 'block';
    document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Sign in' : 'Register';
    document.getElementById('authToggleBtn').textContent = mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in';
    document.getElementById('authError').style.display = 'none';
  }

  async function submitAuthForm(fd) {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const errEl = document.getElementById('authError');
    errEl.style.display = 'none';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password'), name: fd.get('name') || '' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Authentication failed');
      saveAuth({ token: data.token, user: data.user });
      closeAuthModal();
      toast(authMode === 'login' ? `Welcome back, ${data.user.name || data.user.email}` : `Account created for ${data.user.email}`);
      await bootstrapFromServer();
      startApp();
    } catch (e) {
      errEl.textContent = e.message.includes('fetch') || e.message.includes('Failed')
        ? 'Cannot reach the backend right now — try offline demo mode instead.'
        : e.message;
      errEl.style.display = 'block';
    }
  }

  // Pull live orders/enrollments from the server after a successful sign-in
  // and merge them into local state so the signed-in user sees real data.
  async function bootstrapFromServer() {
    if (!auth) return;
    try {
      const [ordersRes, applicantsRes] = await Promise.all([
        fetch(`${API_URL}/api/orders`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/applicants`, { headers: authHeaders() })
      ]);
      if (ordersRes.ok) {
        const d = await ordersRes.json();
        if (d.success && Array.isArray(d.orders) && d.orders.length) state.orders = d.orders;
      }
      if (applicantsRes.ok) {
        const d = await applicantsRes.json();
        if (d.success && Array.isArray(d.enrollments) && d.enrollments.length) state.enrollments = d.enrollments;
      }
      saveState();
      log('Synced live data from server');
    } catch (e) {
      console.warn('bootstrapFromServer failed, staying on local data:', e.message);
    }
  }

  // ---------- Static reference data (from the Executive Strategic Blueprint) ----------
  function addDays(ts, n) { return new Date(ts + n * 86400000).toISOString(); }

  const PAYMENT_WATERFALL = [
    { key: 'P1', label: 'Core OpEx', detail: 'Software hosting, server uptime, rent, base payroll', pct: 0.45 },
    { key: 'P2', label: 'Statutory Liabilities', detail: 'GRA PAYE/VAT remittances, NIS employer contributions', pct: 0.20 },
    { key: 'P3', label: 'Investor Return', detail: '20% capital allocation / preferred investor debt', pct: 0.15 },
    { key: 'P4', label: 'Growth Option Pool', detail: 'Regional fleet expansion & strategic reserves', pct: 0.12 },
    { key: 'P5', label: 'Dividend Pool', detail: 'Final owner equity distributions per cap table ratios', pct: 0.08 }
  ];

  const AP_TIERS = [
    { tier: 1, max: 100000, label: 'Tier 1 — Routine OpEx', approvers: ['Operational Lead or Single Director'], docs: 'Itemized receipt / vendor invoice' },
    { tier: 2, max: 1000000, label: 'Tier 2 — Mid-Level Spend', approvers: ['CEO', 'Director'], docs: 'Requisition form (SD-TPL-PO-02) + 2 vendor quotes' },
    { tier: 3, max: 10000000, label: 'Tier 3 — High-Value Contracts', approvers: ['Dual Director sign-off', 'Legal review'], docs: 'Executed contract + purchase order' },
    { tier: 4, max: Infinity, label: 'Tier 4 — Capital / Structural', approvers: ['Full Board Resolution'], docs: 'Formal board resolution + legal documentation' }
  ];
  function tierFor(amount) { return AP_TIERS.find(t => amount <= t.max) || AP_TIERS[AP_TIERS.length - 1]; }

  const ROADMAP_PHASES = [
    { phase: 'Days 1–30 (Month 1)', title: 'Legal & Administrative Foundation', items: ['Deploy SD-TPL-INV-01 invoicing (Net 15)', 'Enforce Dual-PDF escrow protocol', 'Configure dual-sign banking over GYD 100,000'] },
    { phase: 'Days 31–60 (Month 2)', title: 'Regional Rollout & Payment Integration', items: ['Launch Lethem app corridor', 'Integrate PIX & MMG payment gateways', 'Onboard initial 50 drivers'] },
    { phase: 'Days 61–90 (Month 3)', title: 'Expansion & Multilateral Financing', items: ['Scale Georgetown operations', 'Submit FinDev Canada / BNDES funding applications', 'Target $20,000 USD monthly GMV'] }
  ];

  const RISK_MAP = [
    { risk: 'Object 8 Fee Misclassification', impact: 'Risk of being classified as a Payment Service Provider (PSP) taking customer funds into custody', severity: 'CRITICAL', mitigation: 'Mandate strict non-custodial invoice language; route all access fees to core corporate accounts' },
    { risk: 'Cross-Border Route Delays', impact: 'Lapsed ANTT/IRTA permits stalling freight across the Lethem–Bonfim border', severity: 'HIGH', mitigation: 'Automated compliance calendar with 60-day advance expiry notifications' },
    { risk: 'Data Protection / KYC Breach', impact: 'Transmission of unredacted PII over unencrypted channels resulting in regulatory fines', severity: 'HIGH', mitigation: 'Dual-PDF protocol: redacted PDFs for digital use, sealed physical escrow for raw originals' },
    { risk: 'Statutory Tax Non-Compliance', impact: 'Late filing of GRA PAYE/VAT or NIS remittances risking loss of DCRA Good Standing', severity: 'HIGH', mitigation: 'P2 priority allocation in the payment waterfall guarantees tax remittance before owner distributions' }
  ];

  // ---------- Seed / default state ----------
  function defaultState() {
    const now = Date.now();
    const routes = [['Georgetown','Linden'], ['Linden','Lethem'], ['Lethem','Boa Vista'], ['Georgetown','Berbice']];
    const names = ['A. Singh', 'B. Khan', 'C. James', 'D. Persaud', 'E. McLean', 'F. Griffith'];
    const orders = [];
    for (let i = 0; i < 6; i++) {
      orders.push({
        id: `ORD-${1000 + i}`,
        customer: names[i],
        phone: `592-${600 + i}-${1000 + i}`,
        pickup: routes[i % 4][0],
        delivery: routes[i % 4][1],
        type: ['Standard','Express','Same Day','Scheduled'][i % 4],
        value: 5000 + i * 4200,
        status: ['PENDING','ASSIGNED','PICKED UP','EN ROUTE','DELIVERED'][i % 5],
        driver: ['Unassigned','D-102','D-103','D-104','D-105','D-101'][i % 6],
        createdAt: new Date(now - i * 3600000).toISOString()
      });
    }
    return {
      orders,
      enrollments: [
        { id: 'ID-001', name: 'Jason McLean', role: 'Driver', phone: '592-610-0001', status: 'Active' },
        { id: 'ID-002', name: 'Norma Griffith', role: 'Agent', phone: '592-620-0002', status: 'Pending' },
        { id: 'ID-003', name: 'ShareDrop Ltd', role: 'Merchant', phone: '592-225-0003', status: 'Verified' }
      ],
      compliance: [
        { entity: 'ShareDrop Ltd', type: 'Incorporation', status: 'Verified' },
        { entity: 'Takutu Logistics', type: 'Trade License', status: 'Expired' },
        { entity: 'Jason McLean', type: 'ID Scan', status: 'Verified' },
        { entity: 'Norma Griffith', type: 'Driver Abstract', status: 'Pending' }
      ],
      wallet: { balance: 125000, transactions: [] },
      logs: [
        { t: new Date(now - 60000).toISOString(), msg: 'System initialized' },
        { t: new Date(now - 30000).toISOString(), msg: 'Seed data loaded' }
      ],
      syncQueue: [],
      peers: [
        { id: 'AGT-01', name: 'Linden Depot', status: 'online', lastSeen: 'now' },
        { id: 'AGT-02', name: 'Lethem Border Post', status: 'online', lastSeen: 'now' },
        { id: 'AGT-03', name: 'Boa Vista Relay', status: 'away', lastSeen: '14 min ago' }
      ],
      quiz: { answers: {}, submitted: false, score: null },
      missions: [
        { id: 'M1', title: 'Yard maneuvering & three-point turn', done: false },
        { id: 'M2', title: 'Corridor route: Georgetown → Linden', done: false },
        { id: 'M3', title: 'Loading dock reverse & docking', done: false },
        { id: 'M4', title: 'Night driving assessment', done: false },
        { id: 'M5', title: 'Border-crossing documentation drill', done: false }
      ],
      revenueSeries: Array.from({length: 30}, (_, i) => Math.round(300000 + Math.sin(i/3)*60000 + i*9000 + Math.random()*30000)),
      // Cross-border / regulatory permit calendar — SOP-OPS-003
      permits: [
        { id: 'PRM-01', name: 'ANTT Cross-Border Haulage Permit', authority: 'ANTT (Brazil)', expires: addDays(now, 48) },
        { id: 'PRM-02', name: 'GRA Tax Clearance Certificate', authority: 'Guyana Revenue Authority', expires: addDays(now, 12) },
        { id: 'PRM-03', name: 'NIS Employer Compliance', authority: 'National Insurance Scheme', expires: addDays(now, 95) },
        { id: 'PRM-04', name: 'IRTA Cross-Border Permit', authority: 'Guyana IRTA', expires: addDays(now, -6) },
        { id: 'PRM-05', name: 'MoHA Clearance (driver corps)', authority: 'Ministry of Home Affairs', expires: addDays(now, 70) }
      ],
      // Dual-PDF KYC escrow log — SOP-LEG-002 (metadata only; files handled off-platform)
      docPairs: [
        { id: 'DOC-01', entity: 'Jason McLean', type: 'Passport', loggedAt: new Date(now - 86400000 * 10).toISOString() },
        { id: 'DOC-02', entity: 'Norma Griffith McLean', type: 'Police Clearance (Form C13)', loggedAt: new Date(now - 86400000 * 4).toISOString() }
      ],
      // Accounts payable — tiered approval hierarchy
      expenses: [
        { id: 'EXP-01', description: 'AWS hosting — Q3', amount: 42000, tier: 1, approvers: ['Operational Lead'], secondApprover: '', status: 'Approved', createdAt: new Date(now - 86400000 * 5).toISOString() },
        { id: 'EXP-02', description: 'Fleet vehicle lease renewal', amount: 650000, tier: 2, approvers: ['CEO', 'Director'], secondApprover: 'Norma Griffith McLean', status: 'Approved', createdAt: new Date(now - 86400000 * 2).toISOString() }
      ]
    };
  }

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('State load failed, reseeding', e); }
    return defaultState();
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.error('State save failed', e); }
  }

  function log(msg) {
    state.logs.unshift({ t: new Date().toISOString(), msg });
    state.logs = state.logs.slice(0, 60);
  }

  // ---------- Sync queue (offline-first writes) ----------
  function queueOp(type, data) {
    state.syncQueue.push({ id: `OP-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type, data, queuedAt: new Date().toISOString() });
    saveState();
    renderSyncQueue();
    updateSyncStatus();
    if (navigator.onLine) flushSyncQueue();
  }

  async function flushSyncQueue() {
    if (!state.syncQueue.length) return;
    if (!navigator.onLine) { toast('Still offline — queue will flush on reconnect'); return; }
    if (!auth) { toast('Sign in to sync changes with the server'); return; }
    const ops = state.syncQueue.map(o => ({ type: o.type, data: o.data }));
    try {
      const res = await fetch(`${API_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ operations: ops })
      });
      if (res.status === 401) {
        saveAuth(null);
        openAuthModal();
        toast('Session expired — please sign in again');
        return;
      }
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      state.syncQueue = [];
      log('Sync queue flushed to backend');
      toast('Synced with server');
    } catch (e) {
      // Backend unreachable (e.g. running frontend-only) — keep queue, don't crash the UI.
      console.warn('Sync unreachable, operations remain queued locally:', e.message);
      toast('Backend unreachable — changes saved locally');
    }
    saveState();
    renderSyncQueue();
    updateSyncStatus();
  }

  function updateSyncStatus() {
    const el = document.getElementById('syncStatus');
    el.textContent = state.syncQueue.length ? `${state.syncQueue.length} pending` : 'Synced';
  }

  window.addEventListener('online', () => { updateConnectionUI(); flushSyncQueue(); });
  window.addEventListener('offline', updateConnectionUI);

  function updateConnectionUI() {
    const online = navigator.onLine;
    const dot = document.getElementById('sideDot');
    const sideText = document.getElementById('sideStatusText');
    const badge = document.getElementById('connectionStatus');
    dot.classList.toggle('off', !online);
    sideText.textContent = online ? 'Online' : 'Offline';
    badge.textContent = online ? '● Online' : '● Offline';
    badge.className = 'status ' + (online ? 'online' : 'offline');
  }

  // ---------- Toasts ----------
  function toast(msg) {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------- Navigation ----------
  function switchScreen(name) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.screen === name));
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    const titles = {
      dashboard: 'Dashboard', orders: 'Orders', dispatch: 'Dispatch', driving: 'Driving School',
      enrollment: 'Enrollment', compliance: 'Compliance', map: 'Corridor Map', p2p: 'Agent / P2P', finance: 'Finance',
      roadmap: 'Roadmap'
    };
    document.getElementById('screenTitle').textContent = titles[name] || name;
    document.getElementById('sidebar').classList.remove('open');
    renderScreen(name);
  }

  function renderScreen(name) {
    ({
      dashboard: renderDashboard, orders: renderOrders, dispatch: renderDispatch, driving: renderDriving,
      enrollment: renderEnrollment, compliance: renderCompliance, map: renderMap, p2p: renderP2P, finance: renderFinance,
      roadmap: renderRoadmap
    }[name] || (() => {}))();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const orders = state.orders;
    const delivered = orders.filter(o => o.status === 'DELIVERED').length;
    const active = orders.filter(o => !['DELIVERED'].includes(o.status)).length;
    const gmv = orders.reduce((s, o) => s + Number(o.value || 0), 0);
    const drivers = new Set(state.enrollments.filter(e => e.role === 'Driver').length ? state.enrollments.filter(e => e.role === 'Driver').map(e=>e.id) : []).size;
    const kpis = [
      { label: 'Total Orders', value: orders.length, delta: '+' + orders.length + ' all time', up: true },
      { label: 'Active Deliveries', value: active, delta: `${delivered} delivered`, up: true },
      { label: 'GMV (GYD)', value: gmv.toLocaleString(), delta: 'across all orders', up: true },
      { label: 'Wallet Balance', value: 'GYD ' + state.wallet.balance.toLocaleString(), delta: '', up: true },
      { label: 'Enrolled Users', value: state.enrollments.length, delta: 'drivers, agents, merchants', up: true },
      { label: 'Compliance Verified', value: state.compliance.filter(c => c.status === 'Verified').length + '/' + state.compliance.length, delta: '', up: true },
      { label: 'Active Peers', value: state.peers.filter(p => p.status === 'online').length + '/' + state.peers.length, delta: 'Bitchat mesh', up: true },
      { label: 'Sync Queue', value: state.syncQueue.length, delta: state.syncQueue.length ? 'pending flush' : 'all clear', up: state.syncQueue.length === 0 },
      { label: 'Missions Passed', value: state.missions.filter(m => m.done).length + '/' + state.missions.length, delta: 'Sekai academy', up: true }
    ];
    document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="label">${k.label}</div>
        <div class="value">${k.value}</div>
        <div class="delta ${k.up ? 'up' : 'down'}">${k.delta}</div>
      </div>`).join('');

    drawRevenueChart();

    // Executive KPI dashboard — Phase 4 metrics from the blueprint
    const p1Monthly = Math.round(state.wallet.balance * PAYMENT_WATERFALL[0].pct);
    const cashRunwayMonths = p1Monthly ? (state.wallet.balance / p1Monthly).toFixed(1) : '—';
    const arTotal = orders.filter(o => o.status !== 'DELIVERED').length;
    const arOnTime = orders.filter(o => o.status !== 'DELIVERED' && (Date.now() - new Date(o.createdAt).getTime()) < 15 * 86400000).length;
    const arTurnoverPct = arTotal ? Math.round((arOnTime / arTotal) * 100) : 100;
    const now = Date.now();
    const expiredPermits = state.permits.filter(p => new Date(p.expires).getTime() < now).length;
    const tripsToday = orders.filter(o => {
      const d = new Date(o.createdAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length;
    const execKpis = [
      { label: 'Cash Runway', value: `${cashRunwayMonths} mo`, delta: 'Target: ≥ 6 months', up: Number(cashRunwayMonths) >= 6 },
      { label: 'Platform Fee Run-Rate', value: 'GYD 30M/yr', delta: 'Object 8 base target', up: true },
      { label: 'AR Collected Within Net 15', value: arTurnoverPct + '%', delta: `${arOnTime}/${arTotal} orders`, up: arTurnoverPct >= 80 },
      { label: 'Corridor Trips Today', value: tripsToday, delta: 'Target: 500/day', up: tripsToday > 0 },
      { label: 'Regulatory Standing', value: expiredPermits + ' expired', delta: 'Target: 0 expired licenses', up: expiredPermits === 0 }
    ];
    document.getElementById('execKpiGrid').innerHTML = execKpis.map(k => `
      <div class="kpi-card">
        <div class="label">${k.label}</div>
        <div class="value">${k.value}</div>
        <div class="delta ${k.up ? 'up' : 'down'}">${k.delta}</div>
      </div>`).join('');

    document.getElementById('logFeed').innerHTML = state.logs.slice(0, 20).map(l => `
      <div><span class="t">${new Date(l.t).toLocaleTimeString()}</span>${escapeHtml(l.msg)}</div>
    `).join('') || '<div class="empty">No activity yet</div>';
  }

  function drawRevenueChart() {
    const canvas = document.getElementById('revenueCanvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 400, h = 180;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const data = state.revenueSeries;
    const max = Math.max(...data), min = Math.min(...data);
    const pad = 10;
    const stepX = (w - pad * 2) / (data.length - 1);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(14,165,233,.9)');
    grad.addColorStop(1, 'rgba(16,185,129,.9)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // fill under curve
    ctx.lineTo(pad + (data.length - 1) * stepX, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,165,233,.08)';
    ctx.fill();
  }

  // ---------- Orders ----------
  function renderOrders() {
    const filter = document.getElementById('orderFilter').value;
    const q = document.getElementById('orderSearch').value.trim().toLowerCase();
    const rows = state.orders.filter(o =>
      (!filter || o.status === filter) &&
      (!q || o.customer.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
    );
    document.getElementById('ordersTbody').innerHTML = rows.map(o => `
      <tr>
        <td>${o.id}</td>
        <td>${escapeHtml(o.customer)}</td>
        <td>${o.pickup} → ${o.delivery}</td>
        <td>${o.type}</td>
        <td>${Number(o.value).toLocaleString()}</td>
        <td>${o.driver}</td>
        <td><span class="badge ${statusClass(o.status)}">${o.status}</span></td>
        <td>
          <button class="btn small secondary" data-advance="${o.id}">Advance</button>
          <button class="btn small danger" data-delete-order="${o.id}">✕</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="8"><div class="empty">No orders match this filter</div></td></tr>`;
  }

  function statusClass(s) { return s.toLowerCase().replace(/\s+/g, ''); }

  const ORDER_STAGES = ['PENDING', 'ASSIGNED', 'PICKED UP', 'EN ROUTE', 'DELIVERED'];
  function advanceOrder(id) {
    const o = state.orders.find(x => x.id === id);
    if (!o) return;
    const idx = ORDER_STAGES.indexOf(o.status);
    if (idx < ORDER_STAGES.length - 1) {
      o.status = ORDER_STAGES[idx + 1];
      if (o.status === 'ASSIGNED' && o.driver === 'Unassigned') o.driver = `D-${100 + Math.floor(Math.random()*20)}`;
      log(`${o.id} advanced to ${o.status}`);
      queueOp('update', { id: o.id, status: o.status, driver: o.driver });
      saveState();
      renderOrders(); renderDispatch(); renderDashboard();
    } else {
      toast(`${o.id} already delivered`);
    }
  }

  function deleteOrder(id) {
    state.orders = state.orders.filter(o => o.id !== id);
    log(`${id} removed`);
    queueOp('delete', { id });
    saveState();
    renderOrders(); renderDispatch(); renderDashboard();
  }

  function createOrder(fd) {
    const id = `ORD-${Date.now().toString().slice(-6)}`;
    const order = {
      id, customer: fd.get('customer'), pickup: fd.get('pickup'), delivery: fd.get('delivery'),
      type: fd.get('type'), value: Number(fd.get('value')) || 0, phone: fd.get('phone') || '',
      status: 'PENDING', driver: 'Unassigned', createdAt: new Date().toISOString()
    };
    state.orders.unshift(order);
    log(`New order ${id} created for ${order.customer}`);
    queueOp('create', order);
    saveState();
    renderOrders(); renderDispatch(); renderDashboard();
    toast(`Order ${id} created`);
  }

  // ---------- Dispatch ----------
  function renderDispatch() {
    const active = state.orders.filter(o => o.status !== 'DELIVERED');
    document.getElementById('dispatchList').innerHTML = active.map(o => {
      const idx = ORDER_STAGES.indexOf(o.status);
      const pct = Math.round((idx / (ORDER_STAGES.length - 1)) * 100);
      return `
        <div class="dispatch-card">
          <div class="dispatch-head">
            <div><strong>${o.id}</strong> — ${escapeHtml(o.customer)} <span class="tag">${o.pickup} → ${o.delivery}</span></div>
            <div>
              <button class="btn small" data-advance="${o.id}">Next stage</button>
            </div>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="stage-labels">
            ${ORDER_STAGES.map((s, i) => `<span class="${i <= idx ? 'done' : ''}">${s}</span>`).join('')}
          </div>
        </div>`;
    }).join('') || '<div class="empty">All orders delivered — nothing in flight</div>';
  }

  // ---------- Driving School ----------
  const QUIZ = [
    { id: 'q1', q: 'At an unmarked corridor junction, right of way goes to:', options: ['The larger vehicle', 'Traffic already in the junction', 'Whoever arrives first regardless of direction'], correct: 1 },
    { id: 'q2', q: 'Before crossing the Takutu River bridge into Brazil, a driver must:', options: ['Have cleared customs documentation', 'Simply slow down', 'Nothing extra is required'], correct: 0 },
    { id: 'q3', q: 'Maximum safe following distance on the Linden–Lethem trail in wet conditions:', options: ['1 second', '2 seconds', '4+ seconds'], correct: 2 },
    { id: 'q4', q: 'If the SyncQueue shows a failed delivery scan, the correct first step is:', options: ['Ignore it, it will resolve itself', 'Retry the scan once connectivity returns', 'Cancel the order'], correct: 1 }
  ];

  function renderDriving() {
    document.getElementById('quizArea').innerHTML = QUIZ.map(item => `
      <div class="quiz-q">
        <p class="qtext">${item.q}</p>
        ${item.options.map((opt, i) => `
          <label class="quiz-opt">
            <input type="radio" name="${item.id}" value="${i}" ${state.quiz.answers[item.id] == i ? 'checked' : ''}>
            ${opt}
          </label>
        `).join('')}
      </div>
    `).join('');
    document.querySelectorAll('#quizArea input[type=radio]').forEach(r => {
      r.addEventListener('change', e => {
        state.quiz.answers[e.target.name] = e.target.value;
        saveState();
      });
    });
    const tag = document.getElementById('quizScoreTag');
    tag.textContent = state.quiz.submitted ? `Score: ${state.quiz.score}/${QUIZ.length}` : 'Not submitted';

    document.getElementById('missionList').innerHTML = state.missions.map(m => `
      <div class="mission-card ${m.done ? 'done' : ''}">
        <span>${m.title}</span>
        <button class="btn small ${m.done ? 'secondary' : ''}" data-toggle-mission="${m.id}">${m.done ? 'Passed ✓' : 'Mark passed'}</button>
      </div>
    `).join('');
  }

  function submitQuiz() {
    let score = 0;
    QUIZ.forEach(item => { if (Number(state.quiz.answers[item.id]) === item.correct) score++; });
    state.quiz.submitted = true;
    state.quiz.score = score;
    log(`Written test submitted: ${score}/${QUIZ.length}`);
    queueOp('quiz_submit', { score, total: QUIZ.length });
    saveState();
    renderDriving();
    toast(`Test scored ${score}/${QUIZ.length}`);
  }

  function toggleMission(id) {
    const m = state.missions.find(x => x.id === id);
    if (!m) return;
    m.done = !m.done;
    log(`Mission "${m.title}" ${m.done ? 'passed' : 'reset'}`);
    queueOp('mission_update', { id, done: m.done });
    saveState();
    renderDriving(); renderDashboard();
  }

  // ---------- Enrollment ----------
  function renderEnrollment() {
    document.getElementById('enrollTbody').innerHTML = state.enrollments.map(e => `
      <tr>
        <td>${e.id}</td>
        <td>${escapeHtml(e.name)}</td>
        <td>${e.role}</td>
        <td>${e.phone}</td>
        <td><span class="badge ${statusClass(e.status)}">${e.status}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="5"><div class="empty">No enrollments yet</div></td></tr>';
  }

  function createEnrollment(fd) {
    const id = `ID-${(state.enrollments.length + 1).toString().padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
    const rec = { id, name: fd.get('name'), role: fd.get('role'), phone: fd.get('phone'), status: 'Pending' };
    state.enrollments.push(rec);
    log(`${rec.role} ${rec.name} enrolled (${id})`);
    queueOp('create_enrollment', rec);
    saveState();
    renderEnrollment(); renderDashboard();
    toast(`${rec.name} enrolled as ${rec.role}`);
  }

  // ---------- Compliance ----------
  function renderCompliance() {
    const verified = state.compliance.filter(c => c.status === 'Verified').length;
    const pending = state.compliance.filter(c => c.status === 'Pending').length;
    const expired = state.compliance.filter(c => c.status === 'Expired').length;
    const now = Date.now();
    const permitsExpired = state.permits.filter(p => new Date(p.expires).getTime() < now).length;
    const permitsFlagged = state.permits.filter(p => {
      const d = Math.round((new Date(p.expires).getTime() - now) / 86400000);
      return d >= 0 && d <= 60;
    }).length;
    document.getElementById('complianceKpis').innerHTML = [
      { label: 'KYC Verified', value: verified },
      { label: 'Pending Review', value: pending },
      { label: 'Expired / Action Needed', value: expired },
      { label: 'Permits Expired', value: permitsExpired },
      { label: 'Permits Flagged (≤60d)', value: permitsFlagged }
    ].map(k => `<div class="kpi-card"><div class="label">${k.label}</div><div class="value">${k.value}</div></div>`).join('');

    document.getElementById('docVault').innerHTML = state.compliance.map((c, i) => `
      <div class="doc-vault-item">
        <span>${escapeHtml(c.entity)} — ${c.type}</span>
        <span class="badge ${statusClass(c.status)}">${c.status}</span>
      </div>
    `).join('') + state.docPairs.map(d => `
      <div class="doc-vault-item">
        <span>${escapeHtml(d.entity)} — ${escapeHtml(d.type)} <span class="tag">logged ${new Date(d.loggedAt).toLocaleDateString()}</span></span>
        <span class="badge verified">Redacted public + sealed escrow</span>
      </div>
    `).join('');

    renderPermits();
  }

  function permitStatus(daysLeft) {
    if (daysLeft < 0) return { label: 'EXPIRED', cls: 'expired' };
    if (daysLeft <= 30) return { label: 'RED — renew now', cls: 'expired' };
    if (daysLeft <= 60) return { label: 'YELLOW — flagged', cls: 'pending' };
    return { label: 'GREEN', cls: 'verified' };
  }

  function renderPermits() {
    const now = Date.now();
    const rows = [...state.permits].sort((a, b) => new Date(a.expires) - new Date(b.expires));
    document.getElementById('permitTbody').innerHTML = rows.map(p => {
      const daysLeft = Math.round((new Date(p.expires).getTime() - now) / 86400000);
      const st = permitStatus(daysLeft);
      return `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.authority)}</td>
          <td>${new Date(p.expires).toLocaleDateString()}</td>
          <td>${daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
        </tr>`;
    }).join('');
  }

  function createDocPair(fd) {
    const rec = { id: `DOC-${Date.now().toString().slice(-5)}`, entity: fd.get('entity'), type: fd.get('type'), loggedAt: new Date().toISOString() };
    state.docPairs.push(rec);
    log(`Dual-PDF pair logged for ${rec.entity} (${rec.type})`);
    queueOp('log_doc_pair', rec);
    saveState();
    renderCompliance(); renderDashboard();
    toast('Document pair logged — remember to hand-deliver the sealed original to counsel');
  }

  // ---------- Corridor Map ----------
  const CORRIDOR_STOPS = [
    { code: 'GT', name: 'Georgetown', x: 60 },
    { code: 'LD', name: 'Linden', x: 200 },
    { code: 'LT', name: 'Lethem', x: 340 },
    { code: 'TB', name: 'Takutu Bridge', x: 440 },
    { code: 'BV', name: 'Boa Vista', x: 560 },
    { code: 'RR', name: 'Roraima', x: 660 }
  ];
  function renderMap() {
    const y = 110;
    let svg = `<line x1="${CORRIDOR_STOPS[0].x}" y1="${y}" x2="${CORRIDOR_STOPS[CORRIDOR_STOPS.length-1].x}" y2="${y}" stroke="#334155" stroke-width="4" stroke-linecap="round"/>`;
    // animated progress dot representing an in-flight order
    const activeCount = state.orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'PENDING').length;
    svg += `<line x1="${CORRIDOR_STOPS[0].x}" y1="${y}" x2="${CORRIDOR_STOPS[Math.min(2 + activeCount % 3, 5)].x}" y2="${y}" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>`;
    CORRIDOR_STOPS.forEach((s, i) => {
      svg += `
        <circle cx="${s.x}" cy="${y}" r="9" fill="#1e293b" stroke="#0ea5e9" stroke-width="2.5"/>
        <text x="${s.x}" y="${y - 20}" fill="#e2e8f0" font-size="12" text-anchor="middle" font-weight="600">${s.code}</text>
        <text x="${s.x}" y="${y + 30}" fill="#94a3b8" font-size="10" text-anchor="middle">${s.name}</text>
      `;
    });
    // moving vehicle marker
    const carX = CORRIDOR_STOPS[Math.min(1 + activeCount % 4, 5)].x;
    svg += `<circle cx="${carX}" cy="${y}" r="5" fill="#10b981"><animate attributeName="r" values="5;8;5" dur="1.6s" repeatCount="indefinite"/></circle>`;
    document.getElementById('corridorSvg').innerHTML = svg;
  }

  // ---------- P2P ----------
  function renderSyncQueue() {
    const el = document.getElementById('syncQueueList');
    if (!el) return;
    el.innerHTML = state.syncQueue.length
      ? state.syncQueue.map(o => `<div class="peer-item"><span class="peer-dot away"></span>${o.type} · ${o.data.id || ''} <span class="tag">${new Date(o.queuedAt).toLocaleTimeString()}</span></div>`).join('')
      : '<div class="empty">Queue is empty — everything synced</div>';
  }
  function renderP2P() {
    renderSyncQueue();
    document.getElementById('peerList').innerHTML = state.peers.map(p => `
      <div class="peer-item"><span class="peer-dot ${p.status === 'online' ? '' : 'away'}"></span>${p.name} (${p.id}) <span class="tag">${p.lastSeen}</span></div>
    `).join('');
  }

  // ---------- Finance ----------
  function renderFinance() {
    document.getElementById('financeKpis').innerHTML = [
      { label: 'Wallet Balance', value: 'GYD ' + state.wallet.balance.toLocaleString() },
      { label: 'Y1 Revenue (proj.)', value: 'GYD 11,955,000' },
      { label: 'Y2 Revenue (proj.)', value: 'GYD 47,656,800' },
      { label: 'Y3 Revenue (proj.)', value: 'GYD 110,259,000' }
    ].map(k => `<div class="kpi-card"><div class="label">${k.label}</div><div class="value">${k.value}</div></div>`).join('');
    drawFinanceChart();
    renderWaterfall();
    renderAP();
    renderAR();
  }

  function renderWaterfall() {
    const balance = state.wallet.balance;
    document.getElementById('waterfallList').innerHTML = PAYMENT_WATERFALL.map(p => {
      const amt = Math.round(balance * p.pct);
      return `
        <div class="dispatch-card">
          <div class="dispatch-head">
            <div><strong>${p.key}</strong> — ${p.label} <span class="tag">${Math.round(p.pct * 100)}%</span></div>
            <div>GYD ${amt.toLocaleString()}</div>
          </div>
          <div style="font-size:.78rem;color:var(--muted);">${p.detail}</div>
        </div>`;
    }).join('');
  }

  function renderAP() {
    const rows = [...state.expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('apList').innerHTML = rows.map(e => `
      <div class="dispatch-card">
        <div class="dispatch-head">
          <div>${escapeHtml(e.description)} <span class="tag">Tier ${e.tier}</span></div>
          <div>GYD ${Number(e.amount).toLocaleString()}</div>
        </div>
        <div style="font-size:.76rem;color:var(--muted);">Approvers: ${e.approvers.join(', ')}${e.secondApprover ? ' · Co-signed: ' + escapeHtml(e.secondApprover) : ''}</div>
        <span class="badge ${statusClass(e.status)}" style="margin-top:6px;display:inline-block;">${e.status}</span>
      </div>
    `).join('') || '<div class="empty">No expenses logged yet</div>';
  }

  function createExpense(fd) {
    const amount = Number(fd.get('amount')) || 0;
    const t = tierFor(amount);
    const secondApprover = fd.get('secondApprover') || '';
    if (t.tier >= 2 && !secondApprover) {
      toast(`Tier ${t.tier} requires a second approver before it can be submitted`);
      return false;
    }
    const rec = {
      id: `EXP-${Date.now().toString().slice(-5)}`, description: fd.get('description'), amount, tier: t.tier,
      approvers: t.approvers, secondApprover, status: t.tier >= 2 ? 'Pending dual sign-off' : 'Approved',
      createdAt: new Date().toISOString()
    };
    state.expenses.unshift(rec);
    log(`Expense logged: ${rec.description} (GYD ${amount.toLocaleString()}, Tier ${t.tier})`);
    queueOp('log_expense', rec);
    saveState();
    renderAP(); renderDashboard();
    toast(`Logged as Tier ${t.tier} — ${rec.status}`);
    return true;
  }

  function renderAR() {
    const now = Date.now();
    const outstanding = state.orders.filter(o => o.status !== 'DELIVERED');
    document.getElementById('arList').innerHTML = outstanding.map(o => {
      const days = Math.floor((now - new Date(o.createdAt).getTime()) / 86400000);
      let stage = 'Current', cls = 'verified';
      if (days >= 30) { stage = 'Day +30 — access freeze'; cls = 'expired'; }
      else if (days >= 15) { stage = 'Day +15 — suspension warning'; cls = 'expired'; }
      else if (days >= 7) { stage = 'Day +7 — follow-up call'; cls = 'pending'; }
      else if (days >= 1) { stage = 'Day +1 — email sent'; cls = 'pending'; }
      return `
        <div class="peer-item">
          <span class="peer-dot ${cls === 'verified' ? '' : 'away'}"></span>
          ${o.id} — ${escapeHtml(o.customer)} · GYD ${Number(o.value).toLocaleString()}
          <span class="badge ${cls}" style="margin-left:auto;">${stage}</span>
        </div>`;
    }).join('') || '<div class="empty">No outstanding receivables</div>';
  }

  // ---------- Roadmap ----------
  function renderRoadmap() {
    document.getElementById('roadmapPhases').innerHTML = ROADMAP_PHASES.map(p => `
      <div class="dispatch-card">
        <div class="dispatch-head"><div><strong>${p.phase}</strong> — ${p.title}</div></div>
        <ul style="margin:6px 0 0 18px;font-size:.82rem;color:var(--muted);">
          ${p.items.map(i => `<li style="margin-bottom:4px;">${escapeHtml(i)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    document.getElementById('riskTbody').innerHTML = RISK_MAP.map(r => `
      <tr>
        <td>${escapeHtml(r.risk)}</td>
        <td>${escapeHtml(r.impact)}</td>
        <td><span class="badge ${r.severity === 'CRITICAL' ? 'expired' : 'pending'}">${r.severity}</span></td>
        <td>${escapeHtml(r.mitigation)}</td>
      </tr>
    `).join('');
  }

  function drawFinanceChart() {
    const canvas = document.getElementById('financeCanvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 400, h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const values = [11955000, 47656800, 110259000];
    const labels = ['Year 1', 'Year 2', 'Year 3'];
    const max = Math.max(...values);
    const barW = 70, gap = (w - barW * 3) / 4;
    values.forEach((v, i) => {
      const barH = (v / max) * (h - 50);
      const x = gap + i * (barW + gap);
      const y = h - 30 - barH;
      const grad = ctx.createLinearGradient(0, y, 0, h - 30);
      grad.addColorStop(0, '#0ea5e9');
      grad.addColorStop(1, '#10b981');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 6);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('GYD ' + (v / 1e6).toFixed(1) + 'M', x + barW / 2, y - 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(labels[i], x + barW / 2, h - 12);
    });
  }

  // ---------- Modals ----------
  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  // ---------- Utils ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- Event wiring ----------
  function wireAuthForm() {
    document.getElementById('authForm').addEventListener('submit', e => {
      e.preventDefault();
      submitAuthForm(new FormData(e.target));
    });
    document.getElementById('authToggleBtn').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
    document.getElementById('authOfflineBtn').addEventListener('click', () => {
      closeAuthModal();
      startApp();
    });
    setAuthMode('login');
  }

  function boot() {
    wireAuthForm();
    renderAccountLine();
    if (auth && auth.token) {
      // Returning signed-in user: skip the gate, refresh from server in the background.
      closeAuthModal();
      bootstrapFromServer().finally(startApp);
    }
    // else: leave the auth modal open (it's open by default in the HTML) and
    // wait for login, registration, or "continue offline".
  }

  function startApp() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => switchScreen(item.dataset.screen));
    });
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    // Orders
    document.getElementById('newOrderBtn').addEventListener('click', () => openModal('orderModalBackdrop'));
    document.getElementById('orderForm').addEventListener('submit', e => {
      e.preventDefault();
      createOrder(new FormData(e.target));
      e.target.reset();
      closeModal('orderModalBackdrop');
    });
    document.getElementById('orderFilter').addEventListener('change', renderOrders);
    document.getElementById('orderSearch').addEventListener('input', renderOrders);
    document.getElementById('ordersTbody').addEventListener('click', e => {
      const adv = e.target.closest('[data-advance]');
      const del = e.target.closest('[data-delete-order]');
      if (adv) advanceOrder(adv.dataset.advance);
      if (del) { if (confirm('Delete this order?')) deleteOrder(del.dataset.deleteOrder); }
    });
    document.getElementById('dispatchList').addEventListener('click', e => {
      const adv = e.target.closest('[data-advance]');
      if (adv) advanceOrder(adv.dataset.advance);
    });

    // Enrollment
    document.getElementById('newEnrollBtn').addEventListener('click', () => openModal('enrollModalBackdrop'));
    document.getElementById('enrollForm').addEventListener('submit', e => {
      e.preventDefault();
      createEnrollment(new FormData(e.target));
      e.target.reset();
      closeModal('enrollModalBackdrop');
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
    });

    // Driving school
    document.getElementById('submitQuizBtn').addEventListener('click', submitQuiz);
    document.getElementById('missionList').addEventListener('click', e => {
      const btn = e.target.closest('[data-toggle-mission]');
      if (btn) toggleMission(btn.dataset.toggleMission);
    });

    // P2P
    document.getElementById('flushSyncBtn').addEventListener('click', flushSyncQueue);

    // Finance — expenses (AP tiers)
    document.getElementById('newExpenseBtn').addEventListener('click', () => openModal('expenseModalBackdrop'));
    document.getElementById('expenseAmountInput').addEventListener('input', (e) => {
      const amt = Number(e.target.value) || 0;
      const t = tierFor(amt);
      document.getElementById('expenseTierPreview').textContent = amt
        ? `${t.label} — requires: ${t.approvers.join(', ')}`
        : '';
      document.getElementById('secondApproverField').style.display = t.tier >= 2 && amt ? 'block' : 'none';
    });
    document.getElementById('expenseForm').addEventListener('submit', e => {
      e.preventDefault();
      if (createExpense(new FormData(e.target))) {
        e.target.reset();
        document.getElementById('expenseTierPreview').textContent = '';
        document.getElementById('secondApproverField').style.display = 'none';
        closeModal('expenseModalBackdrop');
      }
    });

    // Compliance — document pair log
    document.getElementById('newDocBtn').addEventListener('click', () => openModal('docModalBackdrop'));
    document.getElementById('docForm').addEventListener('submit', e => {
      e.preventDefault();
      createDocPair(new FormData(e.target));
      e.target.reset();
      closeModal('docModalBackdrop');
    });

    window.addEventListener('resize', () => {
      drawRevenueChart();
      const financeCanvas = document.getElementById('financeCanvas');
      if (financeCanvas && financeCanvas.closest('.screen').classList.contains('active')) drawFinanceChart();
    });

    updateConnectionUI();
    updateSyncStatus();
    switchScreen('dashboard');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW registration failed', err));
    }

    if (navigator.onLine) flushSyncQueue();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
