import { Navigate, Route, Routes } from "react-router-dom"

import { AuthProvider, Protected } from "@/lib/auth"
import AdminHome from "@/pages/admin/AdminHome"
import AdminTournament from "@/pages/admin/AdminTournament"
import Landing from "@/pages/Landing"
import Login from "@/pages/Login"
import Profile from "@/pages/Profile"
import TournamentPage from "@/pages/Tournament"
import Tournaments from "@/pages/Tournaments"
import Welcome from "@/pages/Welcome"

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/connexion" element={<Login />} />
        <Route path="/bienvenue" element={<Protected onboarding><Welcome /></Protected>} />
        <Route path="/tournois" element={<Protected><Tournaments /></Protected>} />
        <Route path="/tournois/:id" element={<Protected><TournamentPage /></Protected>} />
        <Route path="/profil" element={<Protected><Profile /></Protected>} />
        <Route path="/admin" element={<Protected admin><AdminHome /></Protected>} />
        <Route path="/admin/tournois/:id" element={<Protected admin><AdminTournament /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
