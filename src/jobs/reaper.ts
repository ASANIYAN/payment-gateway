import { config } from "../config";
import { withTransaction } from "../db";
import {
  deleteOldIdempotencyKeys,
  deletePayment,
  getStuckPendingPayments,
} from "../db/repositories";
import { createChildLogger } from "../utils/logger";

//   Scenarios handled:
//    Idempotency keys older than 72 hours
//    Abandoned PENDING payments

export async function runReaper() {
  const log = createChildLogger({ job: "reaper" });

  log.info("Reaper job started");

  try {
    const deletedCount = await deleteOldIdempotencyKeys(
      config.jobs.cleanupAgeHours
    );

    log.info({ deletedCount }, "Deleted old idempotency keys");

    const veryOldThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const abandonedPayments = await getStuckPendingPayments(veryOldThreshold);

    log.info(
      { count: abandonedPayments.length },
      "Found very old PENDING payments (7+ days)"
    );

    let deletedPayments = 0;

    for (const payment of abandonedPayments) {
      const paymentLog = createChildLogger({
        job: "reaper",
        paymentId: payment.id,
        age: Date.now() - new Date(payment.created_at).getTime(),
      });

      try {
        await withTransaction(async (client) => {
          await deletePayment(client, payment.id);
          deletedPayments++;

          paymentLog.info("Deleted abandoned PENDING payment");
        });
      } catch (error) {
        paymentLog.error({ error }, "Failed to delete abandoned payment");
      }
    }

    log.info({ deletedPayments }, "Deleted abandoned PENDING payments");
    log.info("Reaper job completed");
  } catch (error) {
    log.error({ error }, "Reaper job failed");
  }
}
