import { useMatch } from "react-router-dom";
import { VoiceLibrary } from "@/features/voices/VoiceLibrary";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";

export function VoicesPage() {
  const library = useMatch(`/${ADMIN_PAGE_ROUTES.voiceLibrary.path}`);
  return <VoiceLibrary view={library ? "library" : "groups"} />;
}
