"use client";
import { useWebText } from "@/i18n/client";
import { webAuthAccess as webAuth } from "@/i18n/messages/auth/access";

import { useState } from "react";
import { useLogout } from "../hooks/useLogout";

export function LogoutButton() {
  const uiText = useWebText(webAuth);
  const logout = useLogout();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await logout();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="text-sm text-foreground-muted hover:text-foreground disabled:opacity-40 transition-colors"
    >
      {loading
        ? uiText("webAuthAccess:signing_out")
        : uiText("webAuthAccess:sign_out")}
    </button>
  );
}
