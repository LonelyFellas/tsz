"use client";

import { useState } from "react";
import { useLogout } from "../hooks/useLogout";

export function LogoutButton() {
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
      {loading ? "退出中..." : "退出登录"}
    </button>
  );
}
