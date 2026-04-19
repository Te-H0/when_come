import { createBrowserRouter } from "react-router";
import Home from "@/features/home/pages/Home";
import SetupRoute from "@/features/setup/pages/SetupRoute";
import RouteManagement from "@/features/route/pages/RouteManagement";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/setup",
    Component: SetupRoute,
  },
  {
    path: "/routes",
    Component: RouteManagement,
  },
]);
