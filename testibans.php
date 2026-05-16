<?php

// =============================================
// KONFIGURATION
// =============================================

$jsonFile    = 'ibans.json';
$outputFile  = 'failed_ibans.txt';
$maxPerMinute = 120;
$cookieFile  = '/tmp/iban_session_' . getmypid() . '.txt';
$url         = 'https://www.iban-rechner.de/iban_validieren.html';

// *** STARTPOSITION (0 = von Anfang, z.B. 500 = ab IBAN Nr. 500) ***
$startIndex  = 0;

// =============================================
// Farben
// =============================================
define('RED',    "\033[31m");
define('GREEN',  "\033[32m");
define('YELLOW', "\033[33m");
define('BLUE',   "\033[34m");
define('CYAN',   "\033[36m");
define('BOLD',   "\033[1m");
define('RESET',  "\033[0m");

// =============================================
// Hilfsfunktionen
// =============================================

function initSession(string $url, string $cookieFile): bool {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: de-DE,de;q=0.9',
        ],
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_COOKIEJAR      => $cookieFile,
        CURLOPT_COOKIEFILE     => $cookieFile,
    ]);
    $result = curl_exec($ch);
    $code   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return ($result !== false && $code === 200);
}

function makeRequest(string $url, array $postData, string $cookieFile): string|false {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($postData),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: de-DE,de;q=0.9',
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: https://www.iban-rechner.de',
            'Referer: https://www.iban-rechner.de/iban_validieren.html',
            'Cache-Control: max-age=0',
        ],
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_COOKIEJAR      => $cookieFile,
        CURLOPT_COOKIEFILE     => $cookieFile,
    ]);
    $response = curl_exec($ch);
    $errno    = curl_errno($ch);
    curl_close($ch);
    if ($errno) return false;
    return $response;
}

