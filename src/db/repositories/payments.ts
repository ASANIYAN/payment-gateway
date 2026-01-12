import { query } from "..";
import { PoolClient } from "pg";
import logger from "@/utils/logger";
import { PaymentRow, PaymentState } from "@/types";

export type CreatePaymentData = {
  idempotencyKey: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
};

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
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Authorization expires in 7 days

  const result = await client.query<PaymentRow>(
    `UPDATE payments 
     SET state = 'AUTHORIZED',
         authorization_id = $2,
         card_last_four = $3,
         card_brand = $4,
         expires_at = $5,
         authorized_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      paymentId,
      authorizationId,
      cardLastFour || null,
      cardBrand || null,
      expiresAt,
    ]
  );

  logger.info(
    {
      paymentId,
      authorizationId,
      expiresAt,
    },
    "Payment authorized"
  );

  return result.rows[0];
}

export async function updatePaymentCaptured(
  client: PoolClient,
  paymentId: string,
  captureId: string
): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
    `UPDATE payments 
     SET state = 'CAPTURED',
         capture_id = $2,
         captured_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, captureId]
  );

  logger.info({ paymentId, captureId }, "Payment captured");

  return result.rows[0];
}

export async function updatePaymentVoided(
  client: PoolClient,
  paymentId: string,
  voidId: string
): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
    `UPDATE payments 
     SET state = 'VOIDED',
         void_id = $2,
         voided_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, voidId]
  );

  logger.info({ paymentId, voidId }, "Payment voided");

  return result.rows[0];
}

export async function updatePaymentRefunded(
  client: PoolClient,
  paymentId: string,
  refundId: string
): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
    `UPDATE payments 
     SET state = 'REFUNDED',
         refund_id = $2,
         refunded_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, refundId]
  );

  logger.info({ paymentId, refundId }, "Payment refunded");

  return result.rows[0];
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

export function isValidStateTransition(
  currentState: PaymentState,
  newState: PaymentState
): boolean {
  const validTransitions: Record<PaymentState, PaymentState[]> = {
    PENDING: ["AUTHORIZED"],
    AUTHORIZED: ["CAPTURED", "VOIDED"],
    CAPTURED: ["REFUNDED"],
    VOIDED: [],
    REFUNDED: [],
  };

  return validTransitions[currentState]?.includes(newState) || false;
}
