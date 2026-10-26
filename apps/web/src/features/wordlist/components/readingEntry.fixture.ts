import type {
  RichTextV3,
  Wordlist,
  WordlistEntry,
  WordlistForm,
  WordlistItems,
  WordlistPos,
  WordlistSense
} from "@tsz/types";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plain = (text: string): RichTextV3 => ({
  version: 2,
  text,
  annotations: []
});
const range = (text: string, part: string) => ({
  start: Array.from(text.slice(0, text.indexOf(part))).length,
  end: Array.from(text.slice(0, text.indexOf(part) + part.length)).length
});

const centerGrammar =
  "something centers on something\nThe discussion centers on education.";
const centerDefinition =
  "以某事为中心；重点围绕某个主题展开，常用于讨论、活动或计划。";
const speechGrammar = "work out something\nWe can work it out together.";

export const richGrammar: RichTextV3 = {
  version: 2,
  text: centerGrammar,
  annotations: [
    {
      type: "emphasis",
      level: "function",
      ...range(centerGrammar, "something")
    },
    { type: "emphasis", level: "core", ...range(centerGrammar, "centers") },
    { type: "emphasis", level: "grammar", ...range(centerGrammar, "on") },
    { type: "italic", ...range(centerGrammar, "discussion") },
    { type: "bold", ...range(centerGrammar, "education") },
    { type: "underline", ...range(centerGrammar, "education") },
    {
      type: "highlight",
      color: "yellow",
      ...range(centerGrammar, "education")
    },
    {
      type: "phoneme",
      alphabet: "ipa",
      phoneme: "ˈsentəz",
      ...range(centerGrammar, "centers")
    },
    {
      type: "liaison",
      start: centerGrammar.indexOf("centers") + 6,
      end: centerGrammar.indexOf("on") + 1
    }
  ]
};

const richDefinition: RichTextV3 = {
  version: 2,
  text: centerDefinition,
  annotations: [
    { type: "bold", ...range(centerDefinition, "为中心") },
    { type: "italic", ...range(centerDefinition, "重点") },
    {
      type: "highlight",
      color: "green",
      ...range(centerDefinition, "讨论、活动或计划")
    }
  ]
};

const speech: RichTextV3 = {
  version: 2,
  text: speechGrammar,
  annotations: [
    { type: "emphasis", level: "core", ...range(speechGrammar, "work out") },
    {
      type: "emphasis",
      level: "function",
      ...range(speechGrammar, "something")
    },
    {
      type: "phoneme",
      alphabet: "ipa",
      phoneme: "wɜːk",
      ...range(speechGrammar, "work")
    },
    {
      type: "liaison",
      start: speechGrammar.indexOf("work") + 3,
      end: speechGrammar.indexOf("out") + 1
    },
    { type: "pause", at: speechGrammar.indexOf("together"), duration_ms: 300 },
    { type: "highlight", color: "blue", ...range(speechGrammar, "together") }
  ]
};

function forms(
  offset: number,
  spellings: [string, string, string][]
): WordlistForm[] {
  return spellings.map(([label, spelling, phonetic], index) => ({
    id: id(offset + index),
    form_type: index === 0 ? "base" : "plural",
    label,
    sense_ids: [],
    variants: [
      {
        id: id(offset + index + 20),
        dialect: "common",
        spelling,
        pronunciations: [
          { id: id(offset + index + 40), dict_phonetic: phonetic },
          { id: id(offset + index + 60), dict_phonetic: "/SECOND-READING/" }
        ]
      }
    ]
  }));
}

function pos(
  offset: number,
  basicPos: string,
  wordForms: WordlistForm[],
  meanings: [string, string, string, string | RichTextV3, string | RichTextV3][]
): WordlistPos {
  const senses: WordlistSense[] = meanings.map(
    ([level, subPos, label, definition], index) => ({
      id: id(offset + index),
      sub_pos: subPos,
      sub_pos_label: label,
      level,
      definitions: [
        {
          id: id(offset + 20 + index),
          level,
          definition_mode: "zh_definition",
          grammar_structure_id: id(offset + 40 + index),
          texts: [
            {
              dialect: "common",
              content:
                typeof definition === "string" ? plain(definition) : definition
            }
          ]
        }
      ]
    })
  );
  return {
    pos_id: id(offset + 90),
    pos: basicPos,
    forms: wordForms,
    senses,
    grammar_structures: meanings.map((meaning, index) => ({
      id: id(offset + 40 + index),
      variants: [
        {
          dialect: "common",
          content:
            typeof meaning[4] === "string" ? plain(meaning[4]) : meaning[4]
        }
      ]
    }))
  };
}

