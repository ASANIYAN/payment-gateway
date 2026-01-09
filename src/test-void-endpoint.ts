import axios from "axios";
import _ from "lodash";
import logger from "./utils/logger";

const BASE_URL = "http://localhost:3000/api/v1/payments";

async function test() {
  try {
    // Authorize payment
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

    // Void payment
    logger.info("Step 2: Voiding payment...");

    const voidResponse = await axios.post(
      `${BASE_URL}/void`,
      {
        payment_id: paymentId,
      },
      {
        headers: {
          "Idempotency-Key": "void-" + Date.now(),
        },
      }
    );

    logger.info({ response: voidResponse.data }, " Void successful");

    logger.info("Step 3: Attempting duplicate void (should fail)...");

    try {
      await axios.post(
        `${BASE_URL}/void`,
        {
          payment_id: paymentId,
        },
        {
          headers: {
            "Idempotency-Key": "void-duplicate-" + Date.now(),
          },
        }
      );

      logger.error("Duplicate void should have failed!");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          " Correctly rejected duplicate void"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    // Step 4: Test cannot capture voided payment
    logger.info(
      "Step 4: Attempting to capture voided payment (should fail)..."
    );

    try {
      await axios.post(
        `${BASE_URL}/capture`,
        {
          payment_id: paymentId,
        },
        {
          headers: {
            "Idempotency-Key": "capture-voided-" + Date.now(),
          },
        }
      );

      logger.error("Should not be able to capture voided payment!");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          " Correctly rejected capture of voided payment"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    logger.info("Step 5: Testing idempotent replay...");

    const idempotentKey = "idempotent-void-" + Date.now();

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

    // First void
    const void1 = await axios.post(
      `${BASE_URL}/void`,
      { payment_id: payment2Id },
      {
        headers: {
          "Idempotency-Key": idempotentKey,
        },
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Retry with same key
    const void2 = await axios.post(
      `${BASE_URL}/void`,
      { payment_id: payment2Id },
      {
        headers: {
          "Idempotency-Key": idempotentKey,
        },
      }
    );

    const match = _.isEqual(void1.data, void2.data);
    logger.info(
      { match },
      match ? " Idempotent replay works" : "Idempotent replay failed"
    );

    // Step 6: Test race condition (capture vs void)
    logger.info("Step 6: Testing capture/void race condition...");

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

    // Capture it
    await axios.post(
      `${BASE_URL}/capture`,
      { payment_id: payment3Id },
      {
        headers: {
          "Idempotency-Key": "capture-3-" + Date.now(),
        },
      }
    );

    try {
      await axios.post(
        `${BASE_URL}/void`,
        { payment_id: payment3Id },
        {
          headers: {
            "Idempotency-Key": "void-after-capture-" + Date.now(),
          },
        }
      );

      logger.error("Should not be able to void captured payment!");
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === "invalid_state"
      ) {
        logger.info(
          { error: error.response.data },
          " Correctly rejected void of captured payment"
        );
      } else {
        logger.error({ error: error.response?.data }, "Unexpected error");
      }
    }

    logger.info(" All void tests passed!");
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
