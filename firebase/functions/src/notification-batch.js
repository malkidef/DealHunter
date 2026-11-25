const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

const PROJECT_ID = "dealhunter-3747b";
const PAGE_SIZE = 400;
const OVERLAP_MS = 10 * 60 * 1000;
const INITIAL_LOOKBACK_MS = 15 * 60 * 1000;

function initialize() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.project_id !== PROJECT_ID || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("Le compte de service ne correspond pas au projet DealHunter attendu.");
    }
    initializeApp({ credential: require("firebase-admin/app").cert(serviceAccount), projectId: PROJECT_ID });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}

initialize();
const db = getFirestore();

function timestampMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function notificationId(eventKey, recipientUid, type) {
  return crypto.createHash("sha256").update(`${eventKey}:${recipientUid}:${type}`).digest("hex");
}

async function notify({ eventKey, recipientUid, type, title, body, relatedId }) {
  if (typeof recipientUid !== "string" || !recipientUid.trim() || recipientUid.length > 128) return false;
  const ref = db.collection("notifications").doc(notificationId(eventKey, recipientUid, type));
  try {
    await ref.create({
      recipientUid,
      type,
      title: String(title || "Notification DealHunter").slice(0, 120),
      body: String(body || "").slice(0, 1000),
      relatedId: typeof relatedId === "string" ? relatedId.slice(0, 180) : null,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null
    });
    return true;
  } catch (error) {
    if (error.code === 6 || error.code === "already-exists") return false;
    throw error;
  }
}

async function eachSince(collectionName, field, sinceMillis, handler) {
  let last = null;
  let scanned = 0;
  while (true) {
    let query = db.collection(collectionName)
      .where(field, ">=", Timestamp.fromMillis(sinceMillis))
      .orderBy(field)
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      await handler(doc.id, doc.data());
      scanned += 1;
    }
    last = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) break;
  }
  return scanned;
}

