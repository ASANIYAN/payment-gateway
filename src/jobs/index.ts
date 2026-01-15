import { config } from "../config";
import logger from "../utils/logger";
import { PgBoss } from "pg-boss";
import { runCompleter } from "./completer";
import { runReaper } from "./reaper";

let boss: PgBoss | null = null;

export async function startJobs(): Promise<void> {
  try {
    logger.info("Initializing pg-boss...");

    boss = new PgBoss({
      connectionString: config.database.url,
    });

    await boss.start();
    await boss.createQueue("completer");
    await boss.createQueue("reaper");
    logger.debug("Queues verified/created");

    logger.info("pg-boss started successfully");

    await boss.schedule(
      "completer",
      "*/2 * * * *", // Cron: every 2 minutes
      {},
      {
        tz: "UTC",
        retryLimit: 2,
        retryDelay: 60, // 1 minute
        retryBackoff: true,
        expireInSeconds: 600, // 10 minutes
      }
    );

    await boss.schedule(
      "reaper",
      "0 * * * *", // Cron: every hour at minute 0
      {},
      {
        tz: "UTC",
        retryLimit: 1,
        retryDelay: 300, // 5 minutes
        expireInSeconds: 1800, // 30 minutes
      }
    );

    await boss.work("completer", { batchSize: 1 }, async () => {
      logger.debug("Completer job triggered");
      await runCompleter();
    });

    await boss.work("reaper", { batchSize: 1 }, async () => {
      logger.debug("Reaper job triggered");
      await runReaper();
    });

    logger.info("Background jobs registered and running");
  } catch (error) {
    logger.error({ error }, "Failed to start background jobs");
    throw error;
  }
}

export async function stopJobs(): Promise<void> {
  if (boss) {
    logger.info("Stopping background jobs...");
    await boss.stop();
    logger.info("Background jobs stopped");
  }
}
