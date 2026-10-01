/**
 * TeleRent Frontend API Client
 */
const API = {
  getToken() {
    return localStorage.getItem('telerent_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('telerent_token', token);
    } else {
      localStorage.removeItem('telerent_token');
    }
  },

  getUser() {
    const raw = localStorage.getItem('telerent_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('telerent_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('telerent_user');
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(`/api${endpoint}`, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          // Redirect to login if on authenticated page
          if (window.location.pathname.includes('app.html')) {
            this.setToken(null);
            this.setUser(null);
            window.location.href = '/#login';
          }
        }
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth
  async login(email, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    this.setToken(res.token);
    this.setUser(res.user);
    return res;
  },

  async register(name, email, password, companyName) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: { name, email, password, companyName }
    });
    this.setToken(res.token);
    this.setUser(res.user);
    return res;
  },

  async getMe() {
    const res = await this.request('/auth/me');
    this.setUser(res.user);
    return res.user;
  },

  logout() {
    this.setToken(null);
    this.setUser(null);
    window.location.href = '/';
  },

  // Numbers & Countries
  async getCountries() {
    return this.request('/numbers/countries');
  },

  async getAvailableNumbers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/numbers/available?${query}`);
  },

  // Rentals
  async rentNumber(phoneNumberId, plan = 'monthly', autoRenew = true, webhookUrl = null) {
    return this.request('/rentals', {
      method: 'POST',
      body: { phoneNumberId, plan, autoRenew, webhookUrl }
    });
  },

  async getRentals(status = 'all') {
    return this.request(`/rentals?status=${status}`);
  },

  async cancelRental(rentalId) {
    return this.request(`/rentals/${rentalId}/cancel`, {
      method: 'POST'
    });
  },

  async toggleAutoRenew(rentalId, autoRenew) {
    return this.request(`/rentals/${rentalId}/autorenew`, {
      method: 'PATCH',
      body: { autoRenew }
    });
  },

  async updateRentalWebhook(rentalId, webhookUrl) {
    return this.request(`/rentals/${rentalId}/webhook`, {
      method: 'PATCH',
      body: { webhookUrl }
    });
  },

  // Messages (SMS)
  async getMessages(rentalId = null) {
    const query = rentalId ? `?rentalId=${rentalId}` : '';
    return this.request(`/messages${query}`);
  },

  async markMessageRead(messageId) {
    return this.request(`/messages/${messageId}/read`, {
      method: 'PATCH'
    });
  },

  async markAllMessagesRead() {
    return this.request('/messages/mark-all-read', {
      method: 'PATCH'
    });
  },

  // Billing
  async getBalance() {
    return this.request('/billing/balance');
  },

  async getTransactions() {
    return this.request('/billing/transactions');
  },

  async deposit(amount, paymentMethod = 'card') {
    return this.request('/billing/deposit', {
      method: 'POST',
      body: { amount, paymentMethod }
    });
  },

  // Simulator
  async simulateSMS(toNumber, fromNumber, body) {
    return this.request('/simulator/send-sms', {
      method: 'POST',
      body: { toNumber, fromNumber, body }
    });
  }
};
