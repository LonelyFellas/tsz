import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  parseWordFilterSearchParams,
  parseWordListSearchParams,
  serializeWordFilterSearchParams,
  serializeWordListSearchParams
} from "./listSearchParams";

describe("word list search params", () => {
  it("round-trips every product filter with day-granularity dates", () => {
    const params = serializeWordFilterSearchParams({
      keyword: "  creator  ",
      gloss: "  中心  ",
      kind: "phrase",
      pos: "noun",
      level: "B2",
      status: "published",
      range: [dayjs("2026-08-01"), dayjs("2026-08-29")]
    });
    expect(params.toString()).toBe(
      "keyword=creator&gloss=%E4%B8%AD%E5%BF%83&kind=phrase&pos=noun&level=B2&status=published&created_from=2026-08-01&created_to=2026-08-29"
    );
    const parsed = parseWordFilterSearchParams(params);
    expect({ ...parsed, range: undefined }).toEqual({
      keyword: "creator",
      gloss: "中心",
      kind: "phrase",
      pos: "noun",
      level: "B2",
      status: "published",
      range: undefined
    });
    expect(parsed.range?.map((value) => value?.format("YYYY-MM-DD"))).toEqual([
      "2026-08-01",
      "2026-08-29"
    ]);
  });

  it("ignores invalid enums, catalog codes, and dates", () => {
    const parsed = parseWordFilterSearchParams(
      new URLSearchParams(
        "kind=sentence&status=deleted&level=A9&pos=NOPE&created_from=2026-13-99&created_to=x"
      )
    );
    expect(parsed).toEqual({});
  });

  it("omits blank values and preserves one-sided ranges", () => {
    expect(
      serializeWordFilterSearchParams({
        keyword: " ",
        gloss: "",
        range: [dayjs("2026-08-01"), null]
      }).toString()
    ).toBe("created_from=2026-08-01");
    expect(
      parseWordFilterSearchParams(
        new URLSearchParams("created_to=2026-08-29")
      ).range?.map((value) => value?.format("YYYY-MM-DD"))
    ).toEqual([undefined, "2026-08-29"]);
  });

  it("round-trips pagination together with every product filter", () => {
    const params = serializeWordListSearchParams(
      {
        keyword: "creator",
        kind: "phrase",
        status: "published"
      },
      3,
      50
    );

    expect(params.toString()).toBe(
      "keyword=creator&kind=phrase&status=published&page=3&page_size=50"
    );
    expect(parseWordListSearchParams(params)).toEqual({
      filters: {
        keyword: "creator",
        kind: "phrase",
        status: "published"
      },
      page: 3,
      pageSize: 50
    });
  });

  it("falls back safely for invalid page and page_size values", () => {
    for (const query of [
      "page=0&page_size=21",
      "page=-1&page_size=0",
      "page=1.5&page_size=1000",
      "page=NaN&page_size=NaN"
    ]) {
      expect(parseWordListSearchParams(new URLSearchParams(query))).toEqual({
        filters: {},
        page: 1,
        pageSize: 20
      });
    }
  });
});
