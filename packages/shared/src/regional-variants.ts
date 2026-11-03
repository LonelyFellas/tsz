import type {
  FormContentRegionalVariantsV3,
  FormRegionalBindingsV3,
  WordRegionalVariantsV3
} from "@tsz/types";

type Regions =
  | WordRegionalVariantsV3
  | FormContentRegionalVariantsV3
  | FormRegionalBindingsV3;
type Variant<R> = R extends { common: infer T }
  ? T
  : R extends { uk: (infer T)[]; us: (infer U)[] }
    ? T | U
    : R extends { uk: infer T; us: infer U }
      ? T | U
      : never;

/** Wire order, with independent lists on each dialect side. */
export function regionalVariants<R extends Regions>(
  regions: R,
  dialect?: "uk" | "us"
): Variant<R>[] {
  const result =
    regions.mode === "common"
      ? [regions.common]
      : regions.mode === "uk_us"
        ? dialect
          ? [regions[dialect]]
          : [regions.uk, regions.us]
        : dialect
          ? regions[dialect]
          : [...regions.uk, ...regions.us];
  return result as Variant<R>[];
}

export function primaryRegionalVariant<R extends Regions>(
  regions: R,
  dialect: "uk" | "us"
): Variant<R> {
  const first = regionalVariants(regions, dialect)[0];
  if (!first) throw new Error(`Missing ${dialect} spelling`);
  return first;
}
