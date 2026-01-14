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

CREATE OR REPLACE FUNCTION validate_payment_state_transition()
RETURNS trigger AS $$
BEGIN
    -- Allow initial state setting (INSERT)
    IF TG_OP = 'INSERT' THEN
        IF NEW.state != 'PENDING' THEN
            RAISE EXCEPTION 'New payments must start in PENDING state, got %', NEW.state;
        END IF;
        RETURN NEW;
    END IF;
    
    -- Validate state transitions (UPDATE)
    IF OLD.state = NEW.state THEN
        RETURN NEW; -- No state change, allow other field updates
    END IF;
    
    -- Define valid transitions
    CASE OLD.state
        WHEN 'PENDING' THEN
            IF NEW.state NOT IN ('AUTHORIZED') THEN
                RAISE EXCEPTION 'Invalid transition from PENDING to %. Allowed: AUTHORIZED', NEW.state;
            END IF;
            
        WHEN 'AUTHORIZED' THEN
            IF NEW.state NOT IN ('CAPTURED', 'VOIDED') THEN
                RAISE EXCEPTION 'Invalid transition from AUTHORIZED to %. Allowed: CAPTURED, VOIDED', NEW.state;
            END IF;
            
        WHEN 'CAPTURED' THEN
            IF NEW.state NOT IN ('REFUNDED') THEN
                RAISE EXCEPTION 'Invalid transition from CAPTURED to %. Allowed: REFUNDED', NEW.state;
            END IF;
            
        WHEN 'VOIDED' THEN
            RAISE EXCEPTION 'Cannot transition from VOIDED state. Final state reached.';
            
        WHEN 'REFUNDED' THEN
            RAISE EXCEPTION 'Cannot transition from REFUNDED state. Final state reached.';
            
        ELSE
            RAISE EXCEPTION 'Unknown payment state: %', OLD.state;
    END CASE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment state validation
CREATE TRIGGER payment_state_validation_trigger
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_state_transition();

-- Recovery point validation function
CREATE OR REPLACE FUNCTION validate_recovery_point_transition()
RETURNS trigger AS $$
BEGIN
    -- Allow initial recovery point setting (INSERT)
    IF TG_OP = 'INSERT' THEN
        IF NEW.recovery_point != 'started' THEN
            RAISE EXCEPTION 'New idempotency keys must start with recovery_point "started", got %', NEW.recovery_point;
        END IF;
        RETURN NEW;
    END IF;
    
    -- Validate recovery point transitions (UPDATE)
    IF OLD.recovery_point = NEW.recovery_point THEN
        RETURN NEW; -- No recovery point change, allow other field updates
    END IF;
    
    -- Define valid recovery point transitions
    CASE OLD.recovery_point
        WHEN 'started' THEN
            IF NEW.recovery_point NOT IN ('payment_created') THEN
                RAISE EXCEPTION 'Invalid recovery point transition from started to %. Allowed: payment_created', NEW.recovery_point;
            END IF;
            
        WHEN 'payment_created' THEN
            IF NEW.recovery_point NOT IN ('authorized', 'finished') THEN
                RAISE EXCEPTION 'Invalid recovery point transition from payment_created to %. Allowed: authorized, finished', NEW.recovery_point;
            END IF;
            
        WHEN 'authorized' THEN
            IF NEW.recovery_point NOT IN ('captured', 'voided', 'finished') THEN
                RAISE EXCEPTION 'Invalid recovery point transition from authorized to %. Allowed: captured, voided, finished', NEW.recovery_point;
            END IF;
            
        WHEN 'captured' THEN
            IF NEW.recovery_point NOT IN ('refunded', 'finished') THEN
                RAISE EXCEPTION 'Invalid recovery point transition from captured to %. Allowed: refunded, finished', NEW.recovery_point;
            END IF;
            
        WHEN 'voided' THEN
            IF NEW.recovery_point NOT IN ('finished') THEN
                RAISE EXCEPTION 'Invalid recovery point transition from voided to %. Allowed: finished', NEW.recovery_point;
            END IF;
            
        WHEN 'refunded' THEN
            IF NEW.recovery_point NOT IN ('finished') THEN
                RAISE EXCEPTION 'Invalid recovery point transition from refunded to %. Allowed: finished', NEW.recovery_point;
            END IF;
            
        WHEN 'finished' THEN
            RAISE EXCEPTION 'Cannot transition from finished recovery point. Final state reached.';
            
        ELSE
            RAISE EXCEPTION 'Unknown recovery point: %', OLD.recovery_point;
    END CASE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for recovery point validation
CREATE TRIGGER recovery_point_validation_trigger
    BEFORE INSERT OR UPDATE ON idempotency_keys
    FOR EACH ROW
    EXECUTE FUNCTION validate_recovery_point_transition();
