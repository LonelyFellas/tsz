/**
 * Vite 环境变量均以字符串注入。显式布尔开关只接受 true / false，
 * 避免诸如 "0"、"TRUE" 被 JavaScript 真值规则意外开启。
 */
export function parseBooleanEnvFlag(
  value: string | boolean | undefined,
  name: string,
  defaultValue = false
): boolean {
  if (value === undefined || value === "") return defaultValue;
  if (value === false || value === "false") {
    return false;
  }
  if (value === true || value === "true") return true;

  throw new Error(
    `[env] ${name} 只能是 "true" 或 "false"，当前值为 ${JSON.stringify(value)}`
  );
}

/** mock 数据源绝不能进入 production mode 产物。运行时与 Vite 构建共用这条策略。 */
export function assertAdminWordsMockAllowed(
  enabled: boolean,
  production: boolean,
  mode = production ? "production" : "development"
): void {
  if (enabled && production && mode !== "test") {
    throw new Error(
      "[env] 仅开发环境或 test mode 构建允许启用 VITE_ADMIN_WORDS_MOCK；请移除该变量或设为 false"
    );
  }
}

/** 词性配置 mock 采用独立开关，但沿用相同的 production fail-closed 策略。 */
export function assertAdminPartOfSpeechMockAllowed(
  enabled: boolean,
  production: boolean,
  mode = production ? "production" : "development"
): void {
  if (enabled && production && mode !== "test") {
    throw new Error(
      "[env] 仅开发环境或 test mode 构建允许启用 VITE_ADMIN_PART_OF_SPEECH_MOCK；请移除该变量或设为 false"
    );
  }
}

/** TTS mock 与词库 mock 采用同样的 fail-closed 策略。 */
export function assertAdminTtsMockAllowed(
  enabled: boolean,
  production: boolean,
  mode = production ? "production" : "development"
): void {
  if (enabled && production && mode !== "test") {
    throw new Error(
      "[env] 仅开发环境或 test mode 构建允许启用 VITE_ADMIN_TTS_MOCK；请移除该变量或设为 false"
    );
  }
}
