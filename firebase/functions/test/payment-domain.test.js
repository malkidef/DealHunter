"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMMISSION_BPS, toCents, getDealAmounts, assertDealPayable,
  assertCheckoutSessionMatchesDeal, assertCheckoutSessionIdentityMatchesDeal, validateReconciliationDecision, resolveCheckoutPaymentEvent, participantRole, assertCanConfirmCompletion, assertCanOpenDispute, resolveDisputeEvent, resolveRefundState, resolveTransferCompletion, isCurrentCheckoutAttempt, canCreateSellerTransfer, canReleaseToSeller
} = require("../src/payment-domain.js");

const deal = {
  status: "agreed", sellerUid: "seller-1", buyerUid: "buyer-1",
  participantUids: ["seller-1", "buyer-1"], quantity: 50,
  unitPrice: 4, totalAmount: 200, commissionRate: 5,
  commissionAmount: 10, currency: "EUR"
};

test("commission is fixed at 5% and calculated in integer cents", () => {
  assert.equal(COMMISSION_BPS, 500);
  assert.deepEqual(getDealAmounts(deal), {
    currency: "eur", quantity: 50, unitPriceCents: 400,
    totalCents: 20000, commissionCents: 1000,
    sellerNetCents: 19000, commissionRate: 5
  });
});

test("rounds commission to nearest cent", () => {
  assert.equal(getDealAmounts({ ...deal, quantity: 1, unitPrice: 10.01, totalAmount: 10.01 }).commissionCents, 50);
});

test("rejects invalid monetary amounts", () => {
  for (const value of [0, -1, NaN, Infinity, "not-money"]) assert.throws(() => toCents(value));
});

test("rejects quantity or total inconsistent with unit price", () => {
  assert.throws(() => getDealAmounts({ ...deal, quantity: 0 }));
  assert.throws(() => getDealAmounts({ ...deal, totalAmount: 199.99 }));
  assert.throws(() => getDealAmounts({ ...deal, unitPrice: 4.01 }));
});

test("payment is allowed only after status agreed", () => {
  assert.doesNotThrow(() => assertDealPayable(deal));
  for (const status of ["proposed", "completed", "cancelled"]) {
    assert.throws(() => assertDealPayable({ ...deal, status }));
  }
});

test("payment rejects invalid participants, currency and commission", () => {
  assert.throws(() => assertDealPayable({ ...deal, currency: "usd" }));
  assert.throws(() => assertDealPayable({ ...deal, paymentStatus: "paid" }));
  assert.throws(() => assertDealPayable({ ...deal, paymentStatus: "refunded" }));
  assert.throws(() => assertDealPayable({ ...deal, paymentStatus: "manual_review" }));
  for (const state of ["pending", "checkout_creating", "checkout_created", "checkout_failed", "checkout_expired"]) {
    assert.doesNotThrow(() => assertDealPayable({ ...deal, paymentStatus: state }));
  }
  assert.throws(() => assertDealPayable({ ...deal, buyerUid: "seller-1" }));
  assert.throws(() => assertDealPayable({ ...deal, participantUids: ["seller-1"] }));
  assert.throws(() => assertDealPayable({ ...deal, commissionRate: 7 }));
  assert.throws(() => assertDealPayable({ ...deal, commissionAmount: 12 }));
});

test("Checkout webhook must match the exact deal, buyer, amount and currency", () => {
  const session = {
    metadata: { dealId: "deal-1", buyerUid: "buyer-1" },
    client_reference_id: "deal-1",
    amount_total: 20000,
    currency: "eur"
  };
  assert.equal(assertCheckoutSessionMatchesDeal(deal, session, "deal-1").totalCents, 20000);
  const attemptBoundDeal = { ...deal, checkoutAttempt: 3 };
  const attemptBoundSession = { ...session, metadata: { ...session.metadata, checkoutAttempt: "3" } };
  assert.equal(assertCheckoutSessionMatchesDeal(attemptBoundDeal, attemptBoundSession, "deal-1").totalCents, 20000);
  assert.throws(() => assertCheckoutSessionMatchesDeal(attemptBoundDeal, { ...attemptBoundSession, metadata: { ...attemptBoundSession.metadata, checkoutAttempt: "2" } }, "deal-1"));
  assert.throws(() => assertCheckoutSessionMatchesDeal(deal, { ...session, amount_total: 19999 }, "deal-1"));
  assert.throws(() => assertCheckoutSessionMatchesDeal(deal, { ...session, currency: "usd" }, "deal-1"));
  assert.throws(() => assertCheckoutSessionMatchesDeal(deal, { ...session, metadata: { ...session.metadata, buyerUid: "attacker" } }, "deal-1"));
  assert.throws(() => assertCheckoutSessionMatchesDeal(deal, { ...session, client_reference_id: "other-deal" }, "deal-1"));
});

