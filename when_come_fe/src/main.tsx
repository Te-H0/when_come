import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DndProvider } from "react-dnd"
import { MultiBackend } from "react-dnd-multi-backend"
import { HTML5toTouch } from "rdndmb-html5-to-touch"
import App from "./app/App.tsx"
import "./styles/index.css"
import { initAuth } from "./lib/supabase.ts"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

initAuth().then(() => {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <DndProvider backend={MultiBackend} options={HTML5toTouch}>
        <App />
      </DndProvider>
    </QueryClientProvider>
  )
})
