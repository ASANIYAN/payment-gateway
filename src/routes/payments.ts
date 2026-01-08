import { z } from "zod";
import { Router, Request, Response } from "express";
import logger, { createChildLogger } from "@/utils/logger";
import {
  cacheResponse,
  createIdempotencyKey,
  createPayment,
  getIdempotencyKey,
  getPaymentById,
  getPaymentByIdempotencyKey,
  getPaymentByOrderId,
  getPaymentsByCustomerId,
  updatePaymentAuthorized,
  updateRecoveryPoint,
} from "@/db/repositories";
import { withTransaction } from "@/db";
import { bankClient, BankPermanentError } from "@/services/bank-client";

const router = Router();

/**
 * Request validation schemas
 */
const authorizeRequestSchema = z.object({
  order_id: z.string().min(1, "order_id is required"),
  customer_id: z.string().min(1, "customer_id is required"),
  amount: z.number().positive("amount must be positive"),
  currency: z.literal("USD"),
  card_details: z.object({
    number: z.string().regex(/^\d{13,19}$/, "Invalid card number"),
    expiry: z.string().regex(/^\d{2}\/\d{4}$/, "Expiry must be MM/YYYY"),
    cvv: z.string().regex(/^\d{3,4}$/, "CVV must be 3-4 digits"),
  }),
});

//  Authorize a payment (reserve funds on card)
router.post("/authorize", async (req: Request, res: Response) => {
  const idempotencyKey = req.headers["idempotency-key"] as string;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "missing_idempotency_key",
      message: "Idempotency-Key header is required",
    });
  }

  const log = createChildLogger({ idempotencyKey, requestId: req.id });

  try {
    const data = authorizeRequestSchema.parse(req.body);

    log.info(
      {
        orderId: data.order_id,
        customerId: data.customer_id,
        amount: data.amount,
      },
      "Authorization request received"
    );

    // Check if we've already processed this idempotency key
    const existingKey = await getIdempotencyKey(idempotencyKey);

    if (existingKey) {
      log.info(
        { recoveryPoint: existingKey.recovery_point },
        "Found existing idempotency key"
      );

      // If already finished, return cached response
      if (existingKey.recovery_point === "finished") {
        log.info("Returning cached response");
        return res
          .status(existingKey.response_status!)
          .json(existingKey.response_body);
      }

      // Check if another request is processing this key
      if (existingKey.locked_at) {
        const lockAge = Date.now() - new Date(existingKey.locked_at).getTime();
        if (lockAge < 60000) {
          // Lock is fresh (< 1 minute)
          log.warn("Request already in progress");
          return res.status(409).json({
            error: "request_in_progress",
            message:
              "Another request with this idempotency key is being processed",
          });
        }
      }

      // Continue from recovery point (crash recovery scenario)
      return await continueAuthorization(idempotencyKey, data, log, res);
    }

    // New request - start from beginning
    return await processNewAuthorization(idempotencyKey, data, log, res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.warn({ errors: error.issues }, "Validation failed");
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid request data",
        details: error.issues,
      });
    }

    log.error({ error }, "Authorization failed");
    return res.status(500).json({
      error: "internal_error",
      message: "An unexpected error occurred",
    });
  }
});

//   Process a new authorization request
//   Implements atomic phases with recovery points

