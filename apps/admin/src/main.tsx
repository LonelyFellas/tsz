import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { router } from "./router";
import "./globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("找不到 #root 挂载点");

createRoot(rootEl).render(
  <StrictMode>
    <InterfaceI18nProvider>
      <RouterProvider router={router} />
    </InterfaceI18nProvider>
  </StrictMode>
);
