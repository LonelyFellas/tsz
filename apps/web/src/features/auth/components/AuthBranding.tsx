// 登录 / 注册页左侧的品牌介绍栏(大屏才展示)。
const FEATURES = ["实时学习进度跟踪", "智能记忆算法优化", "名校教材同步词库"];

export function AuthBranding() {
  return (
    <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 bg-primary text-white">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">📖</span>
        <span className="text-3xl font-bold">天生会背</span>
      </div>
      <p className="text-lg mb-2">智能英语单词学习平台</p>
      <p className="text-sm opacity-80 mb-12">
        科学记忆算法 · 个性化学习路径 · 高效词汇掌握
      </p>
      <ul className="space-y-5 text-sm">
        {FEATURES.map((item) => (
          <li key={item} className="flex items-center gap-3 opacity-90">
            <span className="w-6 h-6 rounded-full border border-white/50 flex items-center justify-center text-xs">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