test("Checkout identity validation permits stale attempts only for reconciliation", () => {
  const staleDeal = { ...deal, checkoutAttempt: 5 };
  const staleSession = {
    metadata: { dealId: "deal-1", buyerUid: "buyer-1", checkoutAttempt: "4" },
    client_reference_id: "deal-1", amount_total: 20000, currency: "eur",
    payment_intent: "pi_old"
  };
  assert.equal(assertCheckoutSessionIdentityMatchesDeal(staleDeal, staleSession, "deal-1").totalCents, 20000);
  assert.throws(() => assertCheckoutSessionMatchesDeal(staleDeal, staleSession, "deal-1"), /tentative de paiement/);
  assert.throws(() => assertCheckoutSessionIdentityMatchesDeal(staleDeal, { ...staleSession, metadata: { ...staleSession.metadata, buyerUid: "other" } }, "deal-1"));
});

test("paid stale Checkout attempts are held for review, and duplicate paid sessions are detected", () => {
  const current = { ...deal, checkoutAttempt: 4, paymentStatus: "checkout_created" };
  const staleSession = {
    metadata: { dealId: "deal-1", buyerUid: "buyer-1", checkoutAttempt: "3" },
    client_reference_id: "deal-1", amount_total: 20000, currency: "eur",
    payment_intent: "pi_stale"
  };
  assert.deepEqual(resolveCheckoutPaymentEvent(current, staleSession, "deal-1"), {
    action: "stale_checkout_paid", paymentIntentId: "pi_stale"
  });
  assert.deepEqual(resolveCheckoutPaymentEvent(
    current,
    { ...staleSession, metadata: { ...staleSession.metadata, checkoutAttempt: "4" } },
    "deal-1"
  ), { action: "mark_paid", paymentIntentId: "pi_stale" });
  assert.deepEqual(resolveCheckoutPaymentEvent(
    { ...current, paymentStatus: "paid", stripePaymentIntentId: "pi_current" },
    { ...staleSession, metadata: { ...staleSession.metadata, checkoutAttempt: "4" }, payment_intent: "pi_current" },
    "deal-1"
  ), { action: "already_paid", paymentIntentId: "pi_current" });
  assert.deepEqual(resolveCheckoutPaymentEvent(
    { ...current, paymentStatus: "paid", stripePaymentIntentId: "pi_current" },
    { ...staleSession, metadata: { ...staleSession.metadata, checkoutAttempt: "4" }, payment_intent: "pi_duplicate" },
    "deal-1"
  ), { action: "duplicate_payment", paymentIntentId: "pi_duplicate" });
  assert.throws(() => resolveCheckoutPaymentEvent(
    current, { ...staleSession, amount_total: 19999 }, "deal-1"
  ), /montants ou participants/);
  assert.deepEqual(resolveCheckoutPaymentEvent(
    current, { ...staleSession, payment_intent: null }, "deal-1"
  ), { action: "missing_payment_intent", paymentIntentId: null });
});

test("participant role is derived only from participant UID fields", () => {
  assert.equal(participantRole(deal, "seller-1"), "seller");
  assert.equal(participantRole(deal, "buyer-1"), "buyer");
  assert.equal(participantRole(deal, "outsider"), null);
  assert.equal(participantRole({ ...deal, participantUids: ["buyer-1"] }, "seller-1"), null);
});