async function processNewAuthorization(
  idempotencyKey: string,
  data: z.infer<typeof authorizeRequestSchema>,
  log: any,
  res: Response
) {
  try {
    // ATOMIC PHASE 1: Create idempotency key and payment record
    log.debug("Phase 1: Creating idempotency key and payment");

    const payment = await withTransaction(async (client) => {
      // Create idempotency key (recovery_point: started)
      await createIdempotencyKey(idempotencyKey, "/authorize", {
        order_id: data.order_id,
        customer_id: data.customer_id,
        amount: data.amount,
      });

      // Create payment record
      const payment = await createPayment(client, {
        idempotencyKey,
        orderId: data.order_id,
        customerId: data.customer_id,
        amount: data.amount,
        currency: data.currency,
      });

      // Update recovery point: payment_created
      await updateRecoveryPoint(client, idempotencyKey, "payment_created");

      log.info({ paymentId: payment.id }, "Payment record created");
      return payment;
    });

    // ATOMIC PHASE 2: Call bank API (foreign state mutation)
    log.debug("Phase 2: Calling bank API");

    const [expMonth, expYear] = data.card_details.expiry.split("/");

    const bankResponse = await bankClient.authorize(
      {
        amount: data.amount,
        card_number: data.card_details.number,
        cvv: data.card_details.cvv,
        expiry_month: parseInt(expMonth),
        expiry_year: parseInt(expYear),
      },
      `gateway-${idempotencyKey}` // to distinguish from bank's own keys
    );

    // ATOMIC PHASE 3: Save authorization result
    log.debug("Phase 3: Saving authorization result");

    await withTransaction(async (client) => {
      // Update payment to AUTHORIZED
      await updatePaymentAuthorized(
        client,
        payment.id,
        bankResponse.authorization_id,
        data.card_details.number.slice(-4),
        "unknown" // Bank does not return card brand in response
      );

      // Update recovery point: authorized
      await updateRecoveryPoint(client, idempotencyKey, "authorized");

      log.info(
        { authorizationId: bankResponse.authorization_id },
        "Authorization successful"
      );
    });

    // ATOMIC PHASE 4: Cache response and mark finished
    const response = {
      id: payment.id,
      order_id: data.order_id,
      status: "AUTHORIZED",
      amount: data.amount,
      currency: data.currency,
    };

    await withTransaction(async (client) => {
      await cacheResponse(client, idempotencyKey, 200, response);
    });

    return res.status(200).json(response);
  } catch (error) {
    log.error({ error }, "Authorization processing failed");

    if (error instanceof BankPermanentError) {
      log.warn(
        { error: error.message, code: error.code },
        "Authorization declined"
      );

      const errorResponse = {
        error: "authorization_failed",
        message: error.message,
        code: error.code,
      };

      // Cache the error response so retries get the same error
      await withTransaction(async (client) => {
        await cacheResponse(client, idempotencyKey, 400, errorResponse);
      });

      return res.status(400).json(errorResponse);
    }

    return res.status(503).json({
      error: "service_unavailable",
      message: "Temporary failure, please retry with the same idempotency key",
    });
  }
}

//  Continue processing from a recovery point
//  Handles crash recovery scenarios

async function continueAuthorization(
  idempotencyKey: string,
  data: z.infer<typeof authorizeRequestSchema>,
  log: any,
  res: Response
) {
  log.info("Continuing authorization from recovery point");

  try {
    const payment = await getPaymentByIdempotencyKey(idempotencyKey);

    if (!payment) {
      log.error("Payment not found for idempotency key during recovery");
      return res.status(500).json({
        error: "internal_error",
        message: "Payment record not found",
      });
    }

    const existingKey = await getIdempotencyKey(idempotencyKey);

    if (!existingKey) {
      log.error("Idempotency key not found during recovery");
      return res.status(500).json({
        error: "internal_error",
        message: "Idempotency key not found",
      });
    }

    // Determine where to resume based on recovery point
    switch (existingKey.recovery_point) {
      case "started":
      case "payment_created":
        // Need to call bank (or check if already called)
        log.debug("Resuming: need to authorize with bank");
        return await resumeBankAuthorization(
          idempotencyKey,
          payment,
          data,
          log,
          res
        );

      case "authorized":
        // Authorization complete, just return success
        log.debug("Resuming: authorization already complete");

        const response = {
          id: payment.id,
          order_id: payment.order_id,
          status: "AUTHORIZED",
          amount: payment.amount,
          currency: payment.currency,
        };

        await withTransaction(async (client) => {
          await cacheResponse(client, idempotencyKey, 200, response);
        });

        return res.status(200).json(response);

      default:
        log.error(
          { recoveryPoint: existingKey.recovery_point },
          "Unknown recovery point"
        );
        return res.status(500).json({
          error: "internal_error",
          message: "Invalid recovery point",
        });
    }
  } catch (error) {
    log.error({ error }, "Recovery failed");
    return res.status(500).json({
      error: "internal_error",
      message: "Recovery processing failed",
    });
  }
}

