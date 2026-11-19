"use strict";

const COMMISSION_BPS = 500;
const ALLOWED_CURRENCIES = new Set(["eur"]);

function toCents(value, label = "Montant") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new TypeError(label + " invalide.");
  }
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1) {
    throw new TypeError(label + " invalide.");
  }
  return cents;
}

function getDealAmounts(deal) {
  if (!deal || typeof deal !== "object") throw new TypeError("Accord introuvable.");
  const totalCents = toCents(deal.totalAmount, "Montant total");
  const commissionCents = Math.round(totalCents * COMMISSION_BPS / 10000);
  return {
    currency: String(deal.currency || "eur").toLowerCase(),
    totalCents,
    commissionCents,
    sellerNetCents: totalCents - commissionCents,
    commissionRate: COMMISSION_BPS / 100
  };
}

function assertDealPayable(deal) {
  if (!deal || deal.status !== "agreed") {
    throw new TypeError("Le paiement est possible uniquement après accord des deux entreprises.");
  }
  if (deal.paymentStatus === "paid" || deal.paymentStatus === "refunded") {
    throw new TypeError("Cet accord a déjà été payé ou remboursé.");
  }
  const amounts = getDealAmounts(deal);
  if (!ALLOWED_CURRENCIES.has(amounts.currency)) {
    throw new TypeError("Devise non prise en charge.");
  }
  return amounts;
}

function participantRole(deal, uid) {
  if (!deal || !uid || !Array.isArray(deal.participantUids) || !deal.participantUids.includes(uid)) {
    return null;
  }
  if (deal.sellerUid === uid) return "seller";
  if (deal.buyerUid === uid) return "buyer";
  return null;
}

function canReleaseToSeller(deal) {
  return Boolean(
    deal &&
    deal.status === "completed" &&
    deal.sellerConfirmed === true &&
    deal.buyerConfirmed === true &&
    deal.paymentStatus === "paid" &&
    deal.disputeStatus !== "open" &&
    deal.disputeStatus !== "lost" &&
    deal.refundStatus !== "refunded"
  );
}

module.exports = {
  COMMISSION_BPS,
  toCents,
  getDealAmounts,
  assertDealPayable,
  participantRole,
  canReleaseToSeller
};
