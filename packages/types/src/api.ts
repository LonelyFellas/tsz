// 通用 API 包裹类型。

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

/** RFC 9457 Problem Details 与 tsz 稳定扩展字段。 */
export interface ProblemDetails {
  /** 跨环境稳定的问题类型 URI。 */
  type: string;
  /** 类型级短标题；客户端不得据此分支。 */
  title: string;
  /** Problem body 中记录的 HTTP 状态；业务控制仍以实际响应状态为准。 */
  status: number;
  /** 本次错误的安全说明。 */
  detail: string;
  /** 稳定机器错误码；客户端业务分支只读取此字段。 */
  code: string;
  /** 单字段错误对应的请求字段。 */
  field?: string;
}