/**
 * Resume authorization by calling bank
 * Safe to retry because we use the same idempotency key
 */
async function resumeBankAuthorization(
  idempotencyKey: string,
  payment: any,
  data: z.infer<typeof authorizeRequestSchema>,
  log: any,
  res: Response
) {
  try {
    log.debug("Resuming bank authorization call");

    const [expMonth, expYear] = data.card_details.expiry.split("/");

    // Call bank with same idempotency key
    // If bank already processed it, we'll get cached response
    const bankResponse = await bankClient.authorize(
      {
        amount: data.amount,
        card_number: data.card_details.number,
        cvv: data.card_details.cvv,
        expiry_month: parseInt(expMonth),
        expiry_year: parseInt(expYear),
      },
      `gateway-${idempotencyKey}`
    );

    // Save result
    await withTransaction(async (client) => {
      await updatePaymentAuthorized(
        client,
        payment.id,
        bankResponse.authorization_id,
        data.card_details.number.slice(-4),
        "unknown"
      );

      await updateRecoveryPoint(client, idempotencyKey, "authorized");
    });

    const response = {
      id: payment.id,
      order_id: payment.order_id,
      status: "AUTHORIZED",
      amount: payment.amount,
      currency: payment.currency,
    };

    await withTransaction(async (client) => {
      await cacheResponse(client, idempotencyKey, 200, response);
    });

    return res.status(200).json(response);
  } catch (error) {
    log.error({ error }, "Resume authorization failed");

    if (error instanceof BankPermanentError) {
      const errorResponse = {
        error: "authorization_failed",
        message: error.message,
      };

      await withTransaction(async (client) => {
        await cacheResponse(client, idempotencyKey, 400, errorResponse);
      });

      return res.status(400).json(errorResponse);
    }

    return res.status(503).json({
      error: "service_unavailable",
      message: "Temporary failure, please retry",
    });
  }
}

router.get("/payments/:id", async (req: Request, res: Response) => {
  try {
    const payment = await getPaymentById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        error: "payment_not_found",
        message: "Payment not found",
      });
    }

    return res.json({
      id: payment.id,
      order_id: payment.order_id,
      customer_id: payment.customer_id,
      amount: payment.amount,
      currency: payment.currency,
      state: payment.state,
      created_at: payment.created_at,
      authorized_at: payment.authorized_at,
      captured_at: payment.captured_at,
      voided_at: payment.voided_at,
      refunded_at: payment.refunded_at,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get payment");
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to retrieve payment",
    });
  }
});

router.get("/payments/order/:orderId", async (req: Request, res: Response) => {
  try {
    const payment = await getPaymentByOrderId(req.params.orderId);

    if (!payment) {
      return res.status(404).json({
        error: "payment_not_found",
        message: "No payment found for this order",
      });
    }

    return res.json({
      id: payment.id,
      order_id: payment.order_id,
      customer_id: payment.customer_id,
      amount: payment.amount,
      currency: payment.currency,
      state: payment.state,
      created_at: payment.created_at,
      authorized_at: payment.authorized_at,
      captured_at: payment.captured_at,
      voided_at: payment.voided_at,
      refunded_at: payment.refunded_at,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get payment by order");
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to retrieve payment",
    });
  }
});

router.get(
  "/payments/customer/:customerId",
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const payments = await getPaymentsByCustomerId(
        req.params.customerId,
        limit
      );

      return res.json({
        customer_id: req.params.customerId,
        count: payments.length,
        payments: payments.map((p) => ({
          id: p.id,
          order_id: p.order_id,
          amount: p.amount,
          currency: p.currency,
          state: p.state,
          created_at: p.created_at,
        })),
      });
    } catch (error) {
      logger.error({ error }, "Failed to get customer payments");
      return res.status(500).json({
        error: "internal_error",
        message: "Failed to retrieve payments",
      });
    }
  }
);

export default router;