// Parst alle Ergebnis-Zeilen der Prüftabelle in drei Kategorien:
// passed (+), failed (-), neutral (kein Icon / "nicht nachgerechnet").
// Gibt 'warnings' zurück: jede Zeile ist ein dokumentiertes Problem.
function extractChecks(string $html): array {
    $passed  = [];
    $failed  = [];
    $neutral = [];

    // Alle <tr>-Zeilen parsen; versteckte Detailzeilen (display:none) überspringen
    if (preg_match_all('/<tr(?![^>]*display\s*:\s*none)[^>]*>(.*?)<\/tr>/si', $html, $rows)) {
        foreach ($rows[1] as $row) {
            if (!preg_match('/<p>(.*?)<\/p>/si', $row, $pm)) continue;
            $text = html_entity_decode(trim(strip_tags($pm[1])), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if (empty(trim($text))) continue;
            if (str_contains($row, 'alt="+"')) {
                $passed[] = $text;
            } elseif (str_contains($row, 'alt="-"')) {
                $failed[] = $text;
            } else {
                $neutral[] = $text;
            }
        }
    }

    // Die 4 Pflicht-Checks
    // track_missing = false: nur explizite - Fehler zählen, fehlendes/neutrales wird ignoriert
    $required = [
        'Länge'                  => ['keyword' => 'richtige länge',                'neutral_kw' => ['länge'],                                        'track_missing' => true],
        'IBAN-Prüfsumme'         => ['keyword' => 'iban-prüfsumme stimmt',         'neutral_kw' => ['iban-prüfsumme', 'prüfsumme'],                   'track_missing' => true],
        'Bankcode'               => ['keyword' => 'bankcode ist korrekt',          'neutral_kw' => ['bankleitzahl', 'bankcode'],                       'track_missing' => false],
        'Kontonummer-Prüfziffer' => ['keyword' => 'prüfziffer in der kontonummer', 'neutral_kw' => ['konto-prüfsumme', 'kontonummer', 'prüfziffer'],  'track_missing' => false],
    ];

    $passedLower = strtolower(implode(' ', $passed));
    $missing     = [];
    foreach ($required as $label => $cfg) {
        if (str_contains($passedLower, $cfg['keyword'])) continue;
        if (!$cfg['track_missing']) continue;

        // Gibt es einen neutralen Eintrag für diesen Check? → echter Servertext
        $neutralText = null;
        foreach ($neutral as $nText) {
            $nLower = strtolower($nText);
            foreach ($cfg['neutral_kw'] as $nKw) {
                if (str_contains($nLower, $nKw)) {
                    $neutralText = $nText;
                    break 2;
                }
            }
        }

        $missing[] = $neutralText !== null
            ? "[Nicht geprüft] {$neutralText}"
            : "[Fehlender Check] {$label}";
    }

    // Warnungen = explizite Fehler + nicht geprüfte/fehlende Pflicht-Checks
    $warnings = array_merge($failed, $missing);

    return ['passed' => $passed, 'failed' => $failed, 'neutral' => $neutral, 'missing' => $missing, 'warnings' => $warnings];
}

function extractFailReason(string $html): string {
    $checks = extractChecks($html);
    $all    = array_merge($checks['failed'], $checks['missing']);
    if (!empty($all)) return implode(' | ', $all);

    // Fallback: Ergebnis-Fieldset Text
    if (preg_match('/<fieldset>\s*<legend>Ergebnis<\/legend>(.*?)<\/fieldset>/si', $html, $m)) {
        return html_entity_decode(trim(strip_tags($m[1])), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    return 'Unbekannter Fehler';
}

function checkIban(string $iban, string $url, string $cookieFile): array {
    $postData = [
        'no_cache'             => '1',
        'tx_valIBAN_pi1[iban]' => $iban,
        'tx_valIBAN_pi1[fi]'   => 'fi',
        'Action'               => 'IBAN prüfen und BIC-Code suchen',
    ];

    $body = makeRequest($url, $postData, $cookieFile);

    if ($body === false) {
        return ['status' => 'error', 'reason' => 'cURL Fehler', 'bank' => '', 'bic' => '', 'warnings' => []];
    }

    if (stripos($body, 'tx-valIBAN-pi1') === false) {
        return ['status' => 'error', 'reason' => 'Ergebnis-Block nicht gefunden', 'bank' => '', 'bic' => '', 'warnings' => []];
    }

    if (stripos($body, $iban) === false) {
        return ['status' => 'error', 'reason' => 'IBAN nicht im Ergebnis', 'bank' => '', 'bic' => '', 'warnings' => []];
    }

    // Bank extrahieren
    $bank = '';
    if (preg_match('/<b>Bank:<\/b>\s*([^<]+)/i', $body, $m)) {
        $bank = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    // BIC extrahieren
    $bic = '';
    if (preg_match('/<b>BIC:<\/b>\s*([A-Z0-9]{8,11})/i', $body, $m)) {
        $bic = trim($m[1]);
    }

    // =============================================
    // PRIMÄRE ERKENNUNG: Ergebnis-Fieldset Text
    // =============================================
    if (preg_match('/<fieldset>\s*<legend>Ergebnis<\/legend>(.*?)<\/fieldset>/si', $body, $m)) {
        $ergebnisText = strtolower(
            html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8')
        );

        // GÜLTIG erkennen
        $validPhrases = [
            'diese iban ist formal korrekt',
            'iban ist korrekt',
            'iban ist gültig',
            'formal korrekt',
        ];
        foreach ($validPhrases as $phrase) {
            if (str_contains($ergebnisText, $phrase)) {
                $checks = extractChecks($body);
                return ['status' => 'valid', 'bank' => $bank, 'bic' => $bic, 'warnings' => $checks['warnings']];
            }
        }

        // UNGÜLTIG erkennen
        $invalidPhrases = [
            'diese iban ist nicht korrekt',
            'iban ist nicht korrekt',
            'iban ist ungültig',
            'nicht korrekt',
            'ungültig',
            'falsch',
            'existiert nicht',
        ];
        foreach ($invalidPhrases as $phrase) {
            if (str_contains($ergebnisText, $phrase)) {
                $checks = extractChecks($body);
                $reason = !empty($checks['warnings']) ? implode(' | ', $checks['warnings']) : extractFailReason($body);
                return ['status' => 'invalid', 'reason' => $reason, 'bank' => $bank, 'bic' => $bic, 'warnings' => $checks['warnings']];
            }
        }
    }

    // =============================================
    // FALLBACK: gif-Zählung + Pflicht-Check-Analyse
    // =============================================
    $checks     = extractChecks($body);
    $minusCount = count($checks['failed']);

    if ($minusCount === 0 && empty($checks['missing'])) {
        return ['status' => 'valid', 'bank' => $bank, 'bic' => $bic, 'warnings' => []];
    }

    if ($minusCount > 0 || !empty($checks['missing'])) {
        $reason = !empty($checks['warnings']) ? implode(' | ', $checks['warnings']) : extractFailReason($body);
        return ['status' => 'invalid', 'reason' => $reason, 'bank' => $bank, 'bic' => $bic, 'warnings' => $checks['warnings']];
    }

    return [
        'status'   => 'unknown',
        'reason'   => "Passed: " . count($checks['passed']) . ", Failed: $minusCount, Missing: " . count($checks['missing']),
        'bank'     => $bank,
        'bic'      => $bic,
        'warnings' => [],
    ];
}

function drawProgressBar(int $current, int $total, int $width = 40): string {
    $percent = $total > 0 ? ($current / $total) : 0;
    $filled  = (int)($percent * $width);
    $empty   = $width - $filled;
    $bar     = str_repeat('█', $filled) . str_repeat('░', $empty);
    $pct     = str_pad(number_format($percent * 100, 1), 5, ' ', STR_PAD_LEFT);
    return "[{$bar}] {$pct}% ({$current}/{$total})";
}

function formatExportLine(string $iban, string $status, string $reason, string $bank, string $bic, int $index): string {
    $iban   = mb_convert_encoding($iban,   'UTF-8', 'UTF-8');
    $reason = mb_convert_encoding($reason, 'UTF-8', 'UTF-8');
    $bank   = mb_convert_encoding($bank,   'UTF-8', 'UTF-8');
    $bic    = mb_convert_encoding($bic,    'UTF-8', 'UTF-8');

    $indexStr = str_pad((string)$index, 5, '0', STR_PAD_LEFT);
    $bankLine = '';
    if (!empty($bank) || !empty($bic)) {
        $parts    = array_filter([$bank ?: 'Unbekannte Bank', $bic ?: 'Kein BIC']);
        $bankLine = "\n         Bank: " . implode(' | ', $parts);
    }

    return "[{$indexStr}] {$iban} | {$status}" .
           ($reason ? " | {$reason}" : '') .
           $bankLine . "\n";
}

// =============================================
// MAIN
// =============================================

if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}

if (!file_exists($jsonFile)) {
    die(RED . "Fehler: '$jsonFile' nicht gefunden!\n" . RESET);
}

$ibans = json_decode(file_get_contents($jsonFile), true);
if ($ibans === null) {
    die(RED . "Fehler: JSON ungültig!\n" . RESET);
}

$ibans = array_values($ibans);
$total = count($ibans);

if ($startIndex < 0 || $startIndex >= $total) {
    die(RED . "Fehler: startIndex ($startIndex) ungültig! Max: " . ($total - 1) . "\n" . RESET);
}

$delayBetweenRequests = (int)((60 / $maxPerMinute) * 1000000);
$remaining = $total - $startIndex;

echo BOLD . BLUE . "═══════════════════════════════════════════════════\n" . RESET;
echo BOLD . "  IBAN Validator\n" . RESET;
echo BOLD . BLUE . "═══════════════════════════════════════════════════\n" . RESET;
echo "  IBANs gesamt:       " . BOLD . $total     . RESET . "\n";
echo "  Starte bei Index:   " . BOLD . CYAN . $startIndex . RESET . "\n";
echo "  Zu prüfen:          " . BOLD . $remaining . RESET . "\n";
echo "  Max/Minute:         " . BOLD . $maxPerMinute . RESET . "\n";
echo "  Delay:              " . BOLD . round($delayBetweenRequests / 1000) . "ms" . RESET . "\n";
echo "  Output:             " . BOLD . $outputFile . RESET . "\n";
echo BOLD . BLUE . "═══════════════════════════════════════════════════\n\n" . RESET;

echo "Initialisiere Session...\n";
if (!initSession($url, $cookieFile)) {
    echo YELLOW . "Warnung: Session-Init fehlgeschlagen, versuche trotzdem...\n" . RESET;
} else {
    echo GREEN . "Session bereit.\n\n" . RESET;
}

$fileExists = file_exists($outputFile);
$outHandle  = fopen($outputFile, 'a');
if (!$outHandle) {
    die(RED . "Fehler: Kann '$outputFile' nicht öffnen!\n" . RESET);
}

if (!$fileExists) {
    fwrite($outHandle, "\xEF\xBB\xBF");
}

$runHeader  = "\n" . str_repeat('=', 55) . "\n";
$runHeader .= "=== Run: " . date('Y-m-d H:i:s') . " | Start-Index: $startIndex ===\n";
$runHeader .= str_repeat('=', 55) . "\n";
fwrite($outHandle, $runHeader);
fflush($outHandle);

$stats        = ['valid' => 0, 'valid_warned' => 0, 'invalid' => 0, 'unknown' => 0, 'error' => 0];
$startTime    = microtime(true);
$requestCount = 0;
$minuteStart  = microtime(true);

echo "Starte Verarbeitung...\n\n";

for ($i = $startIndex; $i < $total; $i++) {
    $iban = trim($ibans[$i]);
    if (empty($iban)) continue;

    $requestCount++;

    // Rate-Limiting
    if ($requestCount > 1 && $requestCount % $maxPerMinute === 0) {
        $elapsed = microtime(true) - $minuteStart;
        if ($elapsed < 60) {
            $wait = (int)((60 - $elapsed) * 1000000);
            echo YELLOW . "\n  Rate-Limit erreicht, warte " . round($wait / 1000000, 1) . "s...\n" . RESET;
            usleep($wait);
        }
        $minuteStart = microtime(true);
    }

    $progress = drawProgressBar($requestCount, $remaining);
    echo "\rFortschritt: " . BOLD . $progress . RESET . "  ";

    $result   = checkIban($iban, $url, $cookieFile);
    $indexStr = str_pad((string)$i, 5, '0', STR_PAD_LEFT);

    $bankStr = '';
    if (!empty($result['bank']) || !empty($result['bic'])) {
        $parts   = array_filter([$result['bank'] ?? '', $result['bic'] ?? '']);
        $bankStr = ' [' . implode(' | ', $parts) . ']';
    }

    switch ($result['status']) {
        case 'valid':
            $stats['valid']++;
            $warnings = $result['warnings'] ?? [];
            echo "\n" . GREEN . "✓ [{$indexStr}] {$iban} → GÜLTIG{$bankStr}" . RESET . "\n";
            if (!empty($warnings)) {
                $stats['valid_warned']++;
                foreach ($warnings as $w) {
                    echo YELLOW . "  ⚠ " . substr($w, 0, 120) . RESET . "\n";
                }
                $warnReason = implode(' | ', $warnings);
                fwrite($outHandle, formatExportLine($iban, 'GÜLTIG (Warnung)', $warnReason, $result['bank'] ?? '', $result['bic'] ?? '', $i));
                fflush($outHandle);
            }
            break;

        case 'invalid':
            $stats['invalid']++;
            $reason = $result['reason'] ?? '';
            echo "\n" . RED . BOLD . "✗ [{$indexStr}] {$iban} → UNGÜLTIG{$bankStr}" . RESET . "\n";
            if ($reason) echo RED . "         Grund: " . substr($reason, 0, 120) . RESET . "\n";
            fwrite($outHandle, formatExportLine($iban, 'UNGÜLTIG', $reason, $result['bank'] ?? '', $result['bic'] ?? '', $i));
            fflush($outHandle);
            break;

        case 'unknown':
            $stats['unknown']++;
            $reason = $result['reason'] ?? '';
            echo "\n" . YELLOW . "? [{$indexStr}] {$iban} → UNKLAR ({$reason}){$bankStr}" . RESET . "\n";
            fwrite($outHandle, formatExportLine($iban, 'UNKLAR', $reason, $result['bank'] ?? '', $result['bic'] ?? '', $i));
            fflush($outHandle);
            break;

        case 'error':
        default:
            $stats['error']++;
            $reason = $result['reason'] ?? 'Unbekannt';
            echo "\n" . YELLOW . "⚠ [{$indexStr}] {$iban} → FEHLER: {$reason}" . RESET . "\n";
            if ($stats['error'] % 5 === 0) {
                echo YELLOW . "  Starte Session neu...\n" . RESET;
                initSession($url, $cookieFile);
                sleep(3);
            }
            break;
    }

    usleep($delayBetweenRequests);
}

fclose($outHandle);

if (file_exists($cookieFile)) unlink($cookieFile);

$totalTime = microtime(true) - $startTime;
$m = floor($totalTime / 60);
$s = round(fmod($totalTime, 60));

echo "\n\n";
echo BOLD . BLUE . "═══════════════════════════════════════════════════\n" . RESET;
echo BOLD . "  Fertig!\n" . RESET;
echo BOLD . BLUE . "═══════════════════════════════════════════════════\n" . RESET;
echo "  Gesamtzeit:   " . BOLD . "{$m}m {$s}s"        . RESET . "\n";
echo "  Verarbeitet:  " . BOLD . $requestCount          . RESET . "\n";
echo "  Gültig:       " . GREEN  . BOLD . $stats['valid']        . RESET . "\n";
if ($stats['valid_warned'] > 0) {
    echo "  → mit Warnung:" . YELLOW . BOLD . " " . $stats['valid_warned'] . RESET . " (in Export)\n";
}
echo "  Ungültig:     " . RED    . BOLD . $stats['invalid']      . RESET . "\n";
echo "  Unklar:       " . YELLOW . BOLD . $stats['unknown']      . RESET . "\n";
echo "  Fehler:       " . YELLOW . BOLD . $stats['error']        . RESET . "\n";
echo BOLD . BLUE . "═══════════════════════════════════════════════════\n" . RESET;
echo "\nExport: " . BOLD . $outputFile . RESET . " (UTF-8)\n\n";
