export interface AdminWordsMockStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistedEnvelope<TState> {
  schema_version: number;
  admin_profile_id: string;
  state: TState;
}

export interface AdminWordsMockStorage<TState> {
  load(adminProfileId: string): TState | undefined;
  save(adminProfileId: string, state: TState): void;
  clear(adminProfileId?: string): void;
}

export interface CreateAdminWordsMockStorageOptions<TState> {
  storage?: AdminWordsMockStorageLike;
  schemaVersion: number;
  legacySchemaVersions?: readonly number[];
  isState: (value: unknown) => value is TState;
  migrateLegacy?: (state: unknown, schemaVersion: number) => TState | undefined;
  warn?: (message: string, error?: unknown) => void;
}

const KEY_PREFIX = "tsz:admin:words-mock";

export function adminWordsMockStorageKey(
  schemaVersion: number,
  adminProfileId: string
): string {
  return `${KEY_PREFIX}:v${schemaVersion}:${encodeURIComponent(adminProfileId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * sessionStorage 只负责 mock 的硬刷新恢复；内存 Map 仍是当前实例的事实源。
 * 适配器会在登出/管理员切换时删除上一身份的 namespace，防止串号。
 */
export function createAdminWordsMockStorage<TState>({
  storage,
  schemaVersion,
  legacySchemaVersions = [],
  isState,
  migrateLegacy,
  warn = (message, error) => {
    if (import.meta.env.DEV) console.warn(message, error);
  }
}: CreateAdminWordsMockStorageOptions<TState>): AdminWordsMockStorage<TState> {
  let activeProfileId: string | undefined;

  const keyFor = (profileId: string) =>
    adminWordsMockStorageKey(schemaVersion, profileId);

  const legacyKeyFor = (legacySchemaVersion: number, profileId: string) =>
    adminWordsMockStorageKey(legacySchemaVersion, profileId);

  function removeKey(key: string): void {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (error) {
      warn("[admin words mock] 无法清理 sessionStorage", error);
    }
  }

  function remove(profileId: string): void {
    removeKey(keyFor(profileId));
    for (const legacySchemaVersion of legacySchemaVersions) {
      removeKey(legacyKeyFor(legacySchemaVersion, profileId));
    }
  }

  function selectProfile(profileId: string): void {
    if (activeProfileId && activeProfileId !== profileId) {
      remove(activeProfileId);
    }
    activeProfileId = profileId;
  }

  return {
    load(profileId) {
      selectProfile(profileId);
      if (!storage) return undefined;

      const key = keyFor(profileId);
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        warn(
          "[admin words mock] 无法读取 sessionStorage，将使用内存状态",
          error
        );
        return undefined;
      }
      if (raw === null) {
        for (const legacySchemaVersion of legacySchemaVersions) {
          const legacyKey = legacyKeyFor(legacySchemaVersion, profileId);
          try {
            raw = storage.getItem(legacyKey);
          } catch (error) {
            warn(
              "[admin words mock] 无法读取 sessionStorage，将使用内存状态",
              error
            );
            return undefined;
          }
          if (raw === null) continue;
          try {
            const parsed: unknown = JSON.parse(raw);
            if (
              !isRecord(parsed) ||
              parsed.schema_version !== legacySchemaVersion ||
              parsed.admin_profile_id !== profileId
            ) {
              throw new Error("legacy mock storage envelope shape mismatch");
            }
            const migrated = migrateLegacy?.(parsed.state, legacySchemaVersion);
            if (!migrated || !isState(migrated)) {
              throw new Error("legacy mock storage migration failed");
            }
            const envelope: PersistedEnvelope<TState> = {
              schema_version: schemaVersion,
              admin_profile_id: profileId,
              state: migrated
            };
            storage.setItem(key, JSON.stringify(envelope));
            removeKey(legacyKey);
            return migrated;
          } catch (error) {
            removeKey(legacyKey);
            warn(
              "[admin words mock] sessionStorage 旧版数据损坏或迁移失败，已清理",
              error
            );
            return undefined;
          }
        }
        return undefined;
      }

      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          !isRecord(parsed) ||
          parsed.schema_version !== schemaVersion ||
          parsed.admin_profile_id !== profileId ||
          !isState(parsed.state)
        ) {
          throw new Error("mock storage envelope shape mismatch");
        }
        return parsed.state;
      } catch (error) {
        remove(profileId);
        warn(
          "[admin words mock] sessionStorage 数据损坏或版本不兼容，已清理",
          error
        );
        return undefined;
      }
    },

    save(profileId, state) {
      selectProfile(profileId);
      if (!storage) return;
      const envelope: PersistedEnvelope<TState> = {
        schema_version: schemaVersion,
        admin_profile_id: profileId,
        state
      };
      try {
        storage.setItem(keyFor(profileId), JSON.stringify(envelope));
      } catch (error) {
        warn(
          "[admin words mock] 无法写入 sessionStorage，将继续使用内存状态",
          error
        );
      }
    },

    clear(profileId) {
      const target = profileId ?? activeProfileId;
      if (target) remove(target);
      if (!profileId || profileId === activeProfileId)
        activeProfileId = undefined;
    }
  };
}
