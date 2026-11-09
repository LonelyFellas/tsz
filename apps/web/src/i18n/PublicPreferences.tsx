"use client";

import { useState } from "react";
import {
  AccountControls,
  type TopbarPanel
} from "@/features/shell/AccountControls";

export function PublicPreferences({ className }: { className: string }) {
  const [panel, setPanel] = useState<TopbarPanel>(null);
  return (
    <div className={className}>
      <AccountControls
        panel={panel}
        setPanel={setPanel}
        studying={false}
        guestPreferences
      />
    </div>
  );
}
