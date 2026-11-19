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
  const allowedPaymentStates = [undefined, null, "none", "pending", "checkout_creating", "checkout_created", "checkout_failed", "checkout_expired"];
  if (!allowedPaymentStates.includes(deal.paymentStatus)) {
    throw new TypeError("L'état de paiement de cet accord ne permet pas un nouveau paiement.");
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

function assertCheckoutSessionMatchesDeal(deal, session, dealId) {
  if (!deal || !session || !dealId) throw new TypeError("Session de paiement invalide.");
  const amounts = getDealAmounts(deal);
  if (session.metadata?.dealId !== dealId ||
      session.metadata?.buyerUid !== deal.buyerUid ||
      (session.metadata?.checkoutAttempt !== undefined &&
       Number(session.metadata.checkoutAttempt) !== Number(deal.checkoutAttempt)) ||
      session.client_reference_id !== dealId ||
      session.amount_total !== amounts.totalCents ||
      String(session.currency || "").toLowerCase() !== amounts.currency) {
    throw new TypeError("Les montants ou participants du paiement ne correspondent pas à la vente.");
  }
  return amounts;
}

function participantRole(deal, uid) {
  if (!deal || !uid || !Array.isArray(deal.participantUids) || !deal.participantUids.includes(uid)) return null;
  if (deal.sellerUid === uid) return "seller";
  if (deal.buyerUid === uid) return "buyer";
  return null;
}

function assertCanConfirmCompletion(deal, uid) {
  const role = participantRole(deal, uid);
  if (!role) throw new TypeError("Vous ne participez pas à cette vente.");
  if (!["agreed", "completed"].includes(deal.status)) {
    throw new TypeError("La vente doit être acceptée avant la confirmation de réalisation.");
  }
  if (deal.paymentStatus !== "paid") {
    throw new TypeError("Le paiement doit être confirmé avant la validation finale.");
  }
  if (deal.disputeStatus && !["none", "won"].includes(deal.disputeStatus)) {
    throw new TypeError("La confirmation est suspendue pendant le traitement du litige.");
  }
  if (deal.refundStatus && deal.refundStatus !== "none") {
    throw new TypeError("La confirmation est impossible pendant ou après un remboursement.");
  }
  return role;
}

function assertCanOpenDispute(deal, uid) {
  const role = participantRole(deal, uid);
  if (!role) throw new TypeError("Vous ne participez pas à cette vente.");
  if (deal.paymentStatus !== "paid") {
    throw new TypeError("Un litige ne peut être ouvert que sur une vente payée.");
  }
  if (["resolved", "cancelled"].includes(deal.status)) {
    throw new TypeError("Cette vente est déjà clôturée.");
  }
  if (deal.disputeStatus && deal.disputeStatus !== "none") {
    throw new TypeError("Un litige a déjà été ouvert ou clôturé pour cette vente.");
  }
  if (deal.refundStatus && deal.refundStatus !== "none") {
    throw new TypeError("Un remboursement est déjà en cours ou a été effectué.");
  }
  return role;
}

function resolveRefundState(deal, charge) {
  if (!deal || !charge) throw new TypeError("Données de remboursement invalides.");
  const charged = Number(charge.amount || 0);
  const incomingRefunded = Number(charge.amount_refunded || 0);
  const previousRefunded = Number(deal.refundedAmountCents || 0);
  if (!Number.isSafeInteger(charged) || charged <= 0 ||
      !Number.isSafeInteger(incomingRefunded) || incomingRefunded < 0 ||
      !Number.isSafeInteger(previousRefunded) || previousRefunded < 0) {
    throw new TypeError("Montants de remboursement invalides.");
  }
  // Stripe events can arrive out of order: never move the recorded refund backwards.
  const refundedAmountCents = Math.max(incomingRefunded, previousRefunded);
  const fullyRefunded = refundedAmountCents >= charged;
  if (deal.refundStatus === "refunded" && fullyRefunded) {
    return { status: "refunded", refundedAmountCents, fullyRefunded: true, alreadyFinal: true };
  }
  if (fullyRefunded) {
    return { status: "refunded", refundedAmountCents, fullyRefunded: true, alreadyFinal: false };
  }
  return {
    status: "partial_refund_manual_review",
    refundedAmountCents,
    fullyRefunded: false,
    alreadyFinal: deal.refundStatus === "refunded"
  };
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
  assertCheckoutSessionMatchesDeal, participantRole, assertCanConfirmCompletion, assertCanOpenDispute, resolveRefundState, canReleaseToSeller
};
