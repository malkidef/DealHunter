"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const db = getFirestore();
const { assertDealPayable, getDealAmounts, assertCheckoutSessionMatchesDeal, assertCanConfirmCompletion, assertCanOpenDispute, resolveDisputeEvent, resolveRefundState, resolveTransferCompletion, resolveCheckoutPaymentEvent, isCurrentCheckoutAttempt, canCreateSellerTransfer, canReleaseToSeller, participantRole } = require("./payment-domain.js");

function stripeClient() {
  const key = stripeSecret.value();
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  return new Stripe(key);
}
function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Connexion requise.");
  return request.auth.uid;
}
function requirePaymentsEnabled() {
  if (process.env.DEALHUNTER_PAYMENTS_ENABLED !== "true") {
    throw new HttpsError("failed-precondition", "Les paiements DealHunter sont désactivés tant que le parcours n'a pas été validé en environnement de test.");
  }
}
function validId(value, label) {
  const id = String(value || "");
  if (!id || id.length > 160 || id.includes("/")) throw new HttpsError("invalid-argument", label + " invalide.");
  return id;
}
async function ownedUserProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  const company = snap.data()?.company;
  if (!snap.exists || !company || typeof company.name !== "string" || !company.name.trim()) {
    throw new HttpsError("failed-precondition", "Complétez d'abord votre espace entreprise.");
  }
  return snap;
}
function stripeCountry(profile) {
  const country = String(profile.company?.country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpsError("failed-precondition", "Le pays de l'entreprise doit être renseigné.");
  return country;
}
function paymentError(message, error) {
  console.error(message, error?.message || error);
  throw new HttpsError("internal", message);
}


exports.createDealProposal = onCall(async (request) => {
  const uid = requireAuth(request);
  const requestId = validId(request.data?.requestId, "Mise en relation");
  const quantity = Number(request.data?.quantity);
  const unitPrice = Number(request.data?.unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new HttpsError("invalid-argument", "Quantité entière et prix unitaire positif requis.");
  }
  const matchRef = db.collection("matchRequests").doc(requestId);
  const dealRef = db.collection("deals").doc(requestId);
  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Mise en relation introuvable.");
    const match = matchSnap.data();
    if (match.status !== "accepted" || !match.participantUids?.includes(uid)) {
      throw new HttpsError("permission-denied", "Une mise en relation acceptée est nécessaire.");
    }
    const [offerSnap, needSnap, existingDeal] = await Promise.all([
      tx.get(db.collection("publicOffers").doc(validId(match.sellerId, "Offre"))),
      tx.get(db.collection("publicNeeds").doc(validId(match.buyerId, "Besoin"))),
      tx.get(dealRef)
    ]);
    if (!offerSnap.exists || !needSnap.exists) throw new HttpsError("failed-precondition", "L'offre ou le besoin n'existe plus.");
    if (existingDeal.exists) throw new HttpsError("already-exists", "Une proposition existe déjà pour cette mise en relation.");
    const offer = offerSnap.data(), need = needSnap.data();
    if (offer.status !== "active" || need.status !== "active" ||
        offer.ownerUid !== match.sellerUid || need.ownerUid !== match.buyerUid) {
      throw new HttpsError("failed-precondition", "L'offre ou le besoin n'est plus disponible.");
    }
    const product = String(match.product || offer.product || "").trim();
    const unit = String(match.unit || offer.unit || "unit");
    if (!product || product !== offer.product || unit !== (offer.unit || "unit") || unit !== (need.unit || "unit")) {
      throw new HttpsError("failed-precondition", "Le produit ou l'unité ne correspond plus aux annonces.");
    }
    if (quantity > Number(offer.quantity) || quantity > Number(need.quantity) || unitPrice > Number(need.maxUnitBudget)) {
      throw new HttpsError("failed-precondition", "La quantité ou le prix dépasse les limites publiées.");
    }
    const unitPriceCents = Math.round((unitPrice + Number.EPSILON) * 100);
    const totalCents = quantity * unitPriceCents;
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 1 || !Number.isSafeInteger(totalCents)) {
      throw new HttpsError("invalid-argument", "Montant total invalide.");
    }
    if (totalCents < 50) throw new HttpsError("failed-precondition", "Le montant total minimum est de 0,50 €.");
    const totalAmount = totalCents / 100;
    const isSeller = uid === match.sellerUid;
    tx.create(dealRef, {
      requestId, sellerUid: match.sellerUid, buyerUid: match.buyerUid,
      participantUids: [match.sellerUid, match.buyerUid], proposerUid: uid,
      accepterUid: isSeller ? match.buyerUid : match.sellerUid,
      product: product.slice(0, 160), unit, quantity, unitPrice: unitPriceCents / 100,
      totalAmount, commissionRate: 5,
      commissionAmount: Math.round(totalCents * 500 / 10000) / 100,
      currency: "eur", status: "proposed", paymentStatus: "pending",
      sellerConfirmed: false, buyerConfirmed: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { accepted: true, dealId: requestId };
});

exports.acceptDealProposal = onCall(async (request) => {
  const uid = requireAuth(request);
  const dealId = validId(request.data?.dealId, "Vente");
  const ref = db.collection("deals").doc(dealId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Proposition introuvable.");
    const deal = snap.data();
    if (deal.status !== "proposed" || deal.accepterUid !== uid) {
      throw new HttpsError("permission-denied", "Seul le destinataire peut accepter cette proposition en attente.");
    }
    tx.update(ref, { status: "agreed", agreedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { accepted: true, dealId };
});

exports.declineDealProposal = onCall(async (request) => {
  const uid = requireAuth(request);
  const dealId = validId(request.data?.dealId, "Vente");
  const ref = db.collection("deals").doc(dealId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Proposition introuvable.");
    const deal = snap.data();
    if (deal.status !== "proposed" || deal.accepterUid !== uid) {
      throw new HttpsError("permission-denied", "Seul le destinataire peut refuser cette proposition en attente.");
    }
    tx.update(ref, { status: "rejected", rejectedAt: FieldValue.serverTimestamp(), rejectedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
  });
  return { accepted: true, dealId };
});

exports.getCompanyDashboard = onCall(async (request) => {
  requirePaymentsEnabled();
  const uid = requireAuth(request);
  await ownedUserProfile(uid);
  const [asSeller, asBuyer] = await Promise.all([
    db.collection("deals").where("sellerUid", "==", uid).orderBy("updatedAt", "desc").limit(100).get(),
    db.collection("deals").where("buyerUid", "==", uid).orderBy("updatedAt", "desc").limit(100).get()
  ]);
  const byId = new Map();
  for (const doc of [...asSeller.docs, ...asBuyer.docs]) byId.set(doc.id, { id: doc.id, ...doc.data() });
  const deals = [...byId.values()].sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0)).slice(0, 100);
  const summary = deals.reduce((acc, deal) => {
    acc.totalDeals++;
    if (deal.paymentStatus === "paid") acc.paidDeals++;
    if (deal.disputeStatus === "open") acc.openDisputes++;
    if (deal.sellerUid === uid) {
      const amounts = getDealAmounts(deal);
      acc.sellerSalesCents += amounts.totalCents;
      acc.commissionCents += amounts.commissionCents;
      acc.sellerNetCents += amounts.sellerNetCents;
    }
    return acc;
  }, { totalDeals: 0, paidDeals: 0, openDisputes: 0, sellerSalesCents: 0, commissionCents: 0, sellerNetCents: 0 });
  return {
    uid, summary,
    deals: deals.map((deal) => ({
      id: deal.id, sellerUid: deal.sellerUid, buyerUid: deal.buyerUid,
      product: String(deal.product || "Transaction DealHunter").slice(0, 160),
      totalAmount: Number(deal.totalAmount || 0), currency: String(deal.currency || "eur").toLowerCase(),
      status: deal.status || "proposed", paymentStatus: deal.paymentStatus || "pending",
      transferStatus: deal.transferStatus || "none", disputeStatus: deal.disputeStatus || "none",
      updatedAt: deal.updatedAt?.toMillis?.() || null
    }))
  };
});


exports.getSellerConnectStatus = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "Profil utilisateur introuvable.");
  const user = snap.data();
  if (!user.company || typeof user.company.name !== "string" || !user.company.name.trim()) {
    return { configured: false, onboardingStatus: "not_started", payoutsEnabled: false, chargesEnabled: false };
  }
  return {
    configured: Boolean(user.stripeAccountId),
    onboardingStatus: user.stripeOnboardingStatus || "not_started",
    payoutsEnabled: user.stripePayoutsEnabled === true,
    chargesEnabled: user.stripeChargesEnabled === true
  };
});

exports.createSellerConnectAccount = onCall({ secrets: [stripeSecret] }, async (request) => {
  requirePaymentsEnabled();
  const uid = requireAuth(request);
  const userRef = db.collection("users").doc(uid);
  const userSnap = await ownedUserProfile(uid);
  const user = userSnap.data();
  if (user.stripeAccountId) return { accountId: user.stripeAccountId };
  const account = await stripeClient().accounts.create({
    type: "express",
    country: stripeCountry(user),
    email: request.auth.token.email || undefined,
    business_type: "company",
    capabilities: { transfers: { requested: true } },
    metadata: { dealhunterUserUid: uid }
  }, { idempotencyKey: "dh-connect-user-" + uid });
  await userRef.update({
    stripeAccountId: account.id,
    stripeOnboardingStatus: "pending",
    updatedAt: FieldValue.serverTimestamp()
  });
  return { accountId: account.id };
});

exports.createSellerOnboardingLink = onCall({ secrets: [stripeSecret] }, async (request) => {
  requirePaymentsEnabled();
  const uid = requireAuth(request);
  const userSnap = await ownedUserProfile(uid);
  const accountId = userSnap.data().stripeAccountId;
  if (!accountId) throw new HttpsError("failed-precondition", "Créez d'abord votre compte de paiement vendeur.");
  const base = process.env.DEALHUNTER_APP_URL;
  if (!base) throw new HttpsError("failed-precondition", "DEALHUNTER_APP_URL doit être configurée.");
  const link = await stripeClient().accountLinks.create({
    account: accountId, type: "account_onboarding",
    refresh_url: base + "/?stripe=refresh",
    return_url: base + "/?stripe=return"
  });
  return { url: link.url };
});

exports.createDealCheckoutSession = onCall({ secrets: [stripeSecret] }, async (request) => {
  requirePaymentsEnabled();
  const uid = requireAuth(request);
  const dealId = validId(request.data?.dealId, "Vente");
  const ref = db.collection("deals").doc(dealId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Vente introuvable.");
  const deal = snap.data();
  if (deal.buyerUid !== uid) throw new HttpsError("permission-denied", "Seul l'acheteur de cette vente peut payer.");
  if (deal.paymentStatus === "checkout_created" && deal.stripeCheckoutSessionId) {
    const existing = await stripeClient().checkout.sessions.retrieve(deal.stripeCheckoutSessionId);
    if (existing.status === "open" && existing.url) return { url: existing.url };
    if (existing.payment_status === "paid") throw new HttpsError("failed-precondition", "Le paiement est déjà confirmé.");
  }
  const base = process.env.DEALHUNTER_APP_URL;
  if (!base) throw new HttpsError("failed-precondition", "DEALHUNTER_APP_URL doit être configurée.");
  const reservation = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data().buyerUid !== uid) throw new HttpsError("permission-denied", "Vente non accessible.");
    const d = fresh.data();
    let freshAmounts;
    try { freshAmounts = assertDealPayable(d); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
    if (freshAmounts.totalCents < 50) throw new HttpsError("failed-precondition", "Le montant minimum d'un paiement est de 0,50 €.");
    const previousAttempt = Number(d.checkoutAttempt || 0);
    let attempt;
    if (d.paymentStatus === "checkout_creating") {
      const startedAt = d.checkoutStartedAt?.toMillis?.() || d.updatedAt?.toMillis?.() || 0;
      if (Date.now() - startedAt < 2 * 60 * 1000) {
        throw new HttpsError("aborted", "Création du paiement déjà en cours. Réessayez dans deux minutes.");
      }
      // Reuse the same Stripe idempotency key after a timed-out invocation.
      // This prevents a second Checkout Session if Stripe succeeded but Firestore did not save its ID.
      attempt = previousAttempt || 1;
    } else {
      attempt = previousAttempt + 1;
    }
    tx.update(ref, {
      paymentStatus: "checkout_creating", checkoutAttempt: attempt,
      checkoutStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return { deal: d, amounts: freshAmounts, attempt };
  });
  const amounts = reservation.amounts;
  const checkoutDeal = reservation.deal;
  const attempt = reservation.attempt;
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: amounts.currency,
          unit_amount: amounts.totalCents,
          product_data: { name: String(checkoutDeal.product || "Transaction DealHunter").slice(0, 120) }
        }
      }],
      success_url: base + "/?deal=" + encodeURIComponent(dealId) + "&payment=success",
      cancel_url: base + "/?deal=" + encodeURIComponent(dealId) + "&payment=cancelled",
      client_reference_id: dealId,
      metadata: { dealId, buyerUid: uid, checkoutAttempt: String(attempt) },
      payment_intent_data: { metadata: { dealId, buyerUid: uid }, transfer_group: "dealhunter_" + dealId }
    }, { idempotencyKey: "dh-checkout-" + dealId + "-" + attempt + "-" + amounts.totalCents });
    const saved = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw new Error("Vente supprimée pendant la création du paiement");
      const current = fresh.data();
      if (!isCurrentCheckoutAttempt(current, attempt) || current.paymentStatus === "paid") return false;
      tx.update(ref, {
        paymentStatus: "checkout_created",
        stripeCheckoutSessionId: session.id,
        updatedAt: FieldValue.serverTimestamp()
      });
      return true;
    });
    if (!saved) {
      if (session.status === "open" && session.payment_status !== "paid") {
        await stripeClient().checkout.sessions.expire(session.id).catch((error) => {
          console.error("Unable to expire stale DealHunter Checkout Session", session.id, error.message);
        });
      }
      throw new HttpsError("aborted", "Cette tentative de paiement a été remplacée. Relancez le paiement depuis la vente.");
    }
    return { url: session.url };
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (fresh.exists && fresh.data().paymentStatus !== "paid" &&
          isCurrentCheckoutAttempt(fresh.data(), attempt)) {
        tx.update(ref, { paymentStatus: "checkout_failed", updatedAt: FieldValue.serverTimestamp() });
      }
    }).catch(() => {});
    if (error instanceof HttpsError) throw error;
    paymentError("Création de la session de paiement impossible", error);
  }
});

