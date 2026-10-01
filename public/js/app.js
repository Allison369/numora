/**
 * TeleRent Main Application Controller
 */

let currentUser = null;
let currentTab = 'numbers';
let selectedNumberForRent = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth
  const token = API.getToken();
  if (!token) {
    window.location.href = '/#login';
    return;
  }

  try {
    currentUser = await API.getMe();
    updateUserUI();
    initApp();
  } catch (err) {
    console.error('Auth verification failed:', err);
    API.logout();
  }
});

function updateUserUI() {
  document.getElementById('user-name-display').textContent = currentUser.name;
  document.getElementById('user-email-display').textContent = currentUser.email;
  document.getElementById('topbar-balance').textContent = `$${currentUser.balance.toFixed(2)}`;
}

function initApp() {
  // Setup SSE
  realtime.connect();

  realtime.on('new_sms', (data) => {
    showToast(`📩 New SMS on ${data.phoneNumber}: "${data.message.body.slice(0, 40)}..."`);
    // If in inbox, reload or prepend
    if (currentTab === 'inbox') {
      loadInbox();
    }
    // Update unread count badge
    updateInboxBadge();
  });

  realtime.on('rental_renewed', (data) => {
    showToast(`🔄 Auto-renewed rental for ${data.phoneNumber}`);
    refreshBalance();
    if (currentTab === 'rentals') loadRentals();
  });

  realtime.on('rental_expired', (data) => {
    showToast(`⚠️ Rental expired for ${data.phoneNumber}: ${data.reason}`, 'warning');
    if (currentTab === 'rentals') loadRentals();
  });

  // Setup Navigation
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.getAttribute('data-tab'));
    });
  });

  // Load default tab
  switchTab('numbers');
  updateInboxBadge();
}

function switchTab(tabName) {
  currentTab = tabName;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.tab-view').forEach(view => {
    view.style.display = view.id === `tab-${tabName}` ? 'block' : 'none';
  });

  if (tabName === 'numbers') {
    loadCountriesAndNumbers();
  } else if (tabName === 'rentals') {
    loadRentals();
  } else if (tabName === 'inbox') {
    loadInbox();
  } else if (tabName === 'billing') {
    loadBilling();
  } else if (tabName === 'simulator') {
    loadSimulator();
  }
}

async function refreshBalance() {
  try {
    const res = await API.getBalance();
    currentUser.balance = res.balance;
    API.setUser(currentUser);
    updateUserUI();
  } catch (err) {
    console.error('Failed refreshing balance:', err);
  }
}

// -------------------------------------------------------------
// BROWSE NUMBERS VIEW
// -------------------------------------------------------------
async function loadCountriesAndNumbers() {
  const countrySelect = document.getElementById('filter-country');
  try {
    if (countrySelect.options.length <= 1) {
      const { countries } = await API.getCountries();
      countrySelect.innerHTML = countries.map(c => 
        `<option value="${c.code}">${c.flag} ${c.name} (${c.available} available)</option>`
      ).join('');
    }
    filterNumbers();
  } catch (err) {
    console.error('Failed loading countries:', err);
  }
}

