import type { Metadata } from "next";
import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import { redirect } from "next/navigation";
export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:my_word_lists"),
    robots: { index: false, follow: false }
  };
}

export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/account/wordlists?space=owned&wordlist=${encodeURIComponent(id)}`);
}
