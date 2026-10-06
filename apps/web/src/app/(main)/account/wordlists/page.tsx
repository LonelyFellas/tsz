import { WordListBrowser } from "@/features/wordlist";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
export const metadata = {
  title: "我的词表",
  robots: { index: false, follow: false }
};
export default function Page() {
  return (
    <RouteGuard>
      <WordListBrowser mine />
    </RouteGuard>
  );
}
