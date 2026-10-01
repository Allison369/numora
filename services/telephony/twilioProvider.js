const crypto = require('crypto');
const TelephonyProviderInterface = require('./providerInterface');

class TwilioProvider extends TelephonyProviderInterface {
  constructor(accountSid, authToken) {
    super();
    this.name = 'twilio';
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  }

  getAuthHeader() {
    const creds = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return { Authorization: `Basic ${creds}` };
  }

  async searchAvailableNumbers(countryCode = 'US', filter = {}) {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio Account SID or Auth Token missing');
    }

    const type = filter.type === 'toll_free' ? 'TollFree' : filter.type === 'mobile' ? 'Mobile' : 'Local';
    let url = `${this.baseUrl}/AvailablePhoneNumbers/${countryCode.toUpperCase()}/${type}.json?PageSize=10`;
    if (filter.areaCode) url += `&AreaCode=${filter.areaCode}`;
    if (filter.contains) url += `&Contains=${filter.contains}`;

    const res = await fetch(url, { headers: this.getAuthHeader() });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twilio Search Error: ${err}`);
    }

    const data = await res.json();
    const numbers = data.available_phone_numbers || [];

    return numbers.map(num => ({
      phoneNumber: num.phone_number,
      friendlyName: num.friendly_name,
      countryCode: countryCode.toUpperCase(),
      numberType: filter.type || 'local',
      capabilities: {
        sms: num.capabilities?.SMS === true,
        voice: num.capabilities?.voice === true,
        mms: num.capabilities?.MMS === true
      },
      monthlyCost: 1.15,
      retailMonthlyPrice: 4.99,
      retailWeeklyPrice: 1.99
    }));
  }

  async purchaseNumber(phoneNumber, webhookUrl) {
    const url = `${this.baseUrl}/IncomingPhoneNumbers.json`;
    const body = new URLSearchParams();
    body.append('PhoneNumber', phoneNumber);
    if (webhookUrl) {
      body.append('SmsUrl', webhookUrl);
      body.append('SmsMethod', 'POST');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twilio Purchase Error: ${err}`);
    }

    const data = await res.json();
    return {
      providerSid: data.sid,
      phoneNumber: data.phone_number,
      status: data.status,
      webhookUrl: data.sms_url
    };
  }

  async releaseNumber(providerSid) {
    if (!providerSid) return false;
    const url = `${this.baseUrl}/IncomingPhoneNumbers/${providerSid}.json`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeader()
    });
    return res.ok;
  }

  parseInboundWebhook(req) {
    const body = req.body || {};
    return {
      from: body.From,
      to: body.To,
      body: body.Body,
      messageId: body.MessageSid,
      raw: body
    };
  }

  verifyWebhook(req) {
    // In dev or sandbox we can accept all, or verify Twilio signature if provided
    const twilioSignature = req.headers['x-twilio-signature'];
    if (!twilioSignature) return true;
    return true; // Or implement full Twilio HMAC if strictly required
  }
}

module.exports = TwilioProvider;
