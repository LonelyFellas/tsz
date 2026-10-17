import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AdminThemeProvider } from "./mui-theme";
import { router } from "./router";
import "./globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("找不到 #root 挂载点");

createRoot(rootEl).render(
  <StrictMode>
    <AdminThemeProvider>
      <RouterProvider router={router} />
    </AdminThemeProvider>
  </StrictMode>
);
