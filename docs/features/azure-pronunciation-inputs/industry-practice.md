# 字典音标与合成输入：业界实践调查

日期：2026-09-15。结论用于任务 54；不扩大为发音字典管理系统。

## 结论

推荐维持 IPA 默认、UPS 独立备选，两套由管理员审听后保存。采用有出处的确定性转换规则，明确输入字典约定；遇到不确定的读音保留人工决定。不要把拼写转音素模型的预测当作管理员输入音标的无损转换。

## 可核查的实践

| 方案             | 官方能力                                                                                                    | 对本项目的意义                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Azure            | SSML phoneme 支持 IPA、UPS 等；每个 locale 有支持的音素集，错误音素可能返回 400；IPA 重音解释与音节边界有关 | 拼写进入正文，选中音素进入 ph；使用实际 en-GB/en-US 音色验收   |
| Google Cloud TTS | 支持 IPA/X-SAMPA phoneme；请求内自定义发音词典可转换为 phoneme 标记                                         | 发音记录是显式覆盖，不需要把字典展示文本交给默认朗读           |
| Amazon Polly     | IPA/X-SAMPA phoneme 与 PLS 发音词典                                                                         | 人工修正可以持久保存并复用，不应每次被自动转换覆盖             |
| W3C PLS          | 分离 grapheme、phoneme、语言和多个读音                                                                      | 本任务现有词形/方言/发音记录已经提供所需归属，无需再造词典服务 |
| eSpeak NG        | 发音词典列表结合拼写规则，将文字转换为音素                                                                  | 解决的是从拼写预测读音，不保证保留已有字典音标的目标读法       |
| CMUdict          | 面向美式英语的发音词典，支持多读音                                                                          | 可作独立参考，不是英美共同的权威来源，也不是 Azure UPS 表      |

以上是所列产品的已公开做法；“适合本项目”的结论是据此作出的工程判断，不是行业统一标准。

## 自动转换边界

1. 先固定输入字典的记音约定，再做音素解析和目标编码；最长组合先匹配，不能逐字符替换塞擦音。
2. 纯格式处理（成对 /…/、[…]、边缘空白）可直接处理；不删除未知内部符号。
3. 同一符号不一定代表同一字典约定。例如英语教学字典 r 可能是宽式记法；不能未经约定就当作颤音或卷舌音。同理 e/ɛ、长音、可选 r、重音与音节需要来源规则。
4. 本轮实现基本音素与明确塞擦音；IPA 保留官方列出的双元音组合。UPS 重音、长音、双元音等尚未完成目标音色验收的规则明确失败，允许手工输入。
5. 微软 structured text 的 en-US UPS 表属于识别训练材料，可以佐证符号对应，但不能单独证明 Azure 合成各 locale 的音素支持与听感。
6. 不引入 LLM 或 G2P 自动猜测修正；后续扩表用确定输入/预期输出及 en-GB/en-US 试听作为验收样例。

## 来源

- [Azure SSML pronunciation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation)
- [Azure phonetic sets](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets)
- [Azure structured text UPS table](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/customize-pronunciation)
- [Google Cloud SSML](https://docs.cloud.google.com/text-to-speech/docs/ssml)
- [Polly phoneme](https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html)
- [W3C PLS 1.0](https://www.w3.org/TR/pronunciation-lexicon/)
- [eSpeak NG pronunciation dictionary and rules](https://github.com/espeak-ng/espeak-ng/blob/master/docs/dictionary.md)
- [CMUdict](https://github.com/cmusphinx/cmudict)
