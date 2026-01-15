import pino from "pino";
import { ServerResponse } from "http";
import { IncomingMessage } from "http";
import { Options, pinoHttp } from "pino-http";
import { config, isDevelopment } from "../config";

const logger = pino({
  level: config.logging.level,

  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
        },
      }
    : undefined,

  base: {
    env: config.nodeEnv,
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

export const httpLogger = pinoHttp({
  logger,

  autoLogging: {
    ignore: (req: IncomingMessage) => {
      return req.url === "/health";
    },
  },

  customProps: (req: IncomingMessage) => ({
    requestId: (req as any).id,
  }),

  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (res.statusCode >= 500 || err) {
      return "error";
    }
    if (res.statusCode >= 400) {
      return "warn";
    }
    return "info";
  },

  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },

  customErrorMessage: (
    req: IncomingMessage,
    res: ServerResponse,
    err?: Error
  ) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err?.message ?? ""}`;
  },
} as Options);

export default logger;
