'use strict';

const fs = require('fs');
const path = require('path');
const XMLParser = require('fast-xml-parser');
const { isValidIBAN, isValidAccountNumberBLZ } = require('ibantools-germany');

const parser = new XMLParser.XMLParser({
    ignoreAttributes: true
});

const xml = fs.readFileSync(
    path.join(__dirname, 'BLZ.xml'),
    'utf8'
);

const parsed = parser.parse(xml);

const banks = {};

for (const entry of parsed.Document.BLZEintrag) {
    // Gelöschte Einträge ignorieren
    if (entry.BLZLoesch === 1 || entry.BLZLoesch === '1') continue;
    // Nur Hauptstellen (Merkmal=1) — Filialen (Merkmal=2) haben meist keine eigene BIC
    // und würden sonst BIC-Einträge der Hauptstelle überschreiben
    if (String(entry.Merkmal) !== '1') continue;
    // Einträge ohne BIC überspringen (SEPA-Zahlung ohne BIC nicht sinnvoll generierbar)
    if (!entry.BIC) continue;

    const methode = entry.PruefZiffMeth != null
        ? String(entry.PruefZiffMeth).padStart(2, '0')
        : '09';

    banks[entry.BLZ] = [
        entry.Bezeichnung || '',
        entry.BIC,
        methode,
        entry.PLZ || '',
        entry.Ort || ''
    ];
}

const data = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'german_data.json'),
        'utf8'
    )
);

const companies = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'companies.json'),
        'utf8'
    )
);

const FORBIDDEN_BLZS = new Set([
    ...require('./sonderbanken_block.json').map(e => e.blz),
    ...require('./sonderbanken_warn.json').map(e => e.blz),
]);

// Harte Sperrliste: Diese BLZs duerfen niemals zur IBAN-Generierung verwendet werden.
const HARD_BLOCKED_BLZS = new Set([
    '25190088', '30150001', '38010053', '40150001', '40351220', '50030000',
    '50040033', '50215500', '50230800', '50320191', '51430400', '52410300',
    '52410310', '52411000', '52411010', '55150098', '70011900', '70012000',
    '70013010', '70015000', '70015015', '70015025', '72030260', '79020076',
    '70015035', '70021180'
]);

const EXCLUDED_BLZS = new Set([
    ...FORBIDDEN_BLZS,
    ...HARD_BLOCKED_BLZS
]);

const bankEntries = Object.entries(banks).filter(([blz]) => !EXCLUDED_BLZS.has(blz));

// ---------------------------------------------------------------------------
// IBAN helpers
// ---------------------------------------------------------------------------

/** Mod97 digit-by-digit – handles strings of arbitrary length without precision loss. */
function mod97(numericStr) {
    let remainder = 0;
    for (const digit of numericStr) {
        remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
    }
    return remainder;
}

/**
 * Builds a valid German IBAN from a BLZ (8 digits) and Kontonummer (10 digits).
 * Calculates the correct 2-digit check digit per ISO 13616.
 */
function buildIban(blz, konto) {
    const bban = blz + konto;
    const checkInput = bban + '131400';
    const checkDigit = String(98 - mod97(checkInput)).padStart(2, '0');
    return 'DE' + checkDigit + bban;
}

/** Verifies an IBAN via ibantools-germany (handles all Bundesbank methods). */
function verifyIban(iban) {
    return isValidIBAN(iban);
}

// ---------------------------------------------------------------------------
// Kontonummer Prüfziffermethoden
// ---------------------------------------------------------------------------

/**
 * Methode 03 – Modulus 10, Gewichtung 2,1,2,1,2,1,2,1,2 (von rechts nach links).
 */
function kzMethod03(d9) {
    const w = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += d9[8 - i] * w[i];
    }
    return (10 - (sum % 10)) % 10;
}


/**
 * Methode 06 – Modulus 11, Gewichtung 2,3,4,5,6,7,2,3,4 von rechts nach links.
 */
