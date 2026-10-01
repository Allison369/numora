require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/telerent',
  jwtSecret: process.env.JWT_SECRET || 'telerent_default_secret_dev_only',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  telephony: {
    provider: process.env.TELEPHONY_PROVIDER || 'sandbox',
    plivo: {
      authId: process.env.PLIVO_AUTH_ID || '',
      authToken: process.env.PLIVO_AUTH_TOKEN || '',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
    },
    telnyx: {
      apiKey: process.env.TELNYX_API_KEY || '',
      connectionId: process.env.TELNYX_CONNECTION_ID || '',
    }
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  pricing: {
    defaultWeeklyPrice: parseFloat(process.env.DEFAULT_WEEKLY_PRICE || '1.99'),
    defaultMonthlyPrice: parseFloat(process.env.DEFAULT_MONTHLY_PRICE || '4.99'),
  }
};
