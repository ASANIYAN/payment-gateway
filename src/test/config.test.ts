import { config } from "../config";

describe("Configuration", () => {
  test("should load configuration values", () => {
    expect(config.nodeEnv).toBeDefined();
    expect(config.port).toBeDefined();
    expect(config.database.url).toBeDefined();
    expect(config.bank.url).toBeDefined();
    expect(config.logging.level).toBeDefined();
  });

  test("should have valid environment", () => {
    expect(["development", "production", "test"]).toContain(config.nodeEnv);
  });

  test("should have valid port", () => {
    expect(config.port).toBeGreaterThan(0);
    expect(config.port).toBeLessThan(65536);
  });

  test("should have valid database URL", () => {
    expect(config.database.url).toMatch(/^postgresql:\/\//);
  });

  test("should have valid bank URL", () => {
    expect(config.bank.url).toMatch(/^https?:\/\//);
  });

  test("should have valid log level", () => {
    const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
    expect(validLevels).toContain(config.logging.level);
  });
});
