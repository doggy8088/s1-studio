import Dexie, { type EntityTable } from 'dexie';
import {
  EndpointProfile,
  S1HistoryEntry,
  S1PresetDefinition,
} from '@/types/systemone';
import { DEFAULT_PROFILES } from './presets';

class S1StudioDatabase extends Dexie {
  history!: EntityTable<S1HistoryEntry, 'id'>;
  customPresets!: EntityTable<S1PresetDefinition, 'id'>;
  profiles!: EntityTable<EndpointProfile, 'id'>;

  constructor() {
    super('S1StudioDatabase');
    this.version(1).stores({
      history: '++id, timestamp, profileName, model',
      customPresets: 'id, name, category, createdAt',
      profiles: 'id, name, baseUrl',
    });
  }
}

export const db = new S1StudioDatabase();

const PROFILES_STORAGE_KEY = 's1_studio_profiles_v1';
const ACTIVE_PROFILE_ID_KEY = 's1_studio_active_profile_id_v1';

export function loadProfilesFromLocalStorage(): EndpointProfile[] {
  if (typeof window === 'undefined') return DEFAULT_PROFILES;
  try {
    const raw = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(
        PROFILES_STORAGE_KEY,
        JSON.stringify(DEFAULT_PROFILES)
      );
      return DEFAULT_PROFILES;
    }
    const parsed = JSON.parse(raw) as EndpointProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_PROFILES;
    }

    let changed = false;
    const normalized = parsed.map((p) => {
      let updated = p;
      if (
        updated.id === 's1-builtin-simulator' &&
        updated.name === 'Built-in Sandbox Simulator (Demo)'
      ) {
        changed = true;
        updated = { ...updated, name: '內建沙盒模擬器(Demo)' };
      }

      if (
        updated.id === 'cloudflare-workers-ai-clef' ||
        (updated.baseUrl || '').includes('api.cloudflare.com/client/v4/accounts/')
      ) {
        const acctMatch = (updated.baseUrl || '').match(
          /\/client\/v4\/accounts\/([^/]+)\/ai\/run/
        );
        const extractedAcct =
          updated.cloudflareAccountId !== undefined
            ? updated.cloudflareAccountId
            : acctMatch &&
                acctMatch[1] &&
                acctMatch[1] !== '$CLOUDFLARE_ACCOUNT_ID'
              ? acctMatch[1]
              : '';

        let cfModel = (updated.defaultModel || '').trim();
        if (
          cfModel === 'clef' ||
          cfModel === 'clef-omni' ||
          cfModel === 'clef-flash'
        ) {
          cfModel = `@cf/cloudflare/${cfModel}`;
        } else if (!cfModel.startsWith('@cf/cloudflare/')) {
          cfModel = '@cf/cloudflare/clef';
        }

        const acctForUrl = extractedAcct.trim() || '$CLOUDFLARE_ACCOUNT_ID';
        const nextBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${acctForUrl}/ai/run/${cfModel}`;

        if (
          updated.cloudflareAccountId !== extractedAcct ||
          updated.defaultModel !== cfModel ||
          updated.baseUrl !== nextBaseUrl
        ) {
          changed = true;
          updated = {
            ...updated,
            cloudflareAccountId: extractedAcct,
            defaultModel: cfModel,
            baseUrl: nextBaseUrl,
          };
        }
      }

      return updated;
    });

    // Merge any newly added built-in DEFAULT_PROFILES (e.g. cloudflare-workers-ai-clef)
    const existingIds = new Set(normalized.map((p) => p.id));
    const missingDefaults = DEFAULT_PROFILES.filter(
      (dp) => !existingIds.has(dp.id)
    );
    if (missingDefaults.length > 0) {
      changed = true;
      const simIdx = normalized.findIndex(
        (p) => p.id === 's1-builtin-simulator'
      );
      if (simIdx >= 0) {
        normalized.splice(simIdx, 0, ...missingDefaults);
      } else {
        normalized.push(...missingDefaults);
      }
    }

    if (changed) {
      window.localStorage.setItem(
        PROFILES_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    }

    return normalized;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function saveProfilesToLocalStorage(profiles: EndpointProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error('Failed to save profiles to localStorage:', e);
  }
}

export function loadActiveProfileId(): string {
  if (typeof window === 'undefined') return DEFAULT_PROFILES[0].id;
  return (
    window.localStorage.getItem(ACTIVE_PROFILE_ID_KEY) || DEFAULT_PROFILES[0].id
  );
}

export function saveActiveProfileId(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_PROFILE_ID_KEY, id);
}

/**
 * Record a test run in IndexedDB and enforce the 50-item maximum history cap.
 */
export async function addHistoryEntry(
  entry: Omit<S1HistoryEntry, 'id'>
): Promise<number | undefined> {
  try {
    const id = await db.history.add(entry as S1HistoryEntry);
    const totalCount = await db.history.count();
    if (totalCount > 50) {
      const oldest = await db.history
        .orderBy('timestamp')
        .limit(totalCount - 50)
        .primaryKeys();
      await db.history.bulkDelete(oldest);
    }
    return id;
  } catch (err) {
    console.error('Failed to add history entry to IndexedDB:', err);
    return undefined;
  }
}

export async function clearAllHistory(): Promise<void> {
  await db.history.clear();
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  await db.history.delete(id);
}

export async function saveCustomPreset(
  preset: S1PresetDefinition
): Promise<void> {
  await db.customPresets.put(preset);
}

export async function deleteCustomPreset(id: string): Promise<void> {
  await db.customPresets.delete(id);
}
