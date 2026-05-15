def generate_german_ibans(n=100):
    import random

    # BLZ -> (Bankname, BIC)
    banks = {
        "10010010": ("Postbank Berlin",          "PBNKDEFF"),
        "20040060": ("Commerzbank Hamburg",       "COBADEFFXXX"),
        "37040044": ("Commerzbank Köln",          "COBADEFFXXX"),
        "50010517": ("ING-DiBa Frankfurt",        "INGDDEFFXXX"),
        "70080000": ("Commerzbank München",       "COBADEFFXXX"),
        "20070024": ("Deutsche Bank Hamburg",     "DEUTDEHHXXX"),
        "10077777": ("Deutsche Bank Berlin",      "DEUTDEBBXXX"),
        "43060967": ("GLS Bank Bochum",           "GENODEM1GLS"),
        "29040090": ("Commerzbank Hannover",      "COBADEFFXXX"),
        "38070724": ("Deutsche Bank Düsseldorf",  "DEUTDEDDXXX"),
        "25050180": ("Sparkasse Hannover",        "SPKHDE2HXXX"),
        "20050550": ("Hamburger Sparkasse",       "HASPDEHHXXX"),
        "37050198": ("Sparkasse KölnBonn",        "COLSDE33XXX"),
        "68351976": ("Sparkasse Offenburg",       "SOLADES1OFG"),
        "10090603": ("Berliner Volksbank",        "BEVODEBB"),
        "30060601": ("DKB Deutsche Kreditbank",   "SSKMDEMMXXX"),
        "12030000": ("Deutsche Kreditbank Berlin","BYLADEM1001"),
        "70150000": ("Hypovereinsbank München",   "HYVEDEMMXXX"),
        "20030000": ("HypoVereinsbank Hamburg",   "HYVEDEMM600"),
        "10020030": ("Comdirect Quickborn",       "COBADEHDXXX"),
        "50040000": ("Commerzbank Frankfurt",     "COBADEFFXXX"),
        "36010043": ("Postbank Köln",             "PBNKDEFF360"),
        "76010085": ("Postbank Nürnberg",         "PBNKDEFF760"),
        "21080050": ("Volksbank Kiel",            "GENODEF1KIL"),
        "30020900": ("UniCredit Berlin",          "HYVEDEMM300"),
    }

    results = []
    seen = set()

    while len(results) < n:
        blz, (bankname, bic) = random.choice(list(banks.items()))
        konto = str(random.randint(1000000, 999999999)).zfill(10)

        bban = blz + konto  # 18 Stellen
        numeric_str = bban + "131400"
        remainder = int(numeric_str) % 97
        checksum = 98 - remainder

        iban = f"DE{checksum:02d}{bban}"

        if iban not in seen:
            seen.add(iban)
            results.append((iban, bic, bankname, blz))

    return results


ibans = generate_german_ibans(1)
for i, (iban, bic, bank, blz) in enumerate(ibans, 1):
    print(f"{iban:<26}")