async function filterNumbers() {
  const country = document.getElementById('filter-country').value;
  const type = document.getElementById('filter-type').value;
  const areaCode = document.getElementById('filter-areacode').value;

  const container = document.getElementById('numbers-list-container');
  container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Searching available telecom inventory...</div>';

  try {
    const res = await API.getAvailableNumbers({ country, type, areaCode });
    if (!res.numbers || res.numbers.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No numbers matching criteria found. Try another country or area code.</div>';
      return;
    }

    const countryFlags = { US: '🇺🇸', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷' };

    container.innerHTML = res.numbers.map(num => `
      <div class="number-card">
        <div class="number-header">
          <div>
            <div class="phone-digits">${num.phoneNumber}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${num.friendlyName}</div>
          </div>
          <span class="country-flag" title="${num.countryCode}">${countryFlags[num.countryCode] || '🌐'}</span>
        </div>

        <div class="caps-list">
          <span class="badge ${num.capabilities.sms ? 'badge-success' : 'badge-warning'}">SMS ${num.capabilities.sms ? '✓' : '✗'}</span>
          <span class="badge ${num.capabilities.voice ? 'badge-primary' : 'badge-warning'}">Voice ${num.capabilities.voice ? '✓' : '✗'}</span>
          ${num.capabilities.mms ? '<span class="badge badge-purple">MMS ✓</span>' : ''}
          <span class="badge" style="background:#1e293b; color:#94a3b8;">${num.numberType}</span>
        </div>

        <div class="price-row">
          <div>
            <span class="price-tag">$${num.pricing.monthly.toFixed(2)}</span>
            <span class="price-sub">/ month</span>
            <div style="font-size:11px; color:#64748b;">or $${num.pricing.weekly.toFixed(2)} / week</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openRentModal('${encodeURIComponent(JSON.stringify(num))}')">
            Rent Number
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1/-1; color: #ef4444; padding: 20px;">Failed to load numbers: ${err.message}</div>`;
  }
}

function openRentModal(numJson) {
  selectedNumberForRent = JSON.parse(decodeURIComponent(numJson));
  
  document.getElementById('rent-modal-number').textContent = selectedNumberForRent.phoneNumber;
  document.getElementById('rent-modal-country').textContent = `${selectedNumberForRent.countryCode} (${selectedNumberForRent.numberType})`;
  document.getElementById('rent-modal-monthly-price').textContent = `$${selectedNumberForRent.pricing.monthly.toFixed(2)}`;
  document.getElementById('rent-modal-weekly-price').textContent = `$${selectedNumberForRent.pricing.weekly.toFixed(2)}`;
  
  updateRentPriceCalc();
  document.getElementById('rent-modal').classList.add('active');
}

function closeRentModal() {
  selectedNumberForRent = null;
  document.getElementById('rent-modal').classList.remove('active');
}

function updateRentPriceCalc() {
  if (!selectedNumberForRent) return;
  const plan = document.querySelector('input[name="rent-plan"]:checked').value;
  const cost = plan === 'weekly' ? selectedNumberForRent.pricing.weekly : selectedNumberForRent.pricing.monthly;
  
  document.getElementById('rent-summary-price').textContent = `$${cost.toFixed(2)}`;
  
  const balanceNotice = document.getElementById('rent-balance-notice');
  if (currentUser.balance < cost) {
    balanceNotice.innerHTML = `<span style="color:#ef4444;">⚠️ Insufficient balance ($${currentUser.balance.toFixed(2)}). <a href="javascript:void(0)" onclick="closeRentModal(); switchTab('billing');">Top up here</a></span>`;
    document.getElementById('btn-confirm-rent').disabled = true;
  } else {
    balanceNotice.innerHTML = `<span style="color:#10b981;">✓ Balance remaining after rental: $${(currentUser.balance - cost).toFixed(2)}</span>`;
    document.getElementById('btn-confirm-rent').disabled = false;
  }
}

async function confirmRental() {
  if (!selectedNumberForRent) return;

  const plan = document.querySelector('input[name="rent-plan"]:checked').value;
  const autoRenew = document.getElementById('rent-autorenew').checked;
  const webhookUrl = document.getElementById('rent-webhook-url').value.trim() || null;

  const btn = document.getElementById('btn-confirm-rent');
  btn.disabled = true;
  btn.textContent = 'Provisioning...';

  try {
    const res = await API.rentNumber(selectedNumberForRent.id, plan, autoRenew, webhookUrl);
    showToast(`🎉 Number ${res.rental.phone_number} successfully rented!`);
    refreshBalance();
    closeRentModal();
    switchTab('rentals');
  } catch (err) {
    alert(`Rental Failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm & Rent Number';
  }
}

// -------------------------------------------------------------
// MY RENTALS VIEW
// -------------------------------------------------------------
async function loadRentals() {
  const container = document.getElementById('rentals-list-container');
  container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Loading active rentals...</div>';

  try {
    const { rentals } = await API.getRentals();
    if (!rentals || rentals.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <div style="font-size: 36px; margin-bottom: 12px;">📱</div>
          <h3 style="margin-bottom: 6px;">No Active Number Rentals</h3>
          <p style="color: var(--text-muted); margin-bottom: 20px;">You haven't rented any phone numbers yet. Browse our inventory to rent your first number!</p>
          <button class="btn btn-primary" onclick="switchTab('numbers')">Browse Available Numbers</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap: 16px;">
        ${rentals.map(r => {
          const daysLeft = Math.max(0, Math.ceil((new Date(r.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)));
          const isCancelled = r.status === 'cancelled';
          const isExpired = r.status === 'expired';

          return `
            <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
              <div>
                <div style="display:flex; align-items:center; gap: 12px;">
                  <span style="font-family:monospace; font-size: 20px; font-weight: 700;">${r.phoneNumber}</span>
                  <span class="badge ${r.status === 'active' ? 'badge-success' : 'badge-warning'}">${r.status.toUpperCase()}</span>
                  <span class="badge badge-purple">${r.rentalPlan}</span>
                </div>
                <div style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">
                  Expires: <strong>${new Date(r.expiresAt).toLocaleDateString()}</strong> (${daysLeft} days remaining)
                  • Received SMS: <strong>${r.messageCount}</strong>
                </div>
              </div>

              <div style="display:flex; align-items: center; gap: 12px;">
                <button class="btn btn-secondary btn-sm" onclick="triggerSimulatorForNumber('${r.phoneNumber}')">
                  ⚡ Simulate SMS
                </button>
                <button class="btn btn-secondary btn-sm" onclick="viewInboxForNumber('${r.id}')">
                  💬 View Inbox (${r.unreadCount} new)
                </button>
                ${r.status === 'active' ? `
                  <label style="display:flex; align-items:center; gap: 6px; font-size: 13px; color: var(--text-muted); cursor:pointer;">
                    <input type="checkbox" ${r.autoRenew ? 'checked' : ''} onchange="toggleAutoRenew('${r.id}', this.checked)">
                    Auto-renew
                  </label>
                  <button class="btn btn-outline-danger btn-sm" onclick="cancelRental('${r.id}', '${r.phoneNumber}')">
                    Cancel
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Failed to load rentals: ${err.message}</div>`;
  }
}

async function toggleAutoRenew(rentalId, autoRenew) {
  try {
    await API.toggleAutoRenew(rentalId, autoRenew);
    showToast(`Auto-renew ${autoRenew ? 'enabled' : 'disabled'}`);
  } catch (err) {
    alert(`Failed: ${err.message}`);
    loadRentals();
  }
}

async function cancelRental(rentalId, phoneNumber) {
  if (!confirm(`Are you sure you want to cancel rental for ${phoneNumber}? The number will be released.`)) {
    return;
  }

  try {
    await API.cancelRental(rentalId);
    showToast(`Rental for ${phoneNumber} cancelled.`);
    loadRentals();
  } catch (err) {
    alert(`Failed to cancel: ${err.message}`);
  }
}

// -------------------------------------------------------------
// LIVE SMS INBOX VIEW
// -------------------------------------------------------------
async function loadInbox(rentalId = null) {
  const container = document.getElementById('inbox-list-container');
  container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Loading messages...</div>';

  try {
    const { messages } = await API.getMessages(rentalId);

    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <div style="font-size: 36px; margin-bottom: 12px;">📭</div>
          <h3 style="margin-bottom: 6px;">Inbox is Empty</h3>
          <p style="color: var(--text-muted); margin-bottom: 20px;">No incoming messages received yet. Send a test SMS to any rented number to watch it appear here instantly!</p>
          <button class="btn btn-primary" onclick="switchTab('simulator')">Open SMS Simulator</button>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => `
      <div class="message-card ${!m.isRead ? 'unread' : ''}" id="msg-${m.id}">
        <div class="message-meta">
          <div>
            <span class="message-from">${m.from}</span>
            <span style="margin: 0 6px;">→</span>
            <span style="font-family:monospace; color:#60a5fa;">${m.to}</span>
          </div>
          <div>
            <span>${new Date(m.receivedAt).toLocaleTimeString()} · ${new Date(m.receivedAt).toLocaleDateString()}</span>
            ${!m.isRead ? `<button class="btn btn-secondary btn-sm" style="margin-left:10px; padding: 2px 8px; font-size:11px;" onclick="markRead('${m.id}')">Mark Read</button>` : ''}
          </div>
        </div>

        <div class="message-body">${escapeHtml(m.body)}</div>

        ${m.code ? `
          <div class="otp-box">
            <span style="font-size:12px; color:#10b981; font-weight:600;">VERIFICATION CODE:</span>
            <span class="otp-code">${m.code}</span>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size:11px;" onclick="copyToClipboard('${m.code}')">Copy Code</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Failed to load messages: ${err.message}</div>`;
  }
}

async function markRead(messageId) {
  try {
    await API.markMessageRead(messageId);
    const card = document.getElementById(`msg-${messageId}`);
    if (card) card.classList.remove('unread');
    updateInboxBadge();
  } catch (err) {
    console.error('Failed to mark read:', err);
  }
}

async function markAllRead() {
  try {
    await API.markAllMessagesRead();
    loadInbox();
    updateInboxBadge();
  } catch (err) {
    console.error('Failed to mark all read:', err);
  }
}

async function updateInboxBadge() {
  try {
    const { messages } = await API.getMessages();
    const unread = messages.filter(m => !m.isRead).length;
    const badge = document.getElementById('inbox-unread-badge');
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch {
    // Ignore error
  }
}

// -------------------------------------------------------------
// BILLING & WALLET VIEW
// -------------------------------------------------------------
async function loadBilling() {
  try {
    await refreshBalance();
    document.getElementById('wallet-display-balance').textContent = `$${currentUser.balance.toFixed(2)}`;

    const { transactions } = await API.getTransactions();
    const tbody = document.getElementById('transactions-table-body');

    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No transactions recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = transactions.map(t => `
      <tr>
        <td>${new Date(t.createdAt).toLocaleString()}</td>
        <td><span class="badge ${t.type.includes('deposit') ? 'badge-success' : 'badge-primary'}">${t.type}</span></td>
        <td style="font-weight:700; color: ${t.amount > 0 ? '#10b981' : '#f87171'};">
          ${t.amount > 0 ? `+$${t.amount.toFixed(2)}` : `-$${Math.abs(t.amount).toFixed(2)}`}
        </td>
        <td>$${t.balanceAfter.toFixed(2)}</td>
        <td style="color:var(--text-muted);">${escapeHtml(t.description)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load billing:', err);
  }
}

function openDepositModal(presetAmount = null) {
  if (presetAmount) {
    document.getElementById('deposit-amount-input').value = presetAmount;
  }
  document.getElementById('deposit-modal').classList.add('active');
}

function closeDepositModal() {
  document.getElementById('deposit-modal').classList.remove('active');
}

async function submitDeposit() {
  const amount = parseFloat(document.getElementById('deposit-amount-input').value);
  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid deposit amount');
    return;
  }

  const btn = document.getElementById('btn-submit-deposit');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    const res = await API.deposit(amount);
    showToast(`💳 ${res.message}`);
    closeDepositModal();
    loadBilling();
  } catch (err) {
    alert(`Deposit failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Funds to Balance';
  }
}

// -------------------------------------------------------------
// SMS SIMULATOR VIEW
// -------------------------------------------------------------
async function loadSimulator() {
  const select = document.getElementById('sim-to-number');
  try {
    const { rentals } = await API.getRentals('active');
    if (!rentals || rentals.length === 0) {
      select.innerHTML = '<option value="">No active rented numbers available</option>';
      document.getElementById('btn-trigger-simulator').disabled = true;
      return;
    }

    document.getElementById('btn-trigger-simulator').disabled = false;
    select.innerHTML = rentals.map(r => `
      <option value="${r.phoneNumber}">${r.phoneNumber} (${r.countryCode} - ${r.rentalPlan})</option>
    `).join('');
  } catch (err) {
    console.error('Failed loading simulator numbers:', err);
  }
}

function triggerSimulatorForNumber(phoneNumber) {
  switchTab('simulator');
  setTimeout(() => {
    const select = document.getElementById('sim-to-number');
    if (select) select.value = phoneNumber;
  }, 100);
}

function viewInboxForNumber(rentalId) {
  switchTab('inbox');
  loadInbox(rentalId);
}

function applyTemplate(type) {
  const code = Math.floor(100000 + Math.random() * 900000);
  const senderInput = document.getElementById('sim-from-number');
  const bodyInput = document.getElementById('sim-body');

  if (type === 'google') {
    senderInput.value = 'Google';
    bodyInput.value = `G-${code} is your Google verification code.`;
  } else if (type === 'whatsapp') {
    senderInput.value = 'WhatsApp';
    bodyInput.value = `Your WhatsApp code is ${code}. Do not share this code with anyone.`;
  } else if (type === 'telegram') {
    senderInput.value = 'Telegram';
    bodyInput.value = `Telegram code: ${code}. You can also tap on this link to log in.`;
  } else if (type === 'bank') {
    senderInput.value = '+18005550199';
    bodyInput.value = `Alert: Secure login detected. One-Time Passcode (OTP) is ${code}. Expires in 10 mins.`;
  }
}

async function triggerSimulator() {
  const toNumber = document.getElementById('sim-to-number').value;
  const fromNumber = document.getElementById('sim-from-number').value.trim();
  const body = document.getElementById('sim-body').value.trim();

  if (!toNumber) {
    alert('Please select a destination phone number');
    return;
  }
  if (!body) {
    alert('Please enter message body');
    return;
  }

  const btn = document.getElementById('btn-trigger-simulator');
  btn.disabled = true;
  btn.textContent = 'Injecting Webhook...';

  try {
    const res = await API.simulateSMS(toNumber, fromNumber, body);
    showToast('🚀 Simulated SMS delivered via Webhook!');
    // Switch to inbox after 1 second
    setTimeout(() => {
      switchTab('inbox');
    }, 800);
  } catch (err) {
    alert(`Simulation failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simulate Incoming SMS';
  }
}

// -------------------------------------------------------------
// UTILITIES & NOTIFICATIONS
// -------------------------------------------------------------
function showToast(text, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #1e293b;
    border: 1px solid ${type === 'warning' ? '#f59e0b' : '#3b82f6'};
    color: #ffffff;
    padding: 14px 20px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    z-index: 9999;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: fadeIn 0.3s ease;
  `;
  toast.textContent = text;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${text} to clipboard!`);
  });
}

function escapeHtml(string) {
  const pre = document.createElement('pre');
  const text = document.createTextNode(string);
  pre.appendChild(text);
  return pre.innerHTML;
}
