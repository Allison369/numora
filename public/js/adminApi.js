/**
 * Numora Super Admin API Client
 */
const AdminAPI = {
  getToken() {
    return localStorage.getItem('numora_admin_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('numora_admin_token', token);
    } else {
      localStorage.removeItem('numora_admin_token');
    }
  },

  getAdmin() {
    const raw = localStorage.getItem('numora_admin_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setAdmin(admin) {
    if (admin) {
      localStorage.setItem('numora_admin_user', JSON.stringify(admin));
    } else {
      localStorage.removeItem('numora_admin_user');
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
      const res = await fetch(`/api/admin${endpoint}`, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (window.location.pathname.includes('admin')) {
            this.setToken(null);
            this.setAdmin(null);
            document.getElementById('admin-login-view')?.style.setProperty('display', 'flex');
            document.getElementById('admin-app-view')?.style.setProperty('display', 'none');
          }
        }
        throw new Error(data.error || `Admin API error ${res.status}`);
      }

      return data;
    } catch (err) {
      console.error(`[AdminAPI Error] ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth
  async login(email, password, twoFactorCode = null) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password, twoFactorCode }
    });
    if (res.token) {
      this.setToken(res.token);
      this.setAdmin(res.user);
    }
    return res;
  },

  async getMe() {
    const res = await this.request('/auth/me');
    this.setAdmin(res.admin);
    return res.admin;
  },

  logout() {
    this.setToken(null);
    this.setAdmin(null);
    window.location.reload();
  },

  // Dashboard Stats
  async getDashboardStats() {
    return this.request('/dashboard/stats');
  },

  // Users
  async getUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/users?${query}`);
  },

  async getUser(id) {
    return this.request(`/users/${id}`);
  },

  async createUser(userData) {
    return this.request('/users', { method: 'POST', body: userData });
  },

  async updateUser(id, updates) {
    return this.request(`/users/${id}`, { method: 'PUT', body: updates });
  },

  async adjustUserBalance(id, amount, type, reason) {
    return this.request(`/users/${id}/balance`, { method: 'POST', body: { amount, type, reason } });
  },

  async resetUserPassword(id, newPassword) {
    return this.request(`/users/${id}/reset-password`, { method: 'POST', body: { newPassword } });
  },

  async deleteUser(id) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  },

  async bulkUsersAction(userIds, action) {
    return this.request('/users/bulk-action', { method: 'POST', body: { userIds, action } });
  },

  // Roles & Permissions
  async getRoles() {
    return this.request('/roles');
  },

  async getPermissions() {
    return this.request('/roles/permissions');
  },

  async createRole(roleData) {
    return this.request('/roles', { method: 'POST', body: roleData });
  },

  async updateRole(id, roleData) {
    return this.request(`/roles/${id}`, { method: 'PUT', body: roleData });
  },

  async deleteRole(id) {
    return this.request(`/roles/${id}`, { method: 'DELETE' });
  },

  // Telephony Fleet
  async getNumbers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/telephony/numbers?${query}`);
  },

  async addNumber(numData) {
    return this.request('/telephony/numbers', { method: 'POST', body: numData });
  },

  async updateNumber(id, updates) {
    return this.request(`/telephony/numbers/${id}`, { method: 'PUT', body: updates });
  },

  async deleteNumber(id) {
    return this.request(`/telephony/numbers/${id}`, { method: 'DELETE' });
  },

  // Rentals & Messages
  async getRentals(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/rentals?${query}`);
  },

  async extendRental(id, days) {
    return this.request(`/rentals/${id}/extend`, { method: 'POST', body: { days } });
  },

  async cancelRental(id) {
    return this.request(`/rentals/${id}/cancel`, { method: 'POST' });
  },

  async getAllMessages(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/rentals/messages?${query}`);
  },

  // Billing
  async getTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/billing/transactions?${query}`);
  },

  // CMS
  async getCMSContent(type = '') {
    const query = type ? `?type=${type}` : '';
    return this.request(`/cms${query}`);
  },

  async createCMSContent(data) {
    return this.request('/cms', { method: 'POST', body: data });
  },

  async updateCMSContent(id, data) {
    return this.request(`/cms/${id}`, { method: 'PUT', body: data });
  },

  async deleteCMSContent(id) {
    return this.request(`/cms/${id}`, { method: 'DELETE' });
  },

  // Database Inspector
  async getDbTables() {
    return this.request('/database/tables');
  },

  async getDbRecords(table, page = 1) {
    return this.request(`/database/records?table=${table}&page=${page}`);
  },

  // Settings & Emergency Controls
  async getSettings() {
    return this.request('/settings');
  },

  async saveSettings(settingsArray) {
    return this.request('/settings', { method: 'PUT', body: { settings: settingsArray } });
  },

  async setEmergencyLock(mode, enabled) {
    return this.request('/settings/emergency-lock', { method: 'POST', body: { mode, enabled } });
  },

  // System Health
  async getSystemHealth() {
    return this.request('/system/health');
  },

  // Audit Logs & Notifications
  async getAuditLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/audit/logs?${query}`);
  },

  async getNotifications() {
    return this.request('/audit/notifications');
  },

  async markNotificationRead(id) {
    return this.request(`/audit/notifications/${id}/read`, { method: 'PATCH' });
  },

  // Global Search
  async globalSearch(q) {
    return this.request(`/search?q=${encodeURIComponent(q)}`);
  }
};
