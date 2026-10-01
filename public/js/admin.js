/**
 * Numora Super Admin Portal Controller
 */

let currentAdminTab = 'dashboard';
let activeAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Theme init
  const savedTheme = localStorage.getItem('numora_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  const token = AdminAPI.getToken();
  if (token) {
    try {
      activeAdmin = await AdminAPI.getMe();
      showAdminApp();
    } catch {
      showAdminLogin();
    }
  } else {
    showAdminLogin();
  }

  // Setup Global Search
  const searchInput = document.getElementById('admin-global-search');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => handleGlobalSearch(e.target.value), 300);
    });
  }
});

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('numora_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
  }
}

function showAdminLogin() {
  document.getElementById('admin-login-view').style.display = 'flex';
  document.getElementById('admin-app-view').style.display = 'none';
}

function showAdminApp() {
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-app-view').style.display = 'flex';

  document.getElementById('admin-profile-name').textContent = activeAdmin.name;
  document.getElementById('admin-profile-email').textContent = activeAdmin.email;

  // Setup tab listeners
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      switchAdminTab(item.getAttribute('data-tab'));
    });
  });

  switchAdminTab('dashboard');
  loadNotificationsBadge();
}

function switchAdminTab(tab) {
  currentAdminTab = tab;

  document.querySelectorAll('.admin-nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tab);
  });

  document.querySelectorAll('.admin-tab-pane').forEach(pane => {
    pane.style.display = pane.id === `tab-${tab}` ? 'block' : 'none';
  });

  // Tab Loaders
  if (tab === 'dashboard') loadDashboardStats();
  if (tab === 'users') loadUsersTable();
  if (tab === 'roles') loadRolesAndPermissions();
  if (tab === 'numbers') loadNumbersFleet();
  if (tab === 'rentals') loadGlobalRentals();
  if (tab === 'messages') loadGlobalMessages();
  if (tab === 'billing') loadGlobalBilling();
  if (tab === 'cms') loadCMSManager();
  if (tab === 'database') loadDatabaseInspector();
  if (tab === 'system') loadSystemHealth();
  if (tab === 'audit') loadAuditLogsTable();
  if (tab === 'settings') loadSettingsManager();
}

