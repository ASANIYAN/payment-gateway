import {
  testConnection,
  closePool,
  getPoolStats,
  withTransaction,
  query,
} from "../db";

describe("Database", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should test database connection", async () => {
    const mockTestConnection = testConnection as jest.MockedFunction<
      typeof testConnection
    >;
    mockTestConnection.mockResolvedValue(undefined);

    await testConnection();
    expect(mockTestConnection).toHaveBeenCalledTimes(1);
  });

  test("should get pool statistics", () => {
    const stats = getPoolStats();

    expect(stats).toBeDefined();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("idle");
    expect(stats).toHaveProperty("waiting");
  });

  test("should handle database queries", async () => {
    const mockQuery = query as jest.MockedFunction<typeof query>;
    const mockResult = {
      rows: [{ time: new Date() }],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    };

    mockQuery.mockResolvedValue(mockResult);

    const result = await query("SELECT NOW() as time");
    expect(mockQuery).toHaveBeenCalledWith("SELECT NOW() as time");
    expect(result).toEqual(mockResult);
  });

  test("should handle transactions", async () => {
    const mockWithTransaction = withTransaction as jest.MockedFunction<
      typeof withTransaction
    >;
    const mockCallback = jest.fn().mockResolvedValue("test-result");

    mockWithTransaction.mockImplementation(async (callback) => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      return callback(mockClient as any);
    });

    await withTransaction(mockCallback);
    expect(mockWithTransaction).toHaveBeenCalledWith(mockCallback);
  });

  test("should close pool", async () => {
    const mockClosePool = closePool as jest.MockedFunction<typeof closePool>;
    mockClosePool.mockResolvedValue(undefined);

    await closePool();
    expect(mockClosePool).toHaveBeenCalledTimes(1);
  });
});
