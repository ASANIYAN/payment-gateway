# Payment Gateway Architecture Tradeoffs

## Architecture: Why did you structure it this way?

A layered architecture approach was used where all tasks are divided into sub-tasks, with each sub-task assigned to a specific layer to perform dedicated functions. The architecture ensures independence between each layer, with services offered to higher layers without revealing implementation details.

The layers include:

- **Data Access Layer** (db folder): Handles all database operations and queries
- **External Service Layer** (services folder): Manages bank-client.ts and other external API integrations
- **Business Logic Layer** (routes folder): Contains payment processing logic and API endpoints
- **Background Process Layer** (jobs folder): Includes completer and reaper jobs for async operations

This separation allows independent testing and modification of each layer, making the system more maintainable and scalable.

## State Management: How do you track payment state? Why?

Payment state is tracked using a `state` field in the payments table, which stores the current state of each transaction (PENDING to AUTHORIZED to CAPTURED/VOIDED to REFUNDED). There is no separate table for tracking state changes - the current state serves as the single source of truth.

This approach allows us to know the current state of any payment and determine what transitions are valid for that payment state. Database-level triggers prevent invalid state transitions which helps prevent unprecedented errors and ensuring data integrity even under concurrent access.

The state tracking prevents issues like double-charging or invalid operations (e.g., trying to capture a voided payment) by enforcing strict transition rules at both the application and database levels.

## Failure Handling: What's your retry strategy? How do you handle partial failures?

**Retry Strategy**: The system uses exponential backoff with full jittering for retrying failed operations. This ensures that when errors occur simultaneously, retry attempts are spaced out adequately with different intervals, preventing system overload during recovery periods.

**Partial Failures**: The payment gateway serves as the source of truth for all transactions. Atomicity is implemented to ensure that all operations causing database updates either fail completely or succeed completely ensuring no partial states.

This implementation, coupled with idempotency, ensures that failures outside our system (like bank API failures) are adequately tracked and can be resumed when services come back online. The idempotency_keys table plays a crucial role in tracking and recovering from partial failures.

## Idempotency: How did you implement it? What edge cases did you consider?

Idempotency is implemented using a dedicated `idempotency_keys` table with the key as the primary key. Each idempotency key points to a transaction in the payments table and tracks recovery points throughout the payment lifecycle.

**Implementation Details**:

- Each request generates a unique idempotency key
- Recovery points track operation progress (started → payment_created → authorized → captured → finished)
- The system can safely replay operations from any recovery point

**Edge Cases Considered**:

- **Bank failures**: If the bank API fails after authorization but before we update our database
- **Database failures**: If our database fails while updating payment state
- **Crash recovery**: If the service crashes mid-operation, recovery points allow safe resumption
- **Concurrent requests**: Same idempotency key prevents duplicate processing
- **Network timeouts**: Partial responses can be safely retried using recovery points

The recovery point system ensures that no matter where a failure occurs, the operation can be safely resumed without creating duplicate charges or inconsistent states.

## What you'd do differently: With more time or in production, what would change?

**Audit Trail**: Create dedicated tables for audit logs and state transitions. This would be essential for compliance requirements and would allow administrators to track complete transaction history and state transition logs for better decision-making and regulatory reporting.

**Enhanced Monitoring**: Implement comprehensive metrics, alerting, and health checks to track payment success rates, error patterns, and system performance in real-time.

**Security Enhancements**: Add API rate limiting, and integration with fraud detection services to meet production security standards.
