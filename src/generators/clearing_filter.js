// clearing_filter.js
const fs   = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const INPUT_FILE   = process.argv[2] || "BLZ.xml";
const OUTPUT_BLOCK = "sonderbanken_block.json";
const OUTPUT_WARN  = "sonderbanken_warn.json";
const OUTPUT_STATS = "sonderbanken_stats.json";

// ══════════════════════════════════════════════════════════════
// MUSTER – HARD BLOCK (keine Privatkonten / reines Clearing)
// ══════════════════════════════════════════════════════════════
const HARD_BLOCK_PATTERNS = [
  { pattern: /bundesbank/i,         label: "Bundesbank" },
  { pattern: /\bbbk\b/i,            label: "BBk (Bundesbank-Kürzel)" },
  { pattern: /\bclearing\b/i,       label: "Clearing" },
  { pattern: /settlement/i,         label: "Settlement" },
  { pattern: /clearstream/i,        label: "Clearstream" },
  { pattern: /\bsecb\b/i,           label: "SECB" },
  { pattern: /wertpapierservice/i,  label: "WertpapierService" },
  { pattern: /\bdwpbank\b/i,        label: "dwpbank" },
  { pattern: /wertpapier.{0,10}bank/i, label: "Wertpapierbank" },
  { pattern: /clearingstelle/i,       label: "Clearingstelle" },
  { pattern: /euro.{0,5}clearing/i, label: "Euro Clearing" },
];

// ══════════════════════════════════════════════════════════════
// MUSTER – SOFT WARN (Förder-/Spezialbanken – manuell prüfen)
// ══════════════════════════════════════════════════════════════
const SOFT_WARN_PATTERNS = [
  // Bund
  { pattern: /\bkfw\b/i,                        label: "KfW" },
  { pattern: /kreditanstalt für wiederaufbau/i, label: "KfW (Langname)" },
  { pattern: /\brentenbank\b/i,                 label: "Rentenbank" },
  { pattern: /landwirtschaftliche rentenbank/i,  label: "Rentenbank (Langname)" },

  // Länder-Förderbanken
  { pattern: /förderbank/i,                     label: "Förderbank" },
  { pattern: /aufbaubank/i,                     label: "Aufbaubank" },
  { pattern: /investitionsbank/i,               label: "Investitionsbank" },
  { pattern: /investitions- und strukturbank/i,  label: "Investitions- und Strukturbank" },
  { pattern: /\bnrw\.bank\b/i,                  label: "NRW.BANK" },
  { pattern: /\bl-bank\b/i,                     label: "L-Bank" },
  { pattern: /landeskreditbank/i,               label: "Landeskreditbank" },
  { pattern: /lfa förderbank/i,                 label: "LfA Förderbank" },
  { pattern: /\blfa\b/i,                       label: "LfA" },
  { pattern: /\bwibank\b/i,                     label: "WIBank" },
  { pattern: /wirtschafts- und infrastrukturbank/i, label: "WIBank (Langname)" },
  { pattern: /hessische förder/i,               label: "Hessische Förderbank" },
  { pattern: /ReiseBank/i,                    label: "ReiseBank" },
  { pattern: /Verrechnung/i,                    label: "Verrechnung" },
  { pattern: /Helaba/i,                      label: "Helaba" },

  // Kürzel für Aufbaubanken
  { pattern: /\bibb\b/i,                       label: "IBB" },
  { pattern: /\bilb\b/i,                       label: "ILB" },
  { pattern: /\bisb\b/i,                       label: "ISB" },
  { pattern: /\btab\b/i,                       label: "TAB" },
  { pattern: /\bbab\b/i,                       label: "BAB" },
  { pattern: /\bsab\b/i,                       label: "SAB" },

  // Bürgschaftsbanken
  { pattern: /bürgschaftsbank/i,               label: "Bürgschaftsbank" },
  { pattern: /bürgschafts- und beteiligungsgesellschaft/i, label: "Bürgschaftsgesellschaft" },
  { pattern: /beteiligungsgesellschaft/i,      label: "Beteiligungsgesellschaft" },

  // Zentralinstitute / Sektorzentralen
  { pattern: /\bdz bank\b/i,                  label: "DZ BANK" },
  { pattern: /\bdekabank\b/i,                 label: "DekaBank" },
  { pattern: /zentralbank/i,                  label: "Zentralbank" },
  { pattern: /zentralinstitut/i,              label: "Zentralinstitut" },
  { pattern: /landesbank/i,                   label: "Landesbank" },
  { pattern: /girozentrale/i,                 label: "Girozentrale" },
  { pattern: /verbundbank/i,                  label: "Verbundbank" },

  // Hypothekenbanken / Pfandbriefbanken
  { pattern: /hypothekenbank/i,               label: "Hypothekenbank" },
  { pattern: /pfandbriefbank/i,               label: "Pfandbriefbank" },
  { pattern: /pfandbriefinstitut/i,           label: "Pfandbriefinstitut" },

  // Sonstige Spezialinstitute
  { pattern: /liquiditäts/i,                 label: "Liquiditätsinstitut" },
  { pattern: /\btreuhand\b/i,                 label: "Treuhand" },
  { pattern: /fördergesellschaft/i,            label: "Fördergesellschaft" },
  { pattern: /sondervermögen/i,                label: "Sondervermögen" },
];