test("seller payout requires completed status, both confirmations and paid funds", () => {
  const releasable = { ...deal, status: "completed", sellerConfirmed: true, buyerConfirmed: true, paymentStatus: "paid" };
  assert.equal(canReleaseToSeller(releasable), true);
  for (const patch of [
    { status: "agreed" }, { sellerConfirmed: false }, { buyerConfirmed: false },
    { paymentStatus: "pending" }, { disputeStatus: "open" },
    { disputeStatus: "lost" }, { disputeStatus: "under_review" },
    { refundStatus: "refunded" }, { refundStatus: "partial_refund_manual_review" },
    { refundStatus: "manual_review" },
    { paymentReviewStatus: "duplicate_payment" },
    { paymentReviewStatus: "stale_checkout_paid" }
  ]) assert.equal(canReleaseToSeller({ ...releasable, ...patch }), false);
});

test("completion confirmation requires a paid agreed deal and a valid participant", () => {
  const paid = { ...deal, status: "agreed", paymentStatus: "paid" };
  assert.equal(assertCanConfirmCompletion(paid, "seller-1"), "seller");
  assert.equal(assertCanConfirmCompletion(paid, "buyer-1"), "buyer");
  assert.throws(() => assertCanConfirmCompletion(paid, "intruder"), /ne participez pas/);
  assert.throws(() => assertCanConfirmCompletion({ ...paid, paymentStatus: "pending" }, "seller-1"), /paiement doit être confirmé/);
  assert.throws(() => assertCanConfirmCompletion({ ...paid, status: "proposed" }, "seller-1"), /acceptée avant/);
  assert.throws(() => assertCanConfirmCompletion({ ...paid, status: "cancelled" }, "seller-1"), /acceptée avant/);
});

test("completion confirmation is blocked during disputes and after any refund", () => {
  const paid = { ...deal, status: "agreed", paymentStatus: "paid" };
  for (const disputeStatus of ["open", "lost", "under_review"]) {
    assert.throws(
      () => assertCanConfirmCompletion({ ...paid, disputeStatus }, "buyer-1"),
      /litige/
    );
  }
  for (const refundStatus of ["refunded", "partial_refund_manual_review", "manual_review"]) {
    assert.throws(
      () => assertCanConfirmCompletion({ ...paid, refundStatus }, "buyer-1"),
      /remboursement/
    );
  }
  assert.equal(assertCanConfirmCompletion({ ...paid, disputeStatus: "won" }, "buyer-1"), "buyer");
  assert.equal(assertCanConfirmCompletion({ ...paid, disputeStatus: "none", refundStatus: "none" }, "buyer-1"), "buyer");
});


test("opening a dispute requires a paid deal and a participant", () => {
  const paid = { ...deal, status: "completed", paymentStatus: "paid" };
  assert.equal(assertCanOpenDispute(paid, "seller-1"), "seller");
  assert.equal(assertCanOpenDispute(paid, "buyer-1"), "buyer");
  assert.throws(() => assertCanOpenDispute(paid, "intruder"), /ne participez pas/);
  assert.throws(() => assertCanOpenDispute({ ...paid, paymentStatus: "pending" }, "buyer-1"), /vente payée/);
  assert.throws(() => assertCanOpenDispute({ ...paid, status: "cancelled" }, "buyer-1"), /clôturée/);
});

test("a dispute cannot be reopened or opened during or after a refund", () => {
  const paid = { ...deal, status: "completed", paymentStatus: "paid" };
  for (const disputeStatus of ["open", "won", "lost", "under_review"]) {
    assert.throws(() => assertCanOpenDispute({ ...paid, disputeStatus }, "buyer-1"), /déjà été ouvert/);
  }
  for (const refundStatus of ["refunded", "partial_refund_manual_review", "manual_review"]) {
    assert.throws(() => assertCanOpenDispute({ ...paid, refundStatus }, "buyer-1"), /remboursement/);
  }
  assert.equal(assertCanOpenDispute({ ...paid, disputeStatus: "none", refundStatus: "none" }, "buyer-1"), "buyer");
});


