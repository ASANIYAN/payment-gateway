import axios from "axios";
import logger from "./utils/logger";
import { runCompleter } from "./jobs/completer";
import { closePool, query } from "./db";

const BASE_URL = "http://localhost:3000/api/v1/payments";

async function testCompleterRecovery() {
  try {
    logger.info("Setting up test scenario for completer...");

    // --- SCENARIO 1: GHOST SUCCESS ---
    // Goal: Payment is PENDING in DB but APPROVED at Bank.
    logger.info("Step 1: Creating a successful authorization to 'poison'...");

    const authResponse = await axios.post(
      `${BASE_URL}/authorize`,
      {
        order_id: "ghost-success-" + Date.now(),
        customer_id: "cust-test",
        amount: 7500,
        currency: "USD",
        card_details: {
          number: "4111111111111111",
          expiry: "12/2030",
          cvv: "123",
        },
      },
      {
        headers: {
          "Idempotency-Key": "ghost-key-" + Date.now(),
        },
      }
    );

    const paymentId = authResponse.data.id;
    logger.info(
      { paymentId },
      "Payment created successfully. Now poisoning state..."
    );

    /**
     * POISONING LOGIC:
     * We keep the authorization_id (so the bank knows about it)
     * but we flip the state back to 'PENDING'.
     * We also age the 'updated_at' so the Completer's WHERE clause picks it up.
     */
    await query(
      `UPDATE payments 
       SET state = 'PENDING', 
           updated_at = NOW() - INTERVAL '10 minutes' 
       WHERE id = $1`,
      [paymentId]
    );

    logger.info("Payment poisoned: State is PENDING but Auth ID exists.");

    logger.info("Step 2: Running completer job to recover poisoned payment...");
    await runCompleter();

    const finalState = await query("SELECT state FROM payments WHERE id = $1", [
      paymentId,
    ]);
    logger.info(
      { finalState: finalState.rows[0].state },
      "Post-Completer Verification"
    );

    if (finalState.rows[0].state === "AUTHORIZED") {
      logger.info("SUCCESS: Completer recovered the Ghost Success!");
    } else {
      logger.error("FAILURE: Completer did not transition the state.");
    }
  } catch (error: any) {
    logger.error(
      {
        message: error.message,
        response: error.response?.data,
      },
      "Test failed"
    );
  } finally {
    await closePool();
  }
}

testCompleterRecovery();
