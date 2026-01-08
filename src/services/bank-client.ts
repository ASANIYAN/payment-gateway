import axios, { AxiosInstance, AxiosError } from "axios";
import { config } from "../config";
import logger, { createChildLogger } from "../utils/logger";

export interface BankAuthorizationRequest {
  amount: number; // In cents
  card_number: string;
  cvv: string;
  expiry_month: number;
  expiry_year: number;
}

export interface BankAuthorizationResponse {
  authorization_id: string;
  status: "approved" | "declined";
  amount: number;
  currency: string;
  created_at: string;
  expires_at: string;
}

export interface BankCaptureRequest {
  authorization_id: string;
  amount: number; // Must match authorized amount
}

export interface BankCaptureResponse {
  capture_id: string;
  status: "captured";
  amount: number;
  authorization_id: string;
  created_at: string;
}

export interface BankVoidRequest {
  authorization_id: string;
}

export interface BankVoidResponse {
  void_id: string;
  status: "voided";
  authorization_id: string;
  created_at: string;
}

export interface BankRefundRequest {
  capture_id: string;
  amount: number; // Amount to refund
}

export interface BankRefundResponse {
  refund_id: string;
  status: "refunded";
  amount: number;
  capture_id: string;
  created_at: string;
}

export class BankError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = "BankError";
  }
}

export class BankPermanentError extends BankError {
  constructor(message: string, statusCode?: number, code?: string) {
    super(message, statusCode, code, false);
    this.name = "BankPermanentError";
  }
}

export class BankTransientError extends BankError {
  constructor(message: string, statusCode?: number, code?: string) {
    super(message, statusCode, code, true);
    this.name = "BankTransientError";
  }
}

class BankClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.bank.url,
      timeout: config.bank.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(
          {
            method: config.method?.toUpperCase(),
            url: config.url,
            idempotencyKey: config.headers?.["Idempotency-Key"],
          },
          "Bank API request"
        );
        return config;
      },
      (error) => {
        logger.error({ error }, "Bank API request setup failed");
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          {
            status: response.status,
            idempotencyReplayed: response.headers["x-idempotent-replayed"],
          },
          "Bank API response"
        );
        return response;
      },
      (error) => {
        if (error.response) {
          logger.warn(
            {
              status: error.response.status,
              data: error.response.data,
            },
            "Bank API error response"
          );
        } else {
          logger.error({ error: error.message }, "Bank API network error");
        }
        return Promise.reject(error);
      }
    );
  }

  private async requestWithRetry<T>(
    operation: string,
    requestFn: () => Promise<T>,
    idempotencyKey: string
  ): Promise<T> {
    const log = createChildLogger({ operation, idempotencyKey });
    const maxRetries = config.bank.maxRetries;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        log.debug({ attempt: attempt + 1 }, "Attempting bank API call");

        const result = await requestFn();

        if (attempt > 0) {
          log.info(
            { attempt: attempt + 1 },
            "Bank API call succeeded after retry"
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        const bankError = this.classifyError(error);

        log.warn(
          {
            attempt: attempt + 1,
            error: bankError.message,
            isRetryable: bankError.isRetryable,
          },
          "Bank API call failed"
        );

        if (!bankError.isRetryable) {
          throw bankError;
        }

        if (attempt === maxRetries) {
          log.error(
            { attempts: attempt + 1 },
            "Bank API call failed after all retries"
          );
          throw bankError;
        }

        // Wait before retrying (exponential backoff with jitter)
        const delayMs = this.calculateBackoff(attempt);
        log.debug({ delayMs }, "Waiting before retry");
        await this.sleep(delayMs);
      }
    }

    throw lastError!;
  }

  private calculateBackoff(attempt: number): number {
    const exponentialDelay = Math.min(1000 * Math.pow(2, attempt), 10000);
    const jitter = Math.random() * exponentialDelay * 0.5;
    return exponentialDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private classifyError(error: any): BankError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Network errors (no response) - transient
      if (!axiosError.response) {
        return new BankTransientError(
          "Network error or timeout",
          undefined,
          "NETWORK_ERROR"
        );
      }

      const status = axiosError.response.status;
      const data = axiosError.response.data as any;

      // 5xx errors - transient (server issues)
      if (status >= 500) {
        return new BankTransientError(
          data?.message || "Bank server error",
          status,
          data?.error || "SERVER_ERROR"
        );
      }

      // 429 Too Many Requests - transient
      if (status === 429) {
        return new BankTransientError(
          "Rate limit exceeded",
          status,
          "RATE_LIMIT"
        );
      }

      // 408 Request Timeout - transient
      if (status === 408) {
        return new BankTransientError("Request timeout", status, "TIMEOUT");
      }

      // 4xx errors (except above) - permanent (client errors)
      if (status >= 400 && status < 500) {
        return new BankPermanentError(
          data?.message || "Bank request error",
          status,
          data?.error || "CLIENT_ERROR"
        );
      }
    }

    // Unknown error - treat as transient to be safe
    return new BankTransientError(
      error.message || "Unknown error",
      undefined,
      "UNKNOWN_ERROR"
    );
  }

  async authorize(
    request: BankAuthorizationRequest,
    idempotencyKey: string
  ): Promise<BankAuthorizationResponse> {
    return this.requestWithRetry(
      "authorize",
      async () => {
        const response = await this.client.post<BankAuthorizationResponse>(
          "/api/v1/authorizations",
          request,
          {
            headers: {
              "Idempotency-Key": idempotencyKey,
            },
          }
        );

        const wasReplayed =
          response.headers["x-idempotent-replayed"] === "true";
        if (wasReplayed) {
          logger.info(
            { idempotencyKey },
            "Bank returned cached authorization (idempotent replay)"
          );
        }

        return response.data;
      },
      idempotencyKey
    );
  }

  async capture(
    authorizationId: string,
    amount: number,
    idempotencyKey: string
  ): Promise<BankCaptureResponse> {
    return this.requestWithRetry(
      "capture",
      async () => {
        const response = await this.client.post<BankCaptureResponse>(
          "/api/v1/captures",
          {
            authorization_id: authorizationId,
            amount: amount,
          },
          {
            headers: {
              "Idempotency-Key": idempotencyKey,
            },
          }
        );

        const wasReplayed =
          response.headers["x-idempotent-replayed"] === "true";
        if (wasReplayed) {
          logger.info(
            { idempotencyKey, authorizationId },
            "Bank returned cached capture (idempotent replay)"
          );
        }

        return response.data;
      },
      idempotencyKey
    );
  }

  async void(
    authorizationId: string,
    idempotencyKey: string
  ): Promise<BankVoidResponse> {
    return this.requestWithRetry(
      "void",
      async () => {
        const response = await this.client.post<BankVoidResponse>(
          "/api/v1/voids",
          { authorization_id: authorizationId },
          {
            headers: {
              "Idempotency-Key": idempotencyKey,
            },
          }
        );

        const wasReplayed =
          response.headers["x-idempotent-replayed"] === "true";
        if (wasReplayed) {
          logger.info(
            { idempotencyKey, authorizationId },
            "Bank returned cached void (idempotent replay)"
          );
        }

        return response.data;
      },
      idempotencyKey
    );
  }

  async refund(
    captureId: string,
    amount: number,
    idempotencyKey: string
  ): Promise<BankRefundResponse> {
    return this.requestWithRetry(
      "refund",
      async () => {
        const response = await this.client.post<BankRefundResponse>(
          "/api/v1/refunds",
          {
            capture_id: captureId,
            amount: amount,
          },
          {
            headers: {
              "Idempotency-Key": idempotencyKey,
            },
          }
        );

        const wasReplayed =
          response.headers["x-idempotent-replayed"] === "true";
        if (wasReplayed) {
          logger.info(
            { idempotencyKey, captureId },
            "Bank returned cached refund (idempotent replay)"
          );
        }

        return response.data;
      },
      idempotencyKey
    );
  }
}

export const bankClient = new BankClient();
