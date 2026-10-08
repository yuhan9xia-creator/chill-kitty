
import { StorageType, FoodDef, FreshnessState, FoodCategory, VitalityFormula } from './types';
import foodData from './food.json';

export const FRESHNESS_COLORS: Record<FreshnessState, string> = {
  [FreshnessState.FRESH]: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  [FreshnessState.STABLE]: 'bg-sky-50 text-sky-600 border-sky-100',
  [FreshnessState.FRAGILE]: 'bg-yellow-50 text-yellow-600 border-yellow-100',
  [FreshnessState.URGENT]: 'bg-orange-50 text-orange-600 border-orange-100',
  [FreshnessState.SPOILED]: 'bg-slate-100 text-slate-400 border-slate-200',
};

const DEFAULT_TIPS: Record<StorageType, Record<'en' | 'cn', string>> = {
  [StorageType.ROOM_TEMP]: { en: "Stay on the counter.", cn: "乖乖待在常温区。" },
  [StorageType.FRIDGE]: { en: "Keep in the fridge.", cn: "放进冰箱冷藏。" },
  [StorageType.FREEZER]: { en: "Tuck into the freezer.", cn: "去冷冻室睡一觉。" },
  [StorageType.UNSET]: { en: "I need a home.", cn: "我需要一个家。" },
};

interface RawFoodEntry {
  id: string;
  name: { en: string; cn: string };
  category: string;
  bestStorage: string;
  baseLifespan: number[];
  lore: { en: string; cn: string };
  realWorldSecret: { en: string; cn: string };
  vitality_formula?: { type: string; declineRate?: number };
  storage_vitality_formula?: Partial<Record<string, { type: string; declineRate?: number }>>;
  quantityKind?: 'countable' | 'uncountable';
}

function parseVitalityFormula(raw?: { type: string; declineRate?: number }): VitalityFormula | undefined {
  if (!raw) return undefined;
  if (raw.type === 'logistic' && raw.declineRate !== undefined) {
    return { type: 'logistic', declineRate: raw.declineRate };
  }
  if (raw.type === 'exponential' && raw.declineRate !== undefined) {
    return { type: 'exponential', declineRate: raw.declineRate };
  }
  return { type: 'linear' };
}

function buildDefinitions(raw: Record<string, RawFoodEntry>): Record<string, FoodDef> {
  const defs: Record<string, FoodDef> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const ls = entry.baseLifespan; // [pantry, fridge, freezer]
    const vitalityFormula = parseVitalityFormula(entry.vitality_formula);
    const storageVitalityFormula: Partial<Record<StorageType, VitalityFormula>> = {};
    for (const [storage, formula] of Object.entries(entry.storage_vitality_formula ?? {})) {
      const parsed = parseVitalityFormula(formula);
      if (parsed) storageVitalityFormula[storage as StorageType] = parsed;
    }
    defs[key] = {
      id: entry.id,
      name: entry.name as Record<'en' | 'cn', string>,
      category: entry.category as FoodCategory,
      bestStorage: entry.bestStorage as StorageType,
      baseLifespan: {
        [StorageType.ROOM_TEMP]: ls[0],
        [StorageType.FRIDGE]: ls[1],
        [StorageType.FREEZER]: ls[2],
        [StorageType.UNSET]: Math.min(...ls),
      },
      lore: entry.lore as Record<'en' | 'cn', string>,
      realWorldSecret: entry.realWorldSecret as Record<'en' | 'cn', string>,
      tips: DEFAULT_TIPS,
      vitalityFormula,
      storageVitalityFormula: Object.keys(storageVitalityFormula).length > 0 ? storageVitalityFormula : undefined,
      quantityKind: entry.quantityKind ?? 'countable',
    };
  }
  return defs;
}

export const FOOD_DEFINITIONS: Record<string, FoodDef> = buildDefinitions(foodData as unknown as Record<string, RawFoodEntry>);
