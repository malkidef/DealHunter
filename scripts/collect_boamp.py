#!/usr/bin/env python3
"""Collecte BOAMP et qualification indicative des besoins."""
import ast, gzip, html, json, os, re, unicodedata, urllib.request
from datetime import datetime, timezone

BASE="https://boamp-datadila.opendatasoft.com/api/explore/v2.1"
DATASET="boamp"
OUT="data/boamp-buyer-opportunities.json"
PAGE_SIZE=100
MAX_RECORDS=5000
HEADERS={"User-Agent":"DealHunter/0.2 (open-data reuse)"}

RULES=[
("Équipements industriels et scientifiques","produits",[r"\bmicroscope",r"\banalyseur",r"\bcapture volumetrique",r"\bsonorisation",r"\beclairage scenique",r"\bsechoir(s)?",r"\bplieur(s)?",r"\bequipement industriel",r"\bmachine(s)?",r"\boutillage",r"\bcompresseur",r"\bpompe(s)?"]),
("Informatique et télécommunications","produits",[r"\binformatique",r"\bordinateur",r"\bserveur(s)?",r"\blogiciel",r"\btelephone(s)?",r"\btelecommunication",r"\bphotocopieur",r"\bimprimante(s)?"]),
("Mobilier et stockage","produits",[r"\bmobilier",r"\bmeuble(s)?",r"\brayonnage",r"\bstockage",r"\barmoire(s)?",r"\btable(s)?",r"\bchaise(s)?",r"\brangement"]),
("Emballage et logistique","produits",[r"\bemballage",r"\bcarton(s)?",r"\bpalette(s)?",r"\bconditionnement",r"\bconteneur(s)?"]),
("EPI et sécurité","produits",[r"\bepi\b",r"\bequipement(s)? de protection",r"\bvetement(s)? de travail",r"\bprotection individuelle"]),
("Alimentation","produits",[r"\bdenree(s)? alimentaire(s)?",r"\balimentaire(s)?",r"\bproduit(s)? alimentaires",r"\brestauration collective",r"\bboisson(s)?",r"\bproduit(s)? appertise(s)?",r"\brepas"]),
("Énergie et combustibles","produits",[r"\bpellet(s)?",r"\bgranule(s)?",r"\bcombustible(s)?",r"\bfioul",r"\bbois de chauffage",r"\bcarburant(s)?"]),
("Véhicules et transport","produits",[r"\bvehicule(s)?",r"\bautomobile(s)?",r"\bcamion(s)?",r"\butilitaire(s)?",r"\bvelo(s)?"]),
("Fournitures et consommables","produits",[r"\bfourniture(s)?",r"\bconsommable(s)?",r"\bpapier",r"\bproduit(s)? d'entretien",r"\bproduit(s)? d'hygiene"]),
("Matériaux et composants","produits",[r"\bmateriaux",r"\bmateriel(s)?",r"\bcomposant(s)?",r"\bpieces detachees",r"\bacier",r"\bbois",r"\betancheite"]),
]
WORK=[r"\btravaux\b",r"\bconstruction\b",r"\brehabilitation\b",r"\brenovation\b",r"\bamenagement\b",r"\brefection\b",r"\bpose\b",r"\bchantier\b",r"\bmaitrise d'oeuvre\b"]
SERVICE=[r"\blocation de vehicule(s)?\b",r"\blongue duree\b",r"\betude de trafic\b",r"\bservices sylvicoles\b",r"\bfourniture de services\b",r"\bprestations video et son\b",r"\bprestation(s)?\b",r"\bmaintenance\b",r"\bentretien\b",r"\bnettoyage\b",r"\bconseil\b",r"\bamo\b",r"\betude(s)?\b",r"\bassistance\b",r"\bformation\b",r"\baccueil\b",r"\bgestion\b",r"\bcollecte\b",r"\bconcession\b",r"\bdelegation de service public\b"]

def get_json(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=40) as r:
        raw=r.read()
        if raw[:2]==bytes((31,139)): raw=gzip.decompress(raw)
        return json.loads(raw.decode("utf-8-sig"))

def field_name(fields,patterns):
    for f in fields:
        n=f.get("name","")
        if any(re.search(p,n.lower()) for p in patterns): return n
    return None

def first(row,names):
    for n in names:
        v=row.get(n)
        if v not in (None,""): return v
    return ""

def clean(value):
    if isinstance(value,(dict,list)): value=" ".join(map(str,value))
    return html.unescape(str(value or "")).strip()

def place_text(value):
    if isinstance(value,str):
        try:
            parsed=ast.literal_eval(value)
            if isinstance(parsed,(list,tuple)): value=parsed
        except (ValueError,SyntaxError): pass
    if isinstance(value,(list,tuple,set)): return ", ".join(clean(x) for x in value if clean(x))
    return clean(value)