exports.confirmDealCompletion = onCall(async (request) => {
  requirePaymentsEnabled();
  const uid = requireAuth(request);
  const dealId = validId(request.data?.dealId, "Vente");
  const ref = db.collection("deals").doc(dealId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Vente introuvable.");
    const deal = snap.data();
    let role;
    try {
      role = assertCanConfirmCompletion(deal, uid);
    } catch (error) {
      const permission = error.message === "Vous ne participez pas à cette vente.";
      throw new HttpsError(permission ? "permission-denied" : "failed-precondition", error.message);
    }
    const field = role + "Confirmed";
    if (deal[field] === true) return { accepted: true, alreadyConfirmed: true };
    const other = role === "seller" ? deal.buyerConfirmed : deal.sellerConfirmed;
    tx.update(ref, {
      [field]: true,
      [role + "ConfirmedAt"]: FieldValue.serverTimestamp(),
      status: other === true ? "completed" : "agreed",
      updatedAt: FieldValue.serverTimestamp()
    });
    return { accepted: true, completed: other === true };
  });
});

exports.openDealDispute = onCall(async (request) => {
  requirePaymentsEnabled();
  const uid = requireAuth(request);
  const dealId = validId(request.data?.dealId, "Vente");
  const reason = String(request.data?.reason || "").trim();
  const description = String(request.data?.description || "").trim();
  if (!reason || reason.length > 80 || !description || description.length > 2000) {
    throw new HttpsError("invalid-argument", "Motif ou description invalide.");
  }
  const ref = db.collection("deals").doc(dealId);
  const disputeRef = ref.collection("disputes").doc();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Vente introuvable.");
    const deal = snap.data();
    try {
      assertCanOpenDispute(deal, uid);
    } catch (error) {
      const permission = error.message === "Vous ne participez pas à cette vente.";
      throw new HttpsError(permission ? "permission-denied" : "failed-precondition", error.message);
    }
    tx.create(disputeRef, {
      openedByUid: uid, role: deal.sellerUid === uid ? "seller" : "buyer",
      reason, description, status: "open", createdAt: FieldValue.serverTimestamp()
    });
    tx.update(ref, {
      disputeStatus: "open", disputeOpenedAt: FieldValue.serverTimestamp(),
      transferStatus: "blocked_dispute", updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { accepted: true, message: "Litige enregistré. Le versement vendeur est suspendu pendant son examen." };
});

function isDealReleaseEligible(deal) {
  return canReleaseToSeller(deal);
}

async function tryReleaseDeal(dealId) {
  if (process.env.DEALHUNTER_PAYMENTS_ENABLED !== "true") return;
  const ref = db.collection("deals").doc(dealId);
  const snap = await ref.get();
  if (!snap.exists || !canCreateSellerTransfer(snap.data())) return;
  const deal = snap.data();
  if (deal.transferStatus === "paid" || deal.transferStatus === "reversed") return;
  if (deal.transferStatus === "processing") {
    const started = deal.transferProcessingAt?.toMillis?.() || 0;
    if (Date.now() - started < 10 * 60 * 1000) return;
  }
  let amounts;
  try { amounts = getDealAmounts(deal); } catch (error) {
    await ref.update({ transferStatus: "blocked_invalid_amounts", updatedAt: FieldValue.serverTimestamp() });
    console.error("Invalid DealHunter payout amounts", dealId, error.message);
    return;
  }
  const sellerSnap = await db.collection("users").doc(deal.sellerUid).get();
  const seller = sellerSnap.data() || {};
  const accountId = seller.stripeAccountId;
  if (!accountId || seller.stripeOnboardingStatus !== "complete" || seller.stripePayoutsEnabled !== true) {
    await ref.update({ transferStatus: "blocked_seller_onboarding", updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || !canCreateSellerTransfer(fresh.data())) return false;
    if (fresh.data().transferStatus === "processing") {
      const started = fresh.data().transferProcessingAt?.toMillis?.() || 0;
      if (Date.now() - started < 10 * 60 * 1000) return false;
    }
    const freshAmounts = getDealAmounts(fresh.data());
    tx.update(ref, {
      transferStatus: "processing",
      transferProcessingAt: FieldValue.serverTimestamp(),
      commissionCents: freshAmounts.commissionCents,
      sellerNetCents: freshAmounts.sellerNetCents,
      updatedAt: FieldValue.serverTimestamp()
    });
    return { amounts: freshAmounts };
  });
  if (!claimed) return;
  amounts = claimed.amounts;

  try {
    // Last Firestore check before the external Stripe side effect. A race can
    // still occur after this read; the post-transfer reconciliation below handles it.
    const preflight = await ref.get();
    if (!preflight.exists || !isDealReleaseEligible(preflight.data())) return;
    const transfer = await stripeClient().transfers.create({
      amount: amounts.sellerNetCents,
      currency: amounts.currency,
      destination: accountId,
      transfer_group: "dealhunter_" + dealId,
      metadata: { dealId, commissionCents: String(amounts.commissionCents), grossCents: String(amounts.totalCents) }
    }, { idempotencyKey: "dh-transfer-" + dealId });

    const reconciliation = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw new Error("Vente supprimée après création du transfert Stripe");
      const state = resolveTransferCompletion(fresh.data(), transfer.id);
      tx.update(ref, {
        transferStatus: state.status,
        stripeTransferId: transfer.id,
        transferredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return state;
    });

    if (reconciliation.shouldReverse) {
      try {
        await stripeClient().transfers.createReversal(
          transfer.id, {}, { idempotencyKey: "dh-refund-reversal-" + dealId }
        );
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(ref);
          if (fresh.exists && fresh.data().stripeTransferId === transfer.id &&
              fresh.data().refundStatus === "refunded") {
            tx.update(ref, {
              transferStatus: "reversed",
              refundReversedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });
          }
        });
      } catch (error) {
        await ref.update({
          refundStatus: "manual_review",
          transferStatus: "manual_review_after_transfer",
          refundErrorCode: String(error.code || "stripe_error").slice(0, 80),
          updatedAt: FieldValue.serverTimestamp()
        });
        console.error("DealHunter post-transfer reversal requires review", dealId, error.message);
      }
    }
  } catch (error) {
    await ref.update({
      transferStatus: "pending_funds_or_review",
      transferErrorCode: String(error.code || "stripe_error").slice(0, 80),
      updatedAt: FieldValue.serverTimestamp()
    });
    console.error("DealHunter transfer deferred", dealId, error.message);
  }
}

