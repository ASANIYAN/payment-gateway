import {
  PaymentStateMachine,
  PaymentStateError,
  RecoveryPointError,
} from "../services/payment-state-machine";

describe("Payment State Machine", () => {
  describe("Payment State Transitions", () => {
    test("should allow valid state transitions", () => {
      expect(() =>
        PaymentStateMachine.validateTransition("PENDING", "AUTHORIZED")
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateTransition("AUTHORIZED", "CAPTURED")
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateTransition("AUTHORIZED", "VOIDED")
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateTransition("CAPTURED", "REFUNDED")
      ).not.toThrow();
    });

    test("should reject invalid state transitions", () => {
      expect(() =>
        PaymentStateMachine.validateTransition("PENDING", "CAPTURED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("PENDING", "VOIDED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("PENDING", "REFUNDED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("AUTHORIZED", "REFUNDED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("CAPTURED", "AUTHORIZED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("VOIDED", "AUTHORIZED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("VOIDED", "CAPTURED")
      ).toThrow(PaymentStateError);
      expect(() =>
        PaymentStateMachine.validateTransition("REFUNDED", "AUTHORIZED")
      ).toThrow(PaymentStateError);
    });

    test("should check if transitions are valid", () => {
      expect(PaymentStateMachine.canTransition("PENDING", "AUTHORIZED")).toBe(
        true
      );
      expect(PaymentStateMachine.canTransition("AUTHORIZED", "CAPTURED")).toBe(
        true
      );
      expect(PaymentStateMachine.canTransition("AUTHORIZED", "VOIDED")).toBe(
        true
      );
      expect(PaymentStateMachine.canTransition("CAPTURED", "REFUNDED")).toBe(
        true
      );

      expect(PaymentStateMachine.canTransition("PENDING", "CAPTURED")).toBe(
        false
      );
      expect(PaymentStateMachine.canTransition("VOIDED", "CAPTURED")).toBe(
        false
      );
      expect(PaymentStateMachine.canTransition("REFUNDED", "AUTHORIZED")).toBe(
        false
      );
    });

    test("should get valid next states", () => {
      expect(PaymentStateMachine.getValidNextStates("PENDING")).toEqual([
        "AUTHORIZED",
      ]);
      expect(PaymentStateMachine.getValidNextStates("AUTHORIZED")).toEqual([
        "CAPTURED",
        "VOIDED",
      ]);
      expect(PaymentStateMachine.getValidNextStates("CAPTURED")).toEqual([
        "REFUNDED",
      ]);
      expect(PaymentStateMachine.getValidNextStates("VOIDED")).toEqual([]);
      expect(PaymentStateMachine.getValidNextStates("REFUNDED")).toEqual([]);
    });
  });

  describe("State Utilities", () => {
    test("should identify final states", () => {
      expect(PaymentStateMachine.isFinalState("VOIDED")).toBe(true);
      expect(PaymentStateMachine.isFinalState("REFUNDED")).toBe(true);
      expect(PaymentStateMachine.isFinalState("PENDING")).toBe(false);
      expect(PaymentStateMachine.isFinalState("AUTHORIZED")).toBe(false);
      expect(PaymentStateMachine.isFinalState("CAPTURED")).toBe(false);
    });

    test("should identify active states", () => {
      expect(PaymentStateMachine.isActiveState("PENDING")).toBe(true);
      expect(PaymentStateMachine.isActiveState("AUTHORIZED")).toBe(true);
      expect(PaymentStateMachine.isActiveState("CAPTURED")).toBe(true);
      expect(PaymentStateMachine.isActiveState("VOIDED")).toBe(false);
      expect(PaymentStateMachine.isActiveState("REFUNDED")).toBe(false);
    });

    test("should check operation capabilities", () => {
      expect(PaymentStateMachine.canCapture("AUTHORIZED")).toBe(true);
      expect(PaymentStateMachine.canCapture("PENDING")).toBe(false);
      expect(PaymentStateMachine.canCapture("CAPTURED")).toBe(false);

      expect(PaymentStateMachine.canVoid("AUTHORIZED")).toBe(true);
      expect(PaymentStateMachine.canVoid("PENDING")).toBe(false);
      expect(PaymentStateMachine.canVoid("CAPTURED")).toBe(false);

      expect(PaymentStateMachine.canRefund("CAPTURED")).toBe(true);
      expect(PaymentStateMachine.canRefund("AUTHORIZED")).toBe(false);
      expect(PaymentStateMachine.canRefund("PENDING")).toBe(false);
    });
  });

  describe("Recovery Point Transitions", () => {
    test("should allow valid recovery point transitions", () => {
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition(
          "started",
          "payment_created"
        )
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition(
          "payment_created",
          "authorized"
        )
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition(
          "payment_created",
          "finished"
        )
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("authorized", "captured")
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("authorized", "voided")
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("captured", "refunded")
      ).not.toThrow();
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("captured", "finished")
      ).not.toThrow();
    });

    test("should reject invalid recovery point transitions", () => {
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("started", "authorized")
      ).toThrow(RecoveryPointError);
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("started", "finished")
      ).toThrow(RecoveryPointError);
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition(
          "payment_created",
          "captured"
        )
      ).toThrow(RecoveryPointError);
      expect(() =>
        PaymentStateMachine.validateRecoveryTransition("finished", "started")
      ).toThrow(RecoveryPointError);
    });

    test("should check if recovery point is finished", () => {
      expect(PaymentStateMachine.isFinishedRecoveryPoint("finished")).toBe(
        true
      );
      expect(PaymentStateMachine.isFinishedRecoveryPoint("started")).toBe(
        false
      );
      expect(PaymentStateMachine.isFinishedRecoveryPoint("authorized")).toBe(
        false
      );
    });
  });

  describe("State-Recovery Point Mapping", () => {
    test("should map payment states to recovery points", () => {
      expect(PaymentStateMachine.getRecoveryPointForState("PENDING")).toBe(
        "payment_created"
      );
      expect(PaymentStateMachine.getRecoveryPointForState("AUTHORIZED")).toBe(
        "authorized"
      );
      expect(PaymentStateMachine.getRecoveryPointForState("CAPTURED")).toBe(
        "captured"
      );
      expect(PaymentStateMachine.getRecoveryPointForState("VOIDED")).toBe(
        "voided"
      );
      expect(PaymentStateMachine.getRecoveryPointForState("REFUNDED")).toBe(
        "refunded"
      );
    });

    test("should map recovery points to payment states", () => {
      expect(
        PaymentStateMachine.getStateForRecoveryPoint("payment_created")
      ).toBe("PENDING");
      expect(PaymentStateMachine.getStateForRecoveryPoint("authorized")).toBe(
        "AUTHORIZED"
      );
      expect(PaymentStateMachine.getStateForRecoveryPoint("captured")).toBe(
        "CAPTURED"
      );
      expect(PaymentStateMachine.getStateForRecoveryPoint("voided")).toBe(
        "VOIDED"
      );
      expect(PaymentStateMachine.getStateForRecoveryPoint("refunded")).toBe(
        "REFUNDED"
      );
      expect(
        PaymentStateMachine.getStateForRecoveryPoint("started")
      ).toBeNull();
      expect(
        PaymentStateMachine.getStateForRecoveryPoint("finished")
      ).toBeNull();
    });
  });
});
