const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function initializeDatabase() {
  console.log('[DB Init] Connecting to PostgreSQL and applying schema...');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

  try {
    await db.query(schemaSql);
    console.log('[DB Init] Schema created or updated successfully.');

    // Check if demo user exists
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', ['demo@telerent.io']);
    let demoUserId;

    if (userCheck.rows.length === 0) {
      const passwordHash = await bcrypt.hash('password123', 10);
      const insertUser = await db.query(
        `INSERT INTO users (email, password_hash, name, company_name, balance, role)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['demo@telerent.io', passwordHash, 'Alex Vance', 'Acme Corp', 25.0000, 'customer']
      );
      demoUserId = insertUser.rows[0].id;
      console.log('[DB Init] Demo user created: demo@telerent.io (Password: password123, Initial Balance: $25.00)');

      // Record initial balance deposit
      await db.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
         VALUES ($1, 'deposit', 25.00, 25.00, 'Welcome bonus credits for sandbox testing', 'completed')`,
        [demoUserId]
      );
    } else {
      demoUserId = userCheck.rows[0].id;
    }

    // Seed phone numbers pool across multiple countries if empty or low
    const countRes = await db.query('SELECT COUNT(*) FROM phone_numbers');
    const existingCount = parseInt(countRes.rows[0].count, 10);

    if (existingCount < 10) {
      console.log('[DB Init] Seeding inventory pool of international phone numbers...');
      const seedNumbers = [
        // US Numbers
        { e164: '+14155550142', friendly: '(415) 555-0142', country: 'US', type: 'local', cost: 1.15, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: true } },
        { e164: '+12125550198', friendly: '(212) 555-0198', country: 'US', type: 'local', cost: 1.15, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: true } },
        { e164: '+18005550183', friendly: '(800) 555-0183', country: 'US', type: 'toll_free', cost: 2.15, monthly: 6.99, weekly: 2.49, caps: { sms: true, voice: true, mms: false } },
        { e164: '+13125550124', friendly: '(312) 555-0124', country: 'US', type: 'local', cost: 1.15, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: true } },
        { e164: '+17865550167', friendly: '(786) 555-0167', country: 'US', type: 'local', cost: 1.15, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: true } },
        
        // UK Numbers
        { e164: '+447911123456', friendly: '+44 7911 123456', country: 'GB', type: 'mobile', cost: 1.50, monthly: 5.99, weekly: 2.29, caps: { sms: true, voice: true, mms: false } },
        { e164: '+442079460192', friendly: '+44 20 7946 0192', country: 'GB', type: 'local', cost: 1.25, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: false } },
        
        // Canada Numbers
        { e164: '+16475550189', friendly: '(647) 555-0189', country: 'CA', type: 'local', cost: 1.15, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: true } },
        { e164: '+15145550172', friendly: '(514) 555-0172', country: 'CA', type: 'local', cost: 1.15, monthly: 4.99, weekly: 1.99, caps: { sms: true, voice: true, mms: true } },

        // Australia Numbers
        { e164: '+61491570156', friendly: '+61 491 570 156', country: 'AU', type: 'mobile', cost: 2.00, monthly: 6.99, weekly: 2.79, caps: { sms: true, voice: true, mms: false } },

        // Germany Numbers
        { e164: '+491512345678', friendly: '+49 151 2345678', country: 'DE', type: 'mobile', cost: 2.20, monthly: 7.49, weekly: 2.99, caps: { sms: true, voice: true, mms: false } },

        // France Numbers
        { e164: '+33612345678', friendly: '+33 6 12 34 56 78', country: 'FR', type: 'mobile', cost: 2.10, monthly: 6.99, weekly: 2.79, caps: { sms: true, voice: true, mms: false } }
      ];

      for (const num of seedNumbers) {
        await db.query(
          `INSERT INTO phone_numbers (e164_format, friendly_name, country_code, number_type, provider, cost_price_monthly, retail_price_monthly, retail_price_weekly, capabilities, status)
           VALUES ($1, $2, $3, $4, 'sandbox', $5, $6, $7, $8, 'available')
           ON CONFLICT (e164_format) DO NOTHING`,
          [num.e164, num.friendly, num.country, num.type, num.cost, num.monthly, num.weekly, JSON.stringify(num.caps)]
        );
      }
      console.log(`[DB Init] Seeded ${seedNumbers.length} phone numbers into inventory pool.`);
    }

    console.log('[DB Init] Database initialization complete!');
  } catch (err) {
    console.error('[DB Init Error]:', err);
    throw err;
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initializeDatabase;
