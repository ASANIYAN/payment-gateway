// Mock pg-boss to avoid ES module issues
jest.mock("pg-boss", () => ({
  PgBoss: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    createQueue: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
  })),
}));

// Mock jobs to prevent server startup during tests
jest.mock("../jobs", () => ({
  startJobs: jest.fn(),
  stopJobs: jest.fn(),
}));

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

// Cleanup after all tests
afterAll(() => {});

// Mock external services for tests
jest.mock("axios", () => ({
  create: jest.fn(() => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  })),
  defaults: {
    headers: { common: {} },
  },
}));

// Mock the database module to avoid actual connections during tests
jest.mock("../db", () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  testConnection: jest.fn(),
  closePool: jest.fn(),
  getPoolStats: jest.fn(() => ({ total: 10, idle: 5, waiting: 0 })),
}));

// Mock the logger module
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  httpLogger: jest.fn((_req, _res, next) => next && next()),
}));
