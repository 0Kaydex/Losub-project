// Payment reminder job.
//
// Billing cycle: every seat (member or manager) renews every 28 days, tracked in
// group_members.next_payment_date. This job:
//   1. Finds seats whose next_payment_date is within the next 7 days and sends a
//      reminder notification + email (once per calendar day, tracked via
//      last_reminder_sent_at, so re-running this job doesn't spam people).
//   2. Finds seats whose next_payment_date has already passed and flags them
//      'overdue' (still reminding once a day) so the frontend can show a "Pay now"
//      state instead of "Active".
//
// Runs two ways:
//   - node scripts/payment-reminders.js   (for an external cron — see README)
//   - imported and called from server.js on an internal setInterval, so it still
//     runs periodically even without external cron infra set up yet.
require("dotenv").config();
const db = require("../db");
const { notify } = require("../utils/notify");
const { sendEmail, paymentReminderEmail } = require("../utils/mailer");

const REMINDER_WINDOW_DAYS = 7;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b) - new Date(a)) / MS_PER_DAY);
}

async function runPaymentReminders() {
  const today = todayStr();
  let remindersSent = 0;
  let overdueFlagged = 0;

  // Every active seat with a payment date set, that hasn't already had a reminder sent
  // today. Manager seats are included — they pay too (see routes/groups.js).
  const rows = db.prepare(`
    SELECT gm.id AS membership_id, gm.user_id, gm.role, gm.payment_status, gm.next_payment_date,
           g.id AS group_id, g.price_per_seat,
           u.fullname, u.email,
           p.name AS plan_name
    FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    JOIN users u ON u.id = gm.user_id
    JOIN plans p ON p.id = g.plan_id
    WHERE gm.next_payment_date IS NOT NULL
      AND g.status = 'active'
      AND (gm.last_reminder_sent_at IS NULL OR gm.last_reminder_sent_at != ?)
  `).all(today);

  for (const row of rows) {
    const diff = daysBetween(today, row.next_payment_date); // negative = overdue

    const isOverdue = diff < 0;
    const isDueSoon = diff >= 0 && diff <= REMINDER_WINDOW_DAYS;
    if (!isOverdue && !isDueSoon) continue;

    const amountNaira = (row.role === "manager" ? row.price_per_seat / 2 : row.price_per_seat) / 100;

    if (isOverdue && row.payment_status !== "overdue") {
      db.prepare("UPDATE group_members SET payment_status = 'overdue' WHERE id = ?").run(row.membership_id);
      overdueFlagged++;
    }

    const text = isOverdue
      ? `Your ${row.plan_name} payment is overdue. Please pay now to avoid losing your seat.`
      : `Your ${row.plan_name} payment of ₦${amountNaira.toLocaleString()} is due in ${diff} day${diff === 1 ? "" : "s"} (${row.next_payment_date}).`;

    notify(row.user_id, text, "payment_reminder", null, Number(row.group_id));
    db.prepare("UPDATE group_members SET last_reminder_sent_at = ? WHERE id = ?").run(today, row.membership_id);
    remindersSent++;

    if (row.email) {
      try {
        const { subject, html } = paymentReminderEmail(row.fullname, row.plan_name, amountNaira, row.next_payment_date, diff);
        await sendEmail({ to: row.email, subject, html });
      } catch (err) {
        console.error(`Payment reminder email failed for user ${row.user_id}:`, err.message);
      }
    }
  }

  console.log(`Payment reminders: ${remindersSent} reminder(s) sent, ${overdueFlagged} seat(s) newly flagged overdue.`);
  return { remindersSent, overdueFlagged };
}

module.exports = { runPaymentReminders };

// Allow running directly: `node scripts/payment-reminders.js`
if (require.main === module) {
  runPaymentReminders()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Payment reminders job failed:", err);
      process.exit(1);
    });
}