async function main() {
  const checkpointRef = db.collection("systemJobs").doc("notificationWorker");
  const checkpointSnap = await checkpointRef.get();
  const now = Date.now();
  const previous = checkpointSnap.exists ? timestampMillis(checkpointSnap.data().lastSuccessfulAt) : null;
  const sinceMillis = previous ? Math.max(0, previous - OVERLAP_MS) : now - INITIAL_LOOKBACK_MS;
  let created = 0;
  const counts = {};

  const count = async (name, work) => { counts[name] = await work(); };

  await count("newRequests", () => eachSince("matchRequests", "createdAt", sinceMillis, async (id, data) => {
    if (data.status !== "pending") return;
    if (await notify({
      eventKey: `request-created:${id}:${timestampMillis(data.createdAt) || "unknown"}`,
      recipientUid: data.recipientUid,
      type: "match_request",
      title: "Nouvelle demande de mise en relation",
      body: `${String(data.requesterCompany || "Une entreprise").slice(0, 100)} souhaite vous contacter au sujet de ${String(data.product || "un produit").slice(0, 140)}.`,
      relatedId: id
    })) created += 1;
  }));

  await count("requestDecisions", () => eachSince("matchRequests", "respondedAt", sinceMillis, async (id, data) => {
    if (!["accepted", "rejected"].includes(data.status) || !data.requesterUid) return;
    if (await notify({
      eventKey: `request-decision:${id}:${timestampMillis(data.respondedAt) || "unknown"}:${data.status}`,
      recipientUid: data.requesterUid,
      type: data.status === "accepted" ? "match_accepted" : "match_rejected",
      title: data.status === "accepted" ? "Demande acceptée" : "Demande refusée",
      body: data.status === "accepted"
        ? "Votre mise en relation est acceptée. Vous pouvez poursuivre l'échange dans DealHunter."
        : "Votre demande de mise en relation a été refusée.",
      relatedId: id
    })) created += 1;
  }));

  const processRequestCollection = async (collectionName, label, title) => {
    await count(collectionName + "Created", () => eachSince(collectionName, "createdAt", sinceMillis, async (id, data) => {
      if (data.status !== "pending") return;
      if (await notify({
        eventKey: collectionName + "-created:" + id + ":" + (timestampMillis(data.createdAt) || "unknown"),
        recipientUid: data.recipientUid,
        type: collectionName === "serviceMatchRequests" ? "service_match_request" : "work_match_request",
        title,
        body: String(data.requesterCompany || "Un utilisateur").slice(0, 100) + " vous propose une mise en relation : " + String(data.serviceTitle || data.needTitle || data.candidateTitle || data.openingTitle || label).slice(0, 140) + ".",
        relatedId: id
      })) created += 1;
    }));
    await count(collectionName + "Decisions", () => eachSince(collectionName, "respondedAt", sinceMillis, async (id, data) => {
      if (!["accepted", "rejected"].includes(data.status) || !data.requesterUid) return;
      if (await notify({
        eventKey: collectionName + "-decision:" + id + ":" + (timestampMillis(data.respondedAt) || "unknown") + ":" + data.status,
        recipientUid: data.requesterUid,
        type: data.status === "accepted" ? "match_accepted" : "match_rejected",
        title: data.status === "accepted" ? "Mise en relation acceptée" : "Mise en relation refusée",
        body: data.status === "accepted" ? "Votre demande a été acceptée. Vous pouvez poursuivre l’échange dans DealHunter." : "Votre demande de mise en relation a été refusée.",
        relatedId: id
      })) created += 1;
    }));
  };

  await processRequestCollection("serviceMatchRequests", "un service", "Nouvelle demande de service");
  await processRequestCollection("workMatchRequests", "une opportunité professionnelle", "Nouvelle demande professionnelle");

  const processMessageCollection = async (collectionName, requestCollection) => {
    await count(collectionName, () => eachSince(collectionName, "createdAt", sinceMillis, async (id, data) => {
      if (typeof data.requestId !== "string" || typeof data.senderUid !== "string") return;
      const requestSnap = await db.collection(requestCollection).doc(data.requestId).get();
      if (!requestSnap.exists) return;
      const request = requestSnap.data();
      if (request.status !== "accepted" || !Array.isArray(request.participantUids) || !request.participantUids.includes(data.senderUid)) return;
      const recipientUid = request.participantUids.find(uid => uid !== data.senderUid);
      if (await notify({
        eventKey: collectionName + "-created:" + id + ":" + (timestampMillis(data.createdAt) || "unknown"),
        recipientUid,
        type: "match_message",
        title: "Nouveau message DealHunter",
        body: "Vous avez reçu un nouveau message dans une conversation acceptée.",
        relatedId: data.requestId
      })) created += 1;
    }));
  };

  await processMessageCollection("serviceMatchMessages", "serviceMatchRequests");
  await processMessageCollection("workMatchMessages", "workMatchRequests");
  await count("newMessages", () => eachSince("matchMessages", "createdAt", sinceMillis, async (id, data) => {
    if (typeof data.requestId !== "string" || typeof data.senderUid !== "string") return;
    const requestSnap = await db.collection("matchRequests").doc(data.requestId).get();
    if (!requestSnap.exists) return;
    const request = requestSnap.data();
    if (request.status !== "accepted" || !Array.isArray(request.participantUids)
      || !request.participantUids.includes(data.senderUid)) return;
    const recipientUid = request.participantUids.find(uid => uid !== data.senderUid);
    if (await notify({
      eventKey: `message-created:${id}:${timestampMillis(data.createdAt) || "unknown"}`,
      recipientUid,
      type: "match_message",
      title: "Nouveau message DealHunter",
      body: "Vous avez reçu un nouveau message dans une mise en relation acceptée.",
      relatedId: data.requestId
    })) created += 1;
  }));

  await count("newDeals", () => eachSince("deals", "createdAt", sinceMillis, async (id, data) => {
    if (data.status !== "proposed" || !Array.isArray(data.participantUids)) return;
    const recipientUid = data.participantUids.find(uid => uid !== data.proposerUid);
    if (await notify({
      eventKey: `deal-created:${id}:${timestampMillis(data.createdAt) || "unknown"}`,
      recipientUid,
      type: "deal_proposed",
      title: "Nouvelle proposition commerciale",
      body: `Une proposition concernant ${String(data.product || "un produit").slice(0, 140)} vous attend dans DealHunter.`,
      relatedId: id
    })) created += 1;
  }));

  await count("dealUpdates", () => eachSince("deals", "updatedAt", sinceMillis, async (id, data) => {
    if (!["agreed", "completed", "cancelled"].includes(data.status) || !Array.isArray(data.participantUids)) return;
    const labels = {
      agreed: "La proposition commerciale a été acceptée.",
      completed: "La vente a été déclarée terminée. Vérifiez sa confirmation dans DealHunter.",
      cancelled: "La proposition commerciale a été annulée."
    };
    const updatedAt = timestampMillis(data.updatedAt) || "unknown";
    for (const recipientUid of data.participantUids) {
      if (await notify({
        eventKey: `deal-updated:${id}:${updatedAt}:${data.status}`,
        recipientUid,
        type: `deal_${data.status}`,
        title: "Mise à jour de votre transaction",
        body: labels[data.status],
        relatedId: id
      })) created += 1;
    }
  }));

  await checkpointRef.set({
    lastSuccessfulAt: Timestamp.fromMillis(now),
    updatedAt: FieldValue.serverTimestamp(),
    workerVersion: 1
  });
  console.log(JSON.stringify({ ok: true, scanned: counts, notificationsCreated: created, since: new Date(sinceMillis).toISOString(), completedAt: new Date(now).toISOString() }));
}

main().catch(error => {
  console.error("Échec du traitement des notifications DealHunter :", error);
  process.exitCode = 1;
});
