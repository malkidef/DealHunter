/**
 * DealHunter — matching emploi et missions individuelles.
 * Séparé du matching de prestations entre entreprises.
 * Aucune donnée sensible, coordonnée privée ou décision automatique d’embauche.
 */
"use strict";
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const list = value => Array.isArray(value) ? value.map(normalize).filter(Boolean) : [];
const words = value => new Set(normalize(value).split(/\s+/).filter(word => word.length > 2));
function validateCandidate(c) {
  if (!c || typeof c !== "object") throw new TypeError("Profil candidat invalide.");
  for (const f of ["id","ownerUid","category","location","countryCode"]) if (typeof c[f] !== "string" || !c[f].trim()) throw new TypeError("Profil candidat : champ obligatoire " + f + ".");
  if (c.status !== "active") throw new TypeError("Profil candidat non actif.");
  if (!/^[A-Z]{2}$/.test(c.countryCode)) throw new TypeError("Code pays invalide.");
  if (!Array.isArray(c.engagementTypes) || c.engagementTypes.some(x => !["employment","independent"].includes(x))) throw new TypeError("Types d’engagement invalides.");
  return c;
}
function validateOpening(o) {
  if (!o || typeof o !== "object") throw new TypeError("Offre invalide.");
  for (const f of ["id","ownerUid","category","location","countryCode","engagementType"]) if (typeof o[f] !== "string" || !o[f].trim()) throw new TypeError("Offre : champ obligatoire " + f + ".");
  if (o.status !== "active") throw new TypeError("Offre non active.");
  if (!/^[A-Z]{2}$/.test(o.countryCode)) throw new TypeError("Code pays invalide.");
  if (!["employment","independent"].includes(o.engagementType)) throw new TypeError("Type d’engagement invalide.");
  return o;
}
function similarity(aValue,bValue) { const a=words(aValue),b=words(bValue); if(!a.size||!b.size)return 0; let n=0; for(const w of a)if(b.has(w))n++; return n/new Set([...a,...b]).size; }
function scoreWorkPair(candidate,opening) {
  validateCandidate(candidate); validateOpening(opening);
  if(candidate.ownerUid===opening.ownerUid || !candidate.engagementTypes.includes(opening.engagementType))return null;
  const remote=candidate.remote===true&&opening.remoteAccepted===true;
  const sameCountry=candidate.countryCode===opening.countryCode;
  const sameArea=sameCountry&&normalize(candidate.location)===normalize(opening.location);
  if(!sameArea&&!remote)return null;
  const exact=normalize(candidate.category)===normalize(opening.category);
  const categoryScore=exact?40:Math.round(similarity(candidate.category,opening.category)*25);
  if(!exact&&categoryScore<12)return null;
  const requiredSkills=list(opening.requiredSkills),skills=new Set(list(candidate.skills));
  if(requiredSkills.some(x=>!skills.has(x)))return null;
  const requiredQualifications=list(opening.requiredQualifications),quals=new Set(list(candidate.qualifications));
  if(requiredQualifications.some(x=>!quals.has(x)))return null;
  const skillsScore=Math.min(25,requiredSkills.length*5),qualsScore=Math.min(15,requiredQualifications.length*5);
  const locationScore=sameArea?15:remote?10:0;
  const availabilityScore=!opening.startDate||!candidate.availableFrom||Date.parse(candidate.availableFrom)<=Date.parse(opening.startDate)?5:0;
  const titleScore=Math.round(similarity(candidate.title||candidate.category,opening.title||opening.category)*10);
  return {candidateId:candidate.id,openingId:opening.id,candidateUid:candidate.ownerUid,employerUid:opening.ownerUid,engagementType:opening.engagementType,category:opening.category,compatibilityScore:Math.min(100,categoryScore+skillsScore+qualsScore+locationScore+availabilityScore+titleScore),locationMode:sameArea?"same_area":"remote",status:"suggested"};
}
function makeWorkCandidates(candidates,openings) { if(!Array.isArray(candidates)||!Array.isArray(openings))throw new TypeError("Les profils et offres doivent être des tableaux."); const out=[]; for(const c of candidates)for(const o of openings){const match=scoreWorkPair(c,o);if(match)out.push(match);} return out.sort((a,b)=>b.compatibilityScore-a.compatibilityScore); }
module.exports={scoreWorkPair,makeWorkCandidates,validateCandidate,validateOpening};