function kzMethod06(d9) {
    const w = [2, 3, 4, 5, 6, 7, 2, 3, 4];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += d9[8 - i] * w[i];
    }
    const check = (11 - (sum % 11)) % 11;
    return check === 10 ? -1 : check;
}


/**
 * Methode 13 – Modulus 10. Stellen 2–7, Gewichtung 1,2,1,2,1,2 von links nach rechts.
 * Mit Quersummenbildung bei zweistelligen Produkten.
 */

function kzMethod13(pos1to7) {
    const w = [1, 2, 1, 2, 1, 2];
    let sum = 0;

    for (let i = 1; i <= 6; i++) {
        let p = pos1to7[i] * w[i - 1];
        if (p >= 10) p = Math.floor(p / 10) + (p % 10);
        sum += p;
    }

    return (10 - (sum % 10)) % 10;
}


/**
 * Methode 32 – Modulus 11.
 * Gewichtung 2,3,4,5,6,7 von rechts nach links auf Stellen 4–9 (1-basiert).
 * Prüfziffer an Stelle 10 (Index 9).
 *
 * Bundesbank-Spezifikation:
 *   - Nimm Stellen 4–9 der Kontonummer (Indizes 3–8 in d9)
 *   - Multipliziere von rechts nach links mit Gewichten 2,3,4,5,6,7
 *   - Summe mod 11, dann (11 - rest) mod 11 = Prüfziffer
 *   - Ergebnis 10 → ungültig (return -1)
 */
function kzMethod32(d9) {
    // Stellen 4–9 (1-basiert) = Indizes 3–8 in d9
    // Von rechts nach links: d9[8], d9[7], d9[6], d9[5], d9[4], d9[3]
    const digits = [d9[8], d9[7], d9[6], d9[5], d9[4], d9[3]];
    const weights = [2, 3, 4, 5, 6, 7];
    let sum = 0;
    for (let i = 0; i < 6; i++) {
        sum += digits[i] * weights[i];
    }
    const check = (11 - (sum % 11)) % 11;
    return check === 10 ? -1 : check;
}


// ---------------------------------------------------------------------------
// Methode 56
// ---------------------------------------------------------------------------

/**
 * Methode 56 – Modulus 11, Gewichtung 2–7 auf Stellen 4–9 (von rechts).
 * Prüfziffer an Stelle 10.
 * Gibt -1 zurück wenn ungültig (Rest = 10).
 */
function kzMethod56(d9) {
    // d9[0..8] = Stellen 1–9, Prüfziffer kommt an Stelle 10
    // Gewichtung auf Stellen 4–9, das sind Indizes 3–8 in d9
    // Von rechts: d9[8]*2, d9[7]*3, d9[6]*4, d9[5]*5, d9[4]*6, d9[3]*7
    const weights = [7, 6, 5, 4, 3, 2]; // Index 3–8 in d9
    let sum = 0;
    for (let i = 0; i < 6; i++) {
        sum += d9[3 + i] * weights[i];
    }
    const rest = sum % 11;
    if (rest === 10) return -1; // ungültig
    return rest; // Prüfziffer
}


function generateKontoMethod56() {
    for (let attempt = 0; attempt < 1000; attempt++) {
        // Stellen 1–9 zufällig, Stellen 1–3 frei, 4–9 relevant für Prüfziffer
        const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
        const check = kzMethod56(d);
        if (check === -1) continue; // neu bei ungültigem Rest
        const konto = d.join('') + check;
        return konto;
    }
    throw new Error('Methode 56: Kein gültiges Konto nach 1000 Versuchen');
}

/**
 * Methode 63 – Modulus 10 (Deutsche Bank).
 * Gewichtung 2,1,2,1,2,1,2,1 von links nach rechts für Stellen 2–9.
 * Mit Quersumme.
 */
