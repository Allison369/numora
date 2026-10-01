const TelephonyProviderInterface = require('./providerInterface');
const { v4: uuidv4 } = require('uuid');

class MockProvider extends TelephonyProviderInterface {
  constructor() {
    super();
    this.name = 'sandbox';
  }

  async searchAvailableNumbers(countryCode = 'US', filter = {}) {
    const areaCodes = {
      US: ['415', '212', '312', '786', '512', '206', '650'],
      CA: ['647', '514', '403', '604'],
      GB: ['7911', '7400', '207'],
      AU: ['491', '412', '420'],
      DE: ['151', '170', '171'],
      FR: ['612', '644', '699']
    };

    const list = areaCodes[countryCode.toUpperCase()] || ['555'];
    const results = [];

    for (let i = 0; i < 6; i++) {
      const code = filter.areaCode || list[i % list.length];
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      let e164 = '';
      let friendly = '';

      if (countryCode === 'US' || countryCode === 'CA') {
        e164 = `+1${code}555${randomSuffix}`;
        friendly = `(${code}) 555-${randomSuffix}`;
      } else if (countryCode === 'GB') {
        e164 = `+44${code}${randomSuffix}12`;
        friendly = `+44 ${code} ${randomSuffix}`;
      } else if (countryCode === 'AU') {
        e164 = `+61${code}${randomSuffix}8`;
        friendly = `+61 ${code} ${randomSuffix}`;
      } else {
        e164 = `+${countryCode === 'DE' ? '49' : '33'}${code}${randomSuffix}34`;
        friendly = `+${countryCode === 'DE' ? '49' : '33'} ${code} ${randomSuffix}`;
      }

      results.push({
        phoneNumber: e164,
        friendlyName: friendly,
        countryCode: countryCode.toUpperCase(),
        numberType: filter.type || 'local',
        capabilities: {
          sms: true,
          voice: true,
          mms: countryCode === 'US' || countryCode === 'CA'
        },
        monthlyCost: 1.15,
        retailMonthlyPrice: 4.99,
        retailWeeklyPrice: 1.99
      });
    }

    return results;
  }

  async purchaseNumber(phoneNumber, webhookUrl) {
    console.log(`[MockProvider] Provisioning ${phoneNumber} with webhook ${webhookUrl}`);
    return {
      providerSid: `mock_pn_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      phoneNumber: phoneNumber,
      status: 'active',
      webhookUrl: webhookUrl
    };
  }

  async releaseNumber(providerSid, phoneNumber) {
    console.log(`[MockProvider] Released ${phoneNumber} (SID: ${providerSid}) back to carrier`);
    return true;
  }

  parseInboundWebhook(req) {
    // Normalizes webhook payload from body or query
    const body = req.body || {};
    return {
      from: body.From || body.from || '+15550001111',
      to: body.To || body.to || '',
      body: body.Body || body.body || body.text || '',
      messageId: body.MessageSid || body.message_id || `msg_${Date.now()}`,
      raw: body
    };
  }

  verifyWebhook(req) {
    return true;
  }
}

module.exports = MockProvider;
