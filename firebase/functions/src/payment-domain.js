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
  if (deal.commissionRate !== undefined && Number(deal.commissionRate) !== COMMISSION_BPS / 100) {
    throw new TypeError("Le taux de commission DealHunter doit être de 5 %.");
  }
  if (deal.commissionAmount !== undefined &&
      toCents(deal.commissionAmount, "Commission") !== commissionCents) {
    throw new TypeError("Le montant de commission ne correspond pas au taux DealHunter.");
  }
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
  const allowedPaymentStates = [undefined, null, "none", "pending", "checkout_creating", "checkout_created", "checkout_creating", "checkout_failed", "checkout_expired"];
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
  return amounts;
}

function assertCheckoutSessionIdentityMatchesDeal(deal, session, dealId) {
  if (!deal || !session || !dealId) throw new TypeError("Session de paiement invalide.");
  const amounts = getDealAmounts(deal);
  if (session.metadata?.dealId !== dealId ||
      session.metadata?.buyerUid !== deal.buyerUid ||
      session.client_reference_id !== dealId ||
      session.amount_total !== amounts.totalCents ||
      String(session.currency || "").toLowerCase() !== amounts.currency) {
    throw new TypeError("Les montants ou participants du paiement ne correspondent pas à la vente.");
  }
  return amounts;
}

function validateReconciliationDecision(decision, evidence) {
  const allowed = ["payment_confirmed", "refund_review", "duplicate_payment", "not_paid", "manual_review"];
  if (!allowed.includes(decision)) throw new TypeError("Décision de réconciliation invalide.");
  if (!evidence || evidence.identityMatches !== true) {
    if (decision !== "manual_review") throw new TypeError("Une identité Stripe/vente vérifiée est requise pour cette décision.");
  }
  if (decision === "payment_confirmed" &&
      !(evidence.currentSession === true && evidence.checkoutAttemptMatches === true &&
        evidence.paidInStripe === true && Boolean(evidence.paymentIntentId) &&
        evidence.paymentIntentMatches === true && ["agreed", "completed"].includes(evidence.dealStatus))) {
    throw new TypeError("Le paiement ne peut être confirmé que pour la session courante payée avec un PaymentIntent.");
  }
  if (decision === "refund_review" || decision === "duplicate_payment") {
    if (evidence.paidInStripe !== true) throw new TypeError("Une session effectivement payée est requise pour cette décision.");
  }
  if (decision === "duplicate_payment" &&
      !(evidence.currentSession === false || evidence.paymentIntentMatches === false || evidence.paidInDealHunter === true)) {
    throw new TypeError("Aucun indice de paiement dupliqué n'a été détecté.");
  }
  if (decision === "not_paid" && evidence.paidInStripe === true) {
    throw new TypeError("Stripe indique que cette session est payée.");
  }
  return true;
}

function assertCheckoutSessionMatchesDeal(deal, session, dealId) {
  const amounts = assertCheckoutSessionIdentityMatchesDeal(deal, session, dealId);
  if (session.metadata?.checkoutAttempt !== undefined &&
      Number(session.metadata.checkoutAttempt) !== Number(deal.checkoutAttempt)) {
    throw new TypeError("La tentative de paiement ne correspond plus à la vente.");
  }
  return amounts;
}

