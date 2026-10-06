import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { WordlistTips } from "@/features/wordlist/components/WordlistTips";
export const metadata = {
  title: "词表投币记录",
  robots: { index: false, follow: false }
};
export default function Page() {
  return (
    <RouteGuard>
      <WordlistTips />
    </RouteGuard>
  );
}
