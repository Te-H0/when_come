import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import App from "./app/App.tsx"
import "./styles/index.css"
import { Startup } from "./app/Startup"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <Startup>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </Startup>,
);
