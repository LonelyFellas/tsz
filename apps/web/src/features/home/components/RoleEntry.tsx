import Link from "next/link";
import { StudentVisual, TeacherVisual } from "./featureVisuals";
import { SectionHeading } from "./SectionHeading";

const ROLES = [
  {
    title: "我是学生",
    desc: "浏览词表,完成每日练习,打卡积累天生币。",
    href: "/wordlists",
    action: "开始学习 ›",
    Visual: StudentVisual,
    primary: true
  },
  {
    title: "我是老师",
    desc: "创建词表与任务,管理班级,跟踪学习数据。",
    href: "/apply-teacher",
    action: "申请成为老师 ›",
    Visual: TeacherVisual,
    primary: false
  }
] as const;

// 师 / 生入口：两张毛玻璃大卡,顶部迷你 UI 场景插画,底部单一入口。
export function RoleEntry() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <SectionHeading
        eyebrow="师生入口"
        title="为师与生而生。"
        desc="一套平台,服务教与学两端。"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map(({ title, desc, href, action, Visual, primary }) => (
          <article
            key={title}
            className="reveal glass flex flex-col rounded-3xl p-2 transition-shadow duration-300 hover:shadow-float"
          >
            <div className="rounded-[20px] bg-muted/60 p-6 sm:p-8">
              <div className="max-w-xs">
                <Visual />
              </div>
            </div>
            <div className="flex flex-1 flex-col px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                {desc}
              </p>
              <Link
                href={href}
                className={
                  primary
                    ? "mt-8 inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 text-sm font-medium tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    : "mt-8 inline-flex h-11 w-fit items-center rounded-full border border-border bg-surface px-6 text-sm font-medium tracking-wide text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                }
              >
                {action}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
