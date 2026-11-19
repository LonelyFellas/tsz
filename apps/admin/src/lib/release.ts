declare const __TSZ_RELEASE_ID__: string;
declare const __TSZ_APP_VERSION__: string;

/** 当前加载的 admin 前端发布标识，来自构建产物而非运行时探测。 */
export const adminReleaseId = __TSZ_RELEASE_ID__;

/** 面向测试人员展示的 admin 语义版本，来自 apps/admin/package.json。 */
export const adminVersion = __TSZ_APP_VERSION__;
