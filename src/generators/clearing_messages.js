// messages/clearing_messages.js

const BLOCK_MESSAGES = {
  // ── Zentralbank / Bundesbank ───────────────────────────────
  "Bundesbank":              {
    title:   "IBAN nicht für Privatkonten geeignet",
    short:   "Bundesbank-Konto – keine Privatkonten",
    detail:  "Diese BLZ gehört zur Deutschen Bundesbank. " +
             "Bundesbank-Konten sind ausschließlich für Interbanken-Zahlungsverkehr " +
             "und werden nicht für Privatpersonen oder Unternehmen geführt.",
    hint:    "Bitte geben Sie die IBAN Ihres Girokontos bei einer Geschäftsbank ein.",
    icon:    "🏛️",
  },
  "BBk (Bundesbank-Kürzel)": {
    title:   "IBAN nicht für Privatkonten geeignet",
    short:   "Bundesbank-Konto – keine Privatkonten",
    detail:  "Diese BLZ gehört zur Deutschen Bundesbank (Filiale). " +
             "Bundesbank-Konten sind ausschließlich für Interbanken-Zahlungsverkehr.",
    hint:    "Bitte geben Sie die IBAN Ihres Girokontos bei einer Geschäftsbank ein.",
    icon:    "🏛️",
  },
  "BLZ-Muster Bundesbank":   {
    title:   "IBAN nicht für Privatkonten geeignet",
    short:   "Bundesbank-Konto – keine Privatkonten",
    detail:  "Die Bankleitzahl entspricht dem Muster einer Bundesbank-Hauptstelle (XX000000). " +
             "Solche Konten werden nicht für den privaten Zahlungsverkehr genutzt.",
    hint:    "Bitte geben Sie die IBAN Ihres Girokontos bei einer Geschäftsbank ein.",
    icon:    "🏛️",
  },
  "BIC-Muster Bundesbank":   {
    title:   "IBAN nicht für Privatkonten geeignet",
    short:   "Bundesbank-BIC erkannt",
    detail:  "Der BIC dieser IBAN identifiziert die Deutsche Bundesbank (MARKDEF…). " +
             "Bundesbank-Konten sind nicht für reguläre Geschäftsvorgänge vorgesehen.",
    hint:    "Bitte geben Sie die IBAN Ihres Girokontos bei einer Geschäftsbank ein.",
    icon:    "🏛️",
  },

  // ── Clearing / Settlement ──────────────────────────────────
  "Clearing":                {
    title:   "Clearing-Konto – nicht verwendbar",
    short:   "Reines Clearing-Institut",
    detail:  "Diese Bank ist ein reines Clearing-Institut und führt keine " +
             "Privatkonten oder Unternehmenskonten für den regulären Zahlungsverkehr. " +
             "Zahlungen auf diese IBAN werden nicht ausgeführt.",
    hint:    "Bitte prüfen Sie, ob Sie eine andere IBAN verwenden möchten.",
    icon:    "🔄",
  },
  "Settlement":              {
    title:   "Settlement-Institut – nicht verwendbar",
    short:   "Reines Settlement-Institut",
    detail:  "Dieses Institut wickelt ausschließlich Wertpapier- oder " +
             "Interbanken-Settlements ab. Reguläre Kontotransaktionen " +
             "sind nicht möglich.",
    hint:    "Bitte prüfen Sie Ihre IBAN und wenden Sie sich an Ihre Bank.",
    icon:    "🔄",
  },
  "Clearinghaus":            {
    title:   "Clearinghaus – nicht verwendbar",
    short:   "Reines Clearinghaus",
    detail:  "Dieses Institut ist ein reines Clearinghaus und führt keine " +
             "Privat- oder Unternehmenskonten.",
    hint:    "Bitte geben Sie Ihre reguläre Bank-IBAN ein.",
    icon:    "🔄",
  },
  "Clearingstelle":          {
    title:   "Clearingstelle – nicht verwendbar",
    short:   "Reines Clearing-Institut",
    detail:  "Diese Bankleitzahl gehört einer Clearingstelle. " +
             "Solche Institute nehmen keine regulären Einlagen an " +
             "und führen keine Privatkonten.",
    hint:    "Bitte geben Sie Ihre reguläre Bank-IBAN ein.",
    icon:    "🔄",
  },
  "Euro Clearing":           {
    title:   "Euro-Clearing-Institut – nicht verwendbar",
    short:   "Euro-Clearing – keine Privatkonten",
    detail:  "Dieses Institut ist ausschließlich im Euro-Clearing aktiv " +
             "und führt keine Konten für Privatpersonen oder Unternehmen.",
    hint:    "Bitte geben Sie Ihre reguläre Bank-IBAN ein.",
    icon:    "🔄",
  },
  "Clearstream":             {
    title:   "Clearstream – nicht verwendbar",
    short:   "Clearstream Banking – kein Privatkonto",
    detail:  "Clearstream Banking ist ein internationaler Wertpapier-Zentralverwahrer " +
             "(ICSD). Clearstream führt keine Privatkonten oder Unternehmenskonten " +
             "für reguläre Transaktionen.",
    hint:    "Bitte geben Sie die IBAN Ihres Girokontos ein.",
    icon:    "📊",
  },

  // ── Wertpapier ─────────────────────────────────────────────
  "WertpapierService":       {
    title:   "Wertpapierservice-Institut – nicht verwendbar",
    short:   "Wertpapier-Servicebank – kein Privatkonto",
    detail:  "Dieses Institut erbringt ausschließlich Wertpapier-Dienstleistungen " +
             "für Banken. Eine direkte Kontonutzung durch Privatpersonen " +
             "oder Unternehmen ist nicht vorgesehen.",
    hint:    "Bitte geben Sie Ihre reguläre Bank-IBAN ein.",
    icon:    "📊",
  },
  "dwpbank":                 {
    title:   "dwpbank – nicht verwendbar",
    short:   "Deutsche WertpapierService Bank – kein Privatkonto",
    detail:  "Die dwpbank (Deutsche WertpapierService Bank AG) ist ein " +
             "reines B2B-Infrastrukturinstitut für die Wertpapierabwicklung. " +
             "Privatkonten werden dort nicht geführt.",
    hint:    "Bitte geben Sie die IBAN Ihres Depot- oder Girokontos bei Ihrer Depotbank ein.",
    icon:    "📊",
  },
  "Wertpapierbank":          {
    title:   "Wertpapierbank – nicht verwendbar",
    short:   "Wertpapierabwicklungsbank – kein Privatkonto",
    detail:  "Diese Bank ist auf die Abwicklung von Wertpapiertransaktionen " +
             "zwischen Instituten spezialisiert und führt keine Privatkonten.",
    hint:    "Bitte geben Sie Ihre reguläre Bank-IBAN ein.",
    icon:    "📊",
  },
  "SECB":                    {
    title:   "SECB – nicht verwendbar",
    short:   "SECB Swiss Euro Clearing Bank – kein Privatkonto",
    detail:  "Die SECB (Swiss Euro Clearing Bank) ist ein reines Clearing-Institut " +
             "für SEPA-Massenzahlungen und führt keine Privatkonten.",
    hint:    "Bitte geben Sie Ihre reguläre Bank-IBAN ein.",
    icon:    "🔄",
  },

  // ── Fallback ───────────────────────────────────────────────
  _default: {
    title:   "IBAN nicht verwendbar",
    short:   "Dieses Institut akzeptiert keine regulären Einzahlungen",
    detail:  "Die eingegebene IBAN gehört einem Spezialinstitut, das keine " +
             "Privatkonten oder regulären Unternehmenskonten führt. " +
             "Zahlungen auf diese IBAN werden voraussichtlich nicht ausgeführt.",
    hint:    "Bitte prüfen Sie Ihre IBAN und wenden Sie sich ggf. an Ihre Bank.",
    icon:    "❌",
  },
};

