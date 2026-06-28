import {
  HomeNav,
  HomeHero,
  FeatureShowcase,
  LearningFlow,
  RoleEntry,
  HomeFooter
} from "@/features/home";

// 首页:落地展示框架,各区块为占位结构,具体功能后续逐步接入。
// 逻辑全在 feature 里,page 只组合区块;各区块自管内部宽度,便于 Hero 全宽出血。
export default function HomePage() {
  return (
    <div className="flex flex-col">
      <HomeNav />
      <HomeHero />
      <FeatureShowcase />
      <LearningFlow />
      <RoleEntry />
      <HomeFooter />
    </div>
  );
}
