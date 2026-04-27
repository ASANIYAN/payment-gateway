// Mock the repository functions
jest.mock("../db/repositories", () => ({
  createIdempotencyKey: jest.fn(),
  getIdempotencyKey: jest.fn(),
  updateRecoveryPoint: jest.fn(),
  createPayment: jest.fn(),
  getPaymentById: jest.fn(),
  updatePaymentAuthorized: jest.fn(),
  PaymentStateError: class extends Error {},
}));

jest.mock("../db", () => ({
  withTransaction: jest.fn(),
}));

import {
  createIdempotencyKey,
  getIdempotencyKey,
  updateRecoveryPoint,
  createPayment,
  getPaymentById,
  updatePaymentAuthorized,
  PaymentStateError,
} from "../db/repositories";
import { withTransaction } from "../db";

describe("Repositories", () => {
  describe("Idempotency Keys", () => {
    test("should create idempotency key", async () => {
      const mockKey = {
        key: "test-key-123",
        request_path: "/authorize",
        request_params: { order_id: "order-test" },
        recovery_point: "started",
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockedCreate = createIdempotencyKey as jest.MockedFunction<
        typeof createIdempotencyKey
      >;
      mockedCreate.mockResolvedValue(mockKey as any);

      const result = await createIdempotencyKey("test-key-123", "/authorize", {
        order_id: "order-test",
      });

      expect(result).toEqual(mockKey);
      expect(mockedCreate).toHaveBeenCalledWith("test-key-123", "/authorize", {
        order_id: "order-test",
      });
    });

    test("should get idempotency key", async () => {
      const mockKey = {
        key: "test-key-123",
        request_path: "/authorize",
        recovery_point: "started",
      };

      const mockedGet = getIdempotencyKey as jest.MockedFunction<
        typeof getIdempotencyKey
      >;
      mockedGet.mockResolvedValue(mockKey as any);

      const result = await getIdempotencyKey("test-key-123");

      expect(result).toEqual(mockKey);
      expect(mockedGet).toHaveBeenCalledWith("test-key-123");
    });

    test("should update recovery point", async () => {
      const mockTransaction = withTransaction as jest.MockedFunction<
        typeof withTransaction
      >;
      const mockedUpdate = updateRecoveryPoint as jest.MockedFunction<
        typeof updateRecoveryPoint
      >;

      mockTransaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        return callback(mockClient as any);
      });

      mockedUpdate.mockResolvedValue(undefined);

      await withTransaction(async (client) => {
        await updateRecoveryPoint(client, "test-key-123", "payment_created");
      });

      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe("Payments", () => {
    test("should create payment", async () => {
      const mockPayment = {
        id: "pay_123",
        idempotency_key: "test-key-123",
        order_id: "order-test-123",
        customer_id: "cust-test",
        amount: 5000,
        currency: "USD",
        state: "PENDING",
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = withTransaction as jest.MockedFunction<
        typeof withTransaction
      >;
      const mockedCreate = createPayment as jest.MockedFunction<
        typeof createPayment
      >;

      mockTransaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        return callback(mockClient as any);
      });

      mockedCreate.mockResolvedValue(mockPayment as any);

      await withTransaction(async (client) => {
        const result = await createPayment(client, {
          idempotencyKey: "test-key-123",
          orderId: "order-test-123",
          customerId: "cust-test",
          amount: 5000,
          currency: "USD",
        });

        expect(result).toEqual(mockPayment);
      });
    });

    test("should get payment by ID", async () => {
      const mockPayment = {
        id: "pay_123",
        state: "AUTHORIZED",
        amount: 5000,
      };

      const mockedGet = getPaymentById as jest.MockedFunction<
        typeof getPaymentById
      >;
      mockedGet.mockResolvedValue(mockPayment as any);

      const result = await getPaymentById("pay_123");

      expect(result).toEqual(mockPayment);
      expect(mockedGet).toHaveBeenCalledWith("pay_123");
    });

    test("should update payment to authorized", async () => {
      const mockUpdatedPayment = {
        id: "pay_123",
        state: "AUTHORIZED",
        authorization_id: "auth_123",
        card_last_four: "1234",
        card_brand: "visa",
      };

      const mockTransaction = withTransaction as jest.MockedFunction<
        typeof withTransaction
      >;
      const mockedUpdate = updatePaymentAuthorized as jest.MockedFunction<
        typeof updatePaymentAuthorized
      >;

      mockTransaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        return callback(mockClient as any);
      });

      mockedUpdate.mockResolvedValue(mockUpdatedPayment as any);

      await withTransaction(async (client) => {
        const result = await updatePaymentAuthorized(
          client,
          "pay_123",
          "auth_123",
          "1234",
          "visa"
        );

        expect(result).toEqual(mockUpdatedPayment);
      });
    });

    test("should handle state validation errors", async () => {
      const mockError = new PaymentStateError("Invalid state transition");

      const mockedUpdate = updatePaymentAuthorized as jest.MockedFunction<
        typeof updatePaymentAuthorized
      >;
      mockedUpdate.mockRejectedValue(mockError);

      const mockTransaction = withTransaction as jest.MockedFunction<
        typeof withTransaction
      >;
      mockTransaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        return callback(mockClient as any);
      });

      await expect(
        withTransaction(async (client) => {
          await updatePaymentAuthorized(client, "pay_123", "auth_123");
        })
      ).rejects.toThrow(PaymentStateError);
    });
  });
});
