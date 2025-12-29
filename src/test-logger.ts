import logger, { createChildLogger } from "./utils/logger";

logger.info("This is an info message");
logger.warn("This is a warning");
logger.error("This is an error");

logger.info({ userId: "user_123", action: "login" }, "User logged in");

// Child logger
const paymentLogger = createChildLogger({
  paymentId: "pay_test",
  orderId: "order_test",
});

paymentLogger.info("Processing payment");
paymentLogger.info({ amount: 5000 }, "Amount validated");
paymentLogger.error({ error: new Error("Test error") }, "Payment failed");

console.log("\n Logger test complete");
