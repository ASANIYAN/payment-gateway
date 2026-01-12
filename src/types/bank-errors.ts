//  Bank error codes and their meanings

//  These error codes come from the mock bank API.
//  Each is classified as either permanent or transient.

export const PERMANENT_ERROR_CODES = [
  "invalid_card",
  "invalid_cvv",
  "invalid_amount",
  "card_expired",
  "insufficient_funds",
  "authorization_not_found",
  "authorization_expired",
  "authorization_already_used",
  "already_captured",
  "already_voided",
  "already_refunded",
  "amount_mismatch",
  "capture_not_found",
  "refund_not_found",
  "not_found",
] as const;

export const TRANSIENT_ERROR_CODES = [
  "internal_error",
  "missing_idempotency_key",
  "timeout",
  "network_error",
] as const;

export type PermanentErrorCode = (typeof PERMANENT_ERROR_CODES)[number];
export type TransientErrorCode = (typeof TRANSIENT_ERROR_CODES)[number];
export type BankErrorCode = PermanentErrorCode | TransientErrorCode;

export const ERROR_MESSAGES: Record<BankErrorCode, string> = {
  // Card errors
  invalid_card: "Card number is invalid",
  invalid_cvv: "CVV is incorrect",
  card_expired: "Card has expired",
  insufficient_funds: "Insufficient funds on card",

  // Amount errors
  invalid_amount: "Amount must be positive",
  amount_mismatch: "Amount does not match authorized amount",

  // Authorization errors
  authorization_not_found: "Authorization not found",
  authorization_expired: "Authorization has expired (7+ days)",
  authorization_already_used: "Authorization already captured or voided",

  // State errors
  already_captured: "Payment already captured",
  already_voided: "Payment already voided",
  already_refunded: "Payment already refunded",

  // Not found errors
  capture_not_found: "Capture not found",
  refund_not_found: "Refund not found",
  not_found: "Resource not found",

  // Transient errors
  internal_error: "Bank internal error, please retry",
  missing_idempotency_key: "Missing idempotency key",
  timeout: "Request timed out",
  network_error: "Network connectivity issue",
};
