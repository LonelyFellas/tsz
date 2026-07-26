import { createMockAssessmentClient } from "./mock";
import type { AssessmentClient } from "./types";

// 装配点:组件只从这里拿 client,不直接 import mock。
// 后端(tsz-rust)定级接口就绪后,把 mock 换成基于 @tsz/api-client 的
// http 实现即可,组件与流程零改动(接口见 types.ts AssessmentClient)。

export const assessmentClient: AssessmentClient = createMockAssessmentClient();
