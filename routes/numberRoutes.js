const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getTelephonyProvider } = require('../services/telephony');

/**
 * GET /api/numbers/countries
 * Returns list of supported countries with active inventory counts
 */
router.get('/countries', async (req, res) => {
  try {
    const countsRes = await db.query(
      `SELECT country_code, COUNT(*) as count 
       FROM phone_numbers 
       WHERE status = 'available' 
       GROUP BY country_code`
    );

    const countsMap = {};
    countsRes.rows.forEach(r => { countsMap[r.country_code] = parseInt(r.count, 10); });

    const countries = [
      { code: 'US', name: 'United States', flag: '🇺🇸', callingCode: '+1', available: countsMap['US'] || 5, types: ['local', 'toll_free'] },
      { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', callingCode: '+44', available: countsMap['GB'] || 2, types: ['mobile', 'local'] },
      { code: 'CA', name: 'Canada', flag: '🇨🇦', callingCode: '+1', available: countsMap['CA'] || 2, types: ['local'] },
      { code: 'AU', name: 'Australia', flag: '🇦🇺', callingCode: '+61', available: countsMap['AU'] || 1, types: ['mobile'] },
      { code: 'DE', name: 'Germany', flag: '🇩🇪', callingCode: '+49', available: countsMap['DE'] || 1, types: ['mobile'] },
      { code: 'FR', name: 'France', flag: '🇫🇷', callingCode: '+33', available: countsMap['FR'] || 1, types: ['mobile'] },
    ];

    res.json({ countries });
  } catch (err) {
    console.error('[Numbers Countries Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/numbers/available
 * Search and browse available numbers
 */
router.get('/available', async (req, res) => {
  try {
    const { country = 'US', type, areaCode, sms, voice } = req.query;

    let queryText = `
      SELECT id, e164_format, friendly_name, country_code, number_type, 
             capabilities, retail_price_monthly, retail_price_weekly, status
      FROM phone_numbers
      WHERE status = 'available' AND country_code = $1
    `;
    const params = [country.toUpperCase()];

    if (type) {
      params.push(type);
      queryText += ` AND number_type = $${params.length}`;
    }

    if (areaCode) {
      params.push(`%${areaCode}%`);
      queryText += ` AND e164_format LIKE $${params.length}`;
    }

    queryText += ' ORDER BY created_at DESC LIMIT 20';

    const dbRes = await db.query(queryText, params);
    let numbers = dbRes.rows;

    // If local inventory is low, seamlessly fetch fresh numbers from provider
    if (numbers.length < 3) {
      try {
        const provider = getTelephonyProvider();
        const freshFromProvider = await provider.searchAvailableNumbers(country, { type, areaCode });

        for (const item of freshFromProvider) {
          const insertRes = await db.query(
            `INSERT INTO phone_numbers (e164_format, friendly_name, country_code, number_type, provider, cost_price_monthly, retail_price_monthly, retail_price_weekly, capabilities, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'available')
             ON CONFLICT (e164_format) DO UPDATE SET status = 'available'
             RETURNING id, e164_format, friendly_name, country_code, number_type, capabilities, retail_price_monthly, retail_price_weekly, status`,
            [item.phoneNumber, item.friendlyName, item.countryCode, item.numberType, provider.name, item.monthlyCost, item.retailMonthlyPrice, item.retailWeeklyPrice, JSON.stringify(item.capabilities)]
          );
          numbers.push(insertRes.rows[0]);
        }
      } catch (provErr) {
        console.warn('[Numbers Search] Provider fetch notice:', provErr.message);
      }
    }

    // Format output
    const formatted = numbers.map(num => ({
      id: num.id,
      phoneNumber: num.e164_format,
      friendlyName: num.friendly_name || num.e164_format,
      countryCode: num.country_code,
      numberType: num.number_type,
      capabilities: typeof num.capabilities === 'string' ? JSON.parse(num.capabilities) : num.capabilities,
      pricing: {
        monthly: parseFloat(num.retail_price_monthly),
        weekly: parseFloat(num.retail_price_weekly),
        currency: 'USD'
      },
      status: num.status
    }));

    res.json({
      count: formatted.length,
      country: country.toUpperCase(),
      numbers: formatted
    });
  } catch (err) {
    console.error('[Numbers Available Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
