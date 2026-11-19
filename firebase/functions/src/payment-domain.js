"use strict";

const COMMISSION_BPS = 500;
const ALLOWED_CURRENCIES = new Set(["eur"]);

function toCents(value, label = "Montant") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new TypeError(label + " invalide.");
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1) throw new TypeError(label + " invalide.");
  return cents;
}

function getDealAmounts(deal) {
  if (!deal || typeof deal !== "object") throw new TypeError("Accord introuvable.");
  const quantity = Number(deal.quantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new TypeError("Quantité invalide.");
  const unitPriceCents = toCents(deal.unitPrice, "Prix unitaire");
  const totalCents = toCents(deal.totalAmount, "Montant total");
  const expectedTotalCents = quantity * unitPriceCents;
  if (!Number.isSafeInteger(expectedTotalCents) || totalCents !== expectedTotalCents) {
    throw new TypeError("Le montant total ne correspond pas à la quantité et au prix unitaire.");
  }
  const commissionCents = Math.round(totalCents * COMMISSION_BPS / 10000);
  return {
    currency: String(deal.currency || "eur").toLowerCase(),
    quantity,
    unitPriceCents,
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
  if (!deal.sellerUid || !deal.buyerUid || deal.sellerUid === deal.buyerUid ||
      !Array.isArray(deal.participantUids) ||
      deal.participantUids.length !== 2 ||
      !deal.participantUids.includes(deal.sellerUid) ||
      !deal.participantUids.includes(deal.buyerUid)) {
    throw new TypeError("Les participants de l'accord sont invalides.");
  }
  const amounts = getDealAmounts(deal);
  if (!ALLOWED_CURRENCIES.has(amounts.currency)) throw new TypeError("Devise non prise en charge.");
  if (deal.commissionRate !== undefined && Number(deal.commissionRate) !== 5) {
    throw new TypeError("Le taux de commission DealHunter doit être de 5 %.");
  }
  if (deal.commissionAmount !== undefined &&
      toCents(deal.commissionAmount, "Commission") !== amounts.commissionCents) {
    throw new TypeError("Le montant de commission ne correspond pas au taux DealHunter.");
  }
  return amounts;
}

function participantRole(deal, uid) {
  if (!deal || !uid || !Array.isArray(deal.participantUids) || !deal.participantUids.includes(uid)) return null;
  if (deal.sellerUid === uid) return "seller";
  if (deal.buyerUid === uid) return "buyer";
  return null;
}

function canReleaseToSeller(deal) {
  const disputeClear = !deal?.disputeStatus || ["none", "won"].includes(deal.disputeStatus);
  const refundClear = !deal?.refundStatus || deal.refundStatus === "none";
  return Boolean(deal && deal.status === "completed" &&
    deal.sellerConfirmed === true && deal.buyerConfirmed === true &&
    deal.paymentStatus === "paid" && disputeClear && refundClear);
}

module.exports = {
  COMMISSION_BPS, toCents, getDealAmounts, assertDealPayable,
  participantRole, canReleaseToSeller
};
