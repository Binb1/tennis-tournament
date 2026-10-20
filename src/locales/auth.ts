import { ns } from "@/locales/ns"

/** Supabase auth errors (lib/authErrors) and the route guard (lib/auth). */
export default ns(
  {
    invalidCredentials: "E-mail ou mot de passe incorrect",
    emailExists: "Un compte existe déjà avec cet e-mail",
    weakPassword: "Mot de passe trop court (8 caractères minimum)",
    rateLimit: "Trop de demandes, réessaie dans quelques minutes",
    profileUnavailable: "Profil indisponible : {error}",
    accountDeleted: "Ce compte a été supprimé.",
    signOut: "Se déconnecter",
  },
  {
    invalidCredentials: "Wrong email or password",
    emailExists: "An account already exists with this email",
    weakPassword: "Password too short (8 characters minimum)",
    rateLimit: "Too many requests, try again in a few minutes",
    profileUnavailable: "Profile unavailable: {error}",
    accountDeleted: "This account has been deleted.",
    signOut: "Log out",
  },
  {
    invalidCredentials: "Correo o contraseña incorrectos",
    emailExists: "Ya existe una cuenta con este correo",
    weakPassword: "Contraseña demasiado corta (mínimo 8 caracteres)",
    rateLimit: "Demasiadas solicitudes, vuelve a intentarlo en unos minutos",
    profileUnavailable: "Perfil no disponible: {error}",
    accountDeleted: "Esta cuenta ha sido eliminada.",
    signOut: "Cerrar sesión",
  },
)