export const richReadingEntries: WordlistEntry[] = [
  {
    entry_id: id(1),
    publication_id: id(2),
    label: "center",
    kind: "word",
    pos: [
      pos(
        100,
        "verb",
        forms(1000, [
          ["原形", "center", "/ˈsentə/"],
          ["现在分词", "centering", "/ˈsentərɪŋ/"],
          ["过去式/过去分词", "centered", "/ˈsentəd/"]
        ]),
        [
          ["A1", "intransitive", "不及物动词", richDefinition, richGrammar],
          [
            "A2",
            "transitive",
            "及物动词",
            "把某物放在中央；使某物居中。",
            "center something\nPlease center the title on the page."
          ],
          [
            "B1",
            "transitive",
            "及物动词",
            "使注意力、工作或资源集中于某人或某事。",
            "center something on somebody / something\nThe project centers its resources on schools."
          ]
        ]
      ),
      pos(
        200,
        "noun",
        forms(1100, [
          ["原形", "center", "/ˈsentə/"],
          ["复数", "centers", "/ˈsentəz/"]
        ]),
        [
          [
            "A1",
            "countable",
            "可数名词",
            "中心；中央；物体或区域的中间部分。",
            "the center of something\nin the center of the room"
          ],
          [
            "A2",
            "countable",
            "可数名词",
            "提供某类服务、活动或培训的中心。",
            "a sports / shopping / training center"
          ],
          [
            "B1",
            "countable",
            "可数名词",
            "城市的中心区；商业和公共活动集中的地带。",
            "the city center\nWe walked from the station to the city center."
          ],
          [
            "B2",
            "uncountable",
            "不可数名词",
            "政治上的中间立场；介于两个相反观点之间的立场。",
            "the political center\na party of the center"
          ]
        ]
      )
    ]
  },
  {
    entry_id: id(3),
    publication_id: id(4),
    label: "work out",
    kind: "phrase",
    pos: [
      pos(
        300,
        "verb",
        [],
        [
          [
            "A1",
            "transitive",
            "及物动词短语",
            "解决；算出；通过思考找到答案。",
            speech
          ],
          [
            "A2",
            "transitive",
            "及物动词短语",
            "制定出；拟定详细的计划或安排。",
            "work out a plan / an agreement\nWe need to work out how much it will cost."
          ],
          [
            "B1",
            "intransitive",
            "不及物动词短语",
            "锻炼；健身；进行有规律的体育训练。",
            "work out at the gym\nShe works out three times a week."
          ]
        ]
      ),
      pos(
        400,
        "noun",
        [],
        [
          [
            "A1",
            "countable",
            "可数名词",
            "锻炼；一次健身训练。",
            "do a work out\na daily work out"
          ]
        ]
      )
    ]
  },
  {
    entry_id: id(5),
    publication_id: id(6),
    label: "set",
    kind: "word",
    pos: [
      pos(
        500,
        "verb",
        forms(1200, [
          ["原形", "set", "/set/"],
          ["现在分词", "setting", "/ˈsetɪŋ/"]
        ]),
        [
          [
            "A1",
            "transitive",
            "及物动词",
            "放置；把某物放到指定位置。",
            "set something on / beside something"
          ],
          [
            "A2",
            "transitive",
            "及物动词",
            "设定；确定时间、价格、目标或标准。",
            "set a time / price / goal / standard"
          ],
          [
            "B1",
            "intransitive",
            "不及物动词",
            "落下；指太阳、月亮等落到地平线以下。",
            "The sun sets in the west."
          ]
        ]
      ),
      pos(
        600,
        "noun",
        forms(1300, [
          ["原形", "set", "/set/"],
          ["复数", "sets", "/sets/"]
        ]),
        [
          [
            "A1",
            "countable",
            "可数名词",
            "一套；一组配套使用的物品。",
            "a set of keys / tools / instructions"
          ],
          [
            "A2",
            "countable",
            "可数名词",
            "比赛中的一盘；音乐表演中的一组曲目。",
            "win the first set\nplay a short set"
          ]
        ]
      )
    ]
  }
];

export const richReadingList: Wordlist = {
  id: id(9000),
  name: "丰富内容阅读验收",
  owner_user_id: id(9001),
  owner_name: "本地验收",
  state: "published",
  revision: 1,
  item_count: richReadingEntries.length,
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z"
};
export const richReadingItems: WordlistItems = {
  items: richReadingEntries.map((entry, position) => ({
    entry_id: entry.entry_id,
    entry,
    position
  })),
  revision: 1,
  pagination: {
    page: 1,
    page_size: 50,
    total: richReadingEntries.length,
    total_pages: 1
  }
};
