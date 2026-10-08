/**
 * Browser-local data service for the independent Chill Kitty build.
 *
 * User progress, inventory, recipes, cat state, and daily tasks stay on the
 * current device. Only image recognition and text generation call the small
 * server-side AI proxy, which keeps the provider key out of the browser.
 */
import { Recipe, Language, SanctuaryNote, FoodItem, StorageType } from '../types';
import { getLocalDateStr } from '../components/FoodCard';

const APP_STATE_PREFIX = 'food-haven-v22-state';
const AUTH_SESSION_KEY = 'chill-kitty-user';
const LOCAL_ACCOUNTS_KEY = 'chill-kitty-local-accounts-v1';
const CAT_STATE_PREFIX = 'chill-kitty-cat-v1';
const TASK_STATE_PREFIX = 'chill-kitty-tasks-v1';

type JsonRecord = Record<string, any>;

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function activeUser(): AuthResult | null {
  if (!hasBrowserStorage()) return null;
  const demoUser = safeParse<AuthResult | null>(sessionStorage.getItem(AUTH_SESSION_KEY), null);
  if (demoUser?.is_demo) return demoUser;
  return safeParse<AuthResult | null>(localStorage.getItem(AUTH_SESSION_KEY), null);
}

function stateStorage(): Storage | null {
  if (!hasBrowserStorage()) return null;
  return activeUser()?.is_demo ? sessionStorage : localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentUserId(): string {
  if (!hasBrowserStorage()) return 'anonymous';
  const user = activeUser();
  return user?.user_id || 'anonymous';
}

function appStateKey(): string {
  return `${APP_STATE_PREFIX}:${currentUserId()}`;
}

function readAppState(): JsonRecord {
  const storage = stateStorage();
  if (!storage) return {};
  return safeParse<JsonRecord>(storage.getItem(appStateKey()), {});
}

function writeAppState(next: JsonRecord): void {
  const storage = stateStorage();
  if (!storage) return;
  storage.setItem(appStateKey(), JSON.stringify(next));
}

function updateAppState(patch: JsonRecord): void {
  writeAppState({ ...readAppState(), ...patch });
}

async function apiFetch(path: string, options: RequestInit = {}, timeoutMs = 180000): Promise<any> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `AI service error ${response.status}`);
    }
    return response.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('请求超时，请稍后重试');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Identify food from a camera image. The recognized items are saved by App.tsx after classification. */
export async function identifyMultipleFoods(
  base64Image: string,
  lang: Language,
  mode: 'food' | 'receipt' = 'food'
): Promise<{ foods: any[]; sanctuaryEntries: any[] }> {
  const byteChars = atob(base64Image);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'capture.jpg');
  form.append('lang', lang);
  form.append('mode', mode);

  const data = await apiFetch('/identify', { method: 'POST', body: form });
  const foods: any[] = data.foods || [];
  const sanctuaryEntries: any[] = [];
  for (const food of foods) {
    const count = food.quantityKind === 'uncountable'
      ? 1
      : Math.max(1, Number.parseInt(String(food.quantity ?? 1), 10) || 1);
    for (let i = 0; i < count; i++) {
      sanctuaryEntries.push({
        id: createId(),
        def_id: food.id,
        vitality: food.vitality ?? 1,
        amountPercent: food.amount_percent ?? 100,
      });
    }
  }
  return { foods, sanctuaryEntries };
}

export async function generateRecipesFromItems(
  items: FoodItem[],
  lang: Language,
  style: 'cn_cuisine' | 'western',
  freshnessMap: Record<string, number>
): Promise<Recipe[]> {
  const foodList = items.map(item => ({
    name: item.name,
    emoji: item.emoji,
    defId: item.defId,
    freshness: 1 - (freshnessMap[item.instanceId] ?? 0.5),
  }));
  const data = await apiFetch('/recipes', {
    method: 'POST',
    body: JSON.stringify({ food_list: foodList, lang, style }),
  });
  const recipes: Recipe[] = (data.recipes || []).map((recipe: Recipe) => ({
    ...recipe,
    recipeId: recipe.recipeId ?? createId(),
  }));
  updateAppState({ recipes });
  return recipes;
}

