import { PaymentState, RecoveryPoint } from "@/types";

export class PaymentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentStateError";
  }
}

export class RecoveryPointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryPointError";
  }
}

export class PaymentStateMachine {
  private static validTransitions: Record<PaymentState, PaymentState[]> = {
    PENDING: ["AUTHORIZED"],
    AUTHORIZED: ["CAPTURED", "VOIDED"],
    CAPTURED: ["REFUNDED"],
    VOIDED: [],
    REFUNDED: [],
  };

  private static validRecoveryTransitions: Record<
    RecoveryPoint,
    RecoveryPoint[]
  > = {
    started: ["payment_created"],
    payment_created: ["authorized", "finished"],
    authorized: ["captured", "voided", "finished"],
    captured: ["refunded", "finished"],
    voided: ["finished"],
    refunded: ["finished"],
    finished: [],
  };

  static canTransition(from: PaymentState, to: PaymentState): boolean {
    return this.validTransitions[from]?.includes(to) || false;
  }

  static validateTransition(from: PaymentState, to: PaymentState): void {
    if (!this.canTransition(from, to)) {
      throw new PaymentStateError(
        `Invalid state transition from ${from} to ${to}. ` +
          `Allowed transitions: ${this.validTransitions[from]?.join(", ") || "none"}`
      );
    }
  }

  static getValidNextStates(currentState: PaymentState): PaymentState[] {
    return this.validTransitions[currentState] || [];
  }

  static isFinalState(state: PaymentState): boolean {
    return ["VOIDED", "REFUNDED"].includes(state);
  }

  static isActiveState(state: PaymentState): boolean {
    return ["PENDING", "AUTHORIZED", "CAPTURED"].includes(state);
  }

  static canRefund(state: PaymentState): boolean {
    return state === "CAPTURED";
  }

  static canVoid(state: PaymentState): boolean {
    return state === "AUTHORIZED";
  }

  static canCapture(state: PaymentState): boolean {
    return state === "AUTHORIZED";
  }

  static canTransitionRecoveryPoint(
    from: RecoveryPoint,
    to: RecoveryPoint
  ): boolean {
    return this.validRecoveryTransitions[from]?.includes(to) || false;
  }

  static validateRecoveryTransition(
    from: RecoveryPoint,
    to: RecoveryPoint
  ): void {
    if (!this.canTransitionRecoveryPoint(from, to)) {
      throw new RecoveryPointError(
        `Invalid recovery point transition from ${from} to ${to}. ` +
          `Allowed transitions: ${this.validRecoveryTransitions[from]?.join(", ") || "none"}`
      );
    }
  }

  static getValidNextRecoveryPoints(
    currentPoint: RecoveryPoint
  ): RecoveryPoint[] {
    return this.validRecoveryTransitions[currentPoint] || [];
  }

  static isFinishedRecoveryPoint(point: RecoveryPoint): boolean {
    return point === "finished";
  }

  static getRecoveryPointForState(state: PaymentState): RecoveryPoint {
    const mapping: Record<PaymentState, RecoveryPoint> = {
      PENDING: "payment_created",
      AUTHORIZED: "authorized",
      CAPTURED: "captured",
      VOIDED: "voided",
      REFUNDED: "refunded",
    };

    return mapping[state];
  }

  static getStateForRecoveryPoint(point: RecoveryPoint): PaymentState | null {
    const mapping: Record<RecoveryPoint, PaymentState | null> = {
      started: null,
      payment_created: "PENDING",
      authorized: "AUTHORIZED",
      captured: "CAPTURED",
      voided: "VOIDED",
      refunded: "REFUNDED",
      finished: null,
    };

    return mapping[point];
  }
}
