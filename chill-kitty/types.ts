
export type Language = 'en' | 'cn';

export enum StorageType {
  ROOM_TEMP = 'Pantry Garden',
  FRIDGE = 'Fridge Sanctuary',
  FREEZER = 'Ice Island',
  UNSET = 'Unset'
}

export enum FreshnessState {
  FRESH = 'Fresh',
  STABLE = 'Stable',
  FRAGILE = 'Fragile',
  URGENT = 'Urgent',
  SPOILED = 'Spoiled'
}

export type FoodCategory = 'Vegetable' | 'Fruit' | 'Protein' | 'Dairy' | 'Grain' | 'Misc';
export type FoodQuantityKind = 'countable' | 'uncountable';

export type VitalityFormula =
  | { type: 'linear' }
  | { type: 'logistic'; declineRate: number }
  | { type: 'exponential'; declineRate: number };

export interface SanctuaryNote {
  id: string;
  senderName: string;
  senderEmoji: string;
  message: string;
  daySent: number;
  isRead: boolean;
  rarity: 'Common' | 'Rare';
  archetype: string;
}

export interface FoodDef {
  id: string;
  name: Record<Language, string>;
  emoji?: string;
  category: FoodCategory;
  baseLifespan: Record<StorageType, number>;
  tips: Record<StorageType, Record<Language, string>>;
  lore: Record<Language, string>;
  realWorldSecret: Record<Language, string>;
  bestStorage: StorageType;
  vitalityFormula?: VitalityFormula;
  storageVitalityFormula?: Partial<Record<StorageType, VitalityFormula>>;
  quantityKind?: FoodQuantityKind;
}

export interface FoodItem {
  instanceId: string;
  defId: string;
  name: string; 
  emoji: string;
  addedDay: number;
  damageDays: number; // manual health reduction tracking (physical damage only)
  vitality?: number; // 0.0~1.0, AI-assessed or user-modified
  initialVitality?: number; // 0.0~1.0, AI-assessed at recognition time, never mutated
  quantityKind?: FoodQuantityKind;
  quantity?: number; // Countable foods: number of pieces in this recognized batch
  amountPercent?: number; // Uncountable foods: remaining amount in percent
  backendEntryIds?: string[]; // IDs created by the backend for a grouped recognition result
  addedDate?: string; // ISO date string (e.g. "2026-02-22") for real-time freshness
  storage: StorageType;
  x: number;
  y: number;
}

export interface DailyFoodStat {
  defId: string;
  name: Record<Language, string>;
  count: number;
}

export interface RecipeIngredient {
  name: string | { en: string; cn: string };  // bilingual or plain string
  id?: string | null;  // food defId for SVG icon lookup (sanctuary items only)
  status: 'sanctuary' | 'market';
}

export interface Recipe {
  recipeId?: number | string;
  name: string | { en: string; cn: string };
  description: string | { en: string; cn: string };
  ingredients: RecipeIngredient[];
  steps?: (string | { en: string; cn: string })[];
  prepTime: string;
}

export interface AppStats {
  eatenCount: number;
  wastedCount: number;
  totalSaved: number;
  todayDate?: string;
  todayEaten?: number;
  todayWasted?: number;
  todayCategoryStats?: Partial<Record<'Fruit' | 'Protein' | 'Dairy' | 'Vegetable' | 'Grain', { eaten: number; wasted: number }>>;
  todayFoodStats?: Partial<Record<'Fruit' | 'Protein' | 'Dairy' | 'Vegetable' | 'Grain', { eaten: DailyFoodStat[]; wasted: DailyFoodStat[] }>>;
  priorityHandledCount: number;
}

export type ViewState = 'HOME' | 'SCAN' | 'CLASSIFY' | 'DETAIL' | 'ALMANAC' | 'RECIPES' | 'CAT' | 'PROFILE' | 'AUTH';
