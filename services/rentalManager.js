const db = require('../config/database');
const config = require('../config/config');
const { getTelephonyProvider } = require('./telephony');

class RentalManager {
  /**
   * Rent a phone number for a customer
   */
  async rentNumber(userId, { phoneNumberId, plan = 'monthly', autoRenew = true, webhookUrl = null }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Fetch user & balance
      const userRes = await client.query('SELECT id, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (userRes.rows.length === 0) {
        throw new Error('User not found');
      }
      const user = userRes.rows[0];
      const userBalance = parseFloat(user.balance);

      // 2. Fetch phone number
      const numRes = await client.query('SELECT * FROM phone_numbers WHERE id = $1 FOR UPDATE', [phoneNumberId]);
      if (numRes.rows.length === 0) {
        throw new Error('Phone number not found');
      }
      const number = numRes.rows[0];

      if (number.status !== 'available') {
        throw new Error(`Phone number is not available (Current status: ${number.status})`);
      }

      // 3. Determine price and duration
      const price = plan === 'weekly' ? parseFloat(number.retail_price_weekly) : parseFloat(number.retail_price_monthly);
      const durationDays = plan === 'weekly' ? 7 : 30;

      if (userBalance < price) {
        throw new Error(`Insufficient balance. Required: $${price.toFixed(2)}, Available: $${userBalance.toFixed(2)}. Please top up your balance.`);
      }

      // 4. Calculate expiration timestamp
      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      // 5. Deduct user balance
      const newBalance = userBalance - price;
      await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2', [newBalance, userId]);

      // 6. Record financial ledger transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
         VALUES ($1, 'rental_purchase', $2, $3, $4, 'completed')`,
        [userId, -price, newBalance, `Rented ${number.e164_format} (${plan} plan, ${durationDays} days)`]
      );

      // 7. Insert rental record
      const rentalRes = await client.query(
        `INSERT INTO rentals (user_id, phone_number_id, phone_number, rental_plan, price_paid, auto_renew, status, webhook_url, starts_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9) RETURNING *`,
        [userId, number.id, number.e164_format, plan, price, autoRenew, webhookUrl, startsAt, expiresAt]
      );
      const rental = rentalRes.rows[0];

      // 8. Update phone number status
      await client.query(
        `UPDATE phone_numbers SET status = 'rented', current_rental_id = $1, updated_at = NOW() WHERE id = $2`,
        [rental.id, number.id]
      );

      // 9. Configure carrier webhook if live provider
      const provider = getTelephonyProvider();
      const platformWebhook = `${config.baseUrl}/api/webhooks/telephony/inbound-sms`;
      if (number.provider_sid && provider.name !== 'sandbox') {
        try {
          await provider.purchaseNumber(number.e164_format, platformWebhook);
        } catch (provErr) {
          console.warn('[RentalManager] Warning: Carrier webhook sync notice:', provErr.message);
        }
      }

      await client.query('COMMIT');
      return {
        rental,
        number,
        newBalance
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an active rental
   */
  async cancelRental(userId, rentalId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const rentalRes = await client.query(
        'SELECT * FROM rentals WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [rentalId, userId]
      );
      if (rentalRes.rows.length === 0) {
        throw new Error('Rental not found or access denied');
      }

      const rental = rentalRes.rows[0];
      if (rental.status !== 'active') {
        throw new Error(`Rental is already ${rental.status}`);
      }

      // Mark rental as cancelled
      await client.query(
        'UPDATE rentals SET status = $1, cancelled_at = NOW(), updated_at = NOW() WHERE id = $2',
        ['cancelled', rentalId]
      );

      // Release number back to available
      await client.query(
        'UPDATE phone_numbers SET status = $1, current_rental_id = NULL, updated_at = NOW() WHERE id = $2',
        ['available', rental.phone_number_id]
      );

      await client.query('COMMIT');
      return { success: true, rentalId, status: 'cancelled' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Toggle auto-renew status
   */
  async toggleAutoRenew(userId, rentalId, autoRenew) {
    const res = await db.query(
      `UPDATE rentals SET auto_renew = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [Boolean(autoRenew), rentalId, userId]
    );

    if (res.rows.length === 0) {
      throw new Error('Rental not found or unauthorized');
    }
    return res.rows[0];
  }
}

module.exports = new RentalManager();