// ══════════════════════════════════════════════════════════════
// BUNDESBANK-ERKENNUNG
// ══════════════════════════════════════════════════════════════
function isBundesbankBLZ(blz) {
  return /^\d{2}000000$/.test(blz);
}

function isBundesbankBIC(bic) {
  return bic.startsWith("MARKDEF") || bic === "MARKDEFFXXX";
}

// ══════════════════════════════════════════════════════════════
// KLASSIFIZIERUNG
// ══════════════════════════════════════════════════════════════
function classifyBank(eintrag) {
  const text = `${eintrag.Bezeichnung || ""} ${eintrag.Kurzbez || ""}`.toLowerCase();
  const bic  = String(eintrag.BIC || "");
  const blz  = String(eintrag.BLZ || "");

  if (isBundesbankBLZ(blz)) return { label: "BLOCK", reason: `BLZ-Muster Bundesbank (${blz})` };
  if (isBundesbankBIC(bic)) return { label: "BLOCK", reason: `BIC-Muster Bundesbank (${bic})` };

  for (const { pattern, label } of HARD_BLOCK_PATTERNS) {
    if (pattern.test(text)) return { label: "BLOCK", reason: label };
  }
  for (const { pattern, label } of SOFT_WARN_PATTERNS) {
    if (pattern.test(text)) return { label: "WARN", reason: label };
  }

  return { label: "OK", reason: null };
}

// ══════════════════════════════════════════════════════════════
// LOOKUP-FUNKTION (für externen Gebrauch via require)
// ══════════════════════════════════════════════════════════════
function buildLookup(blockList, warnList) {
  const blockSet = new Map(blockList.map(e => [e.blz, e]));
  const warnSet  = new Map(warnList.map(e => [e.blz, e]));

  return function checkIBANStatus(iban) {
    if (!iban || typeof iban !== "string") return { status: "ERROR", reason: "Kein IBAN übergeben" };
    const clean = iban.replace(/\s/g, "").toUpperCase();
    if (!clean.startsWith("DE") || clean.length !== 22) return { status: "OK", reason: null };

    const blz = clean.slice(4, 12);

    if (blockSet.has(blz)) {
      const b = blockSet.get(blz);
      return { status: "BLOCK", blz, bezeichnung: b.bezeichnung, reason: b.reason };
    }
    if (warnSet.has(blz)) {
      const w = warnSet.get(blz);
      return { status: "WARN", blz, bezeichnung: w.bezeichnung, reason: w.reason };
    }
    return { status: "OK", blz, reason: null };
  };
}

