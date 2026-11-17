const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");

const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const db = getFirestore();
const COMMISSION_BPS = 800;

function stripeClient() {
  const key = stripeSecret.value();
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  return new Stripe(key);
}
function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Connexion requise.");
  return request.auth.uid;
}
async function ownedCompany(uid, companyId) {
  const snap = await db.collection("companies").doc(companyId).get();
  if (!snap.exists || snap.data().ownerUid !== uid) {
    throw new HttpsError("permission-denied", "Vous ne gérez pas cette entreprise.");
  }
  return snap;
}
function money(amount) {
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw new HttpsError("invalid-argument", "Montant invalide (minimum 1,00 €).");
  }
  return amount;
}

exports.createSellerConnectAccount = onCall({ secrets: [stripeSecret] }, async (request) => {
  const uid = requireAuth(request);
  const companyId = String(request.data?.companyId || "");
  const companySnap = await ownedCompany(uid, companyId);
  const company = companySnap.data();
  if (company.stripeAccountId) return { accountId: company.stripeAccountId };
  const country = String(company.countryCode || "FR").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpsError("failed-precondition", "Pays de l'entreprise invalide.");
  const account = await stripeClient().accounts.create({
    type: "express",
    country,
    email: company.email || request.auth.token.email,
    business_type: "company",
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { dealhunterCompanyId: companyId }
  }, { idempotencyKey: `dh-connect-${companyId}` });
  await companySnap.ref.update({ stripeAccountId: account.id, stripeOnboardingStatus: "pending", updatedAt: FieldValue.serverTimestamp() });
  return { accountId: account.id };
});

