"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMMISSION_BPS, toCents, getDealAmounts, assertDealPayable,
  participantRole, canReleaseToSeller
} = require("../src/payment-domain.js");

const deal = {
  status: "agreed",
  sellerUid: "seller-1",
  buyerUid: "buyer-1",
  participantUids: ["seller-1", "buyer-1"],
  quantity: 50,
  unitPrice: 4,
  totalAmount: 200,
  currency: "EUR"
};

test("commission is fixed at 5% and calculated in integer cents", () => {
  assert.equal(COMMISSION_BPS, 500);
  assert.deepEqual(getDealAmounts(deal), {
    currency: "eur", totalCents: 20000, commissionCents: 1000,
    sellerNetCents: 19000, commissionRate: 5
  });
});

test("rounds the commission to the nearest cent", () => {
  assert.equal(getDealAmounts({ ...deal, totalAmount: 10.01 }).commissionCents, 50);
});

test("rejects zero, negative, non-finite and unsafe amounts", () => {
  for (const value of [0, -1, NaN, Infinity, "not-money"]) {
    assert.throws(() => toCents(value));
  }
});

test("payment is allowed only after status agreed", () => {
  assert.doesNotThrow(() => assertDealPayable(deal));
  for (const status of ["proposed", "completed", "cancelled"]) {
    assert.throws(() => assertDealPayable({ ...deal, status }));
  }
});

test("payment rejects unsupported currencies and already paid deals", () => {
  assert.throws(() => assertDealPayable({ ...deal, currency: "usd" }));
  assert.throws(() => assertDealPayable({ ...deal, paymentStatus: "paid" }));
  assert.throws(() => assertDealPayable({ ...deal, paymentStatus: "refunded" }));
});

test("participant role is derived only from the actual participant UID fields", () => {
  assert.equal(participantRole(deal, "seller-1"), "seller");
  assert.equal(participantRole(deal, "buyer-1"), "buyer");
  assert.equal(participantRole(deal, "outsider"), null);
  assert.equal(participantRole({ ...deal, participantUids: ["buyer-1"] }, "seller-1"), null);
});

test("seller payout requires completed status, both confirmations and paid funds", () => {
  const releasable = {
    ...deal, status: "completed", sellerConfirmed: true,
    buyerConfirmed: true, paymentStatus: "paid"
  };
  assert.equal(canReleaseToSeller(releasable), true);
  for (const patch of [
    { status: "agreed" }, { sellerConfirmed: false }, { buyerConfirmed: false },
    { paymentStatus: "pending" }, { disputeStatus: "open" },
    { disputeStatus: "lost" }, { refundStatus: "refunded" }
  ]) {
    assert.equal(canReleaseToSeller({ ...releasable, ...patch }), false);
  }
});
