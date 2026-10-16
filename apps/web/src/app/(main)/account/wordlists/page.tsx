import { Suspense } from "react";
import { WordlistLibrary } from "@/features/wordlist/components/WordlistLibrary";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
export const metadata = {
  title: "我的词表",
  robots: { index: false, follow: false }
};
export default function Page() {
  return (
    <RouteGuard preserveSearch>
      <Suspense>
        <WordlistLibrary />
      </Suspense>
    </RouteGuard>
  );
}
