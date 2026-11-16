import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { loadBrand } from "@/data/brand"

// The look of the plant first (a small local file), so the first paint already has its colours.
await loadBrand()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="ptw-theme">
      <App />
    </ThemeProvider>
  </StrictMode>
)
