import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { AppShell, Box, PageTitle } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { POINTS_PER_ROUND, POINTS_PER_WIN } from "@/lib/season"

/** How the game works, in one page. Public: linked from the footer, the landing included. */
export default function Rules() {
  const { session } = useAuth()
  return (
    <AppShell bare={!session}>
      <PageTitle eyebrow="Comment ça marche">Règles du jeu</PageTitle>

      <Box className="mb-8 px-4 py-4">
        <p className="font-display text-2xl leading-tight">Un joueur par tour. Il perd, tu sors.</p>
        <p className="mt-2 text-sm text-chalk/90">
          À chaque tour d'un tournoi, choisis un joueur qui doit gagner son match. Tant que tes choix gagnent, tu restes en
          vie. Les derniers debout remportent le tournoi.
        </p>
      </Box>

      <div className="space-y-8">
        <Rule title="Choisir">
          <li>Un joueur par tour, encore dans le tableau.</li>
          <li>Jamais deux fois le même joueur dans un tournoi.</li>
          <li>
            Tu peux préparer tous les tours à l'avance, et changer chaque choix jusqu'au verrouillage de son tour. Si un
            joueur prévu perd avant son tour, le site te prévient : change-le, sinon c'est une défaite.
          </li>
        </Rule>

        <Rule title="Verrouillage">
          <li>Chaque tour se verrouille à une heure précise, affichée sur la page du tournoi.</li>
          <li>Après le verrouillage, les choix sont figés et ceux des autres deviennent visibles.</li>
        </Rule>

        <Rule title="Élimination">
          <li>Ton joueur perd son match : tu es éliminé.</li>
          <li>Aucun choix au verrouillage : tu es éliminé aussi.</li>
          <li>Abandon en cours de match ou forfait avant de jouer : défaite. Ton joueur passe sur abandon ou forfait de son adversaire : victoire.</li>
          <li>Tu restes dans le classement avec tout ton parcours.</li>
        </Rule>

        <Rule title="Gagner un tournoi">
          <li>Tous ceux encore en vie après la finale gagnent.</li>
          <li>Si tous les derniers survivants tombent au même tour, ils sont co-vainqueurs.</li>
        </Rule>

        <Rule title="Repêchage">
          <li>
            Un tour « repêché » est un tour passé sans choix qui ne t'élimine pas : tu as rejoint le tournoi en cours, ou
            l'admin a annulé ton absence de choix.
          </li>
          <li>Il ne rapporte aucun point au classement de la saison.</li>
        </Rule>

        <Rule title="Classement de la saison">
          <li>
            {POINTS_PER_ROUND} points par tour gagné, +{POINTS_PER_WIN} par tournoi remporté.
          </li>
          <li>À égalité de points : le plus de tournois gagnés, puis le plus de tours gagnés.</li>
          <li>Une saison = les tournois qui commencent dans l'année.</li>
        </Rule>
      </div>

      <p className="mt-10 text-sm">
        <Link to={session ? "/tournois" : "/connexion"} className="inline-flex min-h-11 items-center underline underline-offset-4">
          {session ? "Voir les tournois" : "Se connecter pour jouer"}
        </Link>
      </p>
    </AppShell>
  )
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="micro-label mb-2">{title}</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-chalk/95">{children}</ul>
    </section>
  )
}
