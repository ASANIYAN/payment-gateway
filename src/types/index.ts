export type PaymentState =
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "VOIDED"
  | "REFUNDED";

export type RecoveryPoint =
  | "started"
  | "payment_created"
  | "authorized"
  | "captured"
  | "voided"
  | "refunded"
  | "finished";

export interface IdempotencyKeyRow {
  key: string;
  request_path: string;
  request_params: Record<string, any>;
  response_status: number | null;
  response_body: Record<string, any> | null;
  recovery_point: RecoveryPoint;
  locked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type PaymentRow = {
  id: string; // UUID
  idempotency_key: string;
  order_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  state: PaymentState;
  authorization_id: string | null;
  capture_id: string | null;
  void_id: string | null;
  refund_id: string | null;
  card_last_four: string | null;
  card_brand: string | null;
  expires_at: Date | null;
  last_error: string | null;
  failed_at: Date | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  authorized_at: Date | null;
  captured_at: Date | null;
  voided_at: Date | null;
  refunded_at: Date | null;
};

export type CreatePaymentRequest = {
  order_id: string;
  customer_id: string;
  amount: number;
  currency: "USD";
  card_details: {
    number: string;
    expiry: string;
    cvv: string;
  };
};

export interface PaymentResponse {
  id: string;
  status: PaymentState;
  amount: number;
  currency: string;
}
