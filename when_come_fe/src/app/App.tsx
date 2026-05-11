import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "@/components/ui/sonner";
import { useVersionCheck } from "@/lib/useVersionCheck";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export default function App() {
  useVersionCheck();
  useKeyboardInset();
  useOnlineStatus();

  return (
    <>
      <RouterProvider router={router} />
      {/* offset = safe-area-inset-top + 12px — iOS notch/Dynamic Island 영역 회피 */}
      <Toaster position="top-center" offset="calc(env(safe-area-inset-top) + 12px)" />
    </>
  );
}