// ══════════════════════════════════════════════════════════════
// MAIN (nur beim direkten Aufruf – baut JSON-Dateien neu)
// ══════════════════════════════════════════════════════════════
if (require.main === module) {

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ Datei nicht gefunden: ${INPUT_FILE}`);
  process.exit(1);
}

console.log(`📂 Lese ${INPUT_FILE} ...`);
const xml = fs.readFileSync(INPUT_FILE, "utf-8");

// FIX: ignoreDeclaration verhindert, dass <?xml ...?> als Knoten erkannt wird
const parser = new XMLParser({
  ignoreAttributes:    false,
  ignoreDeclaration:   true,          // ← FIX 1
  removeNSPrefix:      true,
  isArray: (name) => name === "BLZEintrag",
});

const parsed = parser.parse(xml);

// FIX 2: Nicht Object.keys(parsed)[0], sondern explizit Document suchen
const rootObj = parsed.Document || parsed;
const eintraege = rootObj?.BLZEintrag;

if (!Array.isArray(eintraege) || eintraege.length === 0) {
  console.error("❌ Keine BLZEintrag-Elemente gefunden – XML-Struktur prüfen!");
  console.error("   Root-Keys:", Object.keys(parsed));
  if (rootObj && typeof rootObj === "object") {
    console.error("   Document-Keys:", Object.keys(rootObj));
  }
  process.exit(1);
}

console.log(`✅ ${eintraege.length} Einträge geladen\n`);

const results = { BLOCK: [], WARN: [], OK: [] };

for (const e of eintraege) {
  if (String(e.BLZLoesch) === "1") continue;

  const { label, reason } = classifyBank(e);

  const entry = {
    blz:         String(e.BLZ         || ""),
    bic:         String(e.BIC         || ""),
    bezeichnung: String(e.Bezeichnung || ""),
    kurzbez:     String(e.Kurzbez     || ""),
    plz:         String(e.PLZ         || ""),
    ort:         String(e.Ort         || ""),
    merkmal:     String(e.Merkmal     || ""),
    reason,
    label,
  };

  results[label].push(entry);
}

fs.writeFileSync(OUTPUT_BLOCK, JSON.stringify(results.BLOCK, null, 2), "utf-8");
fs.writeFileSync(OUTPUT_WARN,  JSON.stringify(results.WARN,  null, 2), "utf-8");

function groupByReason(list) {
  const map = {};
  for (const e of list) map[e.reason] = (map[e.reason] || 0) + 1;
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
}

const stats = {
  gesamt:        eintraege.length,
  block:         results.BLOCK.length,
  warn:          results.WARN.length,
  ok:            results.OK.length,
  block_anteil:  `${((results.BLOCK.length / eintraege.length) * 100).toFixed(1)} %`,
  warn_anteil:   `${((results.WARN.length  / eintraege.length) * 100).toFixed(1)} %`,
  block_reasons: groupByReason(results.BLOCK),
  warn_reasons:  groupByReason(results.WARN),
};

fs.writeFileSync(OUTPUT_STATS, JSON.stringify(stats, null, 2), "utf-8");

console.log("═══════════════════════════════════════");
console.log("  ERGEBNIS");
console.log("═══════════════════════════════════════");
console.log(`  Gesamt:   ${stats.gesamt}`);
console.log(`  ✅ OK:    ${stats.ok}`);
console.log(`  ❌ BLOCK: ${stats.block} (${stats.block_anteil})`);
console.log(`  ⚠️  WARN:  ${stats.warn}  (${stats.warn_anteil})`);
console.log("\n📊 BLOCK-Gründe:");
for (const [r, c] of Object.entries(stats.block_reasons))
  console.log(`   ${String(c).padStart(4)}x  ${r}`);
console.log("\n📊 WARN-Gründe:");
for (const [r, c] of Object.entries(stats.warn_reasons))
  console.log(`   ${String(c).padStart(4)}x  ${r}`);
console.log("\n📁 Geschrieben:");
console.log(`   ${OUTPUT_BLOCK}`);
console.log(`   ${OUTPUT_WARN}`);
console.log(`   ${OUTPUT_STATS}`);

} // end if (require.main === module)

// ══════════════════════════════════════════════════════════════
// MODULE-EXPORT (lädt aus vorberechneten JSON-Dateien)
// ══════════════════════════════════════════════════════════════
const _blockList = JSON.parse(fs.readFileSync(path.join(__dirname, OUTPUT_BLOCK), "utf-8"));
const _warnList  = JSON.parse(fs.readFileSync(path.join(__dirname, OUTPUT_WARN),  "utf-8"));
const checkIBANStatus = buildLookup(_blockList, _warnList);
module.exports = { checkIBANStatus, buildLookup };
