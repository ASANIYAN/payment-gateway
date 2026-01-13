import { Server } from "http";
import { config } from "./config";
import { randomUUID } from "crypto";
import paymentsRouter from "./routes/payments";
import logger, { httpLogger } from "./utils/logger";
import { closePool, getPoolStats, testConnection } from "./db";
import express, { Request, Response, NextFunction } from "express";
import { startJobs, stopJobs } from "./jobs";

const app = express();
app.set("trust proxy", true);

app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
});

app.use(httpLogger);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (req: Request, res: Response) => {
  try {
    const poolStats = getPoolStats();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        pool: poolStats,
      },
    });
  } catch (error) {
    logger.error({ error }, "Health check failed");
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Database connection failed",
    });
  }
});

app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Payment Gateway",
    version: "1.0.0",
    environment: config.nodeEnv,
  });
});

app.use("/api/v1", paymentsRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  (logger.error({
    error: err,
    requestId: req.id,
    method: req.method,
    path: req.path,
  }),
    "Unhandled Error");

  res.status(500).json({
    error: "Internal Server Error",
    message:
      config.nodeEnv === "development"
        ? err.message
        : "Unexpected error occurred",
    requestId: req.id,
  });
});

async function startServer() {
  try {
    logger.info("Checking DB conn");
    await testConnection();

    // Start background jobs
    logger.info("Starting background jobs...");
    await startJobs();

    const server = app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          env: config.nodeEnv,
        },
        "Server started successfully"
      );

      logger.info(`Server running at http://localhost:${config.port}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);

      setUpGracefulShutdown(server);
    });
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

function setUpGracefulShutdown(server: Server) {
  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) {
      logger.warn("Shutdown in progress, forcing exit");
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info({ signal }, "Received shutdown signal");

    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        await stopJobs();
        await closePool();
        logger.info("Database pool closed");
        logger.info("Graceful shutdown");
        process.exit(0);
      } catch (error) {
        logger.error({ error }, "Error during shutdown");
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "Uncaught exception");
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({ reason, promise }, "Unhandled promise rejection");
    shutdown("unhandledRejection");
  });
}

startServer();

export default app;
