"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMMISSION_BPS, toCents, getDealAmounts, assertDealPayable,
  participantRole, canReleaseToSeller
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
    { refundStatus: "manual_review" }
  ]) assert.equal(canReleaseToSeller({ ...releasable, ...patch }), false);
});
