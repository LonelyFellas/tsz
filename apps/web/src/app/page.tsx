import {
  HomeNav,
  HomeHero,
  FeatureShowcase,
  LearningFlow,
  RoleEntry,
  HomeFooter,
  HomeJsonLd
} from "@/features/home";

export default function HomePage() {
  return (
    <div className="relative flex flex-col bg-surface">
      <HomeJsonLd />
      <a
        href="#home-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-full bg-surface px-5 py-3 text-primary shadow-float focus:not-sr-only focus:fixed focus-visible:outline-2 focus-visible:outline-primary"
      >
        跳到主要内容
      </a>
      <HomeNav />
      <main
        id="home-content"
        tabIndex={-1}
        className="scroll-mt-20 focus:outline-none"
      >
        <HomeHero />
        <FeatureShowcase />
        <LearningFlow />
        <RoleEntry />
      </main>
      <HomeFooter />
    </div>
  );
}
