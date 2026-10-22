import { ns } from "@/locales/ns"

/** Round names (lib/i18n roundName, roundShort): the database stores them in French. */
export default ns(
  {
    nth: "{n}e tour", r16: "8es de finale", qf: "Quarts", sf: "Demies", final: "Finale",
    shortNth: "T{n}", shortR16: "1/8", shortQf: "1/4", shortSf: "1/2", shortFinal: "F",
  },
  {
    nth: "Round {n}", r16: "Round of 16", qf: "Quarter-finals", sf: "Semi-finals", final: "Final",
    shortNth: "R{n}", shortR16: "R16", shortQf: "QF", shortSf: "SF", shortFinal: "F",
  },
  {
    nth: "{n}.ª ronda", r16: "Octavos", qf: "Cuartos", sf: "Semifinales", final: "Final",
    shortNth: "R{n}", shortR16: "1/8", shortQf: "1/4", shortSf: "1/2", shortFinal: "F",
  },
)