// -------------------------------------------------------------
// 1. DASHBOARD VIEW
// -------------------------------------------------------------
async function loadDashboardStats() {
  try {
    const data = await AdminAPI.getDashboardStats();
    const { metrics, system, recentAuditLogs, recentAlerts, chartTimeline } = data;

    // Stat Cards
    document.getElementById('stat-total-users').textContent = metrics.users.total.toLocaleString();
    document.getElementById('stat-active-users').textContent = `${metrics.users.active} active (${metrics.users.new7d} new this week)`;
    
    document.getElementById('stat-active-rentals').textContent = metrics.rentals.active.toLocaleString();
    document.getElementById('stat-inventory-util').textContent = `${metrics.inventory.utilizationRate}% inventory utilization`;

    document.getElementById('stat-total-revenue').textContent = `$${metrics.financials.rentalRevenue.toFixed(2)}`;
    document.getElementById('stat-profit-margin').textContent = `$${metrics.financials.netProfit.toFixed(2)} profit (${metrics.financials.profitMarginPct}% margin)`;

    document.getElementById('stat-sms-processed').textContent = metrics.messaging.total.toLocaleString();
    document.getElementById('stat-otp-parsed').textContent = `${metrics.messaging.otpExtracted} OTP/2FA verification codes parsed`;

    // System Status Card
    document.getElementById('sys-uptime').textContent = `${Math.floor(system.uptimeSeconds / 3600)}h ${Math.floor((system.uptimeSeconds % 3600) / 60)}m`;
    document.getElementById('sys-memory').textContent = `${system.memoryUsagePercent}%`;
    document.getElementById('sys-db-conns').textContent = `${system.activeDbPoolClients} active clients`;

    // Recent Audit Logs
    const auditContainer = document.getElementById('dash-recent-audit');
    if (recentAuditLogs.length === 0) {
      auditContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No recent audit events</td></tr>';
    } else {
      auditContainer.innerHTML = recentAuditLogs.map(l => `
        <tr>
          <td style="font-family:var(--font-mono); font-size:12px;">${new Date(l.created_at).toLocaleTimeString()}</td>
          <td><strong>${l.admin_email}</strong></td>
          <td><span class="badge badge-sand">${l.action}</span></td>
          <td><span class="badge ${l.status === 'success' ? 'badge-sage' : 'badge-danger'}">${l.status}</span></td>
        </tr>
      `).join('');
    }

    // Render Timeline Spark Bars
    const chartBox = document.getElementById('dash-growth-bars');
    if (chartBox && chartTimeline.length > 0) {
      const maxVal = Math.max(1, ...chartTimeline.map(d => parseInt(d.rentals_count, 10) + parseInt(d.messages_count, 10)));
      chartBox.innerHTML = chartTimeline.map(d => {
        const total = parseInt(d.rentals_count, 10) + parseInt(d.messages_count, 10);
        const heightPct = Math.max(15, Math.round((total / maxVal) * 100));
        return `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
            <div style="width:100%; height:120px; display:flex; align-items:flex-end; justify-content:center;">
              <div style="width:70%; height:${heightPct}%; background:var(--primary-terracotta); border-radius:6px 6px 0 0;" title="${d.day}: ${d.rentals_count} rentals, ${d.messages_count} SMS"></div>
            </div>
            <span style="font-size:10px; color:var(--text-dim);">${d.day.slice(5)}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed loading stats:', err);
  }
}

// -------------------------------------------------------------
// 2. USERS MANAGEMENT VIEW
// -------------------------------------------------------------
let usersCurrentPage = 1;

async function loadUsersTable(page = 1) {
  usersCurrentPage = page;
  const search = document.getElementById('user-filter-search')?.value || '';
  const role = document.getElementById('user-filter-role')?.value || '';
  const status = document.getElementById('user-filter-status')?.value || '';

  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">Loading users...</td></tr>';

  try {
    const { users, pagination } = await AdminAPI.getUsers({ search, role, status, page, limit: 15 });

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No users found matching criteria</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <div style="font-weight:600; color:var(--text-ink);">${escapeHtml(u.name)}</div>
          <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(u.company_name || 'Individual')}</div>
        </td>
        <td style="font-family:var(--font-mono); font-size:13px;">${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role === 'super_admin' ? 'badge-terracotta' : u.role === 'admin' ? 'badge-gold' : 'badge-sand'}">${u.role}</span></td>
        <td style="font-weight:700; color:var(--gold-money); font-family:var(--font-mono);">$${u.balance.toFixed(2)}</td>
        <td>
          <span class="badge ${u.status === 'active' ? 'badge-sage' : u.status === 'suspended' ? 'badge-danger' : 'badge-sand'}">
            <span class="status-dot ${u.status}"></span>
            ${u.status}
          </span>
        </td>
        <td style="font-size:13px; color:var(--text-muted);">
          📱 ${u.activeRentalsCount} active / 💬 ${u.messagesCount} SMS
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="openUserProfileModal('${u.id}')">Inspect</button>
            <button class="btn btn-secondary btn-sm" onclick="openBalanceModal('${u.id}', '${escapeHtml(u.name)}', ${u.balance})">± Balance</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Pagination
    document.getElementById('users-pagination-info').textContent = `Showing page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)`;
    document.getElementById('btn-users-prev').disabled = pagination.page <= 1;
    document.getElementById('btn-users-next').disabled = pagination.page >= pagination.totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger-red); padding:20px;">Error: ${err.message}</td></tr>`;
  }
}

async function openUserProfileModal(userId) {
  try {
    const { user, rentals, transactions, auditHistory } = await AdminAPI.getUser(userId);

    document.getElementById('modal-user-id').value = user.id;
    document.getElementById('modal-user-name').value = user.name;
    document.getElementById('modal-user-email').value = user.email;
    document.getElementById('modal-user-company').value = user.company_name || '';
    document.getElementById('modal-user-role').value = user.role;
    document.getElementById('modal-user-status').value = user.status;
    document.getElementById('modal-user-balance-display').textContent = `$${user.balance.toFixed(2)}`;

    // Show Rentals
    const rentalsBox = document.getElementById('modal-user-rentals');
    rentalsBox.innerHTML = rentals.length === 0 ? '<p style="color:var(--text-dim); font-size:13px;">No rentals on record</p>' : rentals.map(r => `
      <div style="background:var(--surface-sand); padding:8px 12px; border-radius:6px; margin-bottom:6px; display:flex; justify-content:space-between; font-size:13px;">
        <span style="font-family:var(--font-mono); font-weight:600;">${r.phone_number}</span>
        <span class="badge ${r.status === 'active' ? 'badge-sage' : 'badge-sand'}">${r.status} (${r.rental_plan})</span>
      </div>
    `).join('');

    document.getElementById('user-profile-modal').classList.add('active');
  } catch (err) {
    alert('Failed to load user profile: ' + err.message);
  }
}

async function saveUserProfile() {
  const userId = document.getElementById('modal-user-id').value;
  const name = document.getElementById('modal-user-name').value;
  const email = document.getElementById('modal-user-email').value;
  const companyName = document.getElementById('modal-user-company').value;
  const role = document.getElementById('modal-user-role').value;
  const status = document.getElementById('modal-user-status').value;

  try {
    await AdminAPI.updateUser(userId, { name, email, companyName, role, status });
    showAdminToast('User profile updated successfully');
    closeAdminModals();
    loadUsersTable(usersCurrentPage);
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}

async function triggerPasswordReset(userId) {
  const newPass = prompt('Enter new temporary password for this user (at least 6 characters):', 'TempPass2026!');
  if (!newPass) return;

  try {
    await AdminAPI.resetUserPassword(userId, newPass);
    showAdminToast('Password successfully reset');
  } catch (err) {
    alert('Reset failed: ' + err.message);
  }
}

async function deleteUserPrompt(userId) {
  if (!confirm('⚠️ Are you sure you want to PERMANENTLY DELETE this user? All their rentals and data will be removed. This cannot be undone.')) {
    return;
  }

  try {
    await AdminAPI.deleteUser(userId);
    showAdminToast('User permanently deleted');
    closeAdminModals();
    loadUsersTable(usersCurrentPage);
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

function openCreateUserModal() {
  document.getElementById('create-user-modal').classList.add('active');
}

async function submitCreateUser(e) {
  e.preventDefault();
  const name = document.getElementById('new-user-name').value;
  const email = document.getElementById('new-user-email').value;
  const password = document.getElementById('new-user-password').value;
  const companyName = document.getElementById('new-user-company').value;
  const role = document.getElementById('new-user-role').value;
  const balance = document.getElementById('new-user-balance').value;

  try {
    await AdminAPI.createUser({ name, email, password, companyName, role, balance });
    showAdminToast(`User ${email} created successfully`);
    closeAdminModals();
    loadUsersTable(1);
  } catch (err) {
    alert('Failed to create user: ' + err.message);
  }
}

function openBalanceModal(userId, userName, currentBalance) {
  document.getElementById('bal-user-id').value = userId;
  document.getElementById('bal-user-name').textContent = userName;
  document.getElementById('bal-current-display').textContent = `$${currentBalance.toFixed(2)}`;
  document.getElementById('bal-amount-input').value = '10.00';
  document.getElementById('balance-adjust-modal').classList.add('active');
}

async function submitBalanceAdjust() {
  const userId = document.getElementById('bal-user-id').value;
  const type = document.getElementById('bal-type').value;
  const amount = parseFloat(document.getElementById('bal-amount-input').value);
  const reason = document.getElementById('bal-reason').value.trim() || 'Admin manual balance adjustment';

  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid adjustment amount');
    return;
  }

  try {
    const res = await AdminAPI.adjustUserBalance(userId, amount, type, reason);
    showAdminToast(`Balance adjusted: ${res.message}`);
    closeAdminModals();
    loadUsersTable(usersCurrentPage);
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}

// -------------------------------------------------------------
// 3. TELEPHONY FLEET INVENTORY VIEW
// -------------------------------------------------------------
async function loadNumbersFleet() {
  const container = document.getElementById('numbers-table-body');
  container.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">Loading fleet inventory...</td></tr>';

  try {
    const { numbers } = await AdminAPI.getNumbers();
    if (numbers.length === 0) {
      container.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No phone numbers in fleet</td></tr>';
      return;
    }

    container.innerHTML = numbers.map(n => `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:700; font-size:15px; color:var(--text-ink);">${n.phoneNumber}</td>
        <td><span class="badge badge-sand">${n.countryCode} · ${n.numberType}</span></td>
        <td><span class="badge badge-terracotta">${n.provider}</span></td>
        <td style="color:var(--text-muted); font-size:13px;">Wholesale: $${n.costPriceMonthly.toFixed(2)}/mo</td>
        <td style="font-weight:700; color:var(--gold-money);">$${n.retailPriceMonthly.toFixed(2)}/mo</td>
        <td>
          <span class="badge ${n.status === 'rented' ? 'badge-sage' : n.status === 'available' ? 'badge-gold' : 'badge-sand'}">
            ${n.status.toUpperCase()}
          </span>
          ${n.rental ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">to: ${escapeHtml(n.rental.userEmail)}</div>` : ''}
        </td>
        <td>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteNumberPrompt('${n.id}', '${n.phoneNumber}')">Remove</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="7" style="color:var(--danger-red); padding:20px;">Error: ${err.message}</td></tr>`;
  }
}

function openAddNumberModal() {
  document.getElementById('add-number-modal').classList.add('active');
}

async function submitAddNumber(e) {
  e.preventDefault();
  const phoneNumber = document.getElementById('new-num-e164').value;
  const friendlyName = document.getElementById('new-num-friendly').value;
  const countryCode = document.getElementById('new-num-country').value;
  const numberType = document.getElementById('new-num-type').value;
  const provider = document.getElementById('new-num-provider').value;
  const costPrice = document.getElementById('new-num-cost').value;
  const retailMonthly = document.getElementById('new-num-price').value;

  try {
    await AdminAPI.addNumber({ phoneNumber, friendlyName, countryCode, numberType, provider, costPrice, retailMonthly });
    showAdminToast(`Number ${phoneNumber} added to inventory`);
    closeAdminModals();
    loadNumbersFleet();
  } catch (err) {
    alert('Failed to add number: ' + err.message);
  }
}

async function deleteNumberPrompt(numId, phone) {
  if (!confirm(`Delete ${phone} from inventory? If actively rented, the lease will be cancelled.`)) return;

  try {
    await AdminAPI.deleteNumber(numId);
    showAdminToast(`Number ${phone} removed`);
    loadNumbersFleet();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}

// -------------------------------------------------------------
// 4. RENTALS & MESSAGES VIEW
// -------------------------------------------------------------
async function loadGlobalRentals() {
  const container = document.getElementById('global-rentals-table-body');
  container.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">Loading customer leases...</td></tr>';

  try {
    const { rentals } = await AdminAPI.getRentals();
    if (rentals.length === 0) {
      container.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No leases recorded</td></tr>';
      return;
    }

    container.innerHTML = rentals.map(r => `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:700;">${r.phoneNumber}</td>
        <td>
          <div style="font-weight:600;">${escapeHtml(r.userName)}</div>
          <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(r.userEmail)}</div>
        </td>
        <td><span class="badge badge-terracotta">${r.plan}</span></td>
        <td><span class="badge ${r.status === 'active' ? 'badge-sage' : 'badge-sand'}">${r.status}</span></td>
        <td style="font-size:13px;">${new Date(r.expiresAt).toLocaleDateString()}</td>
        <td>📱 ${r.messageCount} SMS</td>
        <td>
          ${r.status === 'active' ? `
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="extendLeasePrompt('${r.id}')">+30 Days</button>
              <button class="btn btn-outline-danger btn-sm" onclick="cancelLeasePrompt('${r.id}')">Cancel</button>
            </div>
          ` : '<span style="color:var(--text-dim); font-size:12px;">Ended</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="7" style="color:var(--danger-red); padding:20px;">Error: ${err.message}</td></tr>`;
  }
}

async function extendLeasePrompt(rentalId) {
  try {
    await AdminAPI.extendRental(rentalId, 30);
    showAdminToast('Lease extended by 30 days');
    loadGlobalRentals();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}

async function cancelLeasePrompt(rentalId) {
  if (!confirm('Force cancel this customer lease?')) return;
  try {
    await AdminAPI.cancelRental(rentalId);
    showAdminToast('Lease cancelled and number released');
    loadGlobalRentals();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}

async function loadGlobalMessages() {
  const container = document.getElementById('global-messages-table-body');
  container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">Loading message stream...</td></tr>';

  try {
    const { messages } = await AdminAPI.getAllMessages();
    if (messages.length === 0) {
      container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">No messages received yet</td></tr>';
      return;
    }

    container.innerHTML = messages.map(m => `
      <tr>
        <td style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono);">${new Date(m.receivedAt).toLocaleString()}</td>
        <td style="font-weight:600;">${escapeHtml(m.from)}</td>
        <td style="font-family:var(--font-mono); color:var(--primary-terracotta);">${m.to}</td>
        <td style="font-size:13px; max-width:320px;">
          <div>${escapeHtml(m.body)}</div>
          ${m.code ? `<span class="badge badge-sage" style="margin-top:4px;">OTP: ${m.code}</span>` : ''}
        </td>
        <td style="font-size:12px;">${escapeHtml(m.userEmail)}</td>
        <td><span class="badge badge-sand">${m.provider}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="6" style="color:var(--danger-red); padding:20px;">Error: ${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// 5. SETTINGS & EMERGENCY SAFETY VIEW
// -------------------------------------------------------------
async function loadSettingsManager() {
  const container = document.getElementById('settings-list-container');
  try {
    const { settings } = await AdminAPI.getSettings();

    // Check emergency state
    const maint = settings.find(s => s.key === 'maintenance_mode');
    const lock = settings.find(s => s.key === 'security_lockdown');

    document.getElementById('toggle-maintenance').checked = maint?.value === true;
    document.getElementById('toggle-lockdown').checked = lock?.value === true;

    container.innerHTML = settings.map(s => `
      <div style="background:var(--surface-sand); padding:16px; border-radius:var(--radius-base); border:1px solid var(--border-warm); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:16px;">
        <div style="max-width:60%;">
          <strong style="font-size:14px; font-family:var(--font-mono);">${s.key}</strong>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${escapeHtml(s.description || '')}</div>
        </div>
        <div style="width:260px;">
          <input type="text" class="form-input setting-val-input" data-key="${s.key}" value="${typeof s.value === 'object' ? JSON.stringify(s.value) : s.value}">
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger-red);">Failed to load settings: ${err.message}</div>`;
  }
}

async function saveAllSettings() {
  const inputs = document.querySelectorAll('.setting-val-input');
  const payload = [];

  inputs.forEach(inp => {
    let val = inp.value;
    try { val = JSON.parse(val); } catch {}
    payload.push({ key: inp.getAttribute('data-key'), value: val });
  });

  try {
    await AdminAPI.saveSettings(payload);
    showAdminToast('Platform settings saved successfully');
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

async function toggleEmergencyControl(mode, enabled) {
  if (!confirm(`Are you sure you want to toggle ${mode.toUpperCase()} to ${enabled ? 'ENABLED' : 'DISABLED'}?`)) {
    loadSettingsManager();
    return;
  }

  try {
    await AdminAPI.setEmergencyLock(mode, enabled);
    showAdminToast(`Emergency control updated: ${mode} = ${enabled}`);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// -------------------------------------------------------------
// 6. DATABASE INSPECTOR VIEW
// -------------------------------------------------------------
async function loadDatabaseInspector() {
  const tableSelect = document.getElementById('db-table-select');
  try {
    const { tables } = await AdminAPI.getDbTables();
    tableSelect.innerHTML = tables.filter(t => t.isInspectable).map(t => `
      <option value="${t.tableName}">${t.tableName} (${t.rowCount} rows · ${t.totalSize})</option>
    `).join('');

    inspectSelectedTable();
  } catch (err) {
    console.error('Failed loading tables:', err);
  }
}

async function inspectSelectedTable(page = 1) {
  const table = document.getElementById('db-table-select').value;
  const thead = document.getElementById('db-records-thead');
  const tbody = document.getElementById('db-records-tbody');

  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px;">Inspecting table records...</td></tr>';

  try {
    const data = await AdminAPI.getDbRecords(table, page);
    thead.innerHTML = '<tr>' + data.columns.map(c => `<th>${c.column_name}</th>`).join('') + '</tr>';

    if (data.records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${data.columns.length}" style="text-align:center; padding:20px; color:var(--text-muted);">No records in ${table}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.records.map(r => `
      <tr>
        ${data.columns.map(c => {
          let val = r[c.column_name];
          if (typeof val === 'object') val = JSON.stringify(val);
          return `<td style="font-family:var(--font-mono); font-size:12px; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(String(val ?? 'NULL'))}</td>`;
        }).join('')}
      </tr>
    `).join('');

    document.getElementById('db-pagination-info').textContent = `Page ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} records)`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="color:var(--danger-red); padding:20px;">Inspection error: ${err.message}</td></tr>`;
  }
}

function exportCurrentTableJSON() {
  const table = document.getElementById('db-table-select').value;
  window.open(`/api/admin/database/export?table=${table}`, '_blank');
}

// -------------------------------------------------------------
// 7. SYSTEM MONITORING VIEW
// -------------------------------------------------------------
async function loadSystemHealth() {
  try {
    const health = await AdminAPI.getSystemHealth();

    document.getElementById('sys-node-ver').textContent = health.application.nodeVersion;
    document.getElementById('sys-proc-mem').textContent = `${health.application.processMemoryMb} MB`;
    document.getElementById('sys-cpu-model').textContent = `${health.server.cpuCores} Cores · ${health.server.cpuModel}`;
    document.getElementById('sys-ram-usage').textContent = `${health.server.usedMemoryGb} GB / ${health.server.totalMemoryGb} GB (${health.server.memoryUsagePercent}%)`;
    document.getElementById('sys-db-latency').textContent = `${health.database.latencyMs} ms`;
    document.getElementById('sys-db-size').textContent = health.database.databaseSize;
  } catch (err) {
    console.error('System health error:', err);
  }
}

// -------------------------------------------------------------
// 8. AUDIT LOGS VIEW
// -------------------------------------------------------------
async function loadAuditLogsTable(page = 1) {
  const tbody = document.getElementById('audit-table-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">Loading audit events...</td></tr>';

  try {
    const { logs, pagination } = await AdminAPI.getAuditLogs({ page, limit: 30 });
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">No audit logs recorded</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-family:var(--font-mono); font-size:12px;">${new Date(l.created_at).toLocaleString()}</td>
        <td style="font-weight:600;">${escapeHtml(l.admin_email)}</td>
        <td><span class="badge badge-sand">${l.action}</span></td>
        <td>${l.entity_type} · <span style="font-family:var(--font-mono); font-size:11px;">${l.entity_id || '—'}</span></td>
        <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-dim);">${l.ip_address}</td>
        <td><span class="badge ${l.status === 'success' ? 'badge-sage' : 'badge-danger'}">${l.status}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger-red); padding:20px;">Error: ${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// 9. GLOBAL SEARCH & NOTIFICATIONS
// -------------------------------------------------------------
async function handleGlobalSearch(term) {
  const resultsBox = document.getElementById('admin-search-results');
  if (!term || term.length < 2) {
    resultsBox.style.display = 'none';
    return;
  }

  try {
    const { results } = await AdminAPI.globalSearch(term);
    const hasAny = results.users.length > 0 || results.numbers.length > 0 || results.rentals.length > 0;

    if (!hasAny) {
      resultsBox.innerHTML = '<div style="padding:14px; font-size:13px; color:var(--text-muted);">No matching results found</div>';
      resultsBox.style.display = 'block';
      return;
    }

    resultsBox.innerHTML = `
      ${results.users.length > 0 ? `
        <div style="padding:8px 12px; font-size:11px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">Users</div>
        ${results.users.map(u => `
          <div style="padding:8px 14px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border-warm);" onclick="switchAdminTab('users'); openUserProfileModal('${u.id}'); document.getElementById('admin-search-results').style.display='none';">
            <strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.email)}) · <span class="badge badge-sand">${u.role}</span>
          </div>
        `).join('')}
      ` : ''}

      ${results.numbers.length > 0 ? `
        <div style="padding:8px 12px; font-size:11px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">Fleet Numbers</div>
        ${results.numbers.map(n => `
          <div style="padding:8px 14px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border-warm);" onclick="switchAdminTab('numbers'); document.getElementById('admin-search-results').style.display='none';">
            <span style="font-family:var(--font-mono); font-weight:700;">${n.e164_format}</span> (${n.country_code}) · <span class="badge badge-sage">${n.status}</span>
          </div>
        `).join('')}
      ` : ''}
    `;
    resultsBox.style.display = 'block';
  } catch (err) {
    console.error('Search error:', err);
  }
}

async function loadNotificationsBadge() {
  try {
    const { notifications } = await AdminAPI.getNotifications();
    const unread = notifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('admin-notif-badge');
    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'inline-block' : 'none';
    }
  } catch {}
}

// -------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------
function closeAdminModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function showAdminToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--surface-card);
    border: 1px solid var(--primary-terracotta);
    color: var(--text-ink);
    padding: 14px 22px;
    border-radius: var(--radius-base);
    box-shadow: var(--shadow-lg);
    z-index: 9999;
    font-size: 14px;
    font-weight: 500;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('admin-login-email').value;
  const password = document.getElementById('admin-login-password').value;
  const twoFactorCode = document.getElementById('admin-login-2fa').value;
  const btn = document.getElementById('btn-admin-login');

  btn.disabled = true;
  btn.textContent = 'Authenticating Super Admin...';

  try {
    const res = await AdminAPI.login(email, password, twoFactorCode);
    if (res.requires2FA) {
      document.getElementById('admin-2fa-field').style.display = 'block';
      alert('Two-factor authentication code required. (Enter 123456 for demo)');
      return;
    }
    activeAdmin = res.user;
    showAdminApp();
  } catch (err) {
    alert('Super Admin Login Failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In to Super Admin Console';
  }
}
