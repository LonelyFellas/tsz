export function SectionHeading({
  title,
  desc
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
      <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-foreground-muted sm:text-lg">
        {desc}
      </p>
    </div>
  );
}
