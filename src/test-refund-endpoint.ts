import axios from "axios";
import _ from "lodash";
import logger from "./utils/logger";

const BASE_URL = "http://localhost:3000/api/v1/payments";

async function test() {
  try {
    logger.info("Step 1: Full payment flow (Authorize → Capture → Refund)...");

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

    const paymentId = authResponse.data.id;
    logger.info({ paymentId }, "Authorized");

    const captureResponse = await axios.post(
      `${BASE_URL}/capture`,
      { payment_id: paymentId },
      {
        headers: {
          "Idempotency-Key": "capture-" + Date.now(),
        },
      }
    );

    logger.info({ captureId: captureResponse.data.capture_id }, "Captured");

    const refundResponse = await axios.post(
      `${BASE_URL}/refund`,
      { payment_id: paymentId },
      {
        headers: {
          "Idempotency-Key": "refund-" + Date.now(),
        },
      }
    );

    logger.info({ refundId: refundResponse.data.refund_id }, "Refunded");

    // refund again (should fail - already refunded)
    logger.info("Step 2: Attempting duplicate refund (should fail)...");

    try {
      await axios.post(
        `${BASE_URL}/refund`,
        { payment_id: paymentId },
        {
          headers: {
            "Idempotency-Key": "refund-duplicate-" + Date.now(),
          },
        }
      );

      logger.error("Duplicate refund should have failed!");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          "Correctly rejected duplicate refund"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    // Try to refund authorized (not captured) payment
    logger.info(
      "Step 3: Attempting to refund non-captured payment (should fail)"
    );

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

    try {
      await axios.post(
        `${BASE_URL}/refund`,
        { payment_id: payment2Id },
        {
          headers: {
            "Idempotency-Key": "refund-authorized-" + Date.now(),
          },
        }
      );

      logger.error("Should not be able to refund non-captured payment");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          "Correctly rejected refund of authorized payment"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    // Try to refund voided payment
    logger.info("Step 4: Attempting to refund voided payment (should fail)...");

    // Void authorized payment
    await axios.post(
      `${BASE_URL}/void`,
      { payment_id: payment2Id },
      {
        headers: {
          "Idempotency-Key": "void-" + Date.now(),
        },
      }
    );

    try {
      await axios.post(
        `${BASE_URL}/refund`,
        { payment_id: payment2Id },
        {
          headers: {
            "Idempotency-Key": "refund-voided-" + Date.now(),
          },
        }
      );

      logger.error("Should not be able to refund voided payment!");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          "Correctly rejected refund of voided payment"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    // Test idempotent replay
    logger.info("Step 5: Testing idempotent replay...");

    const idempotentKey = "idempotent-refund-" + Date.now();

    // Create new captured payment
    const auth3Response = await axios.post(
      `${BASE_URL}/authorize`,
      {
        order_id: "order-" + Date.now(),
        customer_id: "cust-test",
        amount: 2000,
        currency: "USD",
        card_details: {
          number: "4111111111111111",
          expiry: "12/2030",
          cvv: "123",
        },
      },
      {
        headers: {
          "Idempotency-Key": "auth-3-" + Date.now(),
        },
      }
    );

    const payment3Id = auth3Response.data.id;

    await axios.post(
      `${BASE_URL}/capture`,
      { payment_id: payment3Id },
      {
        headers: {
          "Idempotency-Key": "capture-3-" + Date.now(),
        },
      }
    );

    // First refund
    const refund1 = await axios.post(
      `${BASE_URL}/refund`,
      { payment_id: payment3Id },
      {
        headers: {
          "Idempotency-Key": idempotentKey,
        },
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Retry with same key
    const refund2 = await axios.post(
      `${BASE_URL}/refund`,
      { payment_id: payment3Id },
      {
        headers: {
          "Idempotency-Key": idempotentKey,
        },
      }
    );

    const match = _.isEqual(refund1.data, refund2.data);
    logger.info(
      { match },
      match ? "Idempotent replay works" : "Idempotent replay failed"
    );

    logger.info("All refund tests passed!");
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