// ─────────────────────────────────────────────────────────────
const WARN_MESSAGES = {
  // ── Bund / KfW ────────────────────────────────────────────
  "KfW":                     {
    title:   "Förderinstitut – bitte prüfen",
    short:   "KfW Bankengruppe erkannt",
    detail:  "Diese IBAN gehört zur KfW Bankengruppe. KfW-Konten werden " +
             "üblicherweise nicht für laufende Geschäftstransaktionen genutzt, " +
             "sondern für Förderdarlehen und Auszahlungskonten. " +
             "Bitte prüfen Sie, ob diese IBAN korrekt ist.",
    hint:    "Falls Sie ein KfW-Darlehenskonto angeben möchten, ist diese IBAN korrekt. " +
             "Für Ihren regulären Zahlungsverkehr nutzen Sie bitte Ihr Girokonto.",
    icon:    "⚠️",
  },
  "KfW (Langname)":          {
    title:   "Förderinstitut – bitte prüfen",
    short:   "KfW – Kreditanstalt für Wiederaufbau erkannt",
    detail:  "Diese IBAN gehört zur KfW (Kreditanstalt für Wiederaufbau). " +
             "KfW-Konten dienen in der Regel nicht dem regulären Zahlungsverkehr.",
    hint:    "Bitte prüfen Sie, ob dies die richtige IBAN ist.",
    icon:    "⚠️",
  },
  "Rentenbank":              {
    title:   "Förderinstitut – bitte prüfen",
    short:   "Landwirtschaftliche Rentenbank erkannt",
    detail:  "Diese IBAN gehört der Landwirtschaftlichen Rentenbank, " +
             "einem Förderinstitut des Bundes für die Agrarwirtschaft. " +
             "Privatkonten werden dort nicht geführt.",
    hint:    "Bitte prüfen Sie, ob dies die richtige IBAN für Ihren Zweck ist.",
    icon:    "⚠️",
  },

  // ── Länder-Förderbanken ───────────────────────────────────
  "Förderbank":              {
    title:   "Förderbank – bitte prüfen",
    short:   "Staatliche Förderbank erkannt",
    detail:  "Diese IBAN gehört einer staatlichen Förderbank. Förderbanken " +
             "vergeben öffentliche Fördermittel und führen in der Regel keine " +
             "regulären Privatkonten.",
    hint:    "Falls diese IBAN im Rahmen eines Förderantrags oder Förderdarlehens " +
             "angegeben wird, kann sie korrekt sein. Andernfalls prüfen Sie bitte " +
             "Ihre Eingabe.",
    icon:    "⚠️",
  },
  "Aufbaubank":              {
    title:   "Aufbaubank – bitte prüfen",
    short:   "Staatliche Aufbaubank erkannt",
    detail:  "Diese IBAN gehört einer staatlichen Aufbau- oder Entwicklungsbank " +
             "(z. B. SAB, LAB, BAB). Solche Institute führen keine regulären " +
             "Privatgirokonten.",
    hint:    "Falls die IBAN für einen Fördervorgang korrekt ist, können Sie fortfahren. " +
             "Für den normalen Zahlungsverkehr verwenden Sie bitte Ihr Girokonto.",
    icon:    "⚠️",
  },
  "Investitionsbank":        {
    title:   "Investitionsbank – bitte prüfen",
    short:   "Staatliche Investitionsbank erkannt",
    detail:  "Diese IBAN gehört einer staatlichen Investitionsbank (z. B. IBB, ILB, ISB). " +
             "Diese Institute sind auf Investitionsförderung spezialisiert und " +
             "führen keine regulären Privatkonten.",
    hint:    "Bitte prüfen Sie, ob diese IBAN für Ihren Anwendungsfall korrekt ist.",
    icon:    "⚠️",
  },
  "NRW.BANK":                {
    title:   "NRW.BANK – bitte prüfen",
    short:   "NRW.BANK Förderinstitut erkannt",
    detail:  "Diese IBAN gehört der NRW.BANK, der Förderbank des Landes Nordrhein-Westfalen. " +
             "NRW.BANK-Konten sind keine regulären Privatgirokonten.",
    hint:    "Falls die IBAN im Förderkontext korrekt ist, können Sie fortfahren.",
    icon:    "⚠️",
  },
  "L-Bank":                  {
    title:   "L-Bank – bitte prüfen",
    short:   "L-Bank Baden-Württemberg erkannt",
    detail:  "Diese IBAN gehört der L-Bank (Staatsbank für Baden-Württemberg). " +
             "L-Bank-Konten dienen der Förderung und sind keine Privatgirokonten.",
    hint:    "Bitte prüfen Sie, ob diese IBAN für Ihren Zweck korrekt ist.",
    icon:    "⚠️",
  },

  // ── Zentralinstitute ──────────────────────────────────────
  "DZ BANK":                 {
    title:   "DZ BANK – bitte prüfen",
    short:   "DZ BANK (Zentralinstitut) erkannt",
    detail:  "Diese IBAN gehört der DZ BANK, dem Zentralinstitut der Volksbanken " +
             "und Raiffeisenbanken. Die DZ BANK führt in der Regel keine " +
             "Privatgirokonten – für Endkunden wird die lokale Volksbank genutzt.",
    hint:    "Bitte prüfen Sie, ob Sie die IBAN Ihrer Volksbank/Raiffeisenbank " +
             "verwenden möchten.",
    icon:    "⚠️",
  },
  "DekaBank":                {
    title:   "DekaBank – bitte prüfen",
    short:   "DekaBank (Sparkassen-Investmentbank) erkannt",
    detail:  "Diese IBAN gehört der DekaBank, dem Wertpapierhaus der Sparkassen-Finanzgruppe. " +
             "DekaBank-Konten sind in der Regel Fondskonten, keine Privatgirokonten.",
    hint:    "Falls Sie ein Deka-Fondskonto angeben möchten, kann die IBAN korrekt sein. " +
             "Für Ihren Zahlungsverkehr nutzen Sie bitte Ihr Sparkassen-Girokonto.",
    icon:    "⚠️",
  },
  "Landesbank":              {
    title:   "Landesbank – bitte prüfen",
    short:   "Landesbank erkannt",
    detail:  "Diese IBAN gehört einer Landesbank. Landesbanken sind primär " +
             "Großkunden- und Interbankeninstitute. Privatgirokonten werden " +
             "vereinzelt, aber nicht standardmäßig angeboten.",
    hint:    "Falls Sie ein Konto bei dieser Landesbank haben, ist die IBAN korrekt. " +
             "Andernfalls prüfen Sie bitte Ihre Eingabe.",
    icon:    "⚠️",
  },
  "Girozentrale":            {
    title:   "Girozentrale – bitte prüfen",
    short:   "Girozentrale erkannt",
    detail:  "Diese IBAN gehört einer Girozentrale, die als Zentralinstitut " +
             "für Sparkassen fungiert. Privatkonten sind selten, aber möglich.",
    hint:    "Bitte prüfen Sie, ob dies die richtige IBAN für Ihren Zweck ist.",
    icon:    "⚠️",
  },

  // ── Hypothekenbanken ──────────────────────────────────────
  "Hypothekenbank":          {
    title:   "Hypothekenbank – bitte prüfen",
    short:   "Hypothekenbank erkannt",
    detail:  "Diese IBAN gehört einer Hypothekenbank, die sich auf die " +
             "Vergabe von Immobilienkrediten und die Ausgabe von Pfandbriefen " +
             "spezialisiert hat. Reguläre Girokonten werden meist nicht angeboten.",
    hint:    "Falls diese IBAN für eine Hypothekenzahlung oder Darlehensrückzahlung " +
             "korrekt ist, können Sie fortfahren.",
    icon:    "⚠️",
  },
  "Pfandbriefbank":          {
    title:   "Pfandbriefbank – bitte prüfen",
    short:   "Pfandbriefbank erkannt",
    detail:  "Diese IBAN gehört einer Pfandbriefbank. Diese Institute " +
             "refinanzieren sich über Pfandbriefe und führen keine " +
             "regulären Privatgirokonten.",
    hint:    "Bitte prüfen Sie Ihre IBAN.",
    icon:    "⚠️",
  },

  // ── Bürgschaftsbanken ─────────────────────────────────────
  "Bürgschaftsbank":         {
    title:   "Bürgschaftsbank – bitte prüfen",
    short:   "Bürgschaftsbank erkannt",
    detail:  "Diese IBAN gehört einer Bürgschaftsbank. Bürgschaftsbanken " +
             "stellen Bürgschaften für Unternehmen bereit und führen keine " +
             "regulären Privatkonten.",
    hint:    "Falls diese IBAN im Rahmen eines Bürgschaftsvorgangs korrekt ist, " +
             "können Sie fortfahren.",
    icon:    "⚠️",
  },

  // ── Treuhand / Sonstige ───────────────────────────────────
  "Treuhand":                {
    title:   "Treuhandkonto – bitte prüfen",
    short:   "Treuhandinstitut erkannt",
    detail:  "Diese IBAN gehört einem Treuhandinstitut. Treuhandkonten " +
             "haben einen besonderen rechtlichen Status und sind nicht für " +
             "den regulären Zahlungsverkehr bestimmt.",
    hint:    "Bitte prüfen Sie, ob diese IBAN für Ihren Anwendungsfall korrekt ist.",
    icon:    "⚠️",
  },

  // ── Fallback ───────────────────────────────────────────────
  _default: {
    title:   "Spezialinstitut – bitte prüfen",
    short:   "Ungewöhnliche Bank erkannt",
    detail:  "Diese IBAN gehört einem Spezialinstitut, das möglicherweise " +
             "keine regulären Privatkonten führt. Die Transaktion könnte " +
             "fehlschlagen oder verzögert werden.",
    hint:    "Bitte prüfen Sie, ob diese IBAN für Ihren Zweck korrekt ist, " +
             "und wenden Sie sich ggf. an Ihre Bank.",
    icon:    "⚠️",
  },
};

// ══════════════════════════════════════════════════════════════
// LOOKUP-HELPER
// ══════════════════════════════════════════════════════════════

/**
 * Gibt die passende UI-Message für ein checkIBANStatus()-Ergebnis zurück.
 *
 * @param {{ status: string, reason: string|null, bezeichnung?: string }} checkResult
 * @returns {{ title, short, detail, hint, icon, status, reason, bezeichnung }}
 */
function getIBANMessage(checkResult) {
  const { status, reason, bezeichnung } = checkResult;

  if (status === "OK") return null;

  const map     = status === "BLOCK" ? BLOCK_MESSAGES : WARN_MESSAGES;
  const message = map[reason] || map._default;

  return {
    ...message,
    status,
    reason,
    bezeichnung: bezeichnung || "",
    // Für direkte Alert/Toast-Nutzung:
    toString() {
      return `${this.icon} ${this.title}\n${this.detail}\n💡 ${this.hint}`;
    },
  };
}

module.exports = { BLOCK_MESSAGES, WARN_MESSAGES, getIBANMessage };
