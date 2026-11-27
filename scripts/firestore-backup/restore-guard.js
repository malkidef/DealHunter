"use strict";

const PRODUCTION_PROJECT_ID = "dealhunter-3747";

function validateRestoreTarget({ projectId, emulatorHost, explicitConfirmation }) {
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new Error("Restauration interdite vers le projet de production DealHunter");
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Identifiant de projet de test obligatoire");
  }
  if (explicitConfirmation !== true) {
    throw new Error("Confirmation explicite de la cible de test obligatoire");
  }
  if (typeof emulatorHost !== "string" || !/^(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(emulatorHost)) {
    throw new Error("La restauration de test doit cibler un émulateur local");
  }
  const port = Number(emulatorHost.slice(emulatorHost.lastIndexOf(":") + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port de l'émulateur invalide");
  }
  return { projectId, emulatorHost, mode: "emulator-only" };
}

module.exports = { validateRestoreTarget, PRODUCTION_PROJECT_ID };
