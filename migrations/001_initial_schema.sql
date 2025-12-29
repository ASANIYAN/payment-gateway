CREATE TABLE idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    request_path VARCHAR(100) NOT NULL,
    request_params JSONB NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    recovery_point VARCHAR(50) NOT NULL DEFAULT 'started',
    locked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT check_recovery_point CHECK (
        recovery_point IN ('started', 'payment_created', 'authorized', 'captured', 'voided', 'refunded', 'finished')
    )
);


CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL REFERENCES idempotency_keys(key) ON DELETE CASCADE,

    order_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,

    amount INTEGER NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    state VARCHAR(50) NOT NULL DEFAULT 'PENDING',

    authorization_id VARCHAR(255),
    capture_id VARCHAR(255),
    void_id VARCHAR(255),
    refund_id VARCHAR(255),

    card_last_four CHAR(4),
    card_brand VARCHAR(20),

    expires_at TIMESTAMP,

    last_error TEXT,
    failed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    authorized_at TIMESTAMP,
    captured_at TIMESTAMP,
    voided_at TIMESTAMP,
    refunded_at TIMESTAMP,

    CONSTRAINT check_positive_amount CHECK (amount > 0),
    CONSTRAINT check_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT check_state_values CHECK (state IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED'))
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_state_updated ON payments(state, updated_at);
CREATE INDEX idx_payments_idempotency_key ON payments(idempotency_key);
CREATE INDEX idx_payments_expires_at ON payments(expires_at) WHERE state = 'AUTHORIZED';
CREATE INDEX idx_idempotency_keys_created ON idempotency_keys(created_at);
CREATE INDEX idx_idempotency_keys_recovery ON idempotency_keys(recovery_point) WHERE recovery_point != 'finished';