function resolveCheckoutPaymentEvent(deal, session, dealId) {
  assertCheckoutSessionIdentityMatchesDeal(deal, session, dealId);
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent : session.payment_intent?.id || null;
  const currentPaymentIntentId = deal.stripePaymentIntentId || null;
  if (!paymentIntentId) return { action: "missing_payment_intent", paymentIntentId: null };
  if (deal.paymentStatus === "paid") {
    return currentPaymentIntentId === paymentIntentId
      ? { action: "already_paid", paymentIntentId }
      : { action: "duplicate_payment", paymentIntentId };
  }
  if (session.metadata?.checkoutAttempt !== undefined &&
      Number(session.metadata.checkoutAttempt) !== Number(deal.checkoutAttempt)) {
    return { action: "stale_checkout_paid", paymentIntentId };
  }
  return { action: "mark_paid", paymentIntentId };
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

function assertCanCancelDeal(deal, uid) {
  const role = participantRole(deal, uid);
  if (!role) throw new TypeError("Vous ne participez pas à cette vente.");
  if (!["agreed", "cancellation_pending"].includes(deal.status)) {
    throw new TypeError("Seule une vente acceptée et non terminée peut être annulée.");
  }
  const cancellablePaymentStates = [undefined, null, "none", "pending", "checkout_created", "checkout_failed", "checkout_expired"];
  if (!cancellablePaymentStates.includes(deal.paymentStatus) ||
      (deal.paymentReviewStatus && deal.paymentReviewStatus !== "none")) {
    throw new TypeError("Cette vente a un paiement confirmé ou à vérifier : une annulation simple est impossible.");
  }
  if (deal.stripeTransferId || ["processing", "paid", "reversal_pending", "reversed"].includes(deal.transferStatus)) {
    throw new TypeError("Un transfert vendeur existe ou est en cours : une annulation simple est impossible.");
  }
  if (deal.paymentStatus === "checkout_creating") {
    throw new TypeError("Une session de paiement est en cours de création. Réessayez dans deux minutes.");
  }
  if (deal.disputeStatus && deal.disputeStatus !== "none") {
    throw new TypeError("Une vente avec un litige ne peut pas être annulée par ce parcours.");
  }
  if (deal.refundStatus && deal.refundStatus !== "none") {
    throw new TypeError("Une vente avec un remboursement ne peut pas être annulée par ce parcours.");
  }
  if (deal.status === "cancellation_pending" && !deal.stripeCheckoutSessionId) {
    throw new TypeError("La session de paiement à annuler est introuvable.");
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

function resolveDisputeEvent(deal, eventType, dispute, eventCreated) {
  if (!deal || !dispute || !dispute.id ||
      !["charge.dispute.created", "charge.dispute.closed"].includes(eventType) ||
      !Number.isSafeInteger(Number(eventCreated)) || Number(eventCreated) <= 0) {
    throw new TypeError("Événement de litige invalide.");
  }
  const incomingAt = Number(eventCreated);
  const previousAt = Number(deal.stripeDisputeEventCreated || 0);
  const currentId = deal.stripeDisputeId || null;
  const isCreated = eventType === "charge.dispute.created";
  if (incomingAt < previousAt) return { apply: false, reason: "stale_event" };
  if (currentId && currentId !== dispute.id) {
    if (!isCreated || !["won", "lost"].includes(deal.disputeStatus)) {
      return { apply: false, reason: "different_dispute" };
    }
  }
  if (isCreated) {
    if (currentId === dispute.id && ["won", "lost"].includes(deal.disputeStatus)) {
      return { apply: false, reason: "already_closed" };
    }
    return {
      apply: true, status: "open", transferStatus: "blocked_dispute",
      disputeId: dispute.id, eventCreated: incomingAt
    };
  }
  if (currentId && currentId !== dispute.id) return { apply: false, reason: "different_dispute" };
  if (dispute.status === "won") {
    return { apply: true, status: "won", transferStatus: "pending",
      disputeId: dispute.id, eventCreated: incomingAt, shouldRetryPayout: true };
  }
  if (dispute.status === "lost") {
    return { apply: true, status: "lost", transferStatus: "blocked_dispute_lost",
      disputeId: dispute.id, eventCreated: incomingAt };
  }
  return { apply: true, status: "under_review", transferStatus: "blocked_dispute",
    disputeId: dispute.id, eventCreated: incomingAt };
}

function assertRefundChargeMatchesDeal(deal, charge) {
  const amounts = getDealAmounts(deal);
  const charged = Number(charge?.amount);
  const refunded = Number(charge?.amount_refunded || 0);
  const currency = String(charge?.currency || "").toLowerCase();
  if (!Number.isSafeInteger(charged) || charged !== amounts.totalCents ||
      !Number.isSafeInteger(refunded) || refunded < 0 || refunded > charged ||
      currency !== amounts.currency) {
    throw new TypeError("Le remboursement Stripe ne correspond pas au montant et à la devise de la vente.");
  }
  return amounts;
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
  if (deal.refundStatus === "refunded") {
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


function resolveTransferCompletion(deal, transferId) {
  if (!deal || !transferId) throw new TypeError("Données de transfert invalides.");
  if (deal.refundStatus === "refunded") {
    return { status: "reversal_pending", shouldReverse: true };
  }
  const refundBlocked = Boolean(deal.refundStatus && deal.refundStatus !== "none");
  const disputeBlocked = Boolean(deal.disputeStatus && !["none", "won"].includes(deal.disputeStatus));
  if (refundBlocked || disputeBlocked || !canReleaseToSeller(deal)) {
    return { status: "manual_review_after_transfer", shouldReverse: false };
  }
  return { status: "paid", shouldReverse: false };
}


function isCurrentCheckoutAttempt(deal, attempt) {
  return Boolean(deal && Number.isSafeInteger(Number(attempt)) &&
    Number(attempt) > 0 && Number(deal.checkoutAttempt || 0) === Number(attempt));
}

function canCreateSellerTransfer(deal) {
  return Boolean(deal && !deal.stripeTransferId &&
    !["paid", "reversed", "reversal_pending"].includes(deal.transferStatus) &&
    canReleaseToSeller(deal));
}

function canReleaseToSeller(deal) {
  const disputeClear = !deal?.disputeStatus || ["none", "won"].includes(deal.disputeStatus);
  const refundClear = !deal?.refundStatus || deal.refundStatus === "none";
  return Boolean(deal && deal.status === "completed" &&
    deal.sellerConfirmed === true && deal.buyerConfirmed === true &&
    deal.paymentStatus === "paid" && disputeClear && refundClear &&
    (!deal.paymentReviewStatus || deal.paymentReviewStatus === "none"));
}

module.exports = {
  COMMISSION_BPS, toCents, getDealAmounts, assertDealPayable,
  assertCheckoutSessionMatchesDeal, assertCheckoutSessionIdentityMatchesDeal, validateReconciliationDecision, resolveCheckoutPaymentEvent, participantRole, assertCanConfirmCompletion, assertCanCancelDeal, assertCanOpenDispute, resolveDisputeEvent, assertRefundChargeMatchesDeal, resolveRefundState, resolveTransferCompletion, isCurrentCheckoutAttempt, canCreateSellerTransfer, canReleaseToSeller
};
