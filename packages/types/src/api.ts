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
