/**
 * Country flags for players. The API gives 3-letter codes (IOC style: GER, SUI, NED, RSA…,
 * sometimes ISO 3166 alpha-3: DEU, CHE, NLD, ZAF…). We map them to ISO alpha-2 and build
 * the emoji flag from regional indicator symbols.
 */
const ISO2: Record<string, string> = {
  // IOC codes
  ALG: "DZ", AND: "AD", ARG: "AR", ARM: "AM", AUS: "AU", AUT: "AT", AZE: "AZ", BAH: "BS", BAR: "BB",
  BEL: "BE", BIH: "BA", BLR: "BY", BOL: "BO", BRA: "BR", BUL: "BG", CAN: "CA", CHI: "CL", CHN: "CN",
  COL: "CO", CRC: "CR", CRO: "HR", CYP: "CY", CZE: "CZ", DEN: "DK", DOM: "DO", ECU: "EC", EGY: "EG",
  ESA: "SV", ESP: "ES", EST: "EE", FIN: "FI", FRA: "FR", GBR: "GB", GEO: "GE", GER: "DE", GRE: "GR",
  GUA: "GT", HKG: "HK", HUN: "HU", INA: "ID", IND: "IN", IRI: "IR", IRL: "IE", ISR: "IL", ITA: "IT",
  JAM: "JM", JPN: "JP", KAZ: "KZ", KOR: "KR", KSA: "SA", LAT: "LV", LBN: "LB", LIB: "LB", LTU: "LT",
  LUX: "LU", MAR: "MA", MAS: "MY", MDA: "MD", MEX: "MX", MKD: "MK", MLT: "MT", MNE: "ME", MON: "MC",
  NED: "NL", NGR: "NG", NOR: "NO", NZL: "NZ", PAK: "PK", PAR: "PY", PER: "PE", PHI: "PH", POL: "PL",
  POR: "PT", PUR: "PR", QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU", SLO: "SI", SRB: "RS", SUI: "CH",
  SVK: "SK", SWE: "SE", THA: "TH", TPE: "TW", TUN: "TN", TUR: "TR", UAE: "AE", UKR: "UA", URU: "UY",
  USA: "US", UZB: "UZ", VEN: "VE", VIE: "VN", ZIM: "ZW",
  // ISO 3166 alpha-3 variants that differ from IOC
  BHS: "BS", BRB: "BB", BGR: "BG", CHL: "CL", CRI: "CR", DNK: "DK", DZA: "DZ", DEU: "DE", GTM: "GT",
  HRV: "HR", IDN: "ID", IRN: "IR", LVA: "LV", MYS: "MY", MCO: "MC", NLD: "NL", NGA: "NG", PRY: "PY",
  PHL: "PH", PRT: "PT", PRI: "PR", ROM: "RO", SAU: "SA", SLV: "SV", SVN: "SI", CHE: "CH", TWN: "TW",
  ARE: "AE", URY: "UY", VNM: "VN", ZAF: "ZA", ZWE: "ZW", GRC: "GR", MNG: "MN", LKA: "LK", SGP: "SG",
}

/** ISO alpha-2 of a 3-letter country code, or null if unknown. */
export function iso2(code: string | null | undefined): string | null {
  if (!code) return null
  const c = code.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(c)) return c
  return ISO2[c] ?? null
}

/** Emoji flag ("🇫🇷") for a 3-letter code, or null if unknown. */
export function flagEmoji(code: string | null | undefined): string | null {
  const two = iso2(code)
  if (!two) return null
  return String.fromCodePoint(...[...two].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

/** Host country of a tournament from its name (admin forms; migration 0016 filled the existing ones). First match wins. */
const HOSTS: [RegExp, string][] = [
  [/roland|french open|paris|bercy|lyon|auvergne|marseille|montpellier|metz|moselle/i, "FRA"],
  [/us open|cincinnati|indian wells|miami|washington|atlanta|winston|delray|dallas|houston|newport/i, "USA"],
  [/shanghai|china|beijing|chengdu|hangzhou|zhuhai/i, "CHN"],
  [/almaty|astana/i, "KAZ"],
  [/halle|hamburg|munich|stuttgart/i, "GER"],
  [/european open|antwerp/i, "BEL"], // after Hamburg ("Hamburg European Open")
  [/erste|vienna|wien|kitzb/i, "AUT"],
  [/basel|swiss|gstaad|geneva/i, "SUI"],
  [/australi|adelaide|brisbane/i, "AUS"],
  [/wimbledon|queen|eastbourne/i, "GBR"],
  [/monte[\s-]?carlo|monaco/i, "MON"],
  [/madrid|barcelona|mallorca/i, "ESP"],
  [/\brome\b|\broma\b|internazionali|italian|turin|torino|atp finals/i, "ITA"],
  [/canad|montr[eé]al|toronto|national bank/i, "CAN"],
  [/rotterdam|hertogenbosch/i, "NED"],
  [/doha|qatar/i, "QAT"],
  [/dubai/i, "UAE"],
  [/acapulco|mexic|los cabos/i, "MEX"],
  [/\brio\b/i, "BRA"],
  [/buenos aires|argentina/i, "ARG"],
  [/santiago|chile/i, "CHI"],
  [/tokyo|japan/i, "JPN"],
  [/stockholm|b[aå]stad/i, "SWE"],
  [/umag|croatia/i, "CRO"],
  [/estoril/i, "POR"],
  [/auckland/i, "NZL"],
  [/hong kong/i, "HKG"],
  [/marrakech/i, "MAR"],
  [/jeddah|next gen/i, "KSA"],
]

export function suggestCountry(name: string): string | null {
  return HOSTS.find(([re]) => re.test(name))?.[1] ?? null
}
