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

    // Merge any newly added built-in DEFAULT_PROFILES (e.g. cloudflare-workers-ai-clef)
    const existingIds = new Set(parsed.map((p) => p.id));
    const missingDefaults = DEFAULT_PROFILES.filter(
      (dp) => !existingIds.has(dp.id)
    );
    if (missingDefaults.length > 0) {
      const simIdx = parsed.findIndex((p) => p.id === 's1-builtin-simulator');
      const merged = [...parsed];
      if (simIdx >= 0) {
        merged.splice(simIdx, 0, ...missingDefaults);
      } else {
        merged.push(...missingDefaults);
      }
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }

    return parsed;
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
