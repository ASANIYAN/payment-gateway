// Mock the repository functions and completer dependencies
jest.mock("../db/repositories/payments", () => ({
  getStuckPendingPayments: jest.fn(),
  getExpiredAuthorizations: jest.fn(),
  updatePaymentExpiredAt: jest.fn(),
}));

jest.mock("../db", () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  isDatabaseConnectionError: jest.fn(),
}));

import { runCompleter } from "../jobs/completer";
import { getStuckPendingPayments } from "../db/repositories/payments";

// Mock database functions
jest.mock("../db", () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

// Mock bank client
jest.mock("../services/bank-client", () => ({
  bankClient: {
    authorize: jest.fn(),
    capture: jest.fn(),
  },
}));

describe("Completer Job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should recover stuck payments", async () => {
    const mockGetStuckPayments = getStuckPendingPayments as jest.MockedFunction<
      typeof getStuckPendingPayments
    >;

    // Mock stuck payment with authorization_id
    mockGetStuckPayments.mockResolvedValue([
      {
        id: "pay_test_123",
        idempotency_key: "key_123",
        authorization_id: "auth_123",
        state: "pending",
        amount: 5000,
        currency: "USD",
        created_at: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      } as any,
    ]);

    await runCompleter();

    expect(mockGetStuckPayments).toHaveBeenCalled();
  });

  test("should handle no stuck payments gracefully", async () => {
    const mockGetStuckPayments = getStuckPendingPayments as jest.MockedFunction<
      typeof getStuckPendingPayments
    >;

    // Mock no stuck payments
    mockGetStuckPayments.mockResolvedValue([]);

    await expect(runCompleter()).resolves.not.toThrow();
    expect(mockGetStuckPayments).toHaveBeenCalled();
  });

  test("should handle errors during recovery", async () => {
    const mockGetStuckPayments = getStuckPendingPayments as jest.MockedFunction<
      typeof getStuckPendingPayments
    >;

    // Mock error finding stuck payments
    mockGetStuckPayments.mockRejectedValue(new Error("Database error"));

    // Should not throw, just log the error
    await expect(runCompleter()).resolves.not.toThrow();
  });
});
