import { ns } from "@/locales/ns"

/** Round names (lib/i18n roundName): the database stores them in French. */
export default ns(
  { nth: "{n}e tour", r16: "8es de finale", qf: "Quarts", sf: "Demies", final: "Finale" },
  { nth: "Round {n}", r16: "Round of 16", qf: "Quarter-finals", sf: "Semi-finals", final: "Final" },
  { nth: "{n}.ª ronda", r16: "Octavos", qf: "Cuartos", sf: "Semifinales", final: "Final" },
)