function kzMethod63(pos2to9) {
    const w = [2, 1, 2, 1, 2, 1, 2, 1];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
        let p = pos2to9[i] * w[i];
        if (p >= 10) p = (p % 10) + 1;
        sum += p;
    }
    return (10 - (sum % 10)) % 10;
}

// ---------------------------------------------------------------------------
// Kontonummer-Generator
// ---------------------------------------------------------------------------

/**
 * Erzeugt eine gültige 10-stellige Kontonummer (als String) passend zur
 * Prüfziffermethode der Bank.
 */
function generateAccountDetails(method) {
    switch (method) {
        case '00': {
            // Ziffern an Position 1-9 (d[0] bis d[8])
            const d9 = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));

            // Gewichte von rechts nach links: 2,1,2,1,2,1,2,1,2
            const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2];

            let sum = 0;
            for (let i = 0; i < 9; i++) {
                const product = d9[i] * weights[i];
                // Quersumme des Produkts (relevant wenn Produkt >= 10)
                const crossSum = Math.floor(product / 10) + (product % 10);
                sum += crossSum;
            }

            // Rest der Division durch 10, von 10 abziehen, Ergebnis modulo 10
            const check = (10 - (sum % 10)) % 10;

            return d9.join('') + String(check);
        }
        case '03': {
            const d9 = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
            const check = kzMethod03(d9);
            return d9.join('') + String(check);
        }
        case '06': {
            let d9, check;
            do {
                d9 = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
                check = kzMethod06(d9);
            } while (check === -1);
            return d9.join('') + String(check);
        }
        case '56': {
            return generateKontoMethod56();
        }
        case '13': {
            const free = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
            const check = kzMethod13(free);
            return free.slice(0, 7).join('') + String(check) + String(free[7]) + String(free[8]);
        }
        case '32': {
            let d9, check;
            do {
                d9 = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
                check = kzMethod32(d9);
            } while (check === -1);
            return d9.join('') + String(check);
        }
        case '63': {
            const pos2to9 = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
            const pos10 = Math.floor(Math.random() * 10);
            const check = kzMethod63(pos2to9);
            return String(check) + pos2to9.join('') + String(pos10);
        }
        default: {
            return Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
        }
    }
}

// ---------------------------------------------------------------------------
// Bank account – mit vollständigem Verifikationsschritt vor Ausgabe
// ---------------------------------------------------------------------------

/**
 * Picks a random bank and generates a fully verified IBAN.
 *
 * Verifikationsschritt (unabhängig von der Generierung):
 *   1. Kontonummer-Prüfziffer nach der bankspezifischen Methode
 *   2. IBAN mod97 === 1 (ISO 13616)
 *
 * Schlägt einer der Checks fehl → Neuversuch (max. MAX_RETRIES).
 */
function getRandomBankAccount(MAX_RETRIES = 1000) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const [blz, [bankname, bic, method = '09']] =
            bankEntries[Math.floor(Math.random() * bankEntries.length)];

        const konto = generateAccountDetails(method);
        const iban = buildIban(blz, konto);

        // ── Verifikation via ibantools-germany (alle Bundesbank-Methoden) ──
        const kontoOk = isValidAccountNumberBLZ(konto, blz);
        const ibanOk = isValidIBAN(iban);
        // ───────────────────────────────────────────────────────────────────

        if (!kontoOk || !ibanOk) {
            continue; // Neuversuch
        }

        return { iban, bic, bankname, blz, konto, method };
    }
    throw new Error(`getRandomBankAccount: Konnte nach ${MAX_RETRIES} Versuchen kein valides Konto erzeugen.`);
}

/**
 * Generates `amount` unique valid German IBANs, each correctly tied to a real BLZ.
 */
