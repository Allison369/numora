const TelephonyProviderInterface = require('./providerInterface');

/**
 * Plivo Telephony Provider Implementation
 * Supports Plivo v1 REST API for searching numbers, purchasing, releasing, and inbound SMS webhook handling
 */
class PlivoProvider extends TelephonyProviderInterface {
  constructor(authId, authToken) {
    super();
    this.name = 'plivo';
    this.authId = authId;
    this.authToken = authToken;
    this.baseUrl = `https://api.plivo.com/v1/Account/${authId}`;
  }

  getAuthHeader() {
    const creds = Buffer.from(`${this.authId}:${this.authToken}`).toString('base64');
    return {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Test live connection to Plivo API and check account balance
   */
  async testConnection() {
    if (!this.authId || !this.authToken) {
      return { success: false, error: 'Plivo Auth ID or Auth Token is missing' };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/`, {
        headers: this.getAuthHeader()
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          statusCode: res.status,
          error: `Plivo API returned ${res.status}: ${errorText}`,
          latencyMs
        };
      }

      const data = await res.json();
      const cashCredits = data.cash_credits || '0.00';

      return {
        success: true,
        carrier: 'Plivo Telecom Network',
        balance: parseFloat(cashCredits),
        currency: 'USD',
        latencyMs: latencyMs,
        message: 'Successfully connected to Plivo global carrier API!'
      };
    } catch (err) {
      return {
        success: false,
        error: `Network error connecting to Plivo: ${err.message}`,
        latencyMs: Date.now() - start
      };
    }
  }

  /**
   * Search available phone numbers on Plivo
   */
  async searchAvailableNumbers(countryCode = 'US', filter = {}) {
    if (!this.authId || !this.authToken) {
      throw new Error('Plivo credentials not configured');
    }

    const type = filter.type === 'toll_free' ? 'tollfree' : filter.type === 'mobile' ? 'mobile' : 'local';
    let url = `${this.baseUrl}/PhoneNumber/?country_iso=${countryCode.toUpperCase()}&type=${type}&limit=10`;
    if (filter.areaCode) url += `&pattern=${filter.areaCode}`;

    const res = await fetch(url, { headers: this.getAuthHeader() });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Plivo Search Error: ${err}`);
    }

    const data = await res.json();
    const numbers = data.objects || [];

    return numbers.map(num => ({
      phoneNumber: num.number.startsWith('+') ? num.number : `+${num.number}`,
      friendlyName: num.number,
      countryCode: countryCode.toUpperCase(),
      numberType: filter.type || 'local',
      capabilities: {
        sms: num.sms_enabled === true,
        voice: num.voice_enabled === true,
        mms: num.mms_enabled === true
      },
      monthlyCost: parseFloat(num.rental_rate || '0.50'),
      retailMonthlyPrice: 2.99, // Highly competitive retail price on Plivo's $0.50 base
      retailWeeklyPrice: 1.49
    }));
  }

  /**
   * Purchase number on Plivo and assign webhook URL
   */
  async purchaseNumber(phoneNumber, webhookUrl) {
    const cleanNumber = phoneNumber.replace(/^\+/, '');
    const url = `${this.baseUrl}/PhoneNumber/${cleanNumber}/`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeader(),
      body: JSON.stringify({
        app_url: webhookUrl
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Plivo Purchase Error: ${err}`);
    }

    const data = await res.json();
    return {
      providerSid: data.api_id || cleanNumber,
      phoneNumber: phoneNumber,
      status: 'active',
      webhookUrl: webhookUrl
    };
  }

  /**
   * Release / Delete number on Plivo
   */
  async releaseNumber(providerSid, phoneNumber) {
    const cleanNumber = (phoneNumber || '').replace(/^\+/, '');
    if (!cleanNumber) return false;

    const url = `${this.baseUrl}/Number/${cleanNumber}/`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeader()
    });
    return res.ok;
  }

  /**
   * Parse inbound SMS webhook from Plivo
   */
  parseInboundWebhook(req) {
    const body = req.body || {};
    const toNum = body.To || body.to || '';
    const fromNum = body.From || body.from || '';

    return {
      from: fromNum.startsWith('+') ? fromNum : `+${fromNum}`,
      to: toNum.startsWith('+') ? toNum : `+${toNum}`,
      body: body.Text || body.text || body.Body || '',
      messageId: body.MessageUUID || body.message_uuid || `plivo_${Date.now()}`,
      raw: body
    };
  }

  verifyWebhook(req) {
    return true;
  }
}

module.exports = PlivoProvider;
