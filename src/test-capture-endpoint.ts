import axios from "axios";
import _ from "lodash";
import logger from "./utils/logger";

const BASE_URL = "http://localhost:3000/api/v1/payments";

async function test() {
  try {
    // Step 1: Authorize a payment
    logger.info("Step 1: Authorizing payment...");

    const authResponse = await axios.post(
      `${BASE_URL}/authorize`,
      {
        order_id: "order-" + Date.now(),
        customer_id: "cust-test",
        amount: 5000,
        currency: "USD",
        card_details: {
          number: "4111111111111111",
          expiry: "12/2030",
          cvv: "123",
        },
      },
      {
        headers: {
          "Idempotency-Key": "auth-" + Date.now(),
        },
      }
    );

    logger.info({ response: authResponse.data }, "Authorization successful");

    const paymentId = authResponse.data.id;

    // Step 2: Capture the payment
    logger.info("Step 2: Capturing payment...");

    const captureResponse = await axios.post(
      `${BASE_URL}/capture`,
      {
        payment_id: paymentId,
      },
      {
        headers: {
          "Idempotency-Key": "capture-" + Date.now(),
        },
      }
    );

    logger.info({ response: captureResponse.data }, "Capture successful");

    // Step 3: Try to capture again (should fail - invalid state)
    logger.info("Step 3: Attempting duplicate capture (should fail)...");

    try {
      await axios.post(
        `${BASE_URL}/capture`,
        {
          payment_id: paymentId,
        },
        {
          headers: {
            "Idempotency-Key": "capture-duplicate-" + Date.now(),
          },
        }
      );

      logger.error("Duplicate capture should have failed!");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          "Correctly rejected duplicate capture"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    // Step 4: Test idempotent replay
    logger.info("Step 4: Testing idempotent replay...");

    const idempotentKey = "idempotent-capture-" + Date.now();

    // Authorize new payment
    const auth2Response = await axios.post(
      `${BASE_URL}/authorize`,
      {
        order_id: "order-" + Date.now(),
        customer_id: "cust-test",
        amount: 3000,
        currency: "USD",
        card_details: {
          number: "4111111111111111",
          expiry: "12/2030",
          cvv: "123",
        },
      },
      {
        headers: {
          "Idempotency-Key": "auth-2-" + Date.now(),
        },
      }
    );

    const payment2Id = auth2Response.data.id;

    // First capture
    const capture1 = await axios.post(
      `${BASE_URL}/capture`,
      { payment_id: payment2Id },
      {
        headers: {
          "Idempotency-Key": idempotentKey,
        },
      }
    );

    // Retry with same key
    const capture2 = await axios.post(
      `${BASE_URL}/capture`,
      { payment_id: payment2Id },
      {
        headers: {
          "Idempotency-Key": idempotentKey,
        },
      }
    );

    const match = _.isEqual(capture1.data, capture2.data);
    logger.info(
      { match },
      match ? "Idempotent replay works" : "Idempotent replay failed"
    );

    logger.info("All capture tests passed!");
  } catch (error: any) {
    if (error.response) {
      logger.error(
        {
          status: error.response.status,
          data: error.response.data,
        },
        "Test failed"
      );
    } else {
      logger.error({ error: error.message }, "Test failed");
    }
  }
}

test();
