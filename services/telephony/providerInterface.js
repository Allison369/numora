/**
 * Telephony Provider Interface
 * Defines standard contract for all telephony providers (Twilio, Telnyx, Mock/Sandbox)
 */

class TelephonyProviderInterface {
  /**
   * Search for available phone numbers to purchase
   * @param {string} countryCode - ISO-2 country code (US, GB, CA, etc.)
   * @param {object} filter - { type: 'local'|'toll_free'|'mobile', areaCode: string, contains: string }
   * @returns {Promise<Array<{ phoneNumber: string, friendlyName: string, capabilities: object, monthlyCost: number }>>}
   */
  async searchAvailableNumbers(countryCode, filter) {
    throw new Error('searchAvailableNumbers() not implemented');
  }

  /**
   * Purchase a phone number and bind it to our platform's incoming SMS webhook
   * @param {string} phoneNumber - E.164 phone number
   * @param {string} webhookUrl - URL to receive inbound SMS callbacks
   * @returns {Promise<{ providerSid: string, phoneNumber: string, status: string }>}
   */
  async purchaseNumber(phoneNumber, webhookUrl) {
    throw new Error('purchaseNumber() not implemented');
  }

  /**
   * Release / cancel a rented number with the carrier
   * @param {string} providerSid - Provider resource ID
   * @param {string} phoneNumber - E.164 phone number
   * @returns {Promise<boolean>}
   */
  async releaseNumber(providerSid, phoneNumber) {
    throw new Error('releaseNumber() not implemented');
  }

  /**
   * Parse inbound webhook payload into a normalized object
   * @param {object} req - Express request
   * @returns {{ from: string, to: string, body: string, messageId: string, raw: object }}
   */
  parseInboundWebhook(req) {
    throw new Error('parseInboundWebhook() not implemented');
  }

  /**
   * Verify provider cryptographic signature
   * @param {object} req - Express request
   * @returns {boolean}
   */
  verifyWebhook(req) {
    return true;
  }
}

module.exports = TelephonyProviderInterface;
