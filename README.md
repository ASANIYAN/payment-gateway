# Payment Gateway

A payment processing gateway built with TypeScript, Express.js, and PostgreSQL that handles secure payment operations with comprehensive error handling, transaction safety, and recovery mechanisms.

## Description

The Payment Gateway provides a robust API for processing payments through external bank services. It implements idempotency to prevent duplicate transactions, state machine validation for payment lifecycle management, and background job processing for handling stuck payments and cleanup operations.

## Architecture

The application follows a **Layered Architecture** with **Domain-Driven Design** principles:

1. **API Layer** - RESTful endpoints with request validation and error handling
2. **Service Layer** - Business logic, state machine, and external bank integration
3. **Repository Layer** - Database operations with proper transaction management
4. **Infrastructure Layer** - Database connections, logging, configuration, and background jobs

Key architectural patterns:

- **State Machine Pattern** for payment lifecycle management
- **Repository Pattern** for data access abstraction
- **Idempotency Keys** for duplicate request prevention
- **Background Jobs** for async processing and recovery
- **Circuit Breaker Pattern** for external service resilience

## Features

### Core Payment Operations

- **Payment Authorization** - Secure card payment authorization
- **Payment Capture** - Capture authorized payments
- **Payment Void** - Cancel authorized payments
- **Payment Refund** - Process refunds for captured payments

### Reliability & Safety

- **Idempotency Keys** - Prevent duplicate operations
- **Transaction Safety** - ACID-compliant database operations
- **State Validation** - Strict payment state transitions
- **Retry Logic** - Automatic retries for transient failures
- **Circuit Breaker** - Protection against external service failures

### Monitoring & Recovery

- **Health Checks** - System and database health monitoring
- **Structured Logging** - Comprehensive request/response logging
- **Background Jobs** - Automatic recovery of stuck payments
- **Database Cleanup** - Expired payment cleanup via reaper job

### Security Features

- **Request Validation** - Schema validation with Zod
- **Security Headers** - XSS, CSRF, and clickjacking protection
- **Request Timeouts** - Prevent hanging requests
- **Error Sanitization** - Safe error responses without sensitive data

## Installation

```bash
npm install
```

## Docker Setup

The project includes Docker configuration for easy development and deployment.

### Prerequisites

#### macOS/Linux

- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Docker Compose is included with Docker Desktop

#### Windows

- Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
- Ensure WSL2 is enabled (recommended for better performance)
- Docker Compose is included with Docker Desktop

### Quick Start with Docker

1. **Clone the repository and navigate to the project directory**

2. **Start the services using Docker Compose:**

**macOS/Linux:**

```bash
docker-compose up -d
```

**Windows (Command Prompt/PowerShell):**

```cmd
docker-compose up -d
```

This will:

- Start a PostgreSQL database container on port 5432
- Automatically run database migrations on first startup
- Start the application container on port 3000
- Set up proper networking between containers

3. **Stop the services:**

```bash
docker-compose down
```

### Docker Services

The `docker-compose.yml` defines two services:

#### PostgreSQL Database

- **Image:** postgres:15
- **Container Name:** payment-gateway-db
- **Port:** 5432
- **Database:** payment_gateway
- **Credentials:** postgres/0000
- **Auto-migration:** Runs SQL files from `/migrations` on first startup

## Bank Service Setup

This payment gateway requires a bank service to process payments. The bank service simulates external payment processor APIs and provides endpoints for authorization, capture, void, and refund operations.

### Setting up the Bank Service

