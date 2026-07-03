// 模拟「词表详情」的词条内容 —— 形状与后端智能词库词条树(AdminWord)1:1,
// 覆盖产品图里的两个词条:centre(单词,英美区分)与 dress up(词组,unified)。
// C 端词条读取接口落地后,整个文件换成 api 调用删除即可。
import type { AdminWord, RichText, RichTextSpan } from "@tsz/types";

/**
 * 富文本速记:`|word|` 竖线包住的区间染蓝(语法结构关键词),
 * `~` 表示其前后两个码点之间连读(自身不占位)。偏移量按码点计。
 */
export function rt(marked: string): RichText {
  const spans: RichTextSpan[] = [];
  const liaisons: number[] = [];
  const out: string[] = [];
  let spanStart = -1;

  for (const cp of Array.from(marked)) {
    if (cp === "|") {
      if (spanStart === -1) {
        spanStart = out.length;
      } else {
        spans.push({ start: spanStart, end: out.length, type: "blue" });
        spanStart = -1;
      }
    } else if (cp === "~") {
      liaisons.push(out.length - 1);
    } else {
      out.push(cp);
    }
  }

  return { version: 1, text: out.join(""), spans, liaisons };
}

export const MOCK_WORD_CENTRE: AdminWord = {
  id: "dict-centre",
  kind: "word",
  headword: "centre",
  dialect_mode: "distinguish",
  dialects: ["uk", "us"],
  status: "published",
  created_by: "admin-1",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-20T00:00:00Z",
  sense_groups: [],
  pos: [
    {
      id: "centre-verb",
      pos: "verb",
      forms: [
        {
          id: "centre-v-base-uk",
          dialect: "uk",
          form_type: "base",
          spelling: "centre",
          pronunciations: [
            {
              id: "centre-v-base-uk-p",
              dict_phonetic: "ˈsentə",
              actual_pron: "ˈsentə",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-base-us",
          dialect: "us",
          form_type: "base",
          spelling: "center",
          pronunciations: [
            {
              id: "centre-v-base-us-p",
              dict_phonetic: "ˈsentɚ",
              actual_pron: "ˈsentɚ",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-ing-uk",
          dialect: "uk",
          form_type: "present_participle",
          spelling: "centring",
          pronunciations: [
            {
              id: "centre-v-ing-uk-p",
              dict_phonetic: "ˈsentərɪŋ",
              actual_pron: "ˈsentərɪŋ",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-ing-us",
          dialect: "us",
          form_type: "present_participle",
          spelling: "centering",
          pronunciations: [
            {
              id: "centre-v-ing-us-p",
              dict_phonetic: "ˈsentərɪŋ",
              actual_pron: "ˈsentərɪŋ",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-past-uk",
          dialect: "uk",
          form_type: "past_tense",
          spelling: "centred",
          pronunciations: [
            {
              id: "centre-v-past-uk-p",
              dict_phonetic: "ˈsentəd",
              actual_pron: "ˈsentəd",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-past-us",
          dialect: "us",
          form_type: "past_tense",
          spelling: "centered",
          pronunciations: [
            {
              id: "centre-v-past-us-p",
              dict_phonetic: "ˈsentɚd",
              actual_pron: "ˈsentɚd",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-pp-uk",
          dialect: "uk",
          form_type: "past_participle",
          spelling: "centred",
          pronunciations: [
            {
              id: "centre-v-pp-uk-p",
              dict_phonetic: "ˈsentəd",
              actual_pron: "ˈsentəd",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-v-pp-us",
          dialect: "us",
          form_type: "past_participle",
          spelling: "centered",
          pronunciations: [
            {
              id: "centre-v-pp-us-p",
              dict_phonetic: "ˈsentɚd",
              actual_pron: "ˈsentɚd",
              style: "normal"
            }
          ]
        }
      ],
      grammar_structures: [
        {
          id: "centre-v-gs",
          variants: [
            {
              id: "centre-v-gs-uk",
              dialect: "uk",
              content: rt("something |centres|; to |centre| something")
            },
            {
              id: "centre-v-gs-us",
              dialect: "us",
              content: rt("something |centers|; to |center| something")
            }
          ]
        }
      ],
      senses: [
        {
          id: "centre-v-s1",
          sub_pos: "V-I",
          level: "A1",
          depends_on_context: false,
          definitions: [
            {
              id: "centre-v-s1-d1",
              level: "A1",
              def_type: "zh",
              text: rt("位于中央; 将其置于中央."),
              grammar_structure_id: "centre-v-gs"
            }
          ],
          sentences: [],
          relations: []
        },
        {
          id: "centre-v-s2",
          sub_pos: "V-T",
          level: "A2",
          depends_on_context: false,
          definitions: [
            {
              id: "centre-v-s2-d1",
              level: "A2",
              def_type: "zh",
              text: rt("集中; 使其集中."),
              grammar_structure_id: "centre-v-gs"
            }
          ],
          sentences: [],
          relations: []
        }
      ]
    },
    {
      id: "centre-noun",
      pos: "noun",
      forms: [
        {
          id: "centre-n-base-uk",
          dialect: "uk",
          form_type: "base",
          spelling: "centre",
          pronunciations: [
            {
              id: "centre-n-base-uk-p",
              dict_phonetic: "ˈsentə",
              actual_pron: "ˈsentə",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-n-base-us",
          dialect: "us",
          form_type: "base",
          spelling: "center",
          pronunciations: [
            {
              id: "centre-n-base-us-p",
              dict_phonetic: "ˈsentɚ",
              actual_pron: "ˈsentɚ",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-n-pl-uk",
          dialect: "uk",
          form_type: "plural",
          spelling: "centres",
          pronunciations: [
            {
              id: "centre-n-pl-uk-p",
              dict_phonetic: "ˈsentəz",
              actual_pron: "ˈsentəz",
              style: "normal"
            }
          ]
        },
        {
          id: "centre-n-pl-us",
          dialect: "us",
          form_type: "plural",
          spelling: "centers",
          pronunciations: [
            {
              id: "centre-n-pl-us-p",
              dict_phonetic: "ˈsentɚz",
              actual_pron: "ˈsentɚz",
              style: "normal"
            }
          ]
        }
      ],
      grammar_structures: [
        {
          id: "centre-n-gs",
          variants: [
            {
              id: "centre-n-gs-uk",
              dialect: "uk",
              content: rt("the |centre|")
            },
            {
              id: "centre-n-gs-us",
              dialect: "us",
              content: rt("the |center|")
            }
          ]
        }
      ],
      senses: [
        {
          id: "centre-n-s1",
          sub_pos: "N-COUNT",
          level: "A1",
          depends_on_context: false,
          definitions: [
            {
              id: "centre-n-s1-d1",
              level: "A1",
              def_type: "zh",
              text: rt("中心."),
              grammar_structure_id: "centre-n-gs"
            }
          ],
          sentences: [],
          relations: []
        },
        {
          id: "centre-n-s2",
          sub_pos: "N-COUNT",
          level: "A2",
          depends_on_context: false,
          definitions: [
            {
              id: "centre-n-s2-d1",
              level: "A2",
              def_type: "zh",
              text: rt("中枢."),
              grammar_structure_id: "centre-n-gs"
            }
          ],
          sentences: [],
          relations: []
        },
        {
          id: "centre-n-s3",
          sub_pos: "N-COUNT",
          level: "B1",
          depends_on_context: false,
          definitions: [
            {
              id: "centre-n-s3-d1",
              level: "B1",
              def_type: "zh",
              text: rt("中心区."),
              grammar_structure_id: "centre-n-gs"
            }
          ],
          sentences: [],
          relations: []
        }
      ]
    }
  ]
};

export const MOCK_WORD_DRESS_UP: AdminWord = {
  id: "dict-dress-up",
  kind: "phrase",
  headword: "dress up",
  dialect_mode: "unified",
  dialects: [],
  status: "published",
  created_by: "admin-1",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-20T00:00:00Z",
  sense_groups: [],
  pos: [
    {
      id: "dressup-verb",
      pos: "verb",
      forms: [
        {
          id: "dressup-v-base",
          dialect: "common",
          form_type: "base",
          spelling: "dress up",
          pronunciations: [
            {
              id: "dressup-v-base-p",
              dict_phonetic: "dres ʌp",
              actual_pron: "dres ʌp",
              style: "normal"
            }
          ]
        }
      ],
      grammar_structures: [
        {
          id: "dressup-gs1",
          variants: [
            {
              id: "dressup-gs1-c",
              dialect: "common",
              content: rt("someone |dresses~ up|; to |dress| someone~ |up|")
            }
          ]
        },
        {
          id: "dressup-gs2",
          variants: [
            {
              id: "dressup-gs2-c",
              dialect: "common",
              content: rt(
                "someone |dresses~ up~ as| someone different; to |dress| someone~ |up~ as| someone different"
              )
            }
          ]
        }
      ],
      senses: [
        {
          id: "dressup-s1",
          sub_pos: "V-I",
          level: "A2",
          depends_on_context: false,
          definitions: [
            {
              id: "dressup-s1-d1",
              level: "A2",
              def_type: "zh",
              text: rt(
                "(某人)穿上正装,(某人)盛装打扮; 打扮(某人),为(某人)穿上正装,盛装打扮(某人)."
              ),
              grammar_structure_id: "dressup-gs1"
            }
          ],
          sentences: [],
          relations: []
        },
        {
          id: "dressup-s2",
          sub_pos: "V-T",
          level: "B1",
          depends_on_context: false,
          definitions: [
            {
              id: "dressup-s2-d1",
              level: "B1",
              def_type: "zh",
              text: rt(
                "(某人)乔装成/打扮成/扮作(另一个不同的人); 将(某人)乔装成/打扮成(另一个不同的人)."
              ),
              grammar_structure_id: "dressup-gs2"
            }
          ],
          sentences: [],
          relations: []
        }
      ]
    }
  ]
};

/** 词表详情页的 mock 数据形状(接后端后由词表 + 词条读取接口替代)。 */
export interface MockDictWordList {
  id: string;
  name: string;
  creator_name: string;
  words: AdminWord[];
}

export const MOCK_DICT_LIST: MockDictWordList = {
  id: "wl-demo-1",
  name: "初中英语(人教 2024 新版)① 七年级上 Unit 1 · 课本基础词表",
  creator_name: "Steven 杨老师",
  words: [MOCK_WORD_CENTRE, MOCK_WORD_DRESS_UP]
};
