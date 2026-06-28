import Link from "next/link";
import { StudentVisual, TeacherVisual } from "./featureVisuals";

// 师 / 生入口——Apple 风两块大 bento:深色主推学生,浅色次推老师。
// 顶部各放一个迷你 UI 场景插画作视觉主角;链接采用 Apple 蓝胶囊 / 文字链。
export function RoleEntry() {
  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24 lg:py-32">
        <div className="reveal mb-12 text-center sm:mb-16">
          <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            为师与生而生。
          </h2>
          <p className="mt-3 text-lg font-medium text-gray-400 sm:text-xl">
            一套平台,服务教与学两端。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 学生:深色主推 */}
          <article className="reveal group relative flex flex-col overflow-hidden rounded-3xl bg-gray-900 p-10 text-white transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/20 sm:p-12">
            <div className="max-w-xs">
              <StudentVisual />
            </div>
            <h3 className="mt-8 text-3xl font-semibold tracking-tight">
              我是学生
            </h3>
            <p className="mt-3 max-w-xs text-base leading-relaxed text-white/70">
              浏览词表,完成每日练习,打卡积累天生币。
            </p>
            <Link
              href="/wordlists"
              className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-[#0071e3] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#0077ed] active:scale-95"
            >
              开始学习 ›
            </Link>
          </article>

          {/* 老师:浅色次推 */}
          <article className="reveal group relative flex flex-col overflow-hidden rounded-3xl bg-gray-50 p-10 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/5 sm:p-12">
            <div className="max-w-xs">
              <TeacherVisual />
            </div>
            <h3 className="mt-8 text-3xl font-semibold tracking-tight text-gray-900">
              我是老师
            </h3>
            <p className="mt-3 max-w-xs text-base leading-relaxed text-gray-500">
              创建词表与任务,管理班级,跟踪学习数据。
            </p>
            <Link
              href="/apply-teacher"
              className="mt-auto inline-flex w-fit items-center gap-1 pt-8 text-sm font-medium text-[#0071e3] transition hover:underline"
            >
              申请成为老师 ›
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
