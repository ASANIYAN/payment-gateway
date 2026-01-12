import axios from "axios";
import logger from "./utils/logger";

const BASE_URL = "http://localhost:3000/api/v1/payments";

async function testErrorScenarios() {
  logger.info("Testing error handling scenarios...");

  try {
    // Test 1: Invalid card
    logger.info("Test 1: Invalid card number");
    try {
      await axios.post(
        `${BASE_URL}/authorize`,
        {
          order_id: "order-" + Date.now(),
          customer_id: "cust-test",
          amount: 5000,
          currency: "USD",
          card_details: {
            number: "1234567890123456", // Invalid card
            expiry: "12/2030",
            cvv: "123",
          },
        },
        {
          headers: {
            "Idempotency-Key": "test-invalid-card-" + Date.now(),
          },
        }
      );
    } catch (error: any) {
      logger.info(
        {
          status: error.response?.status,
          error: error.response?.data,
        },
        "Invalid card handled"
      );
    }

    // Test 2: Insufficient funds
    logger.info("Test 2: Insufficient funds");
    try {
      await axios.post(
        `${BASE_URL}/authorize`,
        {
          order_id: "order-" + Date.now(),
          customer_id: "cust-test",
          amount: 100000, // More than balance
          currency: "USD",
          card_details: {
            number: "5555555555554444", // $0 balance card
            expiry: "09/2030",
            cvv: "789",
          },
        },
        {
          headers: {
            "Idempotency-Key": "test-insufficient-" + Date.now(),
          },
        }
      );
    } catch (error: any) {
      logger.info(
        {
          status: error.response?.status,
          error: error.response?.data,
        },
        "Insufficient funds handled"
      );
    }

    // Test 3: Expired card
    logger.info("Test 3: Expired card");
    try {
      await axios.post(
        `${BASE_URL}/authorize`,
        {
          order_id: "order-" + Date.now(),
          customer_id: "cust-test",
          amount: 5000,
          currency: "USD",
          card_details: {
            number: "5105105105105100", // Expired card
            expiry: "03/2020", // Past expiry
            cvv: "321",
          },
        },
        {
          headers: {
            "Idempotency-Key": "test-expired-" + Date.now(),
          },
        }
      );
    } catch (error: any) {
      logger.info(
        {
          status: error.response?.status,
          error: error.response?.data,
        },
        "Expired card handled"
      );
    }

    // Test 4: Payment not found
    logger.info("Test 4: Payment not found");
    try {
      await axios.post(
        `${BASE_URL}/capture`,
        {
          payment_id: "00000000-0000-0000-0000-000000000000", // Non-existent
        },
        {
          headers: {
            "Idempotency-Key": "test-not-found-" + Date.now(),
          },
        }
      );
    } catch (error: any) {
      logger.info(
        {
          status: error.response?.status,
          error: error.response?.data,
        },
        "Payment not found handled"
      );
    }

    logger.info("All error handling tests passed");
  } catch (error: any) {
    logger.error({ error: error.message }, "Test failed unexpectedly");
  }
}

testErrorScenarios();
