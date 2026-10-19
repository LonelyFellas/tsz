import { redirect } from "next/navigation";
export const metadata = {
  title: "我的词表",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(
    `/account/wordlists?space=owned&wordlist=${encodeURIComponent(id)}&mode=edit`
  );
}
