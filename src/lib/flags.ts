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
