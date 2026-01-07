import { bankClient, BankPermanentError } from "./services/bank-client";
import logger from "./utils/logger";

async function main() {
  try {
    logger.info("Testing bank client...");

    // Test authorization with test card
    logger.info("Testing authorization...");
    const authResponse = await bankClient.authorize(
      {
        amount: 9999, // $99.99
        card_number: "4111111111111111", // Test card from spec
        cvv: "123",
        expiry_month: 12,
        expiry_year: 2030,
      },
      "test-idem-key-" + Date.now()
    );

    logger.info({ authResponse }, "Authorization succeeded");

    // Test idempotent replay (same key)
    logger.info("Testing idempotent replay...");
    const idempotentKey = "test-idem-key-replay-" + Date.now();
    await bankClient.authorize(
      {
        amount: 5000,
        card_number: "4111111111111111",
        cvv: "123",
        expiry_month: 12,
        expiry_year: 2030,
      },
      idempotentKey
    );

    // Call again with same key
    await bankClient.authorize(
      {
        amount: 5000,
        card_number: "4111111111111111",
        cvv: "123",
        expiry_month: 12,
        expiry_year: 2030,
      },
      idempotentKey
    );

    logger.info("Idempotent replay test passed");

    // Test insufficient funds (permanent error)
    logger.info("Testing insufficient funds...");
    try {
      await bankClient.authorize(
        {
          amount: 100000, // More than card balance
          card_number: "5555555555554444", // Insufficient funds card from spec
          cvv: "789",
          expiry_month: 9,
          expiry_year: 2030,
        },
        "test-idem-key-insufficient-" + Date.now()
      );
      logger.error("Should have thrown error for insufficient funds");
    } catch (error) {
      if (error instanceof BankPermanentError) {
        logger.info(
          { error: error.message },
          "Correctly identified permanent error"
        );
      } else {
        logger.error({ error }, "Unexpected error type");
      }
    }

    // Test capture
    logger.info("Testing capture...");
    const captureResponse = await bankClient.capture(
      authResponse.authorization_id,
      "test-idem-key-capture-" + Date.now()
    );

    logger.info({ captureResponse }, "Capture succeeded");

    logger.info("All bank client tests passed");
  } catch (error) {
    logger.error({ error }, "Bank client test failed");
  }
}

main();
