import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "@/components/ui/sonner";
import { useVersionCheck } from "@/lib/useVersionCheck";

export default function App() {
  useVersionCheck();

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </>
  );
}
