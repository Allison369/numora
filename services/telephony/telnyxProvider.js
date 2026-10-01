const TelephonyProviderInterface = require('./providerInterface');

class TelnyxProvider extends TelephonyProviderInterface {
  constructor(apiKey, connectionId) {
    super();
    this.name = 'telnyx';
    this.apiKey = apiKey;
    this.connectionId = connectionId;
    this.baseUrl = 'https://api.telnyx.com/v2';
  }

  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  /**
   * Test live connection to Telnyx API
   */
  async testConnection() {
    if (!this.apiKey) {
      return { success: false, error: 'Telnyx API Key is not configured' };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/balance`, {
        headers: this.getHeaders()
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          statusCode: res.status,
          error: `Telnyx API returned ${res.status}: ${errorText}`,
          latencyMs
        };
      }

      const data = await res.json();
      const balance = data.data?.balance || '0.00';
      const currency = data.data?.currency || 'USD';

      return {
        success: true,
        carrier: 'Telnyx Telecom Network',
        balance: parseFloat(balance),
        currency: currency,
        latencyMs: latencyMs,
        message: 'Successfully connected to Telnyx global telephony network!'
      };
    } catch (err) {
      return {
        success: false,
        error: `Network error connecting to Telnyx: ${err.message}`,
        latencyMs: Date.now() - start
      };
    }
  }

  async searchAvailableNumbers(countryCode = 'US', filter = {}) {
    if (!this.apiKey) {
      throw new Error('Telnyx API Key missing');
    }

    let url = `${this.baseUrl}/available_phone_numbers?filter[country_code]=${countryCode.toUpperCase()}&page[size]=10`;
    if (filter.areaCode) url += `&filter[national_destination_code]=${filter.areaCode}`;

    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telnyx Search Error: ${err}`);
    }

    const data = await res.json();
    const numbers = data.data || [];

    return numbers.map(num => ({
      phoneNumber: num.phone_number,
      friendlyName: num.phone_number,
      countryCode: countryCode.toUpperCase(),
      numberType: filter.type || 'local',
      capabilities: {
        sms: num.features?.sms === true,
        voice: num.features?.voice === true,
        mms: num.features?.mms === true
      },
      monthlyCost: parseFloat(num.cost_information?.monthly_fee || '1.00'),
      retailMonthlyPrice: 4.99,
      retailWeeklyPrice: 1.99
    }));
  }

  async purchaseNumber(phoneNumber, webhookUrl) {
    const url = `${this.baseUrl}/number_orders`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        phone_numbers: [{ phone_number: phoneNumber }],
        connection_id: this.connectionId || undefined
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telnyx Order Error: ${err}`);
    }

    const data = await res.json();
    const order = data.data;

    return {
      providerSid: order.id,
      phoneNumber: phoneNumber,
      status: order.status,
      webhookUrl: webhookUrl
    };
  }

  async releaseNumber(providerSid) {
    if (!providerSid) return false;
    const url = `${this.baseUrl}/phone_numbers/${providerSid}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return res.ok;
  }

  parseInboundWebhook(req) {
    const data = req.body?.data?.payload || req.body || {};
    return {
      from: data.from?.phone_number || data.from,
      to: data.to?.[0]?.phone_number || data.to,
      body: data.text || data.body,
      messageId: data.id || data.message_id,
      raw: req.body
    };
  }

  verifyWebhook(req) {
    return true;
  }
}

module.exports = TelnyxProvider;