exports.releaseDealOnConfirmation = onDocumentWritten("deals/{dealId}", async (event) => {
  if (!event.data?.after?.exists) return;
  await tryReleaseDeal(event.params.dealId);
});

async function processStripeEvent(event) {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return;
    const dealId = session.metadata?.dealId || session.client_reference_id;
    if (!dealId) throw new Error("Checkout session sans dealId");
    const ref = db.collection("deals").doc(dealId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Vente liée au paiement introuvable");
      const deal = snap.data();
      const decision = resolveCheckoutPaymentEvent(deal, session, dealId);
      if (decision.action === "already_paid") return;
      if (decision.action === "duplicate_payment") {
        tx.update(ref, {
          paymentReviewStatus: "duplicate_payment",
          stripeDuplicatePaymentIntentIds: FieldValue.arrayUnion(decision.paymentIntentId),
          transferStatus: deal.stripeTransferId ? "manual_review_after_transfer" : (deal.transferStatus || "none"),
          updatedAt: FieldValue.serverTimestamp()
        });
        return;
      }
      if (decision.action === "stale_checkout_paid") {
        tx.update(ref, {
          paymentStatus: "manual_review",
          paymentReviewStatus: "stale_checkout_paid",
          stripeUnmatchedPaymentIntentId: decision.paymentIntentId,
          updatedAt: FieldValue.serverTimestamp()
        });
        return;
      }
      try {
        assertDealPayable(deal);
      } catch (error) {
        tx.update(ref, {
          paymentStatus: "manual_review",
          paymentReviewStatus: "paid_checkout_in_ineligible_deal",
          stripeUnmatchedPaymentIntentId: decision.paymentIntentId,
          updatedAt: FieldValue.serverTimestamp()
        });
        return;
      }
      tx.update(ref, {
        paymentStatus: "paid", stripePaymentIntentId: decision.paymentIntentId,
        paymentReviewStatus: "none",
        paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
    });
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const dealId = session.metadata?.dealId || session.client_reference_id;
    if (dealId) {
      const ref = db.collection("deals").doc(dealId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const deal = snap.data();
        if (deal.stripeCheckoutSessionId === session.id && deal.paymentStatus !== "paid") {
          tx.update(ref, { paymentStatus: event.type.endsWith("expired") ? "checkout_expired" : "checkout_failed", updatedAt: FieldValue.serverTimestamp() });
        }
      });
    }
  } else if (event.type === "account.updated") {
    const account = event.data.object;
    const uid = account.metadata?.dealhunterUserUid;
    if (uid) {
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists || userSnap.data().stripeAccountId !== account.id) {
        throw new Error("Compte Stripe Connect non associé au profil utilisateur attendu");
      }
      await userRef.update({
        stripeOnboardingStatus: account.details_submitted && account.payouts_enabled ? "complete" : "pending",
        stripePayoutsEnabled: Boolean(account.payouts_enabled),
        stripeChargesEnabled: Boolean(account.charges_enabled),
        updatedAt: FieldValue.serverTimestamp()
      });
      if (account.details_submitted && account.payouts_enabled) {
        const blocked = await db.collection("deals")
          .where("sellerUid", "==", uid)
          .where("transferStatus", "==", "blocked_seller_onboarding")
          .limit(100).get();
        for (const doc of blocked.docs) await tryReleaseDeal(doc.id);
      }
    }
  } else if (event.type === "balance.available") {
    const pending = await db.collection("deals").where("transferStatus", "==", "pending_funds_or_review").limit(200).get();
    for (const doc of pending.docs) await tryReleaseDeal(doc.id);
  } else if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object;
    if (dispute.payment_intent) {
      const matches = await db.collection("deals").where("stripePaymentIntentId", "==", dispute.payment_intent).limit(1).get();
      for (const doc of matches.docs) {
        const applied = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists) return false;
          const transition = resolveDisputeEvent(fresh.data(), event.type, dispute, event.created);
          if (!transition.apply) return false;
          const update = {
            disputeStatus: transition.status,
            stripeDisputeId: transition.disputeId,
            stripeDisputeEventCreated: transition.eventCreated,
            transferStatus: fresh.data().stripeTransferId
              ? "manual_review_after_transfer" : transition.transferStatus,
            updatedAt: FieldValue.serverTimestamp()
          };
          if (event.type === "charge.dispute.created") {
            update.disputeOpenedAt = FieldValue.serverTimestamp();
          } else {
            update.stripeDisputeClosedAt = FieldValue.serverTimestamp();
          }
          tx.update(doc.ref, update);
          return transition.shouldRetryPayout === true;
        });
        if (applied) await tryReleaseDeal(doc.id);
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (charge.payment_intent) {
      const matches = await db.collection("deals").where("stripePaymentIntentId", "==", charge.payment_intent).limit(1).get();
      for (const doc of matches.docs) {
        const refundAction = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists) return { action: "none" };
          const deal = fresh.data();
          const refund = resolveRefundState(deal, charge);
          if (refund.status !== "refunded") {
            tx.update(doc.ref, {
              refundStatus: refund.status,
              refundedAmountCents: refund.refundedAmountCents,
              transferStatus: deal.stripeTransferId
                ? "manual_review_after_transfer" : (deal.transferStatus || "none"),
              updatedAt: FieldValue.serverTimestamp()
            });
            return { action: "partial" };
          }
          const transferId = deal.stripeTransferId || null;
          tx.update(doc.ref, {
            refundStatus: "refunded",
            refundedAmountCents: refund.refundedAmountCents,
            transferStatus: transferId ? "reversal_pending" :
              (deal.transferStatus === "processing" ? "blocked_refund" : (deal.transferStatus || "none")),
            refundedAt: deal.refundedAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
          return transferId ? { action: "reverse", transferId } : { action: "refunded" };
        });
        if (refundAction.action !== "reverse") continue;
        try {
          await stripeClient().transfers.createReversal(
            refundAction.transferId, {}, { idempotencyKey: "dh-refund-reversal-" + doc.id }
          );
          await db.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref);
            if (fresh.exists && fresh.data().stripeTransferId === refundAction.transferId &&
                fresh.data().refundStatus === "refunded") {
              tx.update(doc.ref, {
                transferStatus: "reversed",
                refundReversedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              });
            }
          });
        } catch (error) {
          await doc.ref.update({
            refundStatus: "manual_review",
            transferStatus: "manual_review_after_transfer",
            refundErrorCode: String(error.code || "stripe_error").slice(0, 80),
            updatedAt: FieldValue.serverTimestamp()
          });
          console.error("DealHunter refund reversal requires review", doc.id, error.message);
        }
      }
    }
  }
}