1. **Clone and set up the bank service:**

   Visit the bank service repository and follow the setup instructions:

   **[Payment Gateway Bank Service](https://github.com/ASANIYAN/payment-gateway-bank)**

2. **Start the bank service:**

   The bank service should be running on `http://localhost:8787` (default configuration).

3. **Verify bank service connection:**

   Once both services are running, the payment gateway will automatically connect to the bank service for processing payments.

### Bank Service Integration

The payment gateway integrates with the bank service for:

- **Authorization** - Validating and authorizing payment requests
- **Capture** - Capturing authorized payments
- **Void** - Canceling authorized payments
- **Refund** - Processing refunds for captured payments
- **Status Queries** - Checking payment status and recovery

The bank service provides test card numbers and scenarios for development and testing purposes.

## Configuration

Create a `.env` file with the required environment variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/payment_gateway

# Bank API
BANK_API_URL=http://localhost:8787
BANK_API_TIMEOUT=10000
BANK_API_MAX_RETRIES=3

# Logging
LOG_LEVEL=info

# Jobs
COMPLETER_INTERVAL_MS=1200
REAPER_INTERVAL_MS=360
STUCK_PAYMENT_THRESHOLD_MS=3000
CLEANUP_AGE_HOURS=7
```

## Database Setup

Run the database migrations to set up the required tables:

```bash
npm run migrate
```

To reset the database (development only):

```bash
npm run db:reset
```

## Usage

### Docker (Recommended for Development)

Start the entire stack with Docker Compose:

```bash
# Start all services (database + application)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

The application will be available at `http://localhost:3000` with the database automatically configured.

### Local Development

Start the development server with hot reload:

```bash
npm run dev
```

### Production

Build and start the production server:

```bash
npm run build
npm start
```

### API Endpoints

#### Payment Authorization

```http
POST /api/v1/payments/authorize
Content-Type: application/json
Idempotency-Key: unique-key-123

{
  "order_id": "order_123",
  "customer_id": "customer_456",
  "amount": 5000,
  "currency": "USD",
  "card": {
    "number": "4111111111111111",
    "cvv": "123",
    "expiry_month": 12,
    "expiry_year": 2025
  }
}
```

#### Payment Capture

```http
POST /api/v1/payments/:paymentId/capture
Content-Type: application/json
Idempotency-Key: unique-capture-key

{
  "amount": 5000
}
```

#### Payment Void

```http
POST /api/v1/payments/:paymentId/void
Idempotency-Key: unique-void-key
```

#### Payment Refund

```http
POST /api/v1/payments/:paymentId/refund
Content-Type: application/json
Idempotency-Key: unique-refund-key

{
  "amount": 5000,
  "reason": "Customer request"
}
```

#### Health Check

```http
GET /health
```

### Payment States

The payment system follows a strict state machine:

- **PENDING** --> **AUTHORIZED** (via authorize)
- **AUTHORIZED** --> **CAPTURED** (via capture)
- **AUTHORIZED** --> **VOIDED** (via void)
- **CAPTURED** --> **REFUNDED** (via refund)

## How It Works

The payment gateway processes transactions through a series of validation, state management, and external integration steps:

### Request Processing Flow

```mermaid
flowchart TD
    Req([Inbound Request]) --> Auth{Auth & Validate}
    Auth -- "Fail (400)" --> E1[Error Response]

    Auth -- "Pass" --> IK{Check Idempotency}
    IK -- "Key Exists" --> IK_Res[Return Cached Response]

    IK -- "New Key" --> DB_Init[Create Record: PENDING]

    DB_Init --> SM{State Machine Valid?}
    SM -- "Invalid (422)" --> E2[State Conflict Error]

    SM -- "Valid" --> Bank[External Bank API]

    Bank -- "Success" --> Update[Update State: AUTHORIZED]
    Bank -- "Decline" --> Reject[Update State: DECLINED]

    Bank -- "Timeout/5xx" --> Retry[Retry Strategy]
    Retry -- "Max Retries Hit" --> Stuck[Mark as STUCK]

    Stuck -.->|Async Recovery| Jobs[Completer Job]
    Update --> Final[Return 200/201 Success]
    Reject --> Final
```

### System Architecture Overview

```mermaid
flowchart TB
    OS((FicMart OS))

    subgraph gateway["Your Payment Gateway (Node.js/TS)"]
        direction TB
        API[API Layer / Routes]
        SM[State Machine]
        IK[(Idempotency & Payments DB)]
        Jobs[Background Jobs: Reaper/Completer]
        BC[Bank Client]

        API --> SM
        SM <--> IK
        Jobs -.->|Reconcile| IK
        Jobs -.->|Status Check| BC
        SM --> BC
    end

    subgraph bank["Mock Bank API (External)"]
        BA[Bank API]
        BD[(Bank DB)]
        BA <--> BD
    end

    OS ==>|"POST /authorize"| API
    BC ==>|HTTP + Idempotency-Key| BA

    style gateway fill:#f9f9f9,stroke:#333,stroke-width:2px
    style bank fill:#f0f4ff,stroke:#333,stroke-width:2px
```

## Testing

The project includes comprehensive tests covering core functionality:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Coverage

- **Configuration validation** - Environment and settings validation
- **Database operations** - Connection, transactions, and queries
- **Repository layer** - Payment and idempotency key operations
- **State machine** - Payment state transitions and validation
- **Background jobs** - Stuck payment recovery and cleanup
- **Logging system** - Structured logging and child loggers

## Background Jobs

The system includes automated background processes:

### Completer Job

- Detects and recovers stuck payments
- Validates payment status with bank service
- Updates payment states based on external confirmation
- Runs every 5 minutes (configurable)

### Reaper Job

- Cleans up expired payments and idempotency keys
- Maintains database performance
- Configurable retention periods
- Runs daily (configurable)

## Database Schema

### Core Tables

- **idempotency_keys** - Request deduplication and recovery tracking
- **payments** - Payment records with full lifecycle tracking

### Key Features

- **UUID primary keys** for security
- **JSONB columns** for flexible metadata storage
- **Constraints** for data integrity
- **Indexes** for query performance
- **Foreign keys** for referential integrity

## Error Handling

The gateway implements comprehensive error handling:

- **Validation Errors** - 400 Bad Request with detailed field errors
- **Idempotency Conflicts** - 409 Conflict for duplicate keys
- **Not Found** - 404 for missing resources
- **Bank Errors** - Mapped to appropriate HTTP status codes
- **Internal Errors** - 500 with sanitized error messages
- **Timeouts** - 408 Request Timeout for slow operations

## Logging

Structured logging with Pino provides:

- **Request/Response logging** - Full HTTP request lifecycle
- **Database query logging** - Performance monitoring
- **Error tracking** - Detailed error context
- **Business events** - Payment state changes and job execution
- **Child loggers** - Contextual logging with request IDs

## Production Considerations

### Performance

- Connection pooling with configurable limits
- Database query optimization with proper indexes
- Background job processing for non-blocking operations
- Request timeout management

### Security

- Input validation and sanitization
- SQL injection prevention via parameterized queries
- Security headers for XSS/CSRF protection
- Sensitive data exclusion from logs

### Reliability

- Transaction rollback on failures
- Automatic retry logic for transient errors
- Circuit breaker for external service protection
- Health checks for monitoring

### Scalability

- Stateless application design
- Database connection pooling
- Background job queue for async processing
- Horizontal scaling support

## Requirements

- Node.js 18+
- TypeScript 5.0+
- PostgreSQL 14+ (or Docker for containerized setup)
- External bank service API access

### Optional Requirements

- **Docker & Docker Compose** - For containerized development and deployment

## Dependencies

### Core Dependencies

- **Express.js** - Web framework
- **PostgreSQL** - Database with `pg` driver
- **Zod** - Schema validation
- **Pino** - Structured logging
- **pg-boss** - Background job processing
- **Axios** - HTTP client for bank API

### Development Dependencies

- **TypeScript** - Static typing
- **Jest** - Testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting
