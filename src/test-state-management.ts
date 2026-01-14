import {
  PaymentStateMachine,
  PaymentStateError,
  RecoveryPointError,
} from "@/services/payment-state-machine";
import logger from "@/utils/logger";

async function main() {
  logger.info("Testing Payment State Management...");

  logger.info("=== Testing Valid State Transitions ===");

  try {
    PaymentStateMachine.validateTransition("PENDING", "AUTHORIZED");
    logger.info("✓ PENDING → AUTHORIZED: Valid");

    PaymentStateMachine.validateTransition("AUTHORIZED", "CAPTURED");
    logger.info("✓ AUTHORIZED → CAPTURED: Valid");

    PaymentStateMachine.validateTransition("AUTHORIZED", "VOIDED");
    logger.info("✓ AUTHORIZED → VOIDED: Valid");

    PaymentStateMachine.validateTransition("CAPTURED", "REFUNDED");
    logger.info("✓ CAPTURED → REFUNDED: Valid");
  } catch (error) {
    logger.error({ error }, "Unexpected error in valid transitions");
  }

  logger.info("=== Testing Invalid State Transitions ===");

  const invalidTransitions = [
    ["PENDING", "CAPTURED"],
    ["PENDING", "VOIDED"],
    ["PENDING", "REFUNDED"],
    ["AUTHORIZED", "REFUNDED"],
    ["CAPTURED", "AUTHORIZED"],
    ["VOIDED", "AUTHORIZED"],
    ["VOIDED", "CAPTURED"],
    ["REFUNDED", "AUTHORIZED"],
  ];

  for (const [from, to] of invalidTransitions) {
    try {
      PaymentStateMachine.validateTransition(from as any, to as any);
      logger.error(`✗ ${from} → ${to}: Should have failed but didn't!`);
    } catch (error) {
      if (error instanceof PaymentStateError) {
        logger.info(`✓ ${from} → ${to}: Correctly blocked (${error.message})`);
      } else {
        logger.error({ error }, `✗ ${from} → ${to}: Unexpected error type`);
      }
    }
  }

  // Test state utilities
  logger.info("=== Testing State Utilities ===");

  logger.info(
    {
      voidedIsFinal: PaymentStateMachine.isFinalState("VOIDED"),
      refundedIsFinal: PaymentStateMachine.isFinalState("REFUNDED"),
    },
    "Final states"
  );

  logger.info(
    {
      pendingIsActive: PaymentStateMachine.isActiveState("PENDING"),
      authorizedIsActive: PaymentStateMachine.isActiveState("AUTHORIZED"),
    },
    "Active states"
  );

  logger.info(
    {
      canCaptureAuthorized: PaymentStateMachine.canCapture("AUTHORIZED"),
    },
    "Capture capability"
  );

  logger.info(
    {
      canVoidAuthorized: PaymentStateMachine.canVoid("AUTHORIZED"),
    },
    "Void capability"
  );

  logger.info(
    {
      canRefundCaptured: PaymentStateMachine.canRefund("CAPTURED"),
    },
    "Refund capability"
  );

  // Test recovery point transitions
  logger.info("=== Testing Recovery Point Transitions ===");

  try {
    PaymentStateMachine.validateRecoveryTransition(
      "started",
      "payment_created"
    );
    logger.info("✓ started → payment_created: Valid");

    PaymentStateMachine.validateRecoveryTransition(
      "payment_created",
      "authorized"
    );
    logger.info("✓ payment_created → authorized: Valid");

    PaymentStateMachine.validateRecoveryTransition("authorized", "captured");
    logger.info("✓ authorized → captured: Valid");

    PaymentStateMachine.validateRecoveryTransition("captured", "finished");
    logger.info("✓ captured → finished: Valid");
  } catch (error) {
    logger.error({ error }, "Unexpected error in valid recovery transitions");
  }

  // Test invalid recovery point transitions
  const invalidRecoveryTransitions = [
    ["started", "authorized"],
    ["started", "finished"],
    ["payment_created", "captured"],
    ["finished", "started"],
  ];

  for (const [from, to] of invalidRecoveryTransitions) {
    try {
      PaymentStateMachine.validateRecoveryTransition(from as any, to as any);
      logger.error(
        `✗ Recovery ${from} → ${to}: Should have failed but didn't!`
      );
    } catch (error) {
      if (error instanceof RecoveryPointError) {
        logger.info(`✓ Recovery ${from} → ${to}: Correctly blocked`);
      } else {
        logger.error(
          { error },
          `✗ Recovery ${from} → ${to}: Unexpected error type`
        );
      }
    }
  }

  // Test state-recovery point mapping
  logger.info("=== Testing State-Recovery Mapping ===");

  const stateToRecovery = {
    PENDING: "payment_created",
    AUTHORIZED: "authorized",
    CAPTURED: "captured",
    VOIDED: "voided",
    REFUNDED: "refunded",
  };

  for (const [state, expectedRecovery] of Object.entries(stateToRecovery)) {
    const actualRecovery = PaymentStateMachine.getRecoveryPointForState(
      state as any
    );
    if (actualRecovery === expectedRecovery) {
      logger.info(
        { state, recovery: expectedRecovery },
        "Correct state-recovery mapping"
      );
    } else {
      logger.error(
        {
          state,
          expected: expectedRecovery,
          actual: actualRecovery,
        },
        "Incorrect state-recovery mapping"
      );
    }
  }

  logger.info("State management testing completed!");
}

// Run the test if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error({ error }, "State management test failed");
    process.exit(1);
  });
}

export { main as testStateManagement };
