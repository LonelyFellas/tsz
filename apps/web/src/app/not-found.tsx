import { AppText } from "@/i18n/AppText";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-foreground-muted">
        <AppText message="webApp:page_not_found" />
      </p>
      <Link href="/" className="text-primary underline">
        <AppText message="webApp:go_to_home" />
      </Link>
    </div>
  );
}