exports.createSellerOnboardingLink = onCall({ secrets: [stripeSecret] }, async (request) => {
  const uid = requireAuth(request);
  const companyId = String(request.data?.companyId || "");
  const companySnap = await ownedCompany(uid, companyId);
  const accountId = companySnap.data().stripeAccountId;
  if (!accountId) throw new HttpsError("failed-precondition", "Créez d'abord le compte de paiement vendeur.");
  const base = process.env.DEALHUNTER_APP_URL;
  if (!base) throw new HttpsError("failed-precondition", "DEALHUNTER_APP_URL doit être configurée.");
  const link = await stripeClient().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/?stripe=refresh`,
    return_url: `${base}/?stripe=return`
  });
  return { url: link.url };
});

exports.createDealCheckoutSession = onCall({ secrets: [stripeSecret] }, async (request) => {
  const uid = requireAuth(request);
  const dealId = String(request.data?.dealId || "");
  const ref = db.collection("deals").doc(dealId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Vente introuvable.");
  const deal = snap.data();
  await ownedCompany(uid, deal.buyerCompanyId);
  if (deal.status !== "accepted" || deal.paymentStatus === "paid") {
    throw new HttpsError("failed-precondition", "Cette vente n'est pas payable.");
  }
  const amount = money(deal.amountTotalCents);
  if (!/^[a-z]{3}$/.test(String(deal.currency || "eur").toLowerCase())) {
    throw new HttpsError("failed-precondition", "Devise invalide.");
  }
  const base = process.env.DEALHUNTER_APP_URL;
  if (!base) throw new HttpsError("failed-precondition", "DEALHUNTER_APP_URL doit être configurée.");
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: String(deal.currency || "eur").toLowerCase(),
        unit_amount: amount,
        product_data: { name: String(deal.productName || "Transaction DealHunter").slice(0, 120) }
      }
    }],
    success_url: `${base}/?deal=${encodeURIComponent(dealId)}&payment=success`,
    cancel_url: `${base}/?deal=${encodeURIComponent(dealId)}&payment=cancelled`,
    client_reference_id: dealId,
    metadata: { dealId },
    payment_intent_data: { metadata: { dealId } }
  }, { idempotencyKey: `dh-checkout-${dealId}-${amount}` });
  await ref.update({ paymentStatus: "checkout_created", stripeCheckoutSessionId: session.id, updatedAt: FieldValue.serverTimestamp() });
  return { url: session.url };
});

exports.confirmDealCompletion = onCall(async (request) => {
  const uid = requireAuth(request);
  const dealId = String(request.data?.dealId || "");
  const role = String(request.data?.role || "");
  if (!["seller", "buyer"].includes(role)) throw new HttpsError("invalid-argument", "Rôle invalide.");
  const ref = db.collection("deals").doc(dealId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Vente introuvable.");
  const deal = snap.data();
  const companyId = role === "seller" ? deal.sellerCompanyId : deal.buyerCompanyId;
  await ownedCompany(uid, companyId);
  if (deal.paymentStatus !== "paid") throw new HttpsError("failed-precondition", "Le paiement doit être confirmé avant la validation finale.");
  await ref.update({
    [role === "seller" ? "sellerConfirmedAt" : "buyerConfirmedAt"]: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { accepted: true, message: "Confirmation enregistrée. Le versement sera traité lorsque les deux parties auront confirmé et que les fonds seront disponibles." };
});

async function tryReleaseDeal(dealId) {
  const ref = db.collection("deals").doc(dealId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const deal = snap.data();
  if (deal.paymentStatus !== "paid" || !deal.sellerConfirmedAt || !deal.buyerConfirmedAt || deal.transferStatus === "paid" || deal.transferStatus === "processing" || deal.refundStatus === "refunded") return;
  const seller = await db.collection("companies").doc(deal.sellerCompanyId).get();
  const accountId = seller.data()?.stripeAccountId;
  if (!accountId || seller.data()?.stripeOnboardingStatus !== "complete") {
    await ref.update({ transferStatus: "blocked_seller_onboarding", updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  const gross = money(deal.amountTotalCents);
  const commission = Math.round(gross * COMMISSION_BPS / 10000);
  const sellerNet = gross - commission;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const d = fresh.data();
    if (d.transferStatus === "paid" || d.transferStatus === "processing") return;
    if (d.paymentStatus !== "paid" || !d.sellerConfirmedAt || !d.buyerConfirmedAt) return;
    tx.update(ref, { transferStatus: "processing", commissionCents: commission, sellerNetCents: sellerNet, updatedAt: FieldValue.serverTimestamp() });
  });
  const locked = (await ref.get()).data();
  if (locked.transferStatus !== "processing") return;
  try {
    const transfer = await stripeClient().transfers.create({
      amount: sellerNet,
      currency: String(deal.currency || "eur").toLowerCase(),
      destination: accountId,
      transfer_group: `dealhunter_${dealId}`,
      metadata: { dealId, commissionCents: String(commission), grossCents: String(gross) }
    }, { idempotencyKey: `dh-transfer-${dealId}` });
    await ref.update({ transferStatus: "paid", stripeTransferId: transfer.id, transferredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    await ref.update({ transferStatus: "pending_funds_or_review", transferErrorCode: String(error.code || "stripe_error").slice(0, 80), updatedAt: FieldValue.serverTimestamp() });
    console.error("DealHunter transfer deferred", dealId, error.message);
  }
}

exports.releaseDealOnConfirmation = onDocumentWritten("deals/{dealId}", async (event) => {
  if (!event.data?.after?.exists) return;
  await tryReleaseDeal(event.params.dealId);
});

exports.stripeWebhook = onRequest({ secrets: [stripeSecret, stripeWebhookSecret] }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], stripeWebhookSecret.value());
  } catch (error) {
    console.error("Stripe webhook signature rejected", error.message);
    return res.status(400).send("Invalid signature");
  }
  const eventRef = db.collection("processed_stripe_events").doc(event.id);
  const already = await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return true;
    tx.create(eventRef, { type: event.type, receivedAt: FieldValue.serverTimestamp() });
    return false;
  });
  if (already) return res.status(200).send("Already processed");

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      const dealId = session.metadata?.dealId || session.client_reference_id;
      if (dealId) {
        const ref = db.collection("deals").doc(dealId);
        const snap = await ref.get();
        if (snap.exists && snap.data().amountTotalCents === session.amount_total) {
          await ref.update({
            paymentStatus: "paid",
            stripePaymentIntentId: session.payment_intent || null,
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
      }
      }
    }
  } else if (event.type === "account.updated") {
    const account = event.data.object;
    const companyId = account.metadata?.dealhunterCompanyId;
    if (companyId) {
      await db.collection("companies").doc(companyId).update({
        stripeOnboardingStatus: account.details_submitted && account.payouts_enabled ? "complete" : "pending",
        stripePayoutsEnabled: Boolean(account.payouts_enabled),
        stripeChargesEnabled: Boolean(account.charges_enabled),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  } else if (event.type === "balance.available") {
    const pending = await db.collection("deals").where("transferStatus", "==", "pending_funds_or_review").limit(200).get();
    for (const doc of pending.docs) {
      await doc.ref.update({ transferStatus: "pending", updatedAt: FieldValue.serverTimestamp() });
      await tryReleaseDeal(doc.id);
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntentId = charge.payment_intent;
    if (paymentIntentId) {
      const matches = await db.collection("deals").where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
      for (const doc of matches.docs) {
        const deal = doc.data();
        if (deal.stripeTransferId) {
          try {
            await stripeClient().transfers.createReversal(deal.stripeTransferId, {}, { idempotencyKey: `dh-refund-reversal-${doc.id}` });
          } catch (error) {
            console.error("Transfer reversal needs manual review", doc.id, error.message);
            await doc.ref.update({ refundStatus: "manual_review", refundErrorCode: String(error.code || "stripe_error") });
            continue;
          }
        }
        await doc.ref.update({ refundStatus: "refunded", transferStatus: deal.stripeTransferId ? "reversed" : (deal.transferStatus || "none"), refundedAt: FieldValue.serverTimestamp() });
      }
    }
  }
  return res.status(200).send("ok");
});
