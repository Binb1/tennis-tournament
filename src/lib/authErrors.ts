import type { AuthError } from "@supabase/supabase-js"

/** Supabase auth errors, in French. Falls back to the original message. */
export function authErrorFr(error: Pick<AuthError, "message"> & { code?: string }): string {
  const code = error.code ?? ""
  const msg = error.message.toLowerCase()
  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return "E-mail ou mot de passe incorrect"
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered"))
    return "Un compte existe déjà avec cet e-mail"
  if (code === "weak_password" || msg.includes("password should be") || msg.includes("weak password"))
    return "Mot de passe trop court (8 caractères minimum)"
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit"))
    return "Trop de demandes, réessaie dans quelques minutes"
  return error.message
}
