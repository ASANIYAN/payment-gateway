import logger, { createChildLogger } from "../utils/logger";

jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  })),
}));

describe("Logger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should log info messages", () => {
    logger.info("Test info message");
    expect(logger.info).toHaveBeenCalledWith("Test info message");
  });

  test("should log structured data", () => {
    const data = { userId: "user_123", action: "login" };
    logger.info(data, "User logged in");
    expect(logger.info).toHaveBeenCalledWith(data, "User logged in");
  });

  test("should log warnings", () => {
    logger.warn("Test warning");
    expect(logger.warn).toHaveBeenCalledWith("Test warning");
  });

  test("should log errors", () => {
    const error = new Error("Test error");
    logger.error({ error }, "Something went wrong");
    expect(logger.error).toHaveBeenCalledWith(
      { error },
      "Something went wrong"
    );
  });

  test("should create child logger", () => {
    const context = { paymentId: "pay_test", orderId: "order_test" };
    const childLogger = createChildLogger(context);

    expect(createChildLogger).toHaveBeenCalledWith(context);
    expect(childLogger).toBeDefined();
  });

  test("child logger should inherit functionality", () => {
    const context = { paymentId: "pay_test" };
    const childLogger = createChildLogger(context);

    childLogger.info("Processing payment");
    expect(childLogger.info).toHaveBeenCalledWith("Processing payment");

    childLogger.error({ error: new Error("Test") }, "Payment failed");
    expect(childLogger.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      "Payment failed"
    );
  });
});
