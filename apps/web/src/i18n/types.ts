/** 仅类型引用；业务资源仍随各模块按需加载。 */
import type { WebCatalog, webCommon } from "./catalog";

export interface WebNamespaces {
  webCommon: typeof webCommon;
  webApp: typeof import("./messages/app").webApp;
  webAudio: typeof import("./messages/audio").webAudio;
  webClass: typeof import("./messages/class").webClass;
  webDictionary: typeof import("./messages/dictionary").webDictionary;
  webInvitations: typeof import("./messages/invitations").webInvitations;
  webPlacement: typeof import("./messages/placement").webPlacement;
  webPreferences: typeof import("./messages/preferences").webPreferences;
  webReview: typeof import("./messages/review").webReview;
  webShell: typeof import("./messages/shell").webShell;
  webStats: typeof import("./messages/stats").webStats;
  webTask: typeof import("./messages/task").webTask;
  webTheme: typeof import("./messages/theme").webTheme;
  webAuthAccess: typeof import("./messages/auth/access").webAuthAccess;
  webAuthCertification: typeof import("./messages/auth/certification").webAuthCertification;
  webAuthOnboarding: typeof import("./messages/auth/onboarding").webAuthOnboarding;
  webAuthProfile: typeof import("./messages/auth/profile").webAuthProfile;
  webAuthSecurity: typeof import("./messages/auth/security").webAuthSecurity;
  webAuthSession: typeof import("./messages/auth/session").webAuthSession;
  webCoinsRewards: typeof import("./messages/coins/rewards").webCoinsRewards;
  webCoinsWallet: typeof import("./messages/coins/wallet").webCoinsWallet;
  webHomeAccount: typeof import("./messages/home/account").webHomeAccount;
  webHomeLanding: typeof import("./messages/home/landing").webHomeLanding;
  webStudentHomeDashboard: typeof import("./messages/student-home/dashboard").webStudentHomeDashboard;
  webStudentHomePreferences: typeof import("./messages/student-home/preferences").webStudentHomePreferences;
  webTeacherCertificationDocuments: typeof import("./messages/teacher-certification/documents").webTeacherCertificationDocuments;
  webTeacherCertificationIdentity: typeof import("./messages/teacher-certification/identity").webTeacherCertificationIdentity;
  webTeacherCertificationNotifications: typeof import("./messages/teacher-certification/notifications").webTeacherCertificationNotifications;
  webWordlistBrowser: typeof import("./messages/wordlist/browser").webWordlistBrowser;
  webWordlistDetail: typeof import("./messages/wordlist/detail").webWordlistDetail;
  webWordlistEditor: typeof import("./messages/wordlist/editor").webWordlistEditor;
  webWordlistExcel: typeof import("./messages/wordlist/excel").webWordlistExcel;
  webWordlistInteractions: typeof import("./messages/wordlist/interactions").webWordlistInteractions;
  webWordlistLibrary: typeof import("./messages/wordlist/library").webWordlistLibrary;
  webWordlistReader: typeof import("./messages/wordlist/reader").webWordlistReader;
}
type CatalogKeys<C extends WebCatalog> = {
  [K in keyof C["messages"] & string]: `${C["namespace"]}:${K}`;
}[keyof C["messages"] & string];
export type WebKey = {
  [N in keyof WebNamespaces]: CatalogKeys<WebNamespaces[N]>;
}[keyof WebNamespaces];
export type WebCatalogKey<C extends WebCatalog> =
  CatalogKeys<C> | CatalogKeys<typeof webCommon>;
type Parameters<S extends string> =
  S extends `${string}{{${infer P}}}${infer Rest}`
    ? P | Parameters<Rest>
    : never;
type Message<C extends WebCatalog, K extends string> = C extends WebCatalog
  ? K extends `${C["namespace"]}:${infer M extends keyof C["messages"] & string}`
    ? C["messages"][M][2]
    : never
  : never;
type PluralParameter<
  C extends WebCatalog,
  K extends string
> = C extends WebCatalog
  ? K extends `${C["namespace"]}:${infer M extends keyof C["plurals"] & string}`
    ? C["plurals"][M] extends { parameter: infer P extends string }
      ? P
      : never
    : never
  : never;
export type WebParameterValue =
  | string
  | number
  | bigint
  | import("./catalog").LocalText
  | import("./catalog").OriginalText
  | import("./catalog").ServerText;
type MessageParameters<C extends WebCatalog, K extends string> = {
  [
    P in Parameters<Message<C, K>> | PluralParameter<C, K>
  ]: P extends PluralParameter<C, K> ? number | bigint : WebParameterValue;
};
export type CatalogArguments<
  C extends WebCatalog,
  K extends WebCatalogKey<C>
> = [keyof MessageParameters<C | typeof webCommon, K>] extends [never]
  ? [values?: never]
  : [values: MessageParameters<C | typeof webCommon, K>];

type EnglishMessages<C extends WebCatalog> = {
  [K in keyof C["messages"]]: C["messages"][K][2];
};
type RegisteredMessages = {
  [N in Exclude<keyof WebNamespaces, "webCommon">]: EnglishMessages<
    WebNamespaces[N]
  >;
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces extends RegisteredMessages {
    webCommon: EnglishMessages<typeof webCommon>;
  }
}

/** 无插值参数的作者标签，可用于路由标题及静态页头。 */
export type WebStaticKey<C extends WebCatalog> = {
  [K in WebCatalogKey<C>]: CatalogArguments<C, K> extends [values?: never]
    ? K
    : never;
}[WebCatalogKey<C>];