test("refund amounts are monotonic when Stripe events arrive out of order", () => {
  const partial = resolveRefundState(
    { refundedAmountCents: 4000 },
    { amount: 20000, amount_refunded: 2500 }
  );
  assert.deepEqual(partial, {
    status: "partial_refund_manual_review",
    refundedAmountCents: 4000,
    fullyRefunded: false,
    alreadyFinal: false
  });
  const full = resolveRefundState(
    { refundedAmountCents: 4000 },
    { amount: 20000, amount_refunded: 20000 }
  );
  assert.equal(full.status, "refunded");
  assert.equal(full.refundedAmountCents, 20000);
  assert.equal(full.fullyRefunded, true);
  assert.equal(full.alreadyFinal, false);
});

test("a stale partial refund event cannot downgrade a completed full refund", () => {
  const result = resolveRefundState(
    { refundStatus: "refunded", refundedAmountCents: 20000 },
    { amount: 20000, amount_refunded: 5000 }
  );
  assert.equal(result.status, "refunded");
  assert.equal(result.alreadyFinal, true);
  assert.equal(result.refundedAmountCents, 20000);
});

test("refund state rejects invalid Stripe monetary values", () => {
  assert.throws(() => resolveRefundState({}, { amount: 0, amount_refunded: 0 }));
  assert.throws(() => resolveRefundState({}, { amount: 20000, amount_refunded: -1 }));
  assert.throws(() => resolveRefundState({}, { amount: 20000, amount_refunded: 1.5 }));
});


test("a late dispute-created event cannot reopen an already closed dispute", () => {
  const result = resolveDisputeEvent(
    { stripeDisputeId: "dp_1", disputeStatus: "won", stripeDisputeEventCreated: 200 },
    "charge.dispute.created",
    { id: "dp_1", status: "needs_response" },
    150
  );
  assert.deepEqual(result, { apply: false, reason: "stale_event" });
});

test("a dispute-created event cannot overwrite a terminal result for the same dispute", () => {
  const result = resolveDisputeEvent(
    { stripeDisputeId: "dp_1", disputeStatus: "lost", stripeDisputeEventCreated: 100 },
    "charge.dispute.created",
    { id: "dp_1", status: "needs_response" },
    110
  );
  assert.deepEqual(result, { apply: false, reason: "already_closed" });
});

test("a closed dispute event only releases payout when Stripe confirms the dispute was won", () => {
  const won = resolveDisputeEvent(
    { stripeDisputeId: "dp_1", disputeStatus: "open", stripeDisputeEventCreated: 100 },
    "charge.dispute.closed",
    { id: "dp_1", status: "won" },
    120
  );
  assert.equal(won.apply, true);
  assert.equal(won.status, "won");
  assert.equal(won.shouldRetryPayout, true);
  const lost = resolveDisputeEvent(
    { stripeDisputeId: "dp_2", disputeStatus: "open", stripeDisputeEventCreated: 100 },
    "charge.dispute.closed",
    { id: "dp_2", status: "lost" },
    120
  );
  assert.equal(lost.status, "lost");
  assert.equal(lost.transferStatus, "blocked_dispute_lost");
  assert.equal(lost.shouldRetryPayout, undefined);
});

test("a dispute event for another dispute cannot replace an active dispute", () => {
  const result = resolveDisputeEvent(
    { stripeDisputeId: "dp_current", disputeStatus: "open", stripeDisputeEventCreated: 100 },
    "charge.dispute.closed",
    { id: "dp_other", status: "won" },
    120
  );
  assert.deepEqual(result, { apply: false, reason: "different_dispute" });
});

test("unknown dispute close statuses remain blocked for manual review", () => {
  const result = resolveDisputeEvent(
    { stripeDisputeId: "dp_1", disputeStatus: "open", stripeDisputeEventCreated: 100 },
    "charge.dispute.closed",
    { id: "dp_1", status: "warning_closed" },
    120
  );
  assert.equal(result.status, "under_review");
  assert.equal(result.transferStatus, "blocked_dispute");
  assert.equal(result.shouldRetryPayout, undefined);
});


