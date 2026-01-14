import { query } from "..";
import { PoolClient } from "pg";
import logger from "@/utils/logger";
import { PaymentRow, PaymentState } from "@/types";
import {
  PaymentStateMachine,
  PaymentStateError,
} from "@/services/payment-state-machine";

export type CreatePaymentData = {
  idempotencyKey: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
};

export { PaymentStateError } from "@/services/payment-state-machine";

export async function createPayment(
  client: PoolClient,
  data: CreatePaymentData
): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
    `INSERT INTO payments (
      idempotency_key, order_id, customer_id, amount, currency, state
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      data.idempotencyKey,
      data.orderId,
      data.customerId,
      data.amount,
      data.currency,
      "PENDING",
    ]
  );

  logger.info(
    {
      paymentId: result.rows[0].id,
      orderId: data.orderId,
      amount: data.amount,
    },
    "Payment created"
  );

  return result.rows[0];
}

export async function getPaymentById(id: string): Promise<PaymentRow | null> {
  const result = await query<PaymentRow>(
    "SELECT * FROM payments WHERE id = $1",
    [id]
  );

  return result.rows[0] || null;
}

export async function getPaymentByIdForUpdate(
  client: PoolClient,
  id: string
): Promise<PaymentRow | null> {
  const result = await client.query<PaymentRow>(
    "SELECT * FROM payments WHERE id = $1 FOR UPDATE",
    [id]
  );

  return result.rows[0] || null;
}

export async function getPaymentByOrderId(
  orderId: string
): Promise<PaymentRow | null> {
  const result = await query<PaymentRow>(
    "SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1",
    [orderId]
  );

  return result.rows[0] || null;
}

export async function getPaymentByIdempotencyKey(
  idempotencyKey: string
): Promise<PaymentRow | null> {
  const result = await query<PaymentRow>(
    "SELECT * FROM payments WHERE idempotency_key = $1",
    [idempotencyKey]
  );

  return result.rows[0] || null;
}

export async function getPaymentsByCustomerId(
  customerId: string,
  limit: number = 50
): Promise<PaymentRow[]> {
  const result = await query<PaymentRow>(
    "SELECT * FROM payments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2",
    [customerId, limit]
  );

  return result.rows;
}

export async function updatePaymentAuthorized(
  client: PoolClient,
  paymentId: string,
  authorizationId: string,
  cardLastFour?: string,
  cardBrand?: string
): Promise<PaymentRow> {
  return updatePaymentState(client, paymentId, "AUTHORIZED", {
    authorization_id: authorizationId,
    card_last_four: cardLastFour || null,
    card_brand: cardBrand || null,
    expires_at: (() => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      return expiresAt;
    })(),
    authorized_at: new Date(),
  });
}

export async function updatePaymentCaptured(
  client: PoolClient,
  paymentId: string,
  captureId: string
): Promise<PaymentRow> {
  return updatePaymentState(client, paymentId, "CAPTURED", {
    capture_id: captureId,
    captured_at: new Date(),
  });
}

export async function updatePaymentVoided(
  client: PoolClient,
  paymentId: string,
  voidId: string
): Promise<PaymentRow> {
  return updatePaymentState(client, paymentId, "VOIDED", {
    void_id: voidId,
    voided_at: new Date(),
  });
}

export async function updatePaymentRefunded(
  client: PoolClient,
  paymentId: string,
  refundId: string
): Promise<PaymentRow> {
  return updatePaymentState(client, paymentId, "REFUNDED", {
    refund_id: refundId,
    refunded_at: new Date(),
  });
}

/**
 * Core function to update payment state with validation
 */
export async function updatePaymentState(
  client: PoolClient,
  paymentId: string,
  newState: PaymentState,
  additionalFields: Partial<PaymentRow> = {}
): Promise<PaymentRow> {
  try {
    // Get current payment for validation
    const currentPayment = await getPaymentByIdForUpdate(client, paymentId);
    if (!currentPayment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Application-level validation (fast fail)
    PaymentStateMachine.validateTransition(currentPayment.state, newState);

    // Build dynamic SET clause for additional fields
    const setFields: string[] = ["state = $1", "updated_at = NOW()"];
    const values: any[] = [newState];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(additionalFields)) {
      setFields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(paymentId); // WHERE id = $paramIndex

    const query = `
      UPDATE payments 
      SET ${setFields.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await client.query<PaymentRow>(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Payment ${paymentId} not found during update`);
    }

    logger.info(
      {
        paymentId,
        oldState: currentPayment.state,
        newState,
        additionalFields: Object.keys(additionalFields),
      },
      "Payment state updated"
    );

    return result.rows[0];
  } catch (error: any) {
    if (error.message?.includes("Invalid transition")) {
      logger.warn(
        { paymentId, newState, error: error.message },
        "Invalid state transition blocked by database"
      );
      throw new PaymentStateError(error.message);
    }
    throw error;
  }
}

export async function updatePaymentError(
  client: PoolClient,
  paymentId: string,
  error: string
): Promise<void> {
  await client.query(
    `UPDATE payments 
     SET last_error = $2,
         failed_at = NOW(),
         retry_count = retry_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [paymentId, error]
  );

  logger.warn({ paymentId, error }, "Payment error recorded");
}

export async function updatePaymentExpiredAt(
  client: PoolClient,
  paymentId: string,
  expiresAt: string
): Promise<PaymentRow> {
  const expires_at = new Date(expiresAt);

  const result = await client.query<PaymentRow>(
    `UPDATE payments 
     SET expires_at = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, expires_at]
  );

  logger.info(
    {
      paymentId,
      expires_at,
    },
    "Payment expires_at updated"
  );

  return result.rows[0];
}

export async function getStuckPendingPayments(
  thresholdMs: number
): Promise<PaymentRow[]> {
  const result = await query<PaymentRow>(
    `SELECT * FROM payments 
     WHERE state = 'PENDING' 
       AND updated_at < NOW() - INTERVAL '1 millisecond' * $1
     ORDER BY created_at ASC
     LIMIT 100`,
    [thresholdMs]
  );

  return result.rows;
}

export async function getExpiredAuthorizations(): Promise<PaymentRow[]> {
  const result = await query<PaymentRow>(
    `SELECT * FROM payments 
     WHERE state = 'AUTHORIZED' 
       AND expires_at < NOW()
     ORDER BY expires_at ASC
     LIMIT 100`
  );

  return result.rows;
}

export async function deletePayment(
  client: PoolClient,
  paymentId: string
): Promise<void> {
  await client.query("DELETE FROM payments WHERE id = $1", [paymentId]);

  logger.info({ paymentId }, "Payment deleted");
}

/**
 * @deprecated Use PaymentStateMachine.canTransition() instead
 */
export function isValidStateTransition(
  currentState: PaymentState,
  newState: PaymentState
): boolean {
  return PaymentStateMachine.canTransition(currentState, newState);
}
