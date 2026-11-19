"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const db = getFirestore();
const { assertDealPayable, getDealAmounts, canReleaseToSeller } = require("./payment-domain.js");

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
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
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
  let amounts;
  try { amounts = assertDealPayable(deal); }
  catch (error) { throw new HttpsError("failed-precondition", error.message); }
  if (deal.paymentStatus === "checkout_created" && deal.stripeCheckoutSessionId) {
    const existing = await stripeClient().checkout.sessions.retrieve(deal.stripeCheckoutSessionId);
    if (existing.status === "open" && existing.url) return { url: existing.url };
    if (existing.payment_status === "paid") throw new HttpsError("failed-precondition", "Le paiement est déjà confirmé.");
  }
  const base = process.env.DEALHUNTER_APP_URL;
  if (!base) throw new HttpsError("failed-precondition", "DEALHUNTER_APP_URL doit être configurée.");
  const attempt = Number(deal.checkoutAttempt || 0) + 1;
  const reservation = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data().buyerUid !== uid) throw new HttpsError("permission-denied", "Vente non accessible.");
    const d = fresh.data();
    try { assertDealPayable(d); } catch (error) { throw new HttpsError("failed-precondition", error.message); }
    if (d.paymentStatus === "checkout_creating") throw new HttpsError("aborted", "Création du paiement déjà en cours.");
    tx.update(ref, { paymentStatus: "checkout_creating", checkoutAttempt: attempt, updatedAt: FieldValue.serverTimestamp() });
    return d;
  });
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: amounts.currency,
          unit_amount: amounts.totalCents,
          product_data: { name: String(reservation.product || "Transaction DealHunter").slice(0, 120) }
        }
      }],
      success_url: base + "/?deal=" + encodeURIComponent(dealId) + "&payment=success",
      cancel_url: base + "/?deal=" + encodeURIComponent(dealId) + "&payment=cancelled",
      client_reference_id: dealId,
      metadata: { dealId, buyerUid: uid },
      payment_intent_data: { metadata: { dealId, buyerUid: uid }, transfer_group: "dealhunter_" + dealId }
    }, { idempotencyKey: "dh-checkout-" + dealId + "-" + attempt + "-" + amounts.totalCents });
    await ref.update({
      paymentStatus: "checkout_created",
      stripeCheckoutSessionId: session.id,
      updatedAt: FieldValue.serverTimestamp()
    });
    return { url: session.url };
  } catch (error) {
    await ref.update({ paymentStatus: "checkout_failed", updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
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
    if (!deal.participantUids?.includes(uid) || !["sellerUid", "buyerUid"].some((field) => deal[field] === uid)) {
      throw new HttpsError("permission-denied", "Vous ne participez pas à cette vente.");
    }
    if (deal.paymentStatus !== "paid") throw new HttpsError("failed-precondition", "Le paiement doit être confirmé avant la validation finale.");
    const role = deal.sellerUid === uid ? "seller" : "buyer";
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
    if (!deal.participantUids?.includes(uid)) throw new HttpsError("permission-denied", "Vous ne participez pas à cette vente.");
    if (deal.paymentStatus !== "paid") throw new HttpsError("failed-precondition", "Un litige ne peut être ouvert que sur une vente payée.");
    if (["resolved", "cancelled"].includes(deal.status)) throw new HttpsError("failed-precondition", "Cette vente est déjà clôturée.");
    if (deal.disputeStatus === "open") throw new HttpsError("already-exists", "Un litige est déjà ouvert pour cette vente.");
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
  if (!snap.exists || !isDealReleaseEligible(snap.data())) return;
  const deal = snap.data();
  if (deal.transferStatus === "paid") return;
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
  if (!accountId || seller.stripeOnboardingStatus !== "complete") {
    await ref.update({ transferStatus: "blocked_seller_onboarding", updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || !isDealReleaseEligible(fresh.data()) || fresh.data().transferStatus === "paid") return false;
    if (fresh.data().transferStatus === "processing") {
      const started = fresh.data().transferProcessingAt?.toMillis?.() || 0;
      if (Date.now() - started < 10 * 60 * 1000) return false;
    }
    tx.update(ref, {
      transferStatus: "processing",
      transferProcessingAt: FieldValue.serverTimestamp(),
      commissionCents: amounts.commissionCents,
      sellerNetCents: amounts.sellerNetCents,
      updatedAt: FieldValue.serverTimestamp()
    });
    return true;
  });
  if (!claimed) return;
  try {
    const transfer = await stripeClient().transfers.create({
      amount: amounts.sellerNetCents,
      currency: amounts.currency,
      destination: accountId,
      transfer_group: "dealhunter_" + dealId,
      metadata: { dealId, commissionCents: String(amounts.commissionCents), grossCents: String(amounts.totalCents) }
    }, { idempotencyKey: "dh-transfer-" + dealId });
    await ref.update({
      transferStatus: "paid", stripeTransferId: transfer.id,
      transferredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
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
      const amounts = assertDealPayable(deal);
      if (session.metadata?.buyerUid !== deal.buyerUid ||
          session.amount_total !== amounts.totalCents ||
          String(session.currency || "").toLowerCase() !== amounts.currency ||
          session.client_reference_id !== dealId) throw new Error("Les montants ou participants du paiement ne correspondent pas à la vente");
      if (deal.paymentStatus === "paid") return;
      tx.update(ref, {
        paymentStatus: "paid", stripePaymentIntentId: session.payment_intent || null,
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
      await db.collection("users").doc(uid).update({
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
        if (event.type === "charge.dispute.created") {
          await doc.ref.update({
            disputeStatus: "open", stripeDisputeId: dispute.id,
            transferStatus: "blocked_dispute", disputeOpenedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        } else {
          const won = dispute.status === "won";
          await doc.ref.update({
            disputeStatus: won ? "won" : "lost",
            stripeDisputeClosedAt: FieldValue.serverTimestamp(),
            transferStatus: won ? "pending" : "blocked_dispute_lost",
            updatedAt: FieldValue.serverTimestamp()
          });
          if (won) await tryReleaseDeal(doc.id);
        }
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (charge.payment_intent) {
      const matches = await db.collection("deals").where("stripePaymentIntentId", "==", charge.payment_intent).limit(1).get();
      for (const doc of matches.docs) {
        const deal = doc.data();
        const refunded = Number(charge.amount_refunded || 0);
        const charged = Number(charge.amount || 0);
        if (!charged || refunded < charged) {
          await doc.ref.update({
            refundStatus: "partial_refund_manual_review", refundedAmountCents: refunded,
            updatedAt: FieldValue.serverTimestamp()
          });
          continue;
        }
        if (deal.stripeTransferId) {
          try {
            await stripeClient().transfers.createReversal(deal.stripeTransferId, {}, { idempotencyKey: "dh-refund-reversal-" + doc.id });
          } catch (error) {
            await doc.ref.update({
              refundStatus: "manual_review",
              refundErrorCode: String(error.code || "stripe_error").slice(0, 80),
              updatedAt: FieldValue.serverTimestamp()
            });
            continue;
          }
        }
        await doc.ref.update({
          refundStatus: "refunded",
          transferStatus: deal.stripeTransferId ? "reversed" : (deal.transferStatus || "none"),
          refundedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
        });
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