test("transfer completion rechecks refunds and disputes after Stripe creates the transfer", () => {
  const eligible = {
    status: "completed", sellerConfirmed: true, buyerConfirmed: true,
    paymentStatus: "paid", disputeStatus: "none", refundStatus: "none"
  };
  assert.deepEqual(resolveTransferCompletion(eligible, "tr_1"), {
    status: "paid", shouldReverse: false
  });
  assert.deepEqual(resolveTransferCompletion({ ...eligible, refundStatus: "refunded" }, "tr_1"), {
    status: "reversal_pending", shouldReverse: true
  });
  for (const patch of [
    { refundStatus: "partial_refund_manual_review" },
    { disputeStatus: "open" },
    { disputeStatus: "under_review" },
    { disputeStatus: "lost" },
    { status: "agreed" }
  ]) {
    assert.deepEqual(resolveTransferCompletion({ ...eligible, ...patch }, "tr_1"), {
      status: "manual_review_after_transfer", shouldReverse: false
    });
  }
  assert.throws(() => resolveTransferCompletion(eligible, ""));
});


test("seller transfer cannot be created twice when a Stripe transfer ID already exists", () => {
  const eligible = {
    status: "completed", sellerConfirmed: true, buyerConfirmed: true,
    paymentStatus: "paid", disputeStatus: "none", refundStatus: "none"
  };
  assert.equal(canCreateSellerTransfer(eligible), true);
  assert.equal(canCreateSellerTransfer({ ...eligible, transferStatus: "processing" }), true);
  assert.equal(canCreateSellerTransfer({ ...eligible, stripeTransferId: "tr_existing" }), false);
  for (const transferStatus of ["paid", "reversed", "reversal_pending"]) {
    assert.equal(canCreateSellerTransfer({ ...eligible, transferStatus }), false);
  }
  assert.equal(canCreateSellerTransfer({ ...eligible, disputeStatus: "open" }), false);
});


test("checkout callbacks may only update the currently reserved attempt", () => {
  const deal = { checkoutAttempt: 4 };
  assert.equal(isCurrentCheckoutAttempt(deal, 4), true);
  assert.equal(isCurrentCheckoutAttempt(deal, "4"), true);
  assert.equal(isCurrentCheckoutAttempt(deal, 3), false);
  assert.equal(isCurrentCheckoutAttempt(deal, 0), false);
  assert.equal(isCurrentCheckoutAttempt(deal, "invalid"), false);
  assert.equal(isCurrentCheckoutAttempt(null, 4), false);
});


test("reconciliation decisions require fresh Stripe evidence and never imply a financial mutation", () => {
  const currentPaid = {
    identityMatches: true, currentSession: true, checkoutAttemptMatches: true,
    paidInStripe: true, paymentIntentId: "pi_1", paymentIntentMatches: true,
    dealStatus: "agreed", paidInDealHunter: false
  };
  assert.equal(validateReconciliationDecision("payment_confirmed", currentPaid), true);
  assert.equal(validateReconciliationDecision("refund_review", currentPaid), true);
  assert.throws(() => validateReconciliationDecision("payment_confirmed", {
    ...currentPaid, currentSession: false
  }));
  assert.throws(() => validateReconciliationDecision("payment_confirmed", {
    ...currentPaid, checkoutAttemptMatches: false
  }));
  assert.throws(() => validateReconciliationDecision("payment_confirmed", {
    ...currentPaid, paymentIntentMatches: false
  }));
  assert.throws(() => validateReconciliationDecision("payment_confirmed", {
    ...currentPaid, dealStatus: "rejected"
  }));
  assert.throws(() => validateReconciliationDecision("refund_review", {
    ...currentPaid, paidInStripe: false
  }));
  assert.throws(() => validateReconciliationDecision("duplicate_payment", {
    ...currentPaid, currentSession: true, paymentIntentMatches: true, paidInDealHunter: false
  }));
  assert.equal(validateReconciliationDecision("duplicate_payment", {
    ...currentPaid, currentSession: false
  }), true);
  assert.equal(validateReconciliationDecision("not_paid", {
    identityMatches: true, paidInStripe: false
  }), true);
  assert.equal(validateReconciliationDecision("manual_review", {
    identityMatches: false
  }), true);
  assert.throws(() => validateReconciliationDecision("not_paid", {
    identityMatches: true, paidInStripe: true
  }));
});
