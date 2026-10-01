const db = require('../config/database');
const sseService = require('./sseService');

class ExpirationWorker {
  constructor() {
    this.intervalHandle = null;
    this.isRunning = false;
  }

  start(intervalMs = 30000) {
    if (this.intervalHandle) return;
    console.log(`[Expiration Worker] Started background lease expiration monitor (every ${intervalMs / 1000}s)`);
    this.intervalHandle = setInterval(() => this.processExpiredRentals(), intervalMs);
    // Run initial check immediately
    this.processExpiredRentals();
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('[Expiration Worker] Stopped.');
    }
  }

  async processExpiredRentals() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Find all active rentals that have reached or passed their expiration time
      const res = await db.query(
        `SELECT r.*, u.balance as user_balance, p.retail_price_monthly, p.retail_price_weekly
         FROM rentals r
         JOIN users u ON r.user_id = u.id
         JOIN phone_numbers p ON r.phone_number_id = p.id
         WHERE r.status = 'active' AND r.expires_at <= NOW()`
      );

      if (res.rows.length === 0) {
        this.isRunning = false;
        return;
      }

      console.log(`[Expiration Worker] Processing ${res.rows.length} due/expired rental(s)...`);

      for (const rental of res.rows) {
        await this.handleSingleRental(rental);
      }
    } catch (err) {
      console.error('[Expiration Worker Error]:', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  async handleSingleRental(rental) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const renewalCost = rental.rental_plan === 'weekly' 
        ? parseFloat(rental.retail_price_weekly) 
        : parseFloat(rental.retail_price_monthly);
      
      const durationDays = rental.rental_plan === 'weekly' ? 7 : 30;
      const currentBalance = parseFloat(rental.user_balance);

      if (rental.auto_renew && currentBalance >= renewalCost) {
        // Auto-renew succeeds!
        const newBalance = currentBalance - renewalCost;
        const newExpiresAt = new Date(new Date(rental.expires_at).getTime() + durationDays * 24 * 60 * 60 * 1000);

        // Update user balance
        await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2', [newBalance, rental.user_id]);

        // Extend rental
        await client.query(
          'UPDATE rentals SET expires_at = $1, updated_at = NOW() WHERE id = $2',
          [newExpiresAt, rental.id]
        );

        // Record transaction
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
           VALUES ($1, 'rental_renewal', $2, $3, $4, 'completed')`,
          [rental.user_id, -renewalCost, newBalance, `Auto-renewed number ${rental.phone_number} for ${durationDays} days`]
        );

        await client.query('COMMIT');
        console.log(`[Expiration Worker] Auto-renewed rental ${rental.id} (${rental.phone_number}) until ${newExpiresAt.toISOString()}`);

        // Notify client in real time
        sseService.sendToUser(rental.user_id, 'rental_renewed', {
          rentalId: rental.id,
          phoneNumber: rental.phone_number,
          newExpiresAt,
          newBalance
        });
      } else {
        // Expire and release
        await client.query(
          "UPDATE rentals SET status = 'expired', updated_at = NOW() WHERE id = $1",
          [rental.id]
        );

        await client.query(
          "UPDATE phone_numbers SET status = 'available', current_rental_id = NULL, updated_at = NOW() WHERE id = $1",
          [rental.phone_number_id]
        );

        await client.query('COMMIT');
        console.log(`[Expiration Worker] Expired and released rental ${rental.id} (${rental.phone_number})`);

        // Notify client in real time
        sseService.sendToUser(rental.user_id, 'rental_expired', {
          rentalId: rental.id,
          phoneNumber: rental.phone_number,
          reason: rental.auto_renew ? 'Insufficient balance for renewal' : 'Rental period ended'
        });
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Expiration Worker] Error handling rental ${rental.id}:`, err.message);
    } finally {
      client.release();
    }
  }
}

module.exports = new ExpirationWorker();
