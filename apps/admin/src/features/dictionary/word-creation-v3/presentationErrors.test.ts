import {
  HttpError,
  InvalidAdminWordResponseError,
  UnsupportedAdminWordSchemaVersionError
} from "@tsz/api-client";
import {
  V3_VALIDATION_ISSUE_CODES,
  type V3DraftValidationIssue,
  type V3ValidationIssueCode
} from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  presentV3DetailError,
  v3IssueMessage,
  v3IssueMessages,
  shouldRetryV3Detail
} from "./presentationErrors";

function issue(code: V3ValidationIssueCode): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id: "node-1",
    field: "field",
    code,
    message: "raw backend message",
    node_location: { node_role: "entry", ancestor_node_ids: [] }
  };
}

describe("V3 product error presentation", () => {
  it("maps every supported validation code without exposing backend messages", () => {
    for (const code of V3_VALIDATION_ISSUE_CODES) {
      const message = v3IssueMessage(issue(code));
      expect(message).not.toBe("raw backend message");
      expect(message).toMatch(/[\u3400-\u9fff]/u);
    }
    expect(v3IssueMessage(issue("pronunciation_required"))).toBe(
      "请完整填写发音方式、字典音标和实际发音"
    );
  });

  it("deduplicates issue messages and fails closed for future codes", () => {
    expect(
      v3IssueMessages([
        issue("pronunciation_required"),
        issue("pronunciation_required"),
        { ...issue("pos_required"), code: "future_code" as never }
      ])
    ).toEqual([
      "请完整填写发音方式、字典音标和实际发音",
      "该内容暂时无法完成，请刷新后重试"
    ]);
  });

  it("productizes detail errors and retries only recoverable failures", () => {
    const missing = new HttpError(404, "word not found", [], "word_not_found");
    expect(presentV3DetailError(missing)).toEqual({
      title: "无法打开词条",
      description: "词条不存在或已被删除",
      retryable: false
    });
    expect(shouldRetryV3Detail(0, missing)).toBe(false);
    expect(
      presentV3DetailError(
        new UnsupportedAdminWordSchemaVersionError(9, "get.word")
      ).description
    ).toBe("当前前端不支持该词条数据版本，请升级后重试");

    const unavailable = new HttpError(503, "offline", [], "unavailable");
    expect(shouldRetryV3Detail(0, unavailable)).toBe(true);
    expect(shouldRetryV3Detail(1, unavailable)).toBe(true);
    expect(shouldRetryV3Detail(2, unavailable)).toBe(false);
    expect(shouldRetryV3Detail(0, new TypeError("offline"))).toBe(true);
  });

  it.each([
    [
      new InvalidAdminWordResponseError(
        "word",
        "missing_required_property",
        "object"
      ),
      "词条响应格式异常，已安全停止",
      false
    ],
    [
      new HttpError(401, "raw unauthorized", [], "invalid_token"),
      "登录状态已失效，请重新登录",
      false
    ],
    [
      new HttpError(403, "raw forbidden", [], "account_disabled"),
      "当前账号没有查看该词条的权限",
      false
    ],
    [
      new HttpError(400, "raw missing", [], "word_not_found"),
      "词条不存在或已被删除",
      false
    ],
    [
      new HttpError(422, "raw unsupported", [], "unsupported_schema_version"),
      "当前前端不支持该词条数据版本，请升级后重试",
      false
    ],
    [
      new HttpError(500, "raw server error", [], "internal_error"),
      "词条加载失败，请稍后重试",
      true
    ],
    [
      new HttpError(409, "raw conflict", [], "revision_conflict"),
      "词条暂时无法打开",
      false
    ],
    [new Error("raw programming error"), "词条暂时无法打开", false]
  ] as const)(
    "maps detail error %# without exposing raw text",
    (error, description, retryable) => {
      expect(presentV3DetailError(error)).toEqual({
        title: "无法打开词条",
        description,
        retryable
      });
      expect(shouldRetryV3Detail(0, error)).toBe(retryable);
      expect(presentV3DetailError(error).description).not.toContain("raw");
    }
  );
});