def norm(value):
    s=unicodedata.normalize("NFKD",clean(value).lower())
    return re.sub(r"\s+"," ","".join(c for c in s if not unicodedata.combining(c))).strip()

def classify(title):
    """Classement prudent : services/travaux explicites avant les mots génériques de fourniture."""
    t=norm(title)
    if re.search(r"\battribution\b|\bmarche attribue\b|\bavis d'attribution\b",t):
        return {"category":"Avis d’attribution","kind":"attribution","relevance":"faible","reason":"Avis d’attribution : vérifier si le marché est déjà attribué."}
    # Les formulations de service priment sur les mots isolés comme « véhicule »,
    # « sécurité » ou « fourniture ».
    if any(re.search(p,t) for p in SERVICE):
        return {"category":"Services et prestations","kind":"services","relevance":"faible","reason":"Marché principalement lié à une prestation de services."}
    if any(re.search(p,t) for p in WORK):
        return {"category":"Travaux et construction","kind":"travaux","relevance":"faible","reason":"Marché principalement lié à des travaux."}
    for category,kind,patterns in RULES:
        if any(re.search(p,t) for p in patterns):
            return {"category":category,"kind":kind,"relevance":"à étudier","reason":"Besoin potentiel de fourniture ou de matériel détecté dans l’intitulé."}
    return {"category":"À qualifier","kind":"inconnu","relevance":"à vérifier","reason":"Intitulé insuffisant pour déterminer le type de besoin."}


def fetch_records(order=""):
    """Read bounded pages from Opendatasoft Explore API and report truncation."""
    rows=[]
    total_available=0
    offset=0
    while offset < MAX_RECORDS:
        url=f"{BASE}/catalog/datasets/{DATASET}/records?limit={PAGE_SIZE}&offset={offset}{order}"
        payload=get_json(url)
        page=payload.get("results") if isinstance(payload,dict) else None
        if not isinstance(page,list):
            raise RuntimeError("Réponse BOAMP invalide : résultats absents; ancien flux conservé.")
        try:
            total_available=max(total_available,int(payload.get("total_count",total_available) or 0))
        except (TypeError,ValueError):
            pass
        if not page:
            break
        rows.extend(page)
        offset += len(page)
        if len(page) < PAGE_SIZE or (total_available and offset >= total_available):
            break
    return rows[:MAX_RECORDS], total_available, (total_available > MAX_RECORDS and len(rows) >= MAX_RECORDS)

def main():
    meta=get_json(f"{BASE}/catalog/datasets/{DATASET}")
    fields=meta.get("fields",[])
    title_field=field_name(fields,[r"^objet$",r"^objet_marche$",r"^intitule$",r"^titre$"])
    date_field=field_name(fields,[r"^dateparution$",r"date.*publication",r"^date_publication$"])
    if not title_field: raise RuntimeError("Champ titre BOAMP introuvable; flux existant conservé.")
    order=f"&order_by={date_field}%20desc" if date_field else ""
    rows, total_available, truncated = fetch_records(order)
    notices=[]
    seen=set()
    for row in rows:
        title=clean(first(row,[title_field,"objet","intitule","titre"]))
        if not title: continue
        stable_id=str(first(row,["id","idweb","numero_avis","reference"]) or "").strip()
        dedupe_key=stable_id or (title,clean(first(row,[date_field] if date_field else [])),clean(first(row,["nomacheteur","acheteur","organisme"])))
        if dedupe_key in seen: continue
        seen.add(dedupe_key)
        notices.append({
            "id":str(first(row,["id","idweb","numero_avis","reference"]) or ""),
            "title":title,
            "buyer":clean(first(row,["nomacheteur","acheteur","organisme","nom_acheteur","denomination"])),
            "place":place_text(first(row,["ville","lieu_execution","lieuexecution","code_departement"])),
            "deadline":clean(first(row,["datelimitereponse","date_limite_reponse","date_limite","datelimitereceptionoffres"])),
            "url":clean(first(row,["url","url_avis","urlavis","lien"])) or "https://www.boamp.fr/",
            "source":"BOAMP / DILA","verified":False,**classify(title)
        })
    os.makedirs("data",exist_ok=True)
    output={"source":"BOAMP — API open data DILA","source_url":"https://boamp-datadila.opendatasoft.com/explore/dataset/boamp/api/","license":"Licence Ouverte / Open Licence","collected_at":datetime.now(timezone.utc).isoformat(),"count":len(notices),"total_available":total_available,"truncated":truncated,"notices":notices}
    tmp=OUT+".tmp"
    with open(tmp,"w",encoding="utf-8") as f: json.dump(output,f,ensure_ascii=False,indent=2)
    os.replace(tmp,OUT)
    counts={}
    for n in notices: counts[n["kind"]]=counts.get(n["kind"],0)+1
    print(f"BOAMP: {len(notices)} avis collectés et classés (non vérifiés). Répartition: {counts}")

if __name__=="__main__": main()