export async function generateSanctuaryNotes(candidates: any[], lang: Language): Promise<SanctuaryNote[]> {
  const data = await apiFetch('/notes/generate', {
    method: 'POST',
    body: JSON.stringify({ candidates, lang }),
  });
  return data.notes || [];
}

// ── Browser-local inventory and recipe history ─────────────────────────────

export async function loadSanctuaryItems(_allDefs: Record<string, any>): Promise<FoodItem[]> {
  return (readAppState().items || []) as FoodItem[];
}

function updateStoredItem(itemId: string, patch: Partial<FoodItem>): void {
  const state = readAppState();
  const items: FoodItem[] = state.items || [];
  const next = items.map(item =>
    item.instanceId === itemId || item.backendEntryIds?.includes(itemId)
      ? { ...item, ...patch }
      : item
  );
  updateAppState({ items: next });
}

export async function updateSanctuaryVitality(itemId: string, vitality: number, storage?: string): Promise<any> {
  updateStoredItem(itemId, {
    vitality,
    ...(storage ? { storage: storage as StorageType } : {}),
  });
  return { ok: true };
}

export async function updateSanctuaryPortion(itemId: string, amountPercent: number): Promise<any> {
  updateStoredItem(itemId, { amountPercent: Math.max(0, Math.min(100, amountPercent)) });
  return { ok: true };
}

export async function deleteSanctuaryItem(itemId: string): Promise<any> {
  const state = readAppState();
  const items: FoodItem[] = state.items || [];
  updateAppState({
    items: items.filter(item => item.instanceId !== itemId && !item.backendEntryIds?.includes(itemId)),
  });
  return { ok: true };
}

export async function loadRecipeHistory(): Promise<Recipe[]> {
  return (readAppState().recipes || []) as Recipe[];
}

export async function deleteRecipe(recipeId: number | string): Promise<void> {
  const state = readAppState();
  const recipes: Recipe[] = state.recipes || [];
  updateAppState({ recipes: recipes.filter(recipe => String(recipe.recipeId) !== String(recipeId)) });
}

// ── Browser-local cat state ─────────────────────────────────────────────────

export interface CatData {
  xp: number;
  level: number;
  mood: number;
  streak: number;
  last_checkin: string | null;
  last_login_date?: string | null;
  logged_in_today?: boolean;
  already_logged_in_today?: boolean;
  checkin_performed?: boolean;
  previous_login_date?: string | null;
  week_start: string | null;
  weekly_checkins: boolean[];
  weekly_daily_eaten?: number[];
  weekly_daily_wasted?: number[];
  eaten_count?: number;
  wasted_count?: number;
  saved_count?: number;
  today_date?: string | null;
  today_eaten?: number;
  today_wasted?: number;
  daily_tasks_completed_days?: number;
  good_mood_days?: number;
  priority_handled_count?: number;
  zero_waste_days?: number;
  mood_date?: string | null;
  mood_task_gained?: number;
  mood_eat_gained?: number;
  mood_play_gained?: number;
  mood_clean_gained?: number;
  mood_discard_lost?: number;
  mood_daily_lost?: number;
  mood_settled_today?: boolean;
}