function generateGermanIbans(amount) {
    const results = [];
    const seen = new Set();
    while (results.length < amount) {
        const acc = getRandomBankAccount();
        if (!seen.has(acc.iban)) {
            seen.add(acc.iban);
            results.push(acc);
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Name / address / company
// ---------------------------------------------------------------------------

function getRandomCompanyName() {
    return companies[Math.floor(Math.random() * companies.length)];
}

function getRandomName(gender = null) {
    if (!gender) gender = Math.random() < 0.5 ? 'male' : 'female';
    const pool = gender === 'male' ? data.male_first_names : data.female_first_names;
    const lastName = data.last_names[Math.floor(Math.random() * data.last_names.length)];
    let firstName;
    if (Math.random() < 0.1) {
        const f1 = pool[Math.floor(Math.random() * pool.length)];
        let f2 = pool[Math.floor(Math.random() * pool.length)];
        while (f2 === f1) f2 = pool[Math.floor(Math.random() * pool.length)];
        firstName = `${f1} ${f2}`;
    } else {
        firstName = pool[Math.floor(Math.random() * pool.length)];
    }
    return { gender, firstName, lastName, fullName: `${firstName} ${lastName}` };
}

function getRandomAddress() {
    const useCity = Math.random() < 0.5;
    const locationPool = useCity ? data.cities : data.small_towns;
    const location = locationPool[Math.floor(Math.random() * locationPool.length)];
    const street = data.street_names[Math.floor(Math.random() * data.street_names.length)];
    const houseNumber = Math.floor(Math.random() * 150) + 1;
    const suffix = Math.random() < 0.15
        ? String.fromCharCode(97 + Math.floor(Math.random() * 5))
        : '';
    return {
        street: `${street} ${houseNumber}${suffix}`,
        plz: location.plz,
        city: location.name,
        full: `${street} ${houseNumber}${suffix}, ${location.plz} ${location.name}`
    };
}

// ---------------------------------------------------------------------------
// Birthday
// ---------------------------------------------------------------------------

function getRandomBirthday() {
    const today = new Date();
    const MIN_AGE = 28;
    const MAX_AGE = 63;
    const minBirth = new Date(today.getFullYear() - MAX_AGE - 1, today.getMonth(), today.getDate() + 1);
    const maxBirth = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
    const rangeMs = maxBirth.getTime() - minBirth.getTime();
    const birthday = new Date(minBirth.getTime() + Math.floor(Math.random() * rangeMs));

    let age = today.getFullYear() - birthday.getFullYear();
    const monthDiff = today.getMonth() - birthday.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) age--;

    return { date: birthday, isoDate: birthday.toISOString().slice(0, 10), age };
}

// ---------------------------------------------------------------------------
// Complete identity
// ---------------------------------------------------------------------------

function generateIdentity() {
    const name = getRandomName();
    const address = getRandomAddress();
    const account = getRandomBankAccount();
    const birthday = getRandomBirthday();

    // Generate derived contact info
    let safeFirst = name.firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let safeLast = name.lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domains = ['example.com'];
    const email = `${safeFirst}.${safeLast}@${domains[Math.floor(Math.random() * domains.length)]}`;
    const phone = `+49 151 ${Math.floor(Math.random() * 9000000) + 1000000}`;

    return {
        gender: name.gender,
        firstName: name.firstName,
        lastName: name.lastName,
        fullName: name.fullName,
        email: email,
        phone: phone,
        birthday: birthday.isoDate,
        age: birthday.age,
        address: {
            street: address.street,
            plz: address.plz,
            city: address.city,
            full: address.full
        },
        account: {
            iban: account.iban,
            bic: account.bic,
            bankname: account.bankname,
            blz: account.blz,
            konto: account.konto
        }
    };
}

function generateIbanIdForEveryBank() {
    const result = {};
    let idx = 0;

    for (const [blz, [, , method = '09']] of bankEntries) {
        let iban = null;
        for (let attempt = 0; attempt < 200; attempt++) {
            const konto = generateAccountDetails(method);
            const candidate = buildIban(blz, konto);
            if (isValidAccountNumberBLZ(konto, blz) && isValidIBAN(candidate)) {
                iban = candidate;
                break;
            }
        }
        if (iban) {
            result[String(idx++)] = iban;
        }
    }

    fs.writeFileSync(
        path.join(__dirname, 'allbanks.json'),
        JSON.stringify(result, null, 0)
            .replace(/^\{/, '{\n')
            .replace(/\}$/, '\n}')
            .replace(/,"/g, ',\n"'),
        'utf8'
    );

    return result;
}
generateIbanIdForEveryBank();


// function generatFunnyIbans() {
//     const BLZ_LIST = [25190088,30150001,38010053,40150001,40351220,50030000,50040033,50215500,50230800,50320191,51430400,52410300,52410310,52411000,52411010,55150098,70011900,70012000,70013010,70015000,70015015,70015025,72030260,79020076];    BLZ_LIST.sort(() => Math.random() - 0.5);
//     const result = {};
//     for (let i = 0; i < BLZ_LIST.length; i++) {
//         const blz = String(BLZ_LIST[i]);
//         const method = banks[blz][2] || '09';
//         let iban = null;
//         for (let attempt = 0; attempt < 200; attempt++) {
//             const konto = generateAccountDetails(method);
//             const candidate = buildIban(blz, konto);
//             if (isValidAccountNumberBLZ(konto, blz) && isValidIBAN(candidate)) {
//                 iban = candidate;
//                 break;
//             }
//         }
//         if (iban) {
//             result[String(i)] = iban;
//         }
//     }

//     fs.writeFileSync(
//         path.join(__dirname, 'funny_ibans.json'),
//         JSON.stringify(result, null, 0)
//             .replace(/^\{/, '{\n')
//             .replace(/\}$/, '\n}')
//             .replace(/,"/g, ',\n"'),
//         'utf8'
//     );
// }

// generatFunnyIbans()

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    banks,
    generateIdentity,
    getRandomBankAccount,
    generateGermanIbans,
    getRandomCompanyName,
    getRandomName,
    getRandomAddress,
    getRandomBirthday
};

// ---------------------------------------------------------------------------
// Demo output – only when run directly
// ---------------------------------------------------------------------------

// if (require.main === module) {
//     console.log('=== 3 komplette Identitäten ===\n');
//     for (let i = 0; i < 3; i++) {
//         const id = generateIdentity();
//         console.log(JSON.stringify({
//             firstname: id.firstName,
//             lastname: id.lastName,
//             fullname: id.fullName,
//             birthday: id.birthday,
//             age: id.age,
//             address: {
//                 street: id.address.street,
//                 plz: id.address.plz,
//                 city: id.address.city,
//                 full: id.address.full
//             },
//             account: {
//                 iban: id.account.iban,
//                 bic: id.account.bic,
//                 bankname: id.account.bankname
//             }
//         }, null, 4));
//         console.log();
//     }
// }

// let finalstmt = [];

// if (require.main === module) {
//     console.log('=== Identitäten ===\n');


//     for (let i = 0; i < 20000; i++) {
//         const id = generateIdentity();
//         finalstmt.push(`"${i}": "${id.account.iban}"`);
//     }

//     const content = '{\n' + finalstmt.join(',\n') + '\n}';
//     console.log(content);
//     fs.writeFileSync(
//         path.join(__dirname, 'generated_ibans.json'),
//         content,
//         'utf8'
//     );
// }
// console.log('=== IBAN-Verifikation (50 Stück) ===');
// generateGermanIbans(50).forEach(a => {
//     const kontoOk = verifyKonto(a.konto, a.method);
//     const ibanOk  = verifyIban(a.iban);
//     const status  = (kontoOk && ibanOk) ? 'OK' : 'FEHLER';
//     console.log(`${a.iban}  BLZ ${a.blz}  Methode ${a.method}  Konto ${a.konto}  ${status}`);
// });