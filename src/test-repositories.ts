import { closePool, testConnection, withTransaction } from "./db";
import {
  createIdempotencyKey,
  createPayment,
  getIdempotencyKey,
  getPaymentById,
  isValidStateTransition,
  updatePaymentAuthorized,
  updateRecoveryPoint,
} from "./db/repositories";
import logger from "./utils/logger";

async function main() {
  try {
    await testConnection();

    logger.info("Testing idempotency key repository...");

    // Test create idempotency key
    const key = await createIdempotencyKey(
      "test-key-" + Date.now(),
      "/authorize",
      { order_id: "order-test" }
    );
    logger.info({ key }, "Idempotency key created");

    // Test get idempotency key
    const fetched = await getIdempotencyKey(key.key);
    logger.info({ fetched }, "Idempotency key fetched");

    logger.info("Testing payment repository...");

    // Test create payment in transaction
    await withTransaction(async (client) => {
      const payment = await createPayment(client, {
        idempotencyKey: key.key,
        orderId: "order-test-" + Date.now(),
        customerId: "cust-test",
        amount: 5000,
        currency: "USD",
      });

      logger.info({ payment }, "Payment created");

      // Test get payment
      const fetchedPayment = await getPaymentById(payment.id);
      logger.info({ fetchedPayment: fetchedPayment }, "Payment fetched");

      // Test state transition validation
      logger.info(
        {
          from: "PENDING",
          to: "AUTHORIZED",
          valid: isValidStateTransition("PENDING", "AUTHORIZED"),
        },
        "PENDING to AUTHORIZED valid"
      );
      logger.info(
        {
          from: "PENDING",
          to: "CAPTURED",
          valid: isValidStateTransition("PENDING", "CAPTURED"),
        },
        "PENDING to CAPTURED valid"
      );
      logger.info(
        {
          from: "VOIDED",
          to: "CAPTURED",
          valid: isValidStateTransition("VOIDED", "CAPTURED"),
        },
        "VOIDED to CAPTURED valid"
      );

      // Test update to authorized
      await updatePaymentAuthorized(
        client,
        payment.id,
        "auth-test-123",
        "1234",
        "visa"
      );

      // Test update recovery point
      await updateRecoveryPoint(client, key.key, "authorized");
    });

    logger.info("All repository tests passed");
  } catch (error) {
    logger.error({ error }, "Repository test failed");
  } finally {
    await closePool();
  }
}

main();
