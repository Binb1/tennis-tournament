import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { AppShell, Box, PageTitle } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { t, tr, type MsgKey } from "@/lib/i18n"

/** How the game works, in one page. Public: linked from the footer, the landing included. */
export default function Rules() {
  const { session } = useAuth()
  const items = (...keys: MsgKey[]) => keys.map((k) => <li key={k}>{t(k)}</li>)
  return (
    <AppShell bare={!session}>
      <PageTitle eyebrow={t("rules.eyebrow")}>{t("rules.title")}</PageTitle>

      <Box className="mb-8 px-4 py-4">
        <p className="font-display text-2xl leading-tight">{t("rules.tagline")}</p>
        <p className="mt-2 text-sm text-chalk/90">{t("rules.intro")}</p>
      </Box>

      <div className="space-y-8">
        <Rule title={t("rules.pickTitle")}>{items("rules.pick1", "rules.pick2", "rules.pick3", "rules.pick4")}</Rule>

        <Rule title={t("rules.lockTitle")}>{items("rules.lock1", "rules.lock2", "rules.lock3", "rules.lock4")}</Rule>

        <Rule title={t("rules.outTitle")}>{items("rules.out1", "rules.out2", "rules.out3", "rules.out4")}</Rule>

        <Rule title={t("rules.winTitle")}>{items("rules.win1", "rules.win2")}</Rule>

        <Rule title={t("rules.championTitle")}>{items("rules.champion1", "rules.champion2")}</Rule>

        <Rule title={t("rules.reprieveTitle")}>{items("rules.reprieve1", "rules.reprieve2")}</Rule>

        <Rule title={t("rules.seasonTitle")}>
          <li>
            {tr("rules.season1", {
              link: (
                <Link to="/points" className="underline underline-offset-4">
                  {t("rules.season1Link")}
                </Link>
              ),
            })}
          </li>
          {items("rules.season2", "rules.season3", "rules.season4")}
        </Rule>
      </div>

      <p className="mt-10 text-sm">
        <Link to={session ? "/tournois" : "/connexion"} className="inline-flex min-h-11 items-center underline underline-offset-4">
          {session ? t("rules.seeTournaments") : t("rules.loginToPlay")}
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
