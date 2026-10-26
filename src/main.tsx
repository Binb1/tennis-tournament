import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import App from "@/App"
import "@/index.css"
import { initAnalytics } from "@/lib/analytics"
import { loadLiveTheme } from "@/lib/theme"

loadLiveTheme()
initAnalytics()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