exports.stripeWebhook = onRequest({ secrets: [stripeSecret, stripeWebhookSecret] }, async (req, res) => {
  if (process.env.DEALHUNTER_PAYMENTS_ENABLED !== "true") return res.status(503).send("DealHunter payments disabled");
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], stripeWebhookSecret.value());
  } catch (error) {
    console.error("Stripe webhook signature rejected", error.message);
    return res.status(400).send("Invalid signature");
  }
  const eventRef = db.collection("processed_stripe_events").doc(event.id);
  try {
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(eventRef);
      if (snap.exists && snap.data().status === "completed") return "completed";
      if (snap.exists && snap.data().status === "processing") {
        const started = snap.data().processingStartedAt?.toMillis?.() || 0;
        if (Date.now() - started < 5 * 60 * 1000) return "busy";
      }
      tx.set(eventRef, {
        type: event.type, status: "processing",
        processingStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return "claimed";
    });
    if (claim === "completed") return res.status(200).send("Already processed");
    if (claim === "busy") return res.status(500).send("Event processing; retry");
    await processStripeEvent(event);
    await eventRef.set({
      status: "completed", processedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return res.status(200).send("ok");
  } catch (error) {
    await eventRef.set({
      status: "failed", errorCode: String(error.code || "processing_error").slice(0, 80),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
    console.error("Stripe webhook processing failed", event.id, error.message);
    return res.status(500).send("Webhook processing failed");
  }
});
