const config = require('../../config/config');
const MockProvider = require('./mockProvider');
const TwilioProvider = require('./twilioProvider');
const TelnyxProvider = require('./telnyxProvider');
const PlivoProvider = require('./plivoProvider');

let currentProvider = null;

function getTelephonyProvider(overrideConfig = null) {
  if (overrideConfig) {
    if (overrideConfig.provider === 'plivo' && overrideConfig.plivoAuthId && overrideConfig.plivoAuthToken) {
      currentProvider = new PlivoProvider(overrideConfig.plivoAuthId, overrideConfig.plivoAuthToken);
      return currentProvider;
    } else if (overrideConfig.provider === 'telnyx' && overrideConfig.telnyxApiKey) {
      currentProvider = new TelnyxProvider(overrideConfig.telnyxApiKey, overrideConfig.telnyxConnectionId);
      return currentProvider;
    } else if (overrideConfig.provider === 'twilio' && overrideConfig.twilioSid && overrideConfig.twilioToken) {
      currentProvider = new TwilioProvider(overrideConfig.twilioSid, overrideConfig.twilioToken);
      return currentProvider;
    } else {
      currentProvider = new MockProvider();
      return currentProvider;
    }
  }

  if (currentProvider) return currentProvider;

  const providerName = (config.telephony.provider || 'sandbox').toLowerCase();

  if (providerName === 'plivo' && config.telephony.plivo.authId && config.telephony.plivo.authToken) {
    console.log('[Telephony] Initializing live Plivo Telecom Provider');
    currentProvider = new PlivoProvider(config.telephony.plivo.authId, config.telephony.plivo.authToken);
  } else if (providerName === 'telnyx' && config.telephony.telnyx.apiKey) {
    console.log('[Telephony] Initializing live Telnyx Telecom Provider');
    currentProvider = new TelnyxProvider(config.telephony.telnyx.apiKey, config.telephony.telnyx.connectionId);
  } else if (providerName === 'twilio' && config.telephony.twilio.accountSid && config.telephony.twilio.authToken) {
    console.log('[Telephony] Initializing live Twilio Telecom Provider');
    currentProvider = new TwilioProvider(config.telephony.twilio.accountSid, config.telephony.twilio.authToken);
  } else {
    console.log('[Telephony] Initializing High-Fidelity Sandbox Provider');
    currentProvider = new MockProvider();
  }

  return currentProvider;
}

function setTelephonyProvider(providerInstance) {
  currentProvider = providerInstance;
}

module.exports = {
  getTelephonyProvider,
  setTelephonyProvider
};