function currentMonday(): string {
  const date = new Date();
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_CAT: CatData = {
  xp: 0,
  level: 1,
  mood: 10,
  streak: 0,
  last_checkin: null,
  last_login_date: null,
  logged_in_today: false,
  week_start: null,
  weekly_checkins: [false, false, false, false, false, false, false],
  weekly_daily_eaten: [0, 0, 0, 0, 0, 0, 0],
  weekly_daily_wasted: [0, 0, 0, 0, 0, 0, 0],
  eaten_count: 0,
  wasted_count: 0,
  saved_count: 0,
  today_date: null,
  today_eaten: 0,
  today_wasted: 0,
  daily_tasks_completed_days: 0,
  good_mood_days: 0,
  priority_handled_count: 0,
  zero_waste_days: 0,
  mood_date: null,
  mood_task_gained: 0,
  mood_eat_gained: 0,
  mood_play_gained: 0,
  mood_clean_gained: 0,
  mood_discard_lost: 0,
  mood_daily_lost: 0,
  mood_settled_today: false,
};

function catStateKey(): string {
  return `${CAT_STATE_PREFIX}:${currentUserId()}`;
}

function resetMoodDay(cat: CatData): CatData {
  const today = getLocalDateStr();
  if (cat.mood_date === today) return cat;
  return {
    ...cat,
    mood_date: today,
    mood_task_gained: 0,
    mood_eat_gained: 0,
    mood_play_gained: 0,
    mood_clean_gained: 0,
    mood_discard_lost: 0,
    mood_daily_lost: 0,
    mood_settled_today: false,
  };
}

function readCat(): CatData {
  const storage = stateStorage();
  const stored = storage
    ? safeParse<Partial<CatData>>(storage.getItem(catStateKey()), {})
    : {};
  let cat: CatData = resetMoodDay({ ...DEFAULT_CAT, ...stored });
  const monday = currentMonday();
  if (cat.week_start !== monday) {
    cat = {
      ...cat,
      week_start: monday,
      weekly_checkins: [false, false, false, false, false, false, false],
      weekly_daily_eaten: [0, 0, 0, 0, 0, 0, 0],
      weekly_daily_wasted: [0, 0, 0, 0, 0, 0, 0],
      streak: 0,
    };
  }
  writeCat(cat);
  return cat;
}

function writeCat(cat: CatData): void {
  const storage = stateStorage();
  if (!storage) return;
  storage.setItem(catStateKey(), JSON.stringify(cat));
}

export async function loadCatState(): Promise<CatData> {
  return readCat();
}

export async function saveCatState(state: CatData): Promise<void> {
  writeCat({ ...readCat(), ...state });
}

export async function saveStats(stats: {
  eatenCount: number;
  wastedCount: number;
  totalSaved: number;
  todayDate?: string;
  todayEaten?: number;
  todayWasted?: number;
  priorityHandledCount?: number;
}): Promise<void> {
  const cat = readCat();
  const today = getLocalDateStr();
  if (cat.today_date && cat.today_date !== today && (cat.today_eaten || 0) > 0 && (cat.today_wasted || 0) === 0) {
    cat.zero_waste_days = (cat.zero_waste_days || 0) + 1;
  }
  Object.assign(cat, {
    eaten_count: stats.eatenCount,
    wasted_count: stats.wastedCount,
    saved_count: stats.totalSaved,
    today_date: today,
    today_eaten: stats.todayDate === today ? (stats.todayEaten || 0) : 0,
    today_wasted: stats.todayDate === today ? (stats.todayWasted || 0) : 0,
    priority_handled_count: stats.priorityHandledCount ?? cat.priority_handled_count,
  });
  writeCat(cat);
}

export async function recordDailyLogin(): Promise<CatData> {
  const cat = readCat();
  const today = getLocalDateStr();
  const previous = cat.last_login_date || null;
  const already = previous === today;
  const next = { ...cat, last_login_date: today, logged_in_today: true };
  writeCat(next);
  return { ...next, already_logged_in_today: already, previous_login_date: previous };
}

export async function checkinCat(): Promise<CatData> {
  const cat = readCat();
  const today = getLocalDateStr();
  if (cat.last_checkin === today) return { ...cat, checkin_performed: false };
  const weekday = (new Date().getDay() + 6) % 7;
  const weekly = [...(cat.weekly_checkins || DEFAULT_CAT.weekly_checkins)];
  weekly[weekday] = true;
  const eaten = [...(cat.weekly_daily_eaten || DEFAULT_CAT.weekly_daily_eaten!)];
  const wasted = [...(cat.weekly_daily_wasted || DEFAULT_CAT.weekly_daily_wasted!)];
  eaten[weekday] = cat.today_eaten || 0;
  wasted[weekday] = cat.today_wasted || 0;
  const next: CatData = {
    ...cat,
    last_checkin: today,
    weekly_checkins: weekly,
    weekly_daily_eaten: eaten,
    weekly_daily_wasted: wasted,
    streak: weekly.filter(Boolean).length,
    good_mood_days: (cat.good_mood_days || 0) + (cat.mood >= 15 ? 1 : 0),
  };
  writeCat(next);
  await reportTaskDone('checkin');
  return { ...next, checkin_performed: true };
}

// ── Browser-local daily tasks ───────────────────────────────────────────────

export interface DailyTask {
  id: string;
  action?: string;
  name_en: string;
  name_cn: string;
  description_en: string;
  description_cn: string;
  xp: number;
  nav: string;
  done: boolean;
  claimed: boolean;
  day?: number;
  variant?: string;
}

let taskCatalogPromise: Promise<DailyTask[]> | null = null;

function parseTaskMarkdown(text: string): DailyTask[] {
  return text.split(/^## /m).slice(1).map(section => {
    const lines = section.trim().split(/\r?\n/);
    const task: JsonRecord = { id: lines[0].trim(), done: false, claimed: false };
    for (const line of lines.slice(1)) {
      const match = line.match(/^\s*-\s+(\w+):\s*(.+)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      task[key] = key === 'day' || key === 'xp' ? Number(rawValue) : rawValue.trim();
    }
    return task as DailyTask;
  }).filter(task => task.name_en && task.name_cn);
}

async function taskCatalog(): Promise<DailyTask[]> {
  if (!taskCatalogPromise) {
    taskCatalogPromise = fetch('/data/tasks.md')
      .then(response => response.ok ? response.text() : Promise.reject(new Error('Task file unavailable')))
      .then(parseTaskMarkdown);
  }
  return taskCatalogPromise;
}

type LocalAccount = AuthResult & { passwordHash: string; createdAt: string };
type LocalAccounts = Record<string, LocalAccount>;

function readAccounts(): LocalAccounts {
  if (!hasBrowserStorage()) return {};
  return safeParse<LocalAccounts>(localStorage.getItem(LOCAL_ACCOUNTS_KEY), {});
}

function registrationDate(): Date {
  const account = Object.values(readAccounts()).find(entry => entry.user_id === currentUserId());
  return account?.createdAt ? new Date(account.createdAt) : new Date();
}

function cycleDay(): number {
  const start = registrationDate();
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
  return (days % 7) + 1;
}

function taskStateKey(): string {
  return `${TASK_STATE_PREFIX}:${currentUserId()}:${getLocalDateStr()}`;
}

export async function loadDailyTasks(): Promise<DailyTask[]> {
  const day = cycleDay();
  const storage = stateStorage();
  if (storage) {
    const existing = safeParse<{ day: number; tasks: DailyTask[] } | null>(storage.getItem(taskStateKey()), null);
    if (existing?.day === day && Array.isArray(existing.tasks)) return existing.tasks;
  }
  const catalog = await taskCatalog();
  const hasFood = ((readAppState().items || []) as FoodItem[]).length > 0;
  const desiredVariant = hasFood ? 'normal' : 'fallback';
  let selected = catalog.filter(task => task.day === day && (task.variant || 'normal') === desiredVariant);
  if (!selected.length) selected = catalog.filter(task => task.day === day && (task.variant || 'normal') === 'normal');
  const tasks = selected.slice(0, 3).map(task => ({ ...task, done: false, claimed: false }));
  if (storage) storage.setItem(taskStateKey(), JSON.stringify({ day, tasks }));
  return tasks;
}

function storeTasks(tasks: DailyTask[]): void {
  const storage = stateStorage();
  if (!storage) return;
  storage.setItem(taskStateKey(), JSON.stringify({ day: cycleDay(), tasks }));
}

export async function checkTaskDone(taskId: string): Promise<boolean> {
  const tasks = await loadDailyTasks();
  return !!tasks.find(task => (task.action || task.id) === taskId || task.id === taskId)?.done;
}

export async function reportTaskDone(taskId: string): Promise<boolean> {
  const tasks = await loadDailyTasks();
  let updated = false;
  const next = tasks.map(task => {
    if ((task.action || task.id) === taskId || task.id === taskId) {
      if (!task.done) updated = true;
      return { ...task, done: true };
    }
    return task;
  });
  storeTasks(next);
  return updated;
}

function addXp(cat: CatData, amount: number): CatData {
  const thresholds = [30, 50, 70, 90];
  let xp = cat.xp + amount;
  let level = cat.level;
  while (level < 5 && xp >= thresholds[level - 1]) {
    xp -= thresholds[level - 1];
    level += 1;
  }
  if (level >= 5) xp = Math.min(xp, 90);
  return { ...cat, xp, level: Math.min(level, 5) };
}

export async function claimTask(taskId: string): Promise<{ xp_gained: number; already_claimed: boolean; not_done: boolean; cat?: CatData }> {
  const tasks = await loadDailyTasks();
  const target = tasks.find(task => task.id === taskId);
  if (!target) return { xp_gained: 0, already_claimed: true, not_done: false };
  if (!target.done) return { xp_gained: 0, already_claimed: false, not_done: true };
  if (target.claimed) return { xp_gained: 0, already_claimed: true, not_done: false, cat: readCat() };

  const nextTasks = tasks.map(task => task.id === taskId ? { ...task, claimed: true } : task);
  storeTasks(nextTasks);
  const allClaimed = nextTasks.every(task => task.claimed);
  let cat = addXp(readCat(), target.xp + (allClaimed ? 5 : 0));
  cat.mood = Math.min(20, cat.mood + 1 + (allClaimed ? 2 : 0));
  cat.mood_task_gained = Math.min(5, (cat.mood_task_gained || 0) + 1 + (allClaimed ? 2 : 0));
  if (allClaimed) cat.daily_tasks_completed_days = (cat.daily_tasks_completed_days || 0) + 1;
  writeCat(cat);
  return { xp_gained: target.xp, already_claimed: false, not_done: false, cat };
}

export type MoodAction = 'task_done' | 'task_all_done' | 'eat' | 'play' | 'clean_rotten' | 'discard';

export async function reportMoodAction(action: MoodAction): Promise<{ mood: number; capped?: boolean; mood_task_gained?: number; mood_eat_gained?: number; mood_play_gained?: number; mood_clean_gained?: number; mood_discard_lost?: number; mood_daily_lost?: number }> {
  const cat = resetMoodDay(readCat());
  const before = cat.mood;
  let delta = 0;
  if (action === 'task_done' && (cat.mood_task_gained || 0) < 5) {
    delta = 1; cat.mood_task_gained = (cat.mood_task_gained || 0) + 1;
  } else if (action === 'task_all_done' && (cat.mood_task_gained || 0) < 5) {
    delta = Math.min(2, 5 - (cat.mood_task_gained || 0)); cat.mood_task_gained = (cat.mood_task_gained || 0) + delta;
  } else if (action === 'eat' && (cat.mood_eat_gained || 0) < 2) {
    delta = 1; cat.mood_eat_gained = (cat.mood_eat_gained || 0) + 1;
  } else if (action === 'play' && (cat.mood_play_gained || 0) < 1) {
    delta = 1; cat.mood_play_gained = 1;
  } else if (action === 'clean_rotten' && (cat.mood_clean_gained || 0) < 2) {
    delta = 1; cat.mood_clean_gained = (cat.mood_clean_gained || 0) + 1;
  } else if (action === 'discard' && (cat.mood_discard_lost || 0) < 4 && (cat.mood_daily_lost || 0) < 8) {
    delta = -1; cat.mood_discard_lost = (cat.mood_discard_lost || 0) + 1; cat.mood_daily_lost = (cat.mood_daily_lost || 0) + 1;
  }
  cat.mood = Math.max(0, Math.min(20, cat.mood + delta));
  writeCat(cat);
  return {
    mood: cat.mood,
    capped: delta === 0 && ['eat', 'play', 'clean_rotten'].includes(action),
    mood_task_gained: cat.mood_task_gained,
    mood_eat_gained: cat.mood_eat_gained,
    mood_play_gained: cat.mood_play_gained,
    mood_clean_gained: cat.mood_clean_gained,
    mood_discard_lost: cat.mood_discard_lost,
    mood_daily_lost: cat.mood_daily_lost,
    ...(before === cat.mood ? { capped: true } : {}),
  };
}

export async function dailySettle(params: { food_count: number; rotten_count: number; last_active_date?: string }): Promise<{ mood: number; deductions?: number[]; skipped?: boolean; mood_discard_lost?: number; mood_daily_lost?: number }> {
  const cat = resetMoodDay(readCat());
  if (cat.mood_settled_today) return { mood: cat.mood, skipped: true };
  const deductions: number[] = [];
  if (params.rotten_count >= 2) deductions.push(-4);
  else if (params.rotten_count === 1) deductions.push(-2);
  if (params.food_count === 0 && cycleDay() > 1) deductions.push(-1);
  if (params.last_active_date) {
    const gap = Math.floor((Date.now() - new Date(`${params.last_active_date}T00:00:00`).getTime()) / 86400000);
    if (gap >= 3) deductions.push(-4);
    else if (gap >= 2) deductions.push(-2);
  }
  const remaining = Math.max(0, 8 - (cat.mood_daily_lost || 0));
  const total = Math.min(remaining, Math.abs(deductions.reduce((sum, value) => sum + value, 0)));
  cat.mood = Math.max(0, cat.mood - total);
  cat.mood_daily_lost = (cat.mood_daily_lost || 0) + total;
  cat.mood_settled_today = true;
  writeCat(cat);
  return { mood: cat.mood, deductions, mood_discard_lost: cat.mood_discard_lost, mood_daily_lost: cat.mood_daily_lost };
}

// ── Static configuration and browser time ───────────────────────────────────

export interface OutfitItem {
  id: string;
  filename: string;
  url: string;
  thumbnail?: string;
  category?: 'Hats' | 'Glasses' | 'Accessories';
  unlockLevel?: number;
}

export async function loadOutfitItems(): Promise<OutfitItem[]> {
  try {
    const response = await fetch('/data/outfit_config.json');
    if (!response.ok) return [];
    return await response.json() as OutfitItem[];
  } catch {
    return [];
  }
}

export async function fetchSystemDate(): Promise<{ date: string; time: string }> {
  return { date: getLocalDateStr(), time: new Date().toLocaleTimeString('en-GB', { hour12: false }) };
}

// ── Browser-local profiles ──────────────────────────────────────────────────

export interface AuthResult {
  user_id: string;
  username: string;
  is_demo?: boolean;
}

async function hashPassword(value: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export async function authRegister(username: string, password: string): Promise<AuthResult> {
  const clean = username.trim();
  if (clean.length < 2) throw new Error('Username must be at least 2 characters');
  if (clean.length > 30) throw new Error('Username too long (max 30 characters)');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  const key = clean.toLocaleLowerCase();
  const accounts = readAccounts();
  if (accounts[key]) throw new Error('Username already taken on this device');
  const account: LocalAccount = {
    user_id: createId(),
    username: clean,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  accounts[key] = account;
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  return { user_id: account.user_id, username: account.username };
}

export async function authLogin(username: string, password: string): Promise<AuthResult> {
  const account = readAccounts()[username.trim().toLocaleLowerCase()];
  const candidate = await hashPassword(password);
  if (!account || account.passwordHash !== candidate) throw new Error('Invalid username or password');
  return { user_id: account.user_id, username: account.username };
}
