import type { AuthError } from "@supabase/supabase-js"

import { t } from "@/lib/i18n"

/** Supabase auth errors, in the current language. Falls back to the original message. */
export function authError(error: Pick<AuthError, "message"> & { code?: string }): string {
  const code = error.code ?? ""
  const msg = error.message.toLowerCase()
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return t("auth.invalidCredentials")
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered"))
    return t("auth.emailExists")
  if (code === "weak_password" || msg.includes("password should be") || msg.includes("weak password"))
    return t("auth.weakPassword")
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit"))
    return t("auth.rateLimit")
  return error.message
}
