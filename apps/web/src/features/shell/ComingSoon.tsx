import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, PageShell, buttonClass, primaryButtonClass } from "./Page";

// 尚未开放的功能页：说明现状，并给出当前可用的入口。
export function ComingSoon({
  eyebrow,
  title,
  description,
  icon: Icon,
  heading,
  children,
  links
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  heading: string;
  children: ReactNode;
  links: { href: string; label: string }[];
}) {
  return (
    <PageShell>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="glass rounded-3xl p-2">
        <div className="rounded-[20px] bg-surface/70 px-6 py-10 text-center sm:px-10 sm:py-14">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-muted text-primary">
            <Icon className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <h2 className="mt-6 text-xl font-semibold tracking-tight">
            {heading}
          </h2>
          <div className="mx-auto mt-3 max-w-md text-sm leading-6 text-foreground-muted">
            {children}
          </div>
          {links.length > 0 && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {links.map((link, index) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={index === 0 ? primaryButtonClass : buttonClass}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
