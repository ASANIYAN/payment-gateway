import {
  getStuckPendingPayments,
  getExpiredAuthorizations,
  updatePaymentExpiredAt,
} from "../db/repositories/payments";
import { bankClient, BankPermanentError } from "../services/bank-client";
import { isDatabaseConnectionError, withTransaction } from "../db";
import { updatePaymentAuthorized } from "../db/repositories/payments";
import { updateRecoveryPoint } from "../db/repositories/idempotency-keys";
import { createChildLogger } from "../utils/logger";
import { config } from "../config";

// Completer job finds and recovers stuck payments
//   Scenarios handled:
//   Payment stuck in PENDING with authorization_id (crash after bank succeeded)
//   Payment stuck in PENDING without authorization_id (needs manual review)
//   Authorization expired (mark for monitoring)

export async function runCompleter() {
  const log = createChildLogger({ job: "completer" });

  log.info("Completer job started");

  try {
    const stuckPayments = await getStuckPendingPayments(
      config.jobs.stuckPaymentThresholdMs
    );

    log.info({ count: stuckPayments.length }, "Found stuck PENDING payments");

    let recoveredCount = 0;
    let failedCount = 0;

    for (const payment of stuckPayments) {
      const paymentLog = createChildLogger({
        job: "completer",
        paymentId: payment.id,
        idempotencyKey: payment.idempotency_key,
        authorizationId: payment.authorization_id,
      });

      try {
        paymentLog.info("Processing stuck payment");

        // Payment has authorization_id (bank succeeded, we crashed)
        if (payment.authorization_id) {
          paymentLog.debug(
            "Payment has authorization_id, checking status with bank"
          );

          try {
            const bankStatus = await bankClient.getAuthorizationStatus(
              payment.authorization_id
            );

            paymentLog.info(
              {
                status: bankStatus.status,
                expiresAt: bankStatus.expires_at,
              },
              "Bank authorization status retrieved"
            );

            // If bank says approved and we're still PENDING, update to AUTHORIZED
            if (
              bankStatus.status === "approved" &&
              payment.state === "PENDING"
            ) {
              await withTransaction(async (client) => {
                await updatePaymentAuthorized(
                  client,
                  payment.id,
                  payment.authorization_id!,
                  payment.card_last_four || undefined,
                  payment.card_brand || undefined
                );

                await updateRecoveryPoint(
                  client,
                  payment.idempotency_key,
                  "authorized"
                );

                paymentLog.info(
                  "Recovered stuck payment - updated to AUTHORIZED"
                );
                recoveredCount++;
              });
            } else {
              paymentLog.warn(
                { bankStatus: bankStatus.status, ourState: payment.state },
                "Payment state mismatch or unexpected status"
              );
            }
          } catch (error) {
            if (error instanceof BankPermanentError) {
              paymentLog.warn(
                { error: error.message },
                "Bank reports authorization not found or expired"
              );

              failedCount++;
            } else {
              paymentLog.warn(
                { error },
                "Transient error checking bank status"
              );
            }
          }
        }
        // Payment has no authorization_id
        else {
          paymentLog.warn(
            {
              age: Date.now() - new Date(payment.created_at).getTime(),
              state: payment.state,
            },
            "Payment stuck with no authorization_id - cannot recover automatically"
          );

          // needs manual review
          // The payment was created but authorization_id was not gotten from bank
          // Could be:
          // Bank was down and never responded
          // We crashed before calling bank
          // Network issue prevented communication

          failedCount++;
        }
      } catch (error) {
        if (isDatabaseConnectionError(error)) {
          log.fatal("Database connection lost. Terminating job.");
          throw error;
        }

        paymentLog.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          "Individual record processing failed"
        );
        failedCount++;
      }
    }

    log.info(
      {
        total: stuckPayments.length,
        recovered: recoveredCount,
        failed: failedCount,
      },
      "Finished processing stuck PENDING payments"
    );

    // Check expired authorizations
    const expiredAuths = await getExpiredAuthorizations();

    log.info(
      { count: expiredAuths.length },
      "Found expired authorizations (>7 days)"
    );

    let expiredVerified = 0;
    let stillValid = 0;

    for (const payment of expiredAuths) {
      const paymentLog = createChildLogger({
        job: "completer",
        paymentId: payment.id,
        authorizationId: payment.authorization_id,
        expiresAt: payment.expires_at,
      });

      try {
        if (!payment.authorization_id) {
          paymentLog.warn("Payment has no authorization_id, skipping");
          continue;
        }

        // Verify expiration with bank
        try {
          const bankStatus = await bankClient.getAuthorizationStatus(
            payment.authorization_id
          );

          // Check if bank's expires_at matches ours
          const bankExpiresAt = new Date(bankStatus.expires_at);
          const now = new Date();

          if (bankExpiresAt > now) {
            await withTransaction(async (client) => {
              // Bank says still valid
              paymentLog.warn(
                {
                  ourExpiry: payment.expires_at,
                  bankExpiry: bankStatus.expires_at,
                },
                "payment still valid"
              );

              await updatePaymentExpiredAt(
                client,
                payment.id,
                bankStatus.expires_at
              );

              stillValid++;
            });
          } else {
            paymentLog.info("Authorization expiration confirmed with bank");
            expiredVerified++;
          }
        } catch (error) {
          if (error instanceof BankPermanentError) {
            paymentLog.info(
              { error: error.message },
              "Bank confirms authorization expired or not found"
            );
            expiredVerified++;
          } else {
            paymentLog.warn({ error }, "Could not verify expiration with bank");
          }
        }
      } catch (error) {
        paymentLog.error({ error }, "Failed to process expired authorization");
      }
    }

    log.info(
      {
        total: expiredAuths.length,
        verified: expiredVerified,
        stillValid: stillValid,
      },
      "Finished checking expired authorizations"
    );

    log.info("Completer job completed successfully");
  } catch (error) {
    log.error({ error }, "Completer job failed");
  }
}
