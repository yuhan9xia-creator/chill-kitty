
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layout } from './components/Layout';
import { Scanner } from './components/Scanner';
import { ClassificationView } from './components/ClassificationView';
import { FoodSprite } from './components/FoodSprite';
import { Almanac } from './components/Almanac';
import { RecipeView } from './components/RecipeView';
import { CatView } from './components/CatView';
import { FoodItem, ViewState, StorageType, Recipe, FreshnessState, Language, FoodDef, FoodCategory, AppStats, DailyFoodStat } from './types';
import { FOOD_DEFINITIONS as STATIC_DEFS } from './constants';
import { UI_STRINGS } from './translations';
import { identifyMultipleFoods, generateRecipesFromItems, loadSanctuaryItems, loadRecipeHistory, updateSanctuaryVitality, updateSanctuaryPortion, deleteSanctuaryItem, loadCatState, CatData, reportTaskDone, reportMoodAction, saveStats, fetchSystemDate, AuthResult, OutfitItem, loadOutfitItems, deleteRecipe, recordDailyLogin, loadDailyTasks, DailyTask, dailySettle } from './services/api';
import AuthView from './components/AuthView';
import { calculateFreshness, getLocalDateStr } from './components/FoodCard';
import { getFoodIconUrl } from './utils/foodIcons';
import { getBgmVolumePercent, isSfxEnabled, playSound, preloadSounds, setBgmVolumePercent, setSfxEnabled, startBgm, stopBgm, stopLoopSound, unlockAudio } from './utils/sound';
import { Plus, ChevronLeft, ChevronRight, Sparkles, SlidersHorizontal, BookOpen, Heart, RefreshCw, Utensils, Languages, Leaf, ChefHat, AlertTriangle, Activity, Refrigerator, Sprout, Snowflake, Camera, Receipt, X, TrendingUp, Bell, HelpCircle, LogOut, User, Trash2, Settings, Info, Music, Volume2 } from 'lucide-react';

const AUTH_KEY = 'chill-kitty-user';
const BASE_STORAGE_KEY = 'food-haven-v22-state';
const CAT_STORAGE_PREFIX = 'chill-kitty-cat-v1';
const TASK_STORAGE_PREFIX = 'chill-kitty-tasks-v1';
const DEMO_USER: AuthResult = { user_id: 'demo-guest', username: 'Guest Preview', is_demo: true };
const SPLASH_ART_ASSETS = [
  '/assets/cover/背景.png',
  '/assets/cover/start-button.png',
  '/assets/cover/UI.png',
  '/assets/cat/normal.webp',
  '/assets/cat/happy.webp',
  '/assets/cat/idle.webp',
  '/assets/cat/good.webp',
  '/assets/cat/sad.webp',
  '/assets/cat/sleepy.webp',
  '/assets/ui/assign-home.png',
  '/assets/cartoon/detect.mp4',
  '/assets/cartoon/cook_complete.mp4',
  '/assets/outfit/button.png',
  '/assets/outfit/dress/brooch.png',
  '/assets/outfit/dress/glasses.png',
  '/assets/outfit/menu/brooch.png',
  '/assets/outfit/menu/glasses.png',
  ...Object.keys(STATIC_DEFS).map(getFoodIconUrl),
  'Clean Plate Club',
  'Food Finder',
  'Getting Settled',
  'Green Paws',
  'Pueing Along',
  'Use it First',
  'What’s for Today',
  'Zero-Waste Sprout',
].map(asset => asset.startsWith('/') ? asset : `/assets/achievements/${asset}.png`);
const LOADING_MEDIA_STAGE_STYLE: React.CSSProperties = {
  height: '54vh',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',
};
const LOADING_MEDIA: Record<'identify' | 'recipe', { kind: 'video' | 'image'; src: string; style: React.CSSProperties }> = {
  identify: {
    kind: 'video',
    src: '/assets/cartoon/detect.mp4',
    style: {
      height: '54vh',
      transform: 'translateX(15px)',
      clipPath: 'inset(0 6px 0 0)',
      display: 'block',
      objectFit: 'contain',
    },
  },
  recipe: {
    kind: 'video',
    src: '/assets/cartoon/cook_complete.mp4',
    style: {
      height: '32vh',
      transform: 'translateX(20px)',
      clipPath: 'inset(0 0 3px 0)',
      display: 'block',
      objectFit: 'contain',
    },
  },
};

function preloadSplashAsset(src: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    window.setTimeout(finish, 12000);
    if (src.endsWith('.mp4')) {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = finish;
      video.onerror = finish;
      video.src = src;
      video.load();
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (image.decode) {
        image.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    image.onerror = finish;
    image.src = src;
  });
}

async function preloadSplashArt(onProgress: (progress: number) => void) {
  const assets = Array.from(new Set(SPLASH_ART_ASSETS));
  let completed = 0;
  const markDone = () => {
    completed += 1;
    onProgress(Math.round((completed / assets.length) * 100));
  };

  onProgress(0);
  await Promise.all(assets.map(src => preloadSplashAsset(src).then(markDone)));
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }
  onProgress(100);
}

const INITIAL_STATS: AppStats = {
  eatenCount: 0,
  wastedCount: 0,
  totalSaved: 0,
  todayDate: '',
  todayEaten: 0,
  todayWasted: 0,
  todayCategoryStats: {},
  todayFoodStats: {},
  priorityHandledCount: 0,
};

type DailyAnalysisCategory = 'Fruit' | 'Protein' | 'Dairy' | 'Vegetable' | 'Grain';

const DAILY_ANALYSIS_CATEGORIES: {
  id: DailyAnalysisCategory;
  icon: string;
  labelEn: string;
  labelCn: string;
  usedLabelEn: string;
  usedLabelCn: string;
  wasteLabelEn: string;
  wasteLabelCn: string;
}[] = [
  { id: 'Fruit', icon: 'Fruit.png', labelEn: 'Fruit', labelCn: '水果', usedLabelEn: 'Fruit Used', usedLabelCn: '水果消耗', wasteLabelEn: 'Fruit Waste', wasteLabelCn: '水果浪费' },
  { id: 'Protein', icon: 'Protein.png', labelEn: 'Protein', labelCn: '蛋白质', usedLabelEn: 'Protein Used', usedLabelCn: '蛋白质消耗', wasteLabelEn: 'Protein Waste', wasteLabelCn: '蛋白质浪费' },
  { id: 'Dairy', icon: 'Dairy.png', labelEn: 'Dairy', labelCn: '乳制品', usedLabelEn: 'Dairy Used', usedLabelCn: '乳制品消耗', wasteLabelEn: 'Dairy Waste', wasteLabelCn: '乳制品浪费' },
  { id: 'Vegetable', icon: 'Vegetable.png', labelEn: 'Vegetable', labelCn: '蔬菜', usedLabelEn: 'Vegetable Used', usedLabelCn: '蔬菜消耗', wasteLabelEn: 'Vegetable Waste', wasteLabelCn: '蔬菜浪费' },
  { id: 'Grain', icon: 'staple.png', labelEn: 'Staple Food', labelCn: '主食', usedLabelEn: 'Staple Food Used', usedLabelCn: '主食消耗', wasteLabelEn: 'Staple Food Waste', wasteLabelCn: '主食浪费' },
];

const WASTE_REASON_OPTIONS = [
  { id: 'forgot', en: 'Forgot to eat', cn: '忘记吃' },
  { id: 'bought', en: 'Bought too much', cn: '买太多' },
  { id: 'cooked', en: 'Cooked too much', cn: '煮太多' },
  { id: 'plans', en: 'Changed plans', cn: '计划改变' },
];

function getEmptyDailyCategoryStats(): Record<DailyAnalysisCategory, { eaten: number; wasted: number }> {
  return DAILY_ANALYSIS_CATEGORIES.reduce((acc, category) => {
    acc[category.id] = { eaten: 0, wasted: 0 };
    return acc;
  }, {} as Record<DailyAnalysisCategory, { eaten: number; wasted: number }>);
}

function normalizeDailyCategoryStats(stats?: AppStats['todayCategoryStats']): Record<DailyAnalysisCategory, { eaten: number; wasted: number }> {
  const normalized = getEmptyDailyCategoryStats();
  Object.entries(stats ?? {}).forEach(([key, value]) => {
    if (key in normalized) {
      normalized[key as DailyAnalysisCategory] = {
        eaten: Math.max(0, Math.round(value?.eaten ?? 0)),
        wasted: Math.max(0, Math.round(value?.wasted ?? 0)),
      };
    }
  });
  return normalized;
}

function getEmptyDailyFoodStats(): Record<DailyAnalysisCategory, { eaten: DailyFoodStat[]; wasted: DailyFoodStat[] }> {
  return DAILY_ANALYSIS_CATEGORIES.reduce((acc, category) => {
    acc[category.id] = { eaten: [], wasted: [] };
    return acc;
  }, {} as Record<DailyAnalysisCategory, { eaten: DailyFoodStat[]; wasted: DailyFoodStat[] }>);
}

function normalizeDailyFoodStats(stats?: AppStats['todayFoodStats']): Record<DailyAnalysisCategory, { eaten: DailyFoodStat[]; wasted: DailyFoodStat[] }> {
  const normalized = getEmptyDailyFoodStats();
  Object.entries(stats ?? {}).forEach(([key, value]) => {
    if (key in normalized) {
      normalized[key as DailyAnalysisCategory] = {
        eaten: (value?.eaten ?? []).map(item => ({
          defId: item.defId,
          name: item.name,
          count: Math.max(0, Math.round(item.count ?? 0)),
        })).filter(item => item.count > 0),
        wasted: (value?.wasted ?? []).map(item => ({
          defId: item.defId,
          name: item.name,
          count: Math.max(0, Math.round(item.count ?? 0)),
        })).filter(item => item.count > 0),
      };
    }
  });
  return normalized;
}

function addDailyFoodStat(items: DailyFoodStat[], nextItem: DailyFoodStat): DailyFoodStat[] {
  const merged = new Map<string, DailyFoodStat>();
  items.forEach(item => merged.set(item.defId, { ...item }));
  const existing = merged.get(nextItem.defId);
  merged.set(nextItem.defId, existing
    ? { ...existing, count: existing.count + nextItem.count }
    : { ...nextItem }
  );
  return Array.from(merged.values()).sort((a, b) => b.count - a.count).slice(0, 12);
}

function toDailyAnalysisCategory(category?: FoodCategory): DailyAnalysisCategory | null {
  return DAILY_ANALYSIS_CATEGORIES.some(c => c.id === category) ? category as DailyAnalysisCategory : null;
}

const INITIAL_CAT: CatData = {
  xp: 0,
  level: 1,
  mood: 10,
  streak: 0,
  last_checkin: null,
  week_start: null,
  weekly_checkins: [false, false, false, false, false, false, false],
};

const DEMO_CAT: CatData = {
  ...INITIAL_CAT,
  xp: 18,
  level: 2,
  mood: 16,
  streak: 3,
  last_checkin: null,
  last_login_date: getLocalDateStr(),
  logged_in_today: true,
  weekly_checkins: [true, true, true, false, false, false, false],
  eaten_count: 12,
  wasted_count: 2,
  saved_count: 7,
  today_date: getLocalDateStr(),
  today_eaten: 5,
  today_wasted: 1,
  daily_tasks_completed_days: 3,
  good_mood_days: 3,
  priority_handled_count: 4,
};

const DEMO_STATS: AppStats = {
  ...INITIAL_STATS,
  eatenCount: 12,
  wastedCount: 2,
  totalSaved: 7,
  todayDate: getLocalDateStr(),
  todayEaten: 5,
  todayWasted: 1,
  todayCategoryStats: {
    Fruit: { eaten: 1, wasted: 1 },
    Protein: { eaten: 2, wasted: 0 },
    Vegetable: { eaten: 2, wasted: 0 },
  },
  todayFoodStats: {
    Fruit: {
      eaten: [{ defId: 'banana', name: { en: 'Banana', cn: '香蕉' }, count: 1 }],
      wasted: [{ defId: 'strawberry', name: { en: 'Strawberry', cn: '草莓' }, count: 1 }],
    },
    Protein: {
      eaten: [
        { defId: 'egg', name: { en: 'Egg', cn: '鸡蛋' }, count: 1 },
        { defId: 'salmon', name: { en: 'Salmon', cn: '三文鱼' }, count: 1 },
      ],
      wasted: [],
    },
    Vegetable: {
      eaten: [
        { defId: 'tomato', name: { en: 'Tomato', cn: '番茄' }, count: 1 },
        { defId: 'spinach', name: { en: 'Spinach', cn: '菠菜' }, count: 1 },
      ],
      wasted: [],
    },
  },
  priorityHandledCount: 4,
};

const DEMO_RECIPES: Recipe[] = [
  {
    recipeId: 'demo-recipe-omelette',
    name: { en: 'Tomato Spinach Omelette', cn: '番茄菠菜蛋饼' },
    description: { en: 'A quick, soft omelette for a busy morning.', cn: '适合忙碌早晨的快手软嫩蛋饼。' },
    ingredients: [
      { name: { en: 'Egg', cn: '鸡蛋' }, id: 'egg', status: 'sanctuary' },
      { name: { en: 'Tomato', cn: '番茄' }, id: 'tomato', status: 'sanctuary' },
      { name: { en: 'Spinach', cn: '菠菜' }, id: 'spinach', status: 'sanctuary' },
      { name: { en: 'Olive oil', cn: '橄榄油' }, status: 'market' },
    ],
    steps: [
      { en: 'Whisk the eggs and season lightly.', cn: '鸡蛋打散并简单调味。' },
      { en: 'Cook the tomato and spinach, then fold in the eggs.', cn: '炒软番茄和菠菜，再倒入蛋液煎熟。' },
    ],
    prepTime: '15 min',
  },
  {
    recipeId: 'demo-recipe-salmon',
    name: { en: 'Roasted Salmon & Broccoli', cn: '烤三文鱼配西兰花' },
    description: { en: 'A simple tray-bake with a fresh lemon finish.', cn: '一盘完成、带清新柠檬香的简单烤物。' },
    ingredients: [
      { name: { en: 'Salmon', cn: '三文鱼' }, id: 'salmon', status: 'sanctuary' },
      { name: { en: 'Broccoli', cn: '西兰花' }, id: 'broccoli', status: 'sanctuary' },
      { name: { en: 'Lemon', cn: '柠檬' }, status: 'market' },
      { name: { en: 'Olive oil', cn: '橄榄油' }, status: 'market' },
    ],
    steps: [
      { en: 'Season the salmon and broccoli on one tray.', cn: '三文鱼和西兰花放入同一烤盘调味。' },
      { en: 'Roast until tender and finish with lemon.', cn: '烤至熟嫩，出炉后挤上柠檬汁。' },
    ],
    prepTime: '25 min',
  },
];

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createDemoItems(): FoodItem[] {
  const samples: Array<{ id: string; storage: StorageType; daysAgo: number; quantity?: number; amountPercent?: number }> = [
    { id: 'tomato', storage: StorageType.ROOM_TEMP, daysAgo: 4, quantity: 2 },
    { id: 'banana', storage: StorageType.ROOM_TEMP, daysAgo: 2, quantity: 3 },
    { id: 'egg', storage: StorageType.FRIDGE, daysAgo: 5, quantity: 4 },
    { id: 'spinach', storage: StorageType.FRIDGE, daysAgo: 1, amountPercent: 80 },
    { id: 'broccoli', storage: StorageType.FRIDGE, daysAgo: 3, quantity: 1 },
    { id: 'salmon', storage: StorageType.FREEZER, daysAgo: 7, quantity: 1 },
  ];

  return samples.map((sample, index) => {
    const def = STATIC_DEFS[sample.id];
    return {
      instanceId: `demo-${sample.id}`,
      defId: sample.id,
      name: def.name.en,
      emoji: def.emoji || '',
      addedDay: 0,
      damageDays: 0,
      vitality: 1,
      initialVitality: 1,
      quantityKind: def.quantityKind || 'countable',
      quantity: sample.quantity ?? 1,
      amountPercent: sample.amountPercent ?? 100,
      backendEntryIds: [`demo-${sample.id}`],
      addedDate: dateDaysAgo(sample.daysAgo),
      storage: sample.storage,
      x: 36 + (index % 3) * 14,
      y: 42 + Math.floor(index / 3) * 16,
    };
  });
}

type AchievementInfo = {
  id: string;
  en: string;
  cn: string;
  icon: string;
  descEn: string;
  descCn: string;
  unlocked: boolean;
};

function getSavedUser(): AuthResult | null {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthResult) : null;
  } catch {
    return null;
  }
}

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [view, setView] = useState<ViewState | 'SPLASH'>('SPLASH');
  const [currentUser, setCurrentUser] = useState<AuthResult | null>(getSavedUser);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [customDefs, setCustomDefs] = useState<Record<string, FoodDef>>({});
  const [predictionDays, setPredictionDays] = useState(0);
  const [pendingItems, setPendingItems] = useState<Partial<FoodItem>[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [almanacInitialId, setAlmanacInitialId] = useState<string | undefined>(undefined);
  const [quickActionItem, setQuickActionItem] = useState<FoodItem | null>(null);
  const [consumptionDraft, setConsumptionDraft] = useState<{ item: FoodItem; reason: 'EATEN' | 'RELEASED' } | null>(null);
  const [consumeValue, setConsumeValue] = useState(1);
  const [vitalityDraft, setVitalityDraft] = useState<number>(100);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'identify' | 'recipe' | null>(null);
  const [loadingMediaReady, setLoadingMediaReady] = useState(false);
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashReady, setSplashReady] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(() => getBgmVolumePercent());
  const [sfxOn, setSfxOn] = useState(() => isSfxEnabled());
  const [isSanctuaryLoading, setIsSanctuaryLoading] = useState(false);
  const [historyRecipeCount, setHistoryRecipeCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showTimeSlider, setShowTimeSlider] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showScanPicker, setShowScanPicker] = useState(false);
  const [showDailyDetails, setShowDailyDetails] = useState(false);
  const [selectedWasteReason, setSelectedWasteReason] = useState(WASTE_REASON_OPTIONS[0].id);
  const [scanMode, setScanMode] = useState<'food' | 'receipt'>('food');
  const [recipeStyle, setRecipeStyle] = useState<'cn_cuisine' | 'western'>('cn_cuisine');
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementInfo | null>(null);
  const [achievementToast, setAchievementToast] = useState<AchievementInfo | null>(null);
  const [achievementWatchReady, setAchievementWatchReady] = useState(false);
  const [showDemoWelcome, setShowDemoWelcome] = useState(false);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [todayStr, setTodayStr] = useState(getLocalDateStr());
  // dateTick increments on every date check to force re-render even if date hasn't changed
  const [dateTick, setDateTick] = useState(0);
  const [stats, setStats] = useState<AppStats>(INITIAL_STATS);
  const [catData, setCatData] = useState<CatData>(INITIAL_CAT);
  const [outfitItems, setOutfitItems] = useState<OutfitItem[]>([]);
  const [initialDailyTasks, setInitialDailyTasks] = useState<DailyTask[]>([]);
  const [accountHydrationReady, setAccountHydrationReady] = useState(false);
  const storageKey = useMemo(
    () => currentUser ? `${BASE_STORAGE_KEY}:${currentUser.user_id}` : `${BASE_STORAGE_KEY}:anonymous`,
    [currentUser?.user_id]
  );
  const hydratedUserRef = useRef<string | null>(null);
  const achievementToastTimerRef = useRef<number | null>(null);
  const loadingVideoRef = useRef<HTMLVideoElement | null>(null);
  const loadingPlaybackStartedRef = useRef(false);

  // Ref always holds the latest todayStr — avoids stale closure in setInterval
  const todayStrRef = useRef(todayStr);
  todayStrRef.current = todayStr;

  /**
   * Date Monitor — fetches system date from Python backend (/api/date).
   * Python datetime.now() reads OS clock directly, zero delay.
   * Browser new Date() has internal clock cache causing 20-30s delay.
   *
   * Trigger: every 10s by timer + immediately on refresh button click.
   * On failure: falls back to browser Date() with warning.
   */
  const checkDate = async (source: 'timer' | 'manual') => {
    let sysDate: string;
    let sysTime: string;
    let fromBackend = false;

    try {
      const data = await fetchSystemDate();
      sysDate = data.date;   // "YYYY-MM-DD" from Python datetime.now()
      sysTime = data.time;   // "HH:MM:SS" from Python datetime.now()
      fromBackend = true;
    } catch (err) {
      // Backend unreachable — fall back to browser clock (may have delay)
      sysDate = getLocalDateStr();
      sysTime = new Date().toLocaleTimeString();
      console.warn(`[Date Monitor] Backend unreachable (${err}), using browser clock (may lag after system time change)`);
    }

    const changed = sysDate !== todayStrRef.current;
    const tag = fromBackend ? 'backend' : 'browser-fallback';

    if (changed) {
      console.log(`[${sysTime}] *** DATE CHANGED: ${todayStrRef.current} -> ${sysDate} *** (${source}, ${tag})`);
      todayStrRef.current = sysDate;
      setTodayStr(sysDate);
    } else {
      console.log(`[${sysTime}] System date: ${sysDate} (${source}, ${tag})`);
    }

    // Always bump tick — ensures React re-render for vitality recalculation
    setDateTick(t => t + 1);
    return changed;
  };

  useEffect(() => {
    preloadSounds();
    Object.values(LOADING_MEDIA).forEach(({ kind, src }) => {
      if (kind === 'video') {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.playsInline = true;
        video.muted = true;
        video.src = src;
        video.load();
      } else {
        const image = new Image();
        image.src = src;
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    preloadSplashArt(progress => {
      if (!cancelled) setSplashProgress(progress);
    }).then(() => {
      if (!cancelled) setSplashReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    stopLoopSound('cook');
    stopLoopSound('detect');
    setLoadingMediaReady(false);
    loadingPlaybackStartedRef.current = false;
    let revealTimer: number | undefined;

    if (isLoading) {
      stopBgm();
      revealTimer = window.setTimeout(() => {
        setLoadingMediaReady(true);
      }, 450);
      requestAnimationFrame(() => {
        const video = loadingVideoRef.current;
        if (!video || loadingPlaybackStartedRef.current) return;
        loadingPlaybackStartedRef.current = true;
        video.volume = 0.46;
        video.muted = !isSfxEnabled();
        try {
          video.currentTime = 0;
        } catch {}
        video.play().catch(() => {
          if (!video.muted) {
            video.muted = true;
            video.play().catch(() => {
              loadingPlaybackStartedRef.current = false;
            });
          } else {
            loadingPlaybackStartedRef.current = false;
          }
        });
      });
    } else {
      loadingVideoRef.current?.pause();
      startBgm();
    }

    return () => {
      if (revealTimer) window.clearTimeout(revealTimer);
    };
  }, [isLoading, loadingType]);

  const handleLoadingVideoReady = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    video.volume = 0.46;
    video.muted = !isSfxEnabled();
    setLoadingMediaReady(true);
    if (loadingPlaybackStartedRef.current) return;
    loadingPlaybackStartedRef.current = true;
    try {
      video.currentTime = 0;
    } catch {}
    video.play().catch(() => {
      if (!video.muted) {
        video.muted = true;
        video.play().catch(() => {
          loadingPlaybackStartedRef.current = false;
        });
      } else {
        loadingPlaybackStartedRef.current = false;
      }
    });
  };

  useEffect(() => {
    if (isLoading) return;
    const resumeAudio = () => {
      unlockAudio();
      startBgm();
    };
    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('touchstart', resumeAudio, { once: true, passive: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('touchstart', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
  }, [isLoading]);

  // Prefetch all food icon images after mount
  useEffect(() => {
    const foods = [
      'Apple', 'Avocado', 'Banana', 'Beef', 'Beetroot', 'Bell pepper',
      'Blueberry', 'Broccoli', 'Carrot', 'Cauliflower', 'Celery', 'Cheese',
      'Chicken breast', 'Cucumber', 'Egg', 'Eggplant', 'Garlic', 'Ginger',
      'Grapes', 'Kale', 'Kiwi', 'Lemon', 'Lettuce', 'Mango', 'Milk',
      'Mushroom', 'Onion', 'Orange', 'Peach', 'Pear', 'Pineapple', 'Plum',
      'Pork', 'Potato', 'Red cabbage', 'Rye bread', 'Salmon',
      'Shrimp', 'Spinach', 'Strawberry', 'Sweet potato', 'Tomato', 'Watermelon',
      'White cabbage', 'Zucchini',
    ];
    foods.forEach(name => {
      const img = new Image();
      img.src = `/assets/food/${name}.png`;
    });
    // Prefetch achievement icons
    ['Clean Plate Club', 'Food Finder', 'Getting Settled', 'Green Paws',
     'Pueing Along', 'Use it First', "What\u2019s for Today", 'Zero-Waste Sprout'].forEach(name => {
      const img = new Image();
      img.src = `/assets/achievements/${name}.png`;
    });
  }, []);

  // Auto-refresh: stable interval, fires every 10s, never recreated
  // Also runs immediately on mount to correct initial todayStr from backend
  useEffect(() => {
    console.log('=== Date Monitor Started (10s interval, source: backend /api/date) ===');
    checkDate('timer'); // immediate first check to fix initial value
    const timer = setInterval(() => checkDate('timer'), 10000);
    return () => {
      console.log('=== Date Monitor Stopped ===');
      clearInterval(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual refresh: immediate date check + force re-render
  const refreshDate = () => { checkDate('manual'); };

  // Track current view in ref so date toast can check without re-subscribing
  const viewRef = useRef<ViewState | 'SPLASH'>('SPLASH');
  useEffect(() => { viewRef.current = view; }, [view]);

  // Report task done when the target view is actually reached.
  useEffect(() => {
    if (view === 'CAT') reportTaskDone('view_cat').catch(() => {});
    if (view === 'PROFILE') reportTaskDone('view_profile').catch(() => {});
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report check_status when a food item detail is opened
  useEffect(() => {
    if (selectedItem) reportTaskDone('check_status').catch(() => {});
  }, [selectedItem?.instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (quickActionItem) {
      const { progress } = calculateFreshness(quickActionItem, 0, ALL_DEFINITIONS, todayStr);
      setVitalityDraft(Math.max(0, Math.round((1 - progress) * 100)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickActionItem?.instanceId]);

  // Show toast when todayStr actually changes (skip first render and SPLASH screen)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (viewRef.current === 'SPLASH') return;
    showToast(lang === 'cn' ? `日期已更新：${todayStr}` : `Date updated: ${todayStr}`);
  }, [todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const ALL_DEFINITIONS = useMemo(() => ({ ...STATIC_DEFS, ...customDefs }), [customDefs]);

  const achievements = useMemo<AchievementInfo[]>(() => [
    { id: 'getting_settled', en: 'Getting Settled', cn: '\u5b89\u987f\u4e0b\u6765', icon: 'Getting Settled', descEn: 'Finish Daily Tasks for 3 cozy days.', descCn: '\u7d2f\u8ba1\u5b8c\u6210 3 \u5929\u6bcf\u65e5\u4efb\u52a1', unlocked: (catData.daily_tasks_completed_days ?? 0) >= 3 },
    { id: 'purring_along', en: 'Purring Along', cn: '\u547c\u565c\u8fdb\u884c\u4e2d', icon: 'Pueing Along', descEn: 'Keep your kitty in a Good mood for 3 days.', descCn: '\u732b\u54aa\u5fc3\u60c5\u8fbe\u5230\u826f\u597d\u6216\u4ee5\u4e0a\u7d2f\u8ba1 3 \u5929', unlocked: (catData.good_mood_days ?? 0) >= 3 },
    { id: 'clean_plate', en: 'Clean Plate Club', cn: '\u5149\u76d8\u5c0f\u961f', icon: 'Clean Plate Club', descEn: 'Log 10 happy Eat actions.', descCn: '\u7d2f\u8ba1\u8bb0\u5f55 10 \u6b21\u5403\u6389\u98df\u7269', unlocked: stats.eatenCount >= 10 },
    { id: 'use_it_first', en: 'Use It First', cn: '\u5148\u5403\u8fd9\u4e2a', icon: 'Use it First', descEn: 'Use 8 near-expiry or low-HP ingredients first.', descCn: '\u7d2f\u8ba1\u5904\u7406 8 \u4e2a\u4e34\u671f/\u4f4e\u65b0\u9c9c\u5ea6\u98df\u6750', unlocked: stats.priorityHandledCount >= 8 },
    { id: 'zero_waste', en: 'Zero-Waste Sprout', cn: '\u96f6\u6d6a\u8d39\u82bd', icon: 'Zero-Waste Sprout', descEn: 'Achieve 100% food consumption for 3 days with no food discarded.', descCn: '\u7d2f\u8ba1 3 \u5929\u8fbe\u5230 100% \u98df\u7269\u6d88\u8017\uff0c\u4e14\u6ca1\u6709\u4e22\u5f03\u98df\u7269', unlocked: (catData.zero_waste_days ?? 0) >= 3 },
    { id: 'whats_for_today', en: "What's for Today?", cn: '\u4eca\u5929\u5403\u4ec0\u4e48', icon: "What\u2019s for Today", descEn: 'Create 5 yummy recipe ideas.', descCn: '\u7d2f\u8ba1\u751f\u6210 5 \u6b21\u83dc\u8c31', unlocked: historyRecipeCount >= 5 },
    { id: 'green_paws', en: 'Green Paws', cn: '\u7eff\u8272\u722a\u5370', icon: 'Green Paws', descEn: 'Reach Lv5 and finish Daily Tasks for 7 days.', descCn: '\u8fbe\u5230 Lv5\uff0c\u5e76\u7d2f\u8ba1\u5b8c\u6210 7 \u5929\u6bcf\u65e5\u4efb\u52a1', unlocked: catData.level >= 5 && (catData.daily_tasks_completed_days ?? 0) >= 7 },
    { id: 'food_finder', en: 'Food Finder', cn: '\u51b0\u7bb1\u4e07\u7269\u5fd7', icon: 'Food Finder', descEn: 'Unlock 45 food encyclopedia entries.', descCn: '\u7d2f\u8ba1\u89e3\u9501 45 \u4e2a\u98df\u6750\u56fe\u9274\u6761\u76ee', unlocked: unlockedIds.length >= 45 },
  ], [catData, historyRecipeCount, stats.eatenCount, stats.priorityHandledCount, unlockedIds.length]);

  // Load sanctuary items from backend when entering HOME view
  const loadFromSanctuary = async (defs: Record<string, any>) => {
    setIsSanctuaryLoading(true);
    try {
      const sanctuaryItems = await loadSanctuaryItems(defs);
      setItems(sanctuaryItems);
      setUnlockedIds(Array.from(new Set(sanctuaryItems.map(i => i.defId))));
      // Also prefetch history recipe count
      try {
        const hist = await loadRecipeHistory();
        setHistoryRecipeCount(hist.length);
      } catch (_) {}
      return sanctuaryItems;
    } catch (e) {
      console.error('Failed to load sanctuary:', e);
      return [];
    } finally {
      setIsSanctuaryLoading(false);
    }
  };

  const settleMoodForToday = async (sanctuaryItems: FoodItem[], lastActiveDate?: string | null) => {
    const rottenCount = sanctuaryItems.filter(item =>
      calculateFreshness(item, 0, ALL_DEFINITIONS, todayStrRef.current).state === FreshnessState.SPOILED
    ).length;
    const result = await dailySettle({
      food_count: sanctuaryItems.length,
      rotten_count: rottenCount,
      last_active_date: lastActiveDate || undefined,
    });
    setCatData(prev => ({
      ...prev,
      mood: result.mood,
      ...(result.mood_discard_lost !== undefined && { mood_discard_lost: result.mood_discard_lost }),
      ...(result.mood_daily_lost !== undefined && { mood_daily_lost: result.mood_daily_lost }),
    }));
  };

  const resetUserScopedState = () => {
    setItems([]);
    setUnlockedIds([]);
    setCustomDefs({});
    setRecipes([]);
    setHistoryRecipeCount(0);
    setPendingItems([]);
    setSelectedItem(null);
    setQuickActionItem(null);
    setStats(INITIAL_STATS);
    setCatData(INITIAL_CAT);
    setInitialDailyTasks([]);
    setOutfitItems([]);
    setAccountHydrationReady(false);
  };

  useEffect(() => {
    hydratedUserRef.current = null;
    setAchievementWatchReady(false);
    setAccountHydrationReady(false);

    if (!currentUser) {
      resetUserScopedState();
      setAccountHydrationReady(true);
      return;
    }

    resetUserScopedState();

    const scopedStorage = currentUser.is_demo ? sessionStorage : localStorage;
    const saved = scopedStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.items) setItems(parsed.items);
        if (parsed.unlockedIds) setUnlockedIds(parsed.unlockedIds);
        if (parsed.lang) setLang(parsed.lang);
        if (parsed.customDefs) setCustomDefs(parsed.customDefs);
        if (parsed.recipes) setRecipes(parsed.recipes);
        if (parsed.stats) {
          const s = { ...parsed.stats };
          if (!s.todayDate || s.todayDate !== getLocalDateStr()) {
            s.todayDate = getLocalDateStr();
            s.todayEaten = 0;
            s.todayWasted = 0;
            s.todayCategoryStats = {};
            s.todayFoodStats = {};
          }
          setStats(s);
        }
      } catch (e) { console.error("Load error:", e); }
    }
    // Load authoritative account state before allowing entry from Splash.
    const catStatePromise = recordDailyLogin().catch(() => loadCatState()).then(cat => {
      setCatData(cat);
      if (cat.eaten_count !== undefined) {
        const today = getLocalDateStr();
        setStats(prev => ({
          ...prev,
          eatenCount: cat.eaten_count ?? prev.eatenCount,
          wastedCount: cat.wasted_count ?? prev.wastedCount,
          totalSaved: cat.saved_count ?? prev.totalSaved,
          todayDate: today,
          todayEaten: cat.today_date === today ? (cat.today_eaten ?? 0) : 0,
          todayWasted: cat.today_date === today ? (cat.today_wasted ?? 0) : 0,
          todayCategoryStats: cat.today_date === today ? prev.todayCategoryStats : {},
          todayFoodStats: cat.today_date === today ? prev.todayFoodStats : {},
          priorityHandledCount: cat.priority_handled_count ?? prev.priorityHandledCount,
        }));
      }
      return cat;
    }).catch(() => {});
    const dailyTasksPromise = loadDailyTasks().then(setInitialDailyTasks).catch(() => {
      setInitialDailyTasks([]);
    });
    // Pre-load outfit items once at startup so CatView doesn't re-fetch on every visit
    loadOutfitItems().then(items => {
      setOutfitItems(items);
      const btn = new Image(); btn.src = '/assets/outfit/button.png';
      items.forEach(item => {
        const t = new Image(); t.src = item.thumbnail ?? item.url;
        const d = new Image(); d.src = item.url;
      });
    }).catch(() => {});
    // Pre-load sanctuary items so HOME view opens instantly
    const sanctuaryPromise = loadFromSanctuary(ALL_DEFINITIONS).then(sanctuaryItems => {
      skipSanctuaryLoad.current = true;
      return sanctuaryItems;
    });

    Promise.all([catStatePromise, sanctuaryPromise]).then(([cat, sanctuaryItems]) => {
      if (cat) {
        settleMoodForToday(sanctuaryItems, cat.previous_login_date ?? null).catch(() => {});
      }
    }).catch(() => {});

    Promise.allSettled([catStatePromise, dailyTasksPromise, sanctuaryPromise]).then(() => {
      setAccountHydrationReady(true);
      setAchievementWatchReady(true);
    });

    const markHydrated = window.setTimeout(() => {
      hydratedUserRef.current = currentUser.user_id;
    }, 0);
    return () => window.clearTimeout(markHydrated);
  }, [currentUser?.user_id, storageKey]);

  // Re-sync cat state from backend every time user opens the CAT view
  useEffect(() => {
    if (view === 'CAT') {
      loadCatState().then(cat => {
        setCatData(prev => ({
          ...cat,
          already_logged_in_today: prev.already_logged_in_today,
        }));
      }).catch(() => {});
      loadDailyTasks().then(setInitialDailyTasks).catch(() => {});
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load sanctuary data when entering HOME view
  // Skip flag prevents overwriting freshly classified items (race with backend PUT)
  const skipSanctuaryLoad = useRef(false);
  useEffect(() => {
    if (view === 'HOME') {
      if (skipSanctuaryLoad.current) {
        skipSanctuaryLoad.current = false;
      } else {
        loadFromSanctuary(ALL_DEFINITIONS);
      }
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentUser || !achievementWatchReady) return;

    const key = `chill-kitty-achievements-seen:${currentUser.user_id}`;
    const unlockedNow = achievements.filter(a => a.unlocked).map(a => a.id);
    const scopedStorage = currentUser?.is_demo ? sessionStorage : localStorage;
    const raw = scopedStorage.getItem(key);
    if (raw === null) {
      scopedStorage.setItem(key, JSON.stringify(unlockedNow));
      return;
    }

    let seen: string[] = [];
    try {
      seen = JSON.parse(raw);
    } catch {
      seen = [];
    }

    const newlyUnlocked = achievements.find(a => a.unlocked && !seen.includes(a.id));
    if (!newlyUnlocked) return;

    scopedStorage.setItem(key, JSON.stringify(Array.from(new Set([...seen, ...unlockedNow]))));
    playSound('achievement');
    setAchievementToast(newlyUnlocked);
    if (achievementToastTimerRef.current) {
      window.clearTimeout(achievementToastTimerRef.current);
    }
    achievementToastTimerRef.current = window.setTimeout(() => {
      setAchievementToast(null);
    }, 3000);
  }, [achievements, achievementWatchReady, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (hydratedUserRef.current !== currentUser.user_id) return;
    const scopedStorage = currentUser.is_demo ? sessionStorage : localStorage;
    scopedStorage.setItem(storageKey, JSON.stringify({ items, unlockedIds, lang, customDefs, recipes, stats }));
  }, [currentUser?.user_id, storageKey, items, unlockedIds, lang, customDefs, recipes, stats]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const t = (key: string) => UI_STRINGS[key]?.[lang] || key;

  const handleScan = async (base64: string) => {
    setLoadingType('identify');
    setIsLoading(true);
    try {
      const { foods: results, sanctuaryEntries } = await identifyMultipleFoods(base64, lang, scanMode);
      if (results.length > 0) {
        playSound('identifySuccess');
        const newPending: Partial<FoodItem>[] = [];
        const newDefs: Record<string, FoodDef> = {};
        const groupedPending: Record<string, Partial<FoodItem>> = {};
        let entryCursor = 0;
        
        for (let idx = 0; idx < results.length; idx++) {
          const res = results[idx];
          const quantityKind = (ALL_DEFINITIONS[res.id]?.quantityKind || res.quantityKind || 'countable') as 'countable' | 'uncountable';
          const quantity = quantityKind === 'countable' ? Math.max(1, Number.parseInt(String(res.quantity ?? 1), 10) || 1) : 1;
          const amountPercent = quantityKind === 'uncountable' ? Math.max(0, Math.min(100, Number.parseInt(String(res.amount_percent ?? res.amountPercent ?? 100), 10) || 100)) : 100;
          const matchedEntries = sanctuaryEntries.slice(entryCursor, entryCursor + quantity);
          entryCursor += quantity;
          const sEntry = matchedEntries[0];

          if (!ALL_DEFINITIONS[res.id] && !newDefs[res.id]) {
            const bestStorage = (res.bestStorage as StorageType) || StorageType.FRIDGE;
            newDefs[res.id] = {
              id: res.id,
              name: res.name,
              emoji: res.emoji,
              category: (res.category as FoodCategory) || 'Misc',
              bestStorage: bestStorage,
              baseLifespan: { [StorageType.ROOM_TEMP]: 3, [StorageType.FRIDGE]: 7, [StorageType.FREEZER]: 30, [StorageType.UNSET]: 3 },
              lore: res.lore,
              realWorldSecret: res.secret,
              quantityKind,
              tips: {
                [StorageType.ROOM_TEMP]: { en: "Room temp is fine.", cn: "常温即可。" },
                [StorageType.FRIDGE]: { en: "Needs cold shelter.", cn: "需要冷藏避难。" },
                [StorageType.FREEZER]: { en: "Frozen in time.", cn: "冻结于时间。" },
                [StorageType.UNSET]: { en: "Finding a home.", cn: "寻找归宿中。" }
              }
            };
          }
          
          const pendingItem: Partial<FoodItem> = {
            instanceId: sEntry?.id != null ? String(sEntry.id) : crypto.randomUUID(),
            defId: res.id,
            name: res.name[lang],
            emoji: res.emoji,
            addedDay: 0,
            damageDays: 0,
            vitality: res.vitality ?? sEntry?.vitality ?? 1.0,
            quantityKind,
            quantity,
            amountPercent,
            backendEntryIds: matchedEntries
              .map((entry: any) => entry?.id)
              .filter((id: any) => id != null)
              .map((id: any) => String(id)),
            addedDate: getLocalDateStr(),
            storage: StorageType.UNSET,
            x: 50,
            y: 50
          };

          if (quantityKind === 'countable') {
            const existing = groupedPending[res.id];
            if (existing) {
              const existingQuantity = existing.quantity ?? 1;
              const nextQuantity = existingQuantity + quantity;
              existing.quantity = nextQuantity;
              existing.backendEntryIds = [...(existing.backendEntryIds ?? []), ...(pendingItem.backendEntryIds ?? [])];
              existing.vitality = (((existing.vitality ?? 1) * existingQuantity) + ((pendingItem.vitality ?? 1) * quantity)) / nextQuantity;
            } else {
              groupedPending[res.id] = pendingItem;
              newPending.push(pendingItem);
            }
          } else {
            newPending.push(pendingItem);
          }
        }
        
        if (Object.keys(newDefs).length > 0) {
          setCustomDefs(prev => ({ ...prev, ...newDefs }));
        }
        setPendingItems(newPending);
        setView('CLASSIFY');
      } else {
        playSound('error');
        showToast(t('identifyFailure'));
      }
    } catch (e) {
      console.error('Food identification error:', e);
      playSound('error');
      showToast(t('identifyFailure'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchRecipes = () => {
    if (items.length === 0 && recipes.length === 0) {
      playSound('error');
      showToast(lang === 'cn' ? "避难所空空如也，无法变出食谱。" : "Haven is empty. No recipes can be conjured.");
      return;
    }
    playSound('modalOpen');
    setShowStylePicker(true);
  };

  const handleGenerateWithStyle = async (style: 'cn_cuisine' | 'western') => {
    playSound('button');
    setRecipeStyle(style);
    setShowStylePicker(false);
    setLoadingType('recipe');
    setIsLoading(true);
    try {
      // Build freshness map: instanceId -> progress (0=fresh, 1=spoiled)
      const freshnessMap: Record<string, number> = {};
      items.forEach(item => {
        const { progress } = calculateFreshness(item, 0, ALL_DEFINITIONS, todayStr);
        freshnessMap[item.instanceId] = progress;
      });
      const generated = await generateRecipesFromItems(items, lang, style, freshnessMap);
      setRecipes(generated);
      if (generated.length > 0) {
        setHistoryRecipeCount(count => count + generated.length);
      }
      setView('RECIPES');
      // recipe task: generated at least one recipe
      if (generated.length > 0) {
        reportTaskDone('recipe').catch(() => {});
      }
    } catch (e: any) {
      console.error('Recipe generation error:', e);
      playSound('error');
      showToast(lang === 'cn' ? `菜谱生成失败：${e?.message || '未知错误，请重试'}` : `Recipe failed: ${e?.message || 'Unknown error, please retry'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRecipe = async (index: number) => {
    playSound('modalClose');
    const recipe = recipes[index];
    const previousRecipes = recipes;
    setRecipes(prev => prev.filter((_, i) => i !== index));
    if (recipe?.recipeId != null) {
      try {
        await deleteRecipe(recipe.recipeId);
        setHistoryRecipeCount(count => Math.max(0, count - 1));
      } catch (e) {
        console.error('Recipe deletion error:', e);
        setRecipes(previousRecipes);
        showToast(lang === 'cn' ? '删除菜谱失败，请稍后重试' : 'Failed to delete recipe');
      }
    }
  };

  const finalizeItems = (placedItems: FoodItem[]) => {
    // Skip next sanctuary auto-load — items in state are fresh from classification
    skipSanctuaryLoad.current = true;
    // Separate items: vitality=0 should be removed from sanctuary, not stored
    const alive = placedItems.filter(item => (item.vitality ?? 1) > 0);
    const dead = placedItems.filter(item => (item.vitality ?? 1) <= 0);
    const usedEntryIds = new Set(alive.map(item => item.instanceId));
    const batchEntryIds = new Set(alive.flatMap(item => item.backendEntryIds ?? []));
    batchEntryIds.forEach(id => {
      if (!usedEntryIds.has(id)) {
        deleteSanctuaryItem(id).catch(e =>
          console.error('Failed to remove unused grouped item:', e)
        );
      }
    });

    // Delete vitality=0 items from backend sanctuary
    for (const item of dead) {
      deleteSanctuaryItem(item.instanceId).catch(e =>
        console.error('Failed to remove zero-vitality item:', e)
      );
    }

    // Ensure addedDate is set, keep damageDays=0 (formula handles decay)
    const enriched = alive.map(item => ({
      ...item,
      addedDate: item.addedDate || getLocalDateStr(),
      damageDays: item.damageDays || 0,
    }));

    // Sync vitality and storage back to backend sanctuary.json
    for (const item of enriched) {
      if (item.vitality !== undefined) {
        updateSanctuaryVitality(item.instanceId, item.vitality, item.storage).catch(e =>
          console.error('Failed to sync sanctuary item:', e)
        );
      }
    }
    // unlock task: scanned a food type never added before
    const currentUnlocked = unlockedIds;
    const hasNew = enriched.some(i => !currentUnlocked.includes(i.defId));
    if (hasNew) {
      reportTaskDone('unlock').catch(() => {});
    }
    setItems(prev => [...enriched, ...prev]);
    setUnlockedIds(prev => Array.from(new Set([...prev, ...enriched.map(i => i.defId)])));
    setPendingItems([]);
    setView('HOME');
    // Report 'scan' task as done (add an item)
    reportTaskDone('scan').catch(() => {});
  };

  const cancelClassification = () => {
    pendingItems
      .flatMap(item => item.backendEntryIds?.length ? item.backendEntryIds : (item.instanceId ? [item.instanceId] : []))
      .forEach(id => {
        deleteSanctuaryItem(id).catch(e =>
          console.error('Failed to remove discarded classified item:', e)
        );
      });
    setPendingItems([]);
    setView('HOME');
  };

  const getQuickActionGroup = (item: FoodItem) => {
    const date = item.addedDate || todayStr;
    const storage = item.storage;
    return items.filter(candidate =>
      candidate.defId === item.defId &&
      (candidate.addedDate || todayStr) === date &&
      candidate.storage === storage
    );
  };

  const getQuantityKind = (item: FoodItem) =>
    item.quantityKind || ALL_DEFINITIONS[item.defId]?.quantityKind || 'countable';

  const getGroupAmountPercent = (group: FoodItem[]) =>
    Math.max(0, Math.min(100, Math.round(group[0]?.amountPercent ?? 100)));

  const groupInventoryItems = (sourceItems: FoodItem[]) => {
    const groups = new Map<string, FoodItem>();
    sourceItems.forEach(item => {
      const key = `${item.defId}|${item.addedDate || todayStr}|${item.storage}`;
      if (!groups.has(key)) {
        groups.set(key, item);
      }
    });
    return Array.from(groups.values());
  };

  const openConsumptionDraft = (item: FoodItem, reason: 'EATEN' | 'RELEASED') => {
    const group = getQuickActionGroup(item);
    const kind = getQuantityKind(item);
    playSound('modalOpen');
    setConsumptionDraft({ item, reason });
    setConsumeValue(kind === 'countable' ? 1 : Math.min(50, getGroupAmountPercent(group)));
  };

  const closeQuickAction = () => {
    playSound('modalClose');
    setQuickActionItem(null);
    setConsumptionDraft(null);
  };

  const openQuickAction = (item: FoodItem) => {
    playSound('modalOpen');
    setQuickActionItem(item);
    reportTaskDone('check_status').catch(() => {});
  };

  const deleteItem = async (
    id: string,
    reason: 'EATEN' | 'RELEASED',
    options?: {
      ids?: string[];
      targetItem?: FoodItem;
      statUnits?: number;
      remainingAmountPercent?: number;
    }
  ) => {
    // Check if item was "expiring soon" before deletion (for FOOD SAVED stat)
    const targetItem = options?.targetItem ?? items.find(i => i.instanceId === id);
    const idsToDelete = options?.ids ?? [id];
    const statUnits = Math.max(1, options?.statUnits ?? 1);
    const targetCategory = targetItem ? toDailyAnalysisCategory(ALL_DEFINITIONS[targetItem.defId]?.category) : null;
    const isPartialPortion = options?.remainingAmountPercent !== undefined;
    const { wasExpiring, isSpoiled } = targetItem ? (() => {
      const { state, remaining } = calculateFreshness(targetItem, 0, ALL_DEFINITIONS, todayStr);
      return {
        wasExpiring: state !== FreshnessState.SPOILED && remaining !== undefined && remaining > 0 && remaining <= 2.1,
        isSpoiled: state === FreshnessState.SPOILED,
      };
    })() : { wasExpiring: false, isSpoiled: false };
    if (isPartialPortion && targetItem) {
      const nextAmount = Math.max(0, Math.min(100, Math.round(options!.remainingAmountPercent!)));
      try { await updateSanctuaryPortion(targetItem.instanceId, nextAmount); } catch (e) { console.error('Failed to update sanctuary portion:', e); }
      setItems(prev => prev.map(item =>
        item.instanceId === targetItem.instanceId ? { ...item, amountPercent: nextAmount } : item
      ));
    } else {
      await Promise.all(idsToDelete.map(deleteId =>
        deleteSanctuaryItem(deleteId).catch(e => console.error('Failed to delete from sanctuary:', e))
      ));
    }
    // Notify task system: consuming a food item may complete the 'consume' task
    if (reason === 'EATEN') {
      reportTaskDone('consume').catch(() => {});
      reportMoodAction('eat').catch(() => {});
    }
    // handle_expiring task:
    // Case 1: There are expiring-soon items (remaining ≤ 2.1 days) → only handling one of them counts.
    // Case 2: No expiring-soon items → handling the item with the lowest remaining freshness counts.
    const expiringCandidates = items.filter(item => {
      const { state, remaining } = calculateFreshness(item, 0, ALL_DEFINITIONS, todayStr);
      return state !== FreshnessState.SPOILED && remaining !== undefined && remaining > 0 && remaining <= 2.1;
    });
    let shouldReportHandleExpiring = false;
    if (expiringCandidates.length > 0) {
      shouldReportHandleExpiring = wasExpiring;
    } else if (targetItem && items.length > 0) {
      const getVitalityScore = (item: FoodItem) => {
        const { progress } = calculateFreshness(item, 0, ALL_DEFINITIONS, todayStr);
        return Math.max(0, 1 - progress);
      };
      const targetVitality = getVitalityScore(targetItem);
      const minVitality = Math.min(...items.map(getVitalityScore));
      shouldReportHandleExpiring = targetVitality <= minVitality + 0.001;
    }
    if (shouldReportHandleExpiring) {
      reportTaskDone('handle_expiring_d2').catch(() => {});
      reportTaskDone('handle_expiring').catch(() => {});
    }
    // Mood adjustment for discard: cleaning rotten food is good (+1), wasting fresh food is bad (-1)
    if (reason === 'RELEASED') {
      reportMoodAction(isSpoiled ? 'clean_rotten' : 'discard').then(r => {
        setCatData(prev => ({
          ...prev,
          mood: r.mood,
          ...(r.mood_clean_gained !== undefined && { mood_clean_gained: r.mood_clean_gained }),
          ...(r.mood_discard_lost !== undefined && { mood_discard_lost: r.mood_discard_lost }),
          ...(r.mood_daily_lost !== undefined && { mood_daily_lost: r.mood_daily_lost }),
        }));
      }).catch(() => {});
    }
    if (!isPartialPortion) {
      // Reload from sanctuary to keep IDs in sync after reindex
      try {
        const sanctuaryItems = await loadSanctuaryItems(ALL_DEFINITIONS);
        setItems(sanctuaryItems);
        setUnlockedIds(Array.from(new Set(sanctuaryItems.map(i => i.defId))));
      } catch (_) {
        const deleteSet = new Set(idsToDelete);
        // Fallback: just remove locally
        setItems(prev => prev.filter(i => !deleteSet.has(i.instanceId)));
      }
    }
    setStats(prev => {
      const isNewDay = !prev.todayDate || prev.todayDate !== todayStr;
      const categoryStats = normalizeDailyCategoryStats(isNewDay ? undefined : prev.todayCategoryStats);
      const foodStats = normalizeDailyFoodStats(isNewDay ? undefined : prev.todayFoodStats);
      if (targetCategory) {
        categoryStats[targetCategory] = {
          ...categoryStats[targetCategory],
          eaten: categoryStats[targetCategory].eaten + (reason === 'EATEN' ? statUnits : 0),
          wasted: categoryStats[targetCategory].wasted + (reason === 'RELEASED' ? statUnits : 0),
        };
        const def = targetItem ? ALL_DEFINITIONS[targetItem.defId] : undefined;
        const foodStat = targetItem ? {
          defId: targetItem.defId,
          name: def?.name ?? { en: targetItem.name, cn: targetItem.name },
          count: statUnits,
        } : null;
        if (foodStat) {
          const modeKey = reason === 'EATEN' ? 'eaten' : 'wasted';
          foodStats[targetCategory] = {
            ...foodStats[targetCategory],
            [modeKey]: addDailyFoodStat(foodStats[targetCategory][modeKey], foodStat),
          };
        }
      }
      const next = {
        eatenCount: reason === 'EATEN' ? prev.eatenCount + statUnits : prev.eatenCount,
        wastedCount: reason === 'RELEASED' ? prev.wastedCount + statUnits : prev.wastedCount,
        totalSaved: (reason === 'EATEN' && wasExpiring) ? prev.totalSaved + statUnits : prev.totalSaved,
        todayDate: todayStr,
        todayEaten: (isNewDay ? 0 : (prev.todayEaten ?? 0)) + (reason === 'EATEN' ? statUnits : 0),
        todayWasted: (isNewDay ? 0 : (prev.todayWasted ?? 0)) + (reason === 'RELEASED' ? statUnits : 0),
        todayCategoryStats: categoryStats,
        todayFoodStats: foodStats,
        priorityHandledCount: wasExpiring ? prev.priorityHandledCount + statUnits : prev.priorityHandledCount,
      };
      // Persist stats to cat.json asynchronously
      saveStats(next).catch(() => {});
      return next;
    });
    skipSanctuaryLoad.current = true; // already reloaded above
    setView('HOME');
    setSelectedItem(null);
    setConsumptionDraft(null);
    setQuickActionItem(null);
    showToast(reason === 'EATEN' ? (lang === 'cn' ? "感谢馈赠。" : "Thank you for the meal.") : (lang === 'cn' ? "归还自然。" : "Released to nature."));
  };

  const completeConsumption = async (item: FoodItem, reason: 'EATEN' | 'RELEASED') => {
    const group = getQuickActionGroup(item);
    const kind = getQuantityKind(item);
    if (kind === 'countable') {
      const count = Math.max(0, Math.min(group.length, Math.round(consumeValue)));
      if (count <= 0) return;
      playSound(reason === 'EATEN' ? 'eat' : 'waste');
      await deleteItem(item.instanceId, reason, {
        ids: group.slice(0, count).map(groupItem => groupItem.instanceId),
        targetItem: item,
        statUnits: count,
      });
      return;
    }

    const currentAmount = getGroupAmountPercent(group);
    const usedAmount = Math.max(0, Math.min(currentAmount, Math.round(consumeValue)));
    if (usedAmount <= 0) return;
    playSound(reason === 'EATEN' ? 'eat' : 'waste');
    const remainingAmount = currentAmount - usedAmount;
    await deleteItem(item.instanceId, reason, {
      ids: [item.instanceId],
      targetItem: item,
      statUnits: 1,
      remainingAmountPercent: remainingAmount > 0 ? remainingAmount : undefined,
    });
  };



  const handleAuthSuccess = (user: AuthResult) => {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    resetUserScopedState();
    setCurrentUser(user);
    setView('CAT');
  };

  const handleDemoStart = () => {
    const demoBgmVolume = Math.max(4, getBgmVolumePercent());
    unlockAudio();
    setBgmVolume(demoBgmVolume);
    setBgmVolumePercent(demoBgmVolume);
    startBgm();
    const demoItems = createDemoItems();
    const demoState = {
      items: demoItems,
      unlockedIds: demoItems.map(item => item.defId),
      lang: 'en' as Language,
      customDefs: {},
      recipes: DEMO_RECIPES,
      stats: DEMO_STATS,
    };

    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key && (key.startsWith(`${BASE_STORAGE_KEY}:${DEMO_USER.user_id}`) || key.startsWith(`${CAT_STORAGE_PREFIX}:${DEMO_USER.user_id}`) || key.startsWith(`${TASK_STORAGE_PREFIX}:${DEMO_USER.user_id}`))) {
        sessionStorage.removeItem(key);
      }
    }
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(DEMO_USER));
    sessionStorage.setItem(`${BASE_STORAGE_KEY}:${DEMO_USER.user_id}`, JSON.stringify(demoState));
    sessionStorage.setItem(`${CAT_STORAGE_PREFIX}:${DEMO_USER.user_id}`, JSON.stringify(DEMO_CAT));
    resetUserScopedState();
    setCurrentUser(DEMO_USER);
    setShowDemoWelcome(true);
    setView('HOME');
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    resetUserScopedState();
    setCurrentUser(null);
    setView('SPLASH');
  };

  const handleBgmVolumeChange = (value: number) => {
    unlockAudio();
    const next = Math.max(0, Math.min(50, value));
    setBgmVolume(next);
    setBgmVolumePercent(next);
  };

  const toggleSfx = () => {
    setSfxOn(current => {
      const next = !current;
      setSfxEnabled(next);
      if (next) window.setTimeout(() => playSound('modalOpen'), 0);
      return next;
    });
  };

  return (
    <Layout
      activeView={view}
      onViewChange={(v) => {
        unlockAudio();
        playSound(v === 'HOME' ? 'fridgeOpen' : v === 'ALMANAC' ? 'almanac' : 'button');
        if (v === 'ALMANAC') setAlmanacInitialId(undefined);
        setView(v);
      }}
      onPlusClick={() => {
        unlockAudio();
        playSound('modalOpen');
        setView('HOME');
        setShowScanPicker(true);
      }}
    >
      {/* Persistent hidden preload to keep outfit button in memory cache */}
      <img src="/assets/outfit/button.png" alt="" aria-hidden className="hidden" />
      {achievementToast && (
        <div className="fixed top-4 left-1/2 z-[10000] w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-2xl border border-haven-tan/25 bg-white/95 px-4 py-3 shadow-[0_12px_30px_rgba(95,77,65,0.20)] backdrop-blur-md">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-haven-sage/70 bg-haven-cream">
              <img src={`/assets/achievements/${achievementToast.icon}.png`} alt={achievementToast.en} className="h-full w-full scale-125 object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-haven-moss">{lang === 'cn' ? '\u6210\u5c31\u5df2\u89e3\u9501' : 'Achievement unlocked'}</p>
              <p className="mt-0.5 truncate font-aahou text-[12pt] text-haven-brown">{lang === 'cn' ? achievementToast.cn : achievementToast.en}</p>
            </div>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] bg-haven-cream flex flex-col items-center justify-center text-center animate-in fade-in">
          <div
            className={`shrink-0 transition-opacity duration-150 ${loadingMediaReady ? 'opacity-100' : 'opacity-0'}`}
            style={LOADING_MEDIA_STAGE_STYLE}
          >
            {LOADING_MEDIA[loadingType ?? 'identify'].kind === 'video' ? (
              <video
                key={loadingType ?? 'loading'}
                ref={loadingVideoRef}
                src={LOADING_MEDIA[loadingType ?? 'identify'].src}
                className="max-w-none"
                style={LOADING_MEDIA[loadingType ?? 'identify'].style}
                playsInline
                autoPlay
                muted={!sfxOn}
                loop
                preload="auto"
                onLoadedMetadata={handleLoadingVideoReady}
                onLoadedData={handleLoadingVideoReady}
                onCanPlay={handleLoadingVideoReady}
                onPlaying={handleLoadingVideoReady}
                onError={() => setLoadingMediaReady(true)}
              />
            ) : (
              <img
                key={loadingType ?? 'loading'}
                src={LOADING_MEDIA[loadingType ?? 'identify'].src}
                className="max-w-none"
                style={LOADING_MEDIA[loadingType ?? 'identify'].style}
                alt=""
                aria-hidden
                onLoad={() => setLoadingMediaReady(true)}
                onError={() => setLoadingMediaReady(true)}
              />
            )}
          </div>
          <div className="relative mt-4 mb-4">
            <svg className="animate-spin w-8 h-8 text-haven-sage" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-2xl font-aahou text-haven-brown">{loadingType === 'recipe' ? (lang === 'cn' ? '正在研究菜谱...' : 'Cooking Up Ideas...') : (lang === 'cn' ? '万物感知中...' : 'Perceiving all things...')}</h2>
        </div>
      )}
      {toast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] bg-haven-brown text-white px-8 py-3 rounded-full text-[12px] font-black tracking-widest uppercase animate-in slide-in-from-top-12">
          {toast}
        </div>
      )}
      {view === 'SPLASH' && (
        <div className="h-full relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ backgroundImage: "url('/assets/cover/背景.png')", backgroundSize: 'cover', backgroundPosition: 'center top', transform: 'translateZ(0)' }}
          />
          <div className="relative z-10 h-full flex flex-col items-center justify-end pb-24">
            {splashReady && (!currentUser || accountHydrationReady) ? (
              <button
                onClick={() => { unlockAudio(); playSound('modalOpen'); if (currentUser) { loadFromSanctuary(ALL_DEFINITIONS); setView('CAT'); } else { setView('AUTH'); } }}
                className="transition-transform duration-200 hover:scale-105 animate-in fade-in zoom-in-95"
                aria-label="Start"
              >
                <img src="/assets/cover/start-button.png" alt="START" className="w-[164px] object-contain select-none pointer-events-none" />
              </button>
            ) : (
              <div className="w-[210px] animate-in fade-in">
                <div className="h-3 w-full overflow-hidden rounded-full border border-white/60 bg-white/50 shadow-sm backdrop-blur">
                  <div
                    className="h-full rounded-full bg-[#D8E63C] transition-all duration-200"
                    style={{ width: `${splashProgress}%` }}
                  />
                </div>
                <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.28em] text-[#5F4D41] drop-shadow-sm">
                  {splashProgress}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {view === 'AUTH' && <AuthView onSuccess={handleAuthSuccess} onDemo={handleDemoStart} />}
      {view === 'HOME' && (
        <div className="h-full relative flex flex-col overflow-hidden">
          <div className="p-4 flex justify-between items-center z-50 min-h-[56px]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-haven-sage rounded-full animate-pulse" />
              <p className="text-[11px] font-black uppercase tracking-widest text-haven-olive">{todayStr}</p>
              <button onClick={() => { refreshDate(); loadFromSanctuary(ALL_DEFINITIONS); setCustomDefs({}); setRecipes([]); }} className="p-1.5 bg-haven-tan/20 rounded-full text-haven-moss hover:text-haven-sage transition-all"><RefreshCw size={13} /></button>
            </div>
            <div className="flex gap-2">
               <button onClick={() => { playSound(showTimeSlider ? 'modalClose' : 'modalOpen'); setShowTimeSlider(!showTimeSlider); }} className={`w-10 h-10 rounded-xl shadow-md flex items-center justify-center ${showTimeSlider?'bg-haven-sage text-haven-brown':'bg-white text-[#5F4D41]'}`}><SlidersHorizontal size={20} /></button>
               <button onClick={handleFetchRecipes} className="w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center text-[#5F4D41]"><ChefHat size={20} /></button>
            </div>
          </div>
          
          {isSanctuaryLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-haven-cream/70 z-40">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw size={28} className="text-haven-sage animate-spin" />
                <p className="text-[9px] font-black uppercase tracking-widest text-haven-olive">{lang === 'cn' ? '正在读取避难所...' : 'Loading sanctuary...'}</p>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-y-auto bg-haven-cream scrollbar-hide pb-20">
             {(() => {
               const urgentItems = items
                 .filter(item => {
                   const { state, remaining } = calculateFreshness(item, predictionDays, ALL_DEFINITIONS, todayStr);
                   return state !== FreshnessState.SPOILED && remaining !== undefined && remaining <= 2.1 && remaining > 0;
                 })
                 .sort((a, b) => {
                   const remA = calculateFreshness(a, predictionDays, ALL_DEFINITIONS, todayStr).remaining;
                   const remB = calculateFreshness(b, predictionDays, ALL_DEFINITIONS, todayStr).remaining;
                   return (remA ?? 0) - (remB ?? 0);
                 });

               const roomTempItems = items.filter(item => {
                 const { remaining, state } = calculateFreshness(item, predictionDays, ALL_DEFINITIONS, todayStr);
                 const isUrgent = state !== FreshnessState.SPOILED && remaining !== undefined && remaining > 0 && remaining <= 2.1;
                 return !isUrgent && item.storage === StorageType.ROOM_TEMP;
               });
               const fridgeItems = items.filter(item => {
                 const { remaining, state } = calculateFreshness(item, predictionDays, ALL_DEFINITIONS, todayStr);
                 const isUrgent = state !== FreshnessState.SPOILED && remaining !== undefined && remaining > 0 && remaining <= 2.1;
                 return !isUrgent && item.storage === StorageType.FRIDGE;
               });
               const freezerItems = items.filter(item => {
                 const { remaining, state } = calculateFreshness(item, predictionDays, ALL_DEFINITIONS, todayStr);
                 const isUrgent = state !== FreshnessState.SPOILED && remaining !== undefined && remaining > 0 && remaining <= 2.1;
                 return !isUrgent && item.storage === StorageType.FREEZER;
               });
               const groupedUrgentItems = groupInventoryItems(urgentItems);
               const groupedRoomTempItems = groupInventoryItems(roomTempItems);
               const groupedFridgeItems = groupInventoryItems(fridgeItems);
               const groupedFreezerItems = groupInventoryItems(freezerItems);

               return (
                 <div className="p-3 space-y-3">
                    {/* Expiring Soon Section */}
                    <section className={`${groupedUrgentItems.length > 0 ? 'bg-haven-violet shadow-lg shadow-haven-deeppurple/10 border-haven-deeppurple/30' : 'bg-haven-violet border-haven-brown/5'} p-4 rounded-[2rem] border-2 transition-all duration-500`}>
                      <div className="flex justify-between items-center mb-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={12} className={groupedUrgentItems.length > 0 ? 'text-haven-deeppurple' : 'text-haven-brown/60'} />
                          <h2 className={`font-aahou text-[10pt] uppercase tracking-[0.2em] whitespace-nowrap ${groupedUrgentItems.length > 0 ? 'text-haven-deeppurple' : 'text-haven-brown'}`}>
                            {t('expiringSoon')}
                          </h2>
                        </div>
                        {groupedUrgentItems.length > 0 && (
                          <span className="font-aahou text-haven-deeppurple text-[7pt] uppercase tracking-widest whitespace-nowrap">
                            {groupedUrgentItems.length} {lang === 'cn' ? '项' : groupedUrgentItems.length > 1 ? 'ITEMS' : 'ITEM'}
                          </span>
                        )}
                      </div>
                      
                      {groupedUrgentItems.length > 0 ? (
                        <div className="grid grid-cols-5 gap-2 p-0.5">
                          {groupedUrgentItems.map(item => (
                            <FoodSprite key={item.instanceId} item={item} currentDay={0} predictionDays={predictionDays} todayStr={todayStr} lang={lang} onClick={() => openQuickAction(item)} allDefs={ALL_DEFINITIONS} />
                          ))}
                        </div>
                      ) : (
                        <div className="py-2 flex flex-col items-center justify-center text-haven-brown/40 gap-1 opacity-80">
                           <div className="flex items-center gap-2">
                             <Sparkles size={12} className="text-haven-brown/20" />
                             <p className="text-[8px] font-black uppercase tracking-widest">{lang === 'cn' ? '万物皆鲜' : 'ALL CLEAR & FRESH'}</p>
                             <Sparkles size={12} className="text-haven-brown/20" />
                           </div>
                        </div>
                      )}
                    </section>

                    {/* Fridge Section */}
                    <section className="bg-white p-4 rounded-[2rem] border-2 border-haven-brown/5 shadow-sm">
                      <div className="flex justify-between items-center mb-4 px-1">
                        <div className="flex items-center gap-2">
                          <Refrigerator size={14} className="text-haven-brown/60" />
                          <h2 className="font-aahou text-[10pt] uppercase tracking-[0.2em] text-haven-brown whitespace-nowrap">{t('fridgeSanctuary')}</h2>
                        </div>
                        <span className="font-aahou text-[7pt] text-haven-brown/40 uppercase tracking-widest whitespace-nowrap">
                          {groupedFridgeItems.length} {lang === 'cn' ? '项' : groupedFridgeItems.length > 1 ? 'ITEMS' : 'ITEM'}
                        </span>
                      </div>
                      
                      {groupedFridgeItems.length > 0 ? (
                        <div className="grid grid-cols-5 gap-2.5 p-0.5">
                          {groupedFridgeItems.map(item => (
                            <FoodSprite key={item.instanceId} item={item} currentDay={0} predictionDays={predictionDays} todayStr={todayStr} lang={lang} onClick={() => openQuickAction(item)} allDefs={ALL_DEFINITIONS} />
                          ))}
                        </div>
                      ) : (
                        <div className="py-8 flex flex-col items-center justify-center text-haven-brown/20 gap-3 min-h-[100px]">
                           <div className="w-16 h-16 bg-haven-cream rounded-full flex items-center justify-center">
                             <Refrigerator size={24} className="opacity-40" />
                           </div>
                           <p className="text-[9px] font-black uppercase tracking-widest text-center max-w-[200px] leading-relaxed">{t('fridgeEmpty')}</p>
                        </div>
                      )}
                    </section>

                    {/* Pantry & Freezer Row */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Pantry Section */}
                      <section className="bg-haven-sage p-3.5 rounded-[2rem] border-2 border-haven-brown/5 shadow-sm">
                        <div className="flex justify-between items-center mb-3 px-1">
                          <div className="flex items-center gap-1.5">
                            <Sprout size={12} className="text-haven-brown/60" />
                            <h2 className="font-aahou text-[10pt] uppercase tracking-[0.1em] text-haven-brown whitespace-nowrap">{t('pantryGarden')}</h2>
                          </div>
                          <span className="font-aahou text-[7pt] text-haven-brown/40 uppercase tracking-widest whitespace-nowrap">
                            {groupedRoomTempItems.length} {lang === 'cn' ? '项' : groupedRoomTempItems.length > 1 ? 'ITEMS' : 'ITEM'}
                          </span>
                        </div>
                        
                        {groupedRoomTempItems.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {groupedRoomTempItems.map(item => (
                              <FoodSprite key={item.instanceId} item={item} currentDay={0} predictionDays={predictionDays} todayStr={todayStr} lang={lang} onClick={() => openQuickAction(item)} allDefs={ALL_DEFINITIONS} />
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 flex flex-col items-center justify-center text-haven-brown/30 gap-2 min-h-[80px]">
                             <Sprout size={16} className="opacity-30" />
                             <p className="text-[7px] font-black uppercase tracking-widest text-center leading-relaxed px-1">{t('pantryEmpty')}</p>
                          </div>
                        )}
                      </section>

                      {/* Freezer Section */}
                      <section className="bg-haven-nordic p-3.5 rounded-[2rem] border-2 border-haven-brown/5 shadow-sm">
                        <div className="flex justify-between items-center mb-3 pl-1 pr-0">
                          <div className="flex items-center gap-1.5">
                            <Snowflake size={12} className="text-haven-brown/60" />
                            <h2 className="font-aahou text-[10pt] uppercase tracking-[0.1em] text-haven-brown whitespace-nowrap">{t('iceIsland')}</h2>
                          </div>
                          <span className="font-aahou text-[7pt] text-haven-brown/40 uppercase tracking-widest whitespace-nowrap">
                            {groupedFreezerItems.length} {lang === 'cn' ? '项' : groupedFreezerItems.length > 1 ? 'ITEMS' : 'ITEM'}
                          </span>
                        </div>
                        
                        {groupedFreezerItems.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {groupedFreezerItems.map(item => (
                              <FoodSprite key={item.instanceId} item={item} currentDay={0} predictionDays={predictionDays} todayStr={todayStr} lang={lang} onClick={() => openQuickAction(item)} allDefs={ALL_DEFINITIONS} />
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 flex flex-col items-center justify-center text-haven-brown/30 gap-2 min-h-[80px]">
                             <Snowflake size={16} className="opacity-30" />
                             <p className="text-[7px] font-black uppercase tracking-widest text-center leading-relaxed px-1">{t('freezerEmpty')}</p>
                          </div>
                        )}
                      </section>
                    </div>
                 </div>
               );
             })()}
          </div>

          {showStylePicker && (
            <div className="absolute inset-0 z-[70] bg-haven-brown/40 flex items-end pb-32 px-6 animate-in fade-in" onClick={() => { playSound('modalClose'); setShowStylePicker(false); }}>
              <div className="w-full bg-haven-cream rounded-[2.5rem] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="relative text-center mb-6">
                  <button onClick={() => { playSound('modalClose'); setShowStylePicker(false); }} className="absolute right-0 top-0 w-7 h-7 flex items-center justify-center text-haven-brown/50 hover:text-haven-brown transition-colors">
                    <X size={16} />
                  </button>
                  <span className="text-2xl">🍳</span>
                  <h3 className="text-2xl font-aahou text-haven-brown mt-2">{lang === 'cn' ? '菜谱工坊' : 'Recipe Studio'}</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-haven-moss mt-1">{lang === 'cn' ? '优先使用新鲜度最低的食材' : 'Least fresh ingredients used first'}</p>
                </div>
                {historyRecipeCount > 0 && (
                  <button
                    onClick={async () => {
                      playSound('modalOpen');
                      try {
                        const hist = await loadRecipeHistory();
                        setRecipes(hist);
                        setHistoryRecipeCount(hist.length);
                        setShowStylePicker(false);
                        setView('RECIPES');
                      } catch (e) {
                        showToast(lang === 'cn' ? '加载历史菜谱失败' : 'Failed to load recipe history');
                      }
                    }}
                    className="w-full flex items-center gap-4 py-4 px-6 mb-4 bg-white border border-slate-100 rounded-[2rem] active:scale-95 transition-all hover:border-slate-300"
                  >
                    <span className="text-3xl">📝</span>
                    <div className="text-left">
                      <span className="font-black uppercase tracking-widest text-[10px] text-[#5F4D41] block">{lang === 'cn' ? '查看历史菜谱' : 'Recipe History'}</span>
                      <span className="text-[9px] text-[#5F4D41]/60 italic">{lang === 'cn' ? `共 ${historyRecipeCount} 道菜` : `${historyRecipeCount} recipe${historyRecipeCount > 1 ? 's' : ''} saved`}</span>
                    </div>
                  </button>
                )}
                <p className="text-[9px] font-black uppercase tracking-widest text-haven-moss mb-3 text-center">{lang === 'cn' ? '生成新菜谱' : 'Generate New Recipes'}</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleGenerateWithStyle('cn_cuisine')}
                    className="flex-1 flex flex-col items-center gap-3 py-6 bg-white border-2 border-slate-100 rounded-[2rem] active:scale-95 transition-all hover:border-slate-300"
                  >
                    <span className="text-4xl">🥢</span>
                    <span className="font-black uppercase tracking-widest text-[10px] text-[#5F4D41]">{lang === 'cn' ? '中餐' : 'Chinese'}</span>
                    <span className="text-[9px] text-[#5F4D41]/60 italic">{lang === 'cn' ? '炒·蒸·炖·拌' : 'Stir-fry · Steam'}</span>
                  </button>
                  <button
                    onClick={() => handleGenerateWithStyle('western')}
                    className="flex-1 flex flex-col items-center gap-3 py-6 bg-white border-2 border-slate-100 rounded-[2rem] active:scale-95 transition-all hover:border-slate-300"
                  >
                    <span className="text-4xl">🍴</span>
                    <span className="font-black uppercase tracking-widest text-[10px] text-[#5F4D41]">{lang === 'cn' ? '西餐' : 'Western'}</span>
                    <span className="text-[9px] text-[#5F4D41]/60 italic">{lang === 'cn' ? '烤·煎·沙拉·意面' : 'Roast · Grill · Pasta'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {showTimeSlider && (() => {
            const maxSliderDays = items.length > 0
              ? Math.max(...items.map(item => Math.ceil(calculateFreshness(item, 0, ALL_DEFINITIONS, todayStr).remaining ?? 0)))
              : 30;
            return (
              <div className="absolute bottom-20 sm:bottom-4 inset-x-4 z-[60] bg-haven-cream px-5 py-4 rounded-[2.5rem] shadow-2xl border border-haven-tan/30">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-aahou text-[9pt] text-haven-moss">{lang === 'cn' ? '时间模拟预览' : 'TIME SIMULATION'}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg font-aahou text-[#5F4D41]">+{predictionDays}D</span>
                    <button onClick={() => { playSound('modalClose'); setPredictionDays(0); setShowTimeSlider(false); }} className="w-7 h-7 bg-haven-tan/20 rounded-full flex items-center justify-center text-haven-moss hover:bg-haven-tan/40 transition-colors"><X size={13} /></button>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max={maxSliderDays}
                  value={predictionDays}
                  onChange={e => {
                    const nextDays = parseInt(e.target.value);
                    setPredictionDays(nextDays);
                    if (nextDays > 0) reportTaskDone('time_slider').catch(() => {});
                  }}
                  className="w-full h-2 bg-haven-tan/20 rounded-full appearance-none accent-haven-sage cursor-pointer"
                />
              </div>
            );
          })()}
          {quickActionItem && (
            <div className="absolute inset-0 z-[300] flex items-center justify-center p-8 bg-haven-brown/30 backdrop-blur-sm animate-in fade-in duration-150" onClick={closeQuickAction}>
              <div className="relative bg-white rounded-[2.5rem] p-6 w-full shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Close button */}
                <button onClick={closeQuickAction} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-haven-tan/20 flex items-center justify-center text-haven-brown hover:bg-haven-tan/40 transition-colors z-10"><X size={16} /></button>
                {/* Header */}
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-haven-moss text-center mb-1">{lang === 'cn' ? '快捷操作' : 'Quick Action'}</p>
                <h3 className="text-2xl font-bold text-haven-brown text-center mb-4">
                  {(() => {
                    const group = getQuickActionGroup(quickActionItem);
                    const name = ALL_DEFINITIONS[quickActionItem.defId]?.name[lang] || quickActionItem.name;
                    return getQuantityKind(quickActionItem) === 'countable' ? `${name} ${String.fromCharCode(215)}${group.length}` : name;
                  })()}
                </h3>
                {/* Food icon */}
                <div className="flex justify-center mb-5">
                  <div className="w-24 h-24 bg-haven-cream rounded-3xl flex items-center justify-center shadow-inner">
                    <img src={getFoodIconUrl(quickActionItem.defId)} alt={quickActionItem.name} className="w-16 h-16 object-contain drop-shadow-sm" />
                  </div>
                </div>
                {!consumptionDraft && (
                  <div className="flex justify-center mb-5">
                    <div className="px-5 py-2 rounded-full border border-haven-brown/30 text-haven-brown font-black uppercase tracking-widest text-[9px]">
                      <span className="text-[9px]">{lang === 'cn' ? '\u5165\u5e93\u65e5\u671f' : 'Stored'} {quickActionItem.addedDate || todayStr}</span>
                    </div>
                  </div>
                )}
                {/* Primary actions */}
                {!consumptionDraft && (() => {
                  const { state: qaState } = calculateFreshness(quickActionItem, 0, ALL_DEFINITIONS, todayStr);
                  const qaSpoiled = qaState === FreshnessState.SPOILED;
                  return (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button disabled={qaSpoiled} onClick={() => openConsumptionDraft(quickActionItem, 'EATEN')} className={`py-5 px-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${qaSpoiled ? 'bg-stone-200 opacity-50 cursor-not-allowed' : 'bg-[#D8E63C] active:scale-95'}`}>
                    <Utensils size={20} className="text-haven-brown" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-haven-brown leading-tight text-center">{lang === 'cn' ? '我已吃完！' : "I've Eaten This!"}</span>
                  </button>
                  <button onClick={() => openConsumptionDraft(quickActionItem, 'RELEASED')} className="bg-[#D6B4FC] py-5 px-2 rounded-2xl flex flex-col items-center gap-2 active:scale-95 transition-all">
                    <Leaf size={20} className="text-haven-brown" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-haven-brown leading-tight text-center">{lang === 'cn' ? '放归自然' : 'Release to Nature'}</span>
                  </button>
                </div>
                  );
                })()}
                {consumptionDraft && (() => {
                  const group = getQuickActionGroup(consumptionDraft.item);
                  const kind = getQuantityKind(consumptionDraft.item);
                  const isEat = consumptionDraft.reason === 'EATEN';
                  const max = kind === 'countable' ? Math.max(1, group.length) : getGroupAmountPercent(group);
                  const selected = Math.min(consumeValue, max);
                  const accent = isEat ? '#D8E63C' : '#D6B4FC';
                  const trackPercent = max > 0 ? Math.max(0, Math.min(100, (selected / max) * 100)) : 0;
                  const selectedLabel = kind === 'countable'
                    ? `${selected} item${selected === 1 ? '' : 's'}`
                    : `${selected}%`;
                  const question = isEat
                    ? (kind === 'countable' ? 'How many did you eat?' : 'How much did you eat?')
                    : (kind === 'countable' ? 'How many did you waste?' : 'How much did you waste?');
                  return (
                    <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className={`mb-5 py-4 rounded-2xl flex flex-col items-center gap-2 ${isEat ? 'bg-[#D8E63C]' : 'bg-[#D6B4FC]'}`}>
                        {isEat ? <Utensils size={20} className="text-haven-brown" /> : <Leaf size={20} className="text-haven-brown" />}
                        <span className="text-[8px] font-black uppercase tracking-widest text-haven-brown leading-tight text-center">
                          {isEat ? "I've Eaten This!" : 'Release to Nature'}
                        </span>
                      </div>
                      <p className="text-[10px] font-black text-haven-brown text-center mb-3">{question}</p>
                      <div className="px-2 pt-9 mb-2">
                        <div className="relative">
                          <div
                            className="absolute -top-9 flex -translate-x-1/2 flex-col items-center"
                            style={{ left: `clamp(16px, ${trackPercent}%, calc(100% - 16px))` }}
                          >
                            <span
                              className="rounded-xl px-3 py-1.5 text-[10px] font-black text-haven-brown shadow-sm"
                              style={{ backgroundColor: accent }}
                            >
                              {selectedLabel}
                            </span>
                            <span
                              className="-mt-1 h-2 w-2 rotate-45"
                              style={{ backgroundColor: accent }}
                            />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={max}
                            value={selected}
                            onChange={e => setConsumeValue(parseInt(e.target.value, 10))}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--range-accent)] [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--range-accent)] [&::-moz-range-thumb]:shadow-md"
                            style={{
                              background: `linear-gradient(to right, ${accent} 0%, ${accent} ${trackPercent}%, #EEEAE4 ${trackPercent}%, #EEEAE4 100%)`,
                              accentColor: accent,
                              ['--range-accent' as string]: accent,
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-4 px-2">
                        <span className="text-[9px] font-black text-haven-brown">{kind === 'countable' ? '0' : '0%'}</span>
                        <span className="text-[9px] font-black text-haven-brown">All</span>
                      </div>
                      <p className="text-[9px] text-haven-brown/70 text-center">
                        {kind === 'countable' ? `Selected: ${selected} of ${max} items` : `Selected: ${selected}%`}
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-5">
                        <button onClick={() => { playSound('modalClose'); setConsumptionDraft(null); }} className="py-3 bg-haven-cream border border-haven-tan/30 text-haven-brown rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all">
                          Back
                        </button>
                        <button disabled={selected <= 0} onClick={() => completeConsumption(consumptionDraft.item, consumptionDraft.reason)} className={`py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all ${selected <= 0 ? 'bg-haven-tan/30 text-haven-brown/40 cursor-not-allowed' : 'bg-haven-sage/70 text-haven-brown'}`}>
                          Confirm
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {/* Vitality Slider */}
                {!consumptionDraft && (() => {
                  const { state: qaSliderState } = calculateFreshness(quickActionItem, 0, ALL_DEFINITIONS, todayStr);
                  const sliderSpoiled = qaSliderState === FreshnessState.SPOILED;
                  return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-bold text-[#9B8B7E] tracking-[0.18em] uppercase">{lang === 'cn' ? '新鲜度' : 'Freshness'}</p>
                    <p className="text-base font-black text-[#5F4D41]">{vitalityDraft}%</p>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={vitalityDraft}
                    disabled={sliderSpoiled}
                    onChange={e => setVitalityDraft(parseInt(e.target.value))}
                    className={`vitality-slider w-full h-0.5 rounded-full appearance-none bg-slate-200 ${sliderSpoiled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  />
                </div>
                  );
                })()}
                {/* Bottom actions */}
                {!consumptionDraft && <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { playSound('almanac'); setAlmanacInitialId(quickActionItem.defId); setQuickActionItem(null); setView('ALMANAC'); }} className="flex items-center justify-center gap-1.5 py-3 bg-haven-cream border border-haven-tan/30 text-haven-brown rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all">
                    <Info size={14} />{lang === 'cn' ? '详情' : 'Details'}
                  </button>
                  <button onClick={() => {
                    const { state: cState } = calculateFreshness(quickActionItem!, 0, ALL_DEFINITIONS, todayStr);
                    if (cState !== FreshnessState.SPOILED) {
                      const newV = vitalityDraft / 100;
                      setItems(prev => prev.map(i =>
                        i.instanceId === quickActionItem!.instanceId
                          ? { ...i, vitality: newV, damageDays: 0, addedDate: todayStr }
                          : i
                      ));
                      updateSanctuaryVitality(quickActionItem!.instanceId, newV).catch(() => {});
                    }
                    closeQuickAction();
                  }} className="flex items-center justify-center py-3 bg-haven-sage/60 text-haven-brown rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all">
                    {lang === 'cn' ? '确认' : 'Confirm'}
                  </button>
                </div>}
              </div>
            </div>
          )}
        </div>
      )}
      {view === 'CAT' && <CatView lang={lang} stats={stats} catData={catData} setCatData={setCatData} outfitItems={outfitItems} initialDailyTasks={initialDailyTasks} onNavigate={(v) => {
        if (v === 'RECIPES') {
          // Task navigation to recipes: trigger generation instead of just switching view
          if (items.length === 0) {
            showToast(lang === 'cn' ? '避难所空空如也，无法变出食谱。' : 'Haven is empty. No recipes can be conjured.');
          } else {
            handleGenerateWithStyle(recipeStyle);
          }
        } else if (v === 'SCAN') {
          // Task navigation to scan: go HOME and open scan picker (same as + button)
          setView('HOME');
          setShowScanPicker(true);
        } else {
          setView(v as any);
        }
      }} todayStr={todayStr} />}
      {view === 'PROFILE' && (
        <div className="h-full flex flex-col overflow-y-auto scrollbar-hide bg-haven-cream">
          {/* Hero Header — horizontal layout */}
          <div className="bg-haven-sage flex items-center gap-4 px-6 pt-14 pb-8">
            <div className="w-14 h-14 rounded-full bg-white/50 flex items-center justify-center shrink-0 border-2 border-white/60">
              <User size={26} className="text-haven-brown" />
            </div>
            <div>
              <h2 className="text-xl font-black text-haven-brown tracking-wide">{currentUser?.username ?? ''}</h2>
              <p className="text-[10px] text-haven-brown/60 mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full border border-haven-brown/40 inline-block" />
                {currentUser?.is_demo ? (lang === 'cn' ? '快速体验模式' : 'Quick Demo Mode') : (lang === 'cn' ? '资深守护者' : 'Senior Guardian')}
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mx-5 -mt-5 bg-white rounded-[2rem] shadow-lg p-5 flex justify-around border border-haven-tan/20 relative z-10">
            <div className="text-center">
              <p className="text-2xl font-serif text-haven-brown">{stats.totalSaved}</p>
              <p className="text-[8px] uppercase tracking-widest text-haven-moss mt-1">{lang === 'cn' ? '已节省' : 'Foods Saved'}</p>
            </div>
            <div className="w-px bg-haven-tan/40 self-stretch" />
            <div className="text-center">
              <p className="text-2xl font-serif text-haven-brown">{stats.eatenCount}</p>
              <p className="text-[8px] uppercase tracking-widest text-haven-moss mt-1">{lang === 'cn' ? '已食用' : 'Consumed'}</p>
            </div>
            <div className="w-px bg-haven-tan/40 self-stretch" />
            <div className="text-center">
              <p className="text-2xl font-serif text-haven-brown">{stats.wastedCount}</p>
              <p className="text-[8px] uppercase tracking-widest text-haven-moss mt-1">{lang === 'cn' ? '已浪费' : 'Wasted'}</p>
            </div>
          </div>

          {/* Today's Analysis */}
          <div className="mx-5 mt-4 bg-white rounded-[2rem] border border-haven-tan/20 shadow-sm p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-haven-brown flex items-center gap-2">
                <TrendingUp size={13} className="text-haven-sage" /> {lang === 'cn' ? '每日分析' : 'Daily Analysis'}
              </p>
              <button
                onClick={() => { playSound('modalOpen'); setShowDailyDetails(true); }}
                className="shrink-0 rounded-full bg-haven-cream px-4 py-2 text-[8px] font-black uppercase tracking-[0.18em] text-haven-brown shadow-sm border border-haven-tan/20 active:scale-95 transition-transform flex items-center gap-2"
              >
                {lang === 'cn' ? '查看详情' : 'View Details'}
                <ChevronRight size={13} strokeWidth={3} />
              </button>
            </div>
            {(() => {
              const todayEaten = stats.todayEaten ?? 0;
              const todayWasted = stats.todayWasted ?? 0;
              const total = todayEaten + todayWasted;
              const R = 52;
              const circ = 2 * Math.PI * R;
              const consumedRatio = total > 0 ? todayEaten / total : 0.67;
              const consumedLen = circ * consumedRatio;
              const wastedLen = circ * (1 - consumedRatio);
              const consumedPct = total > 0 ? Math.round(consumedRatio * 100) : 0;
              const wastedPct = total > 0 ? Math.round((1 - consumedRatio) * 100) : 0;
              return (
                <div className="flex flex-col items-center">
                  {/* Large donut */}
                  <div className="relative w-44 h-44 mb-3">
                    <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                      <circle cx="70" cy="70" r={R} fill="none" stroke="#F0EEE9" strokeWidth="22" />
                      {total === 0 ? (
                        <circle cx="70" cy="70" r={R} fill="none" stroke="#ddbea9" strokeWidth="22"
                          strokeDasharray={`${circ} 0`} />
                      ) : (
                        <>
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#D8E63C" strokeWidth="22"
                            strokeDasharray={`${consumedLen} ${circ - consumedLen}`} />
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#D6B4FC" strokeWidth="22"
                            strokeDasharray={`${wastedLen} ${circ - wastedLen}`}
                            strokeDashoffset={-consumedLen} />
                        </>
                      )}
                    </svg>
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-5 mb-4">
                    <span className="flex items-center gap-1.5 text-[10px] text-haven-moss font-black uppercase tracking-widest">
                      <span className="w-3 h-3 rounded-sm bg-haven-sage inline-block" />
                      {lang === 'cn' ? '已食用' : 'Consumed'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-haven-moss font-black uppercase tracking-widest">
                      <span className="w-3 h-3 rounded-sm bg-haven-violet inline-block" />
                      {lang === 'cn' ? '已浪费' : 'Wasted'}
                    </span>
                  </div>
                  {/* Stat cards */}
                  <div className="flex gap-3 w-full">
                    <div className="flex-1 bg-haven-cream rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Utensils size={12} className="text-haven-moss" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-haven-moss">{lang === 'cn' ? '已食用' : 'Consumed'}</span>
                      </div>
                      <p className="text-3xl font-black text-haven-brown">{consumedPct}%</p>
                    </div>
                    <div className="flex-1 bg-haven-cream rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Trash2 size={12} className="text-haven-moss" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-haven-moss">{lang === 'cn' ? '已浪费' : 'Wasted'}</span>
                      </div>
                      <p className="text-3xl font-black text-haven-brown">{wastedPct}%</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Medals of Honor */}
          <div className="mx-5 mt-4 bg-white rounded-[2rem] border border-haven-tan/20 shadow-sm p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-haven-moss mb-4">
              {lang === 'cn' ? '荣誉勋章' : 'Medals of Honor'}
            </p>
            <div className="grid grid-cols-4 gap-3">
              {(() => {
                return achievements.map(a => (
                  <div key={a.id} className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => { playSound('modalOpen'); setSelectedAchievement(a); }}>
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-haven-tan/30 flex items-center justify-center bg-haven-cream">
                      <img
                        src={`/assets/achievements/${a.icon}.png`}
                        alt={a.en}
                        className={`w-full h-full object-cover scale-125 ${a.unlocked ? '' : 'grayscale opacity-50'}`}
                      />
                    </div>
                    <span className="text-[8px] text-haven-moss tracking-wider text-center leading-tight">{lang === 'cn' ? a.cn : a.en}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Settings Rows — individual cards */}
          <div className="mx-5 mt-4 space-y-3">
            <button onClick={() => { playSound('modalOpen'); setLang(l => l === 'en' ? 'cn' : 'en'); }} className="w-full bg-white rounded-2xl border border-haven-tan/20 shadow-sm flex items-center gap-3 px-4 py-4 active:bg-haven-cream transition-colors">
              <div className="w-9 h-9 rounded-xl bg-haven-cream flex items-center justify-center shrink-0">
                <Settings size={16} className="text-haven-brown" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-haven-brown flex-1 text-left">{lang === 'cn' ? '语言设置' : 'Language Settings'}</span>
              <span className="text-[10px] font-black text-haven-sage uppercase tracking-widest">{lang === 'cn' ? '中文' : 'English'}</span>
            </button>
            <div className="w-full bg-white rounded-2xl border border-haven-tan/20 shadow-sm flex items-center gap-3 px-4 py-4 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-haven-cream flex items-center justify-center shrink-0">
                <Music size={16} className="text-haven-brown" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-black uppercase tracking-widest text-haven-brown text-left">{lang === 'cn' ? '背景音乐' : 'Background Music'}</span>
                  <span className="shrink-0 text-[10px] font-black text-haven-sage tabular-nums">{bgmVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={bgmVolume}
                  aria-label={lang === 'cn' ? '背景音乐音量' : 'Background music volume'}
                  onChange={e => handleBgmVolumeChange(parseInt(e.target.value, 10))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: '#D8E63C',
                    background: `linear-gradient(to right, #D8E63C 0%, #D8E63C ${(bgmVolume / 50) * 100}%, #EEEAE4 ${(bgmVolume / 50) * 100}%, #EEEAE4 100%)`,
                  }}
                />
              </div>
            </div>
            <button onClick={toggleSfx} aria-pressed={sfxOn} className="w-full bg-white rounded-2xl border border-haven-tan/20 shadow-sm flex items-center gap-3 px-4 py-4 active:bg-haven-cream transition-colors">
              <div className="w-9 h-9 rounded-xl bg-haven-cream flex items-center justify-center shrink-0">
                <Volume2 size={16} className="text-haven-brown" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-haven-brown flex-1 text-left">{lang === 'cn' ? '音效' : 'Sound Effects'}</span>
              <span className={`relative mr-2 h-6 w-11 shrink-0 rounded-full transition-colors ${sfxOn ? 'bg-haven-sage' : 'bg-haven-tan/40'}`}>
                <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${sfxOn ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
            </button>
            <button onClick={() => playSound('modalOpen')} className="w-full bg-white rounded-2xl border border-haven-tan/20 shadow-sm flex items-center gap-3 px-4 py-4 active:bg-haven-cream transition-colors">
              <div className="w-9 h-9 rounded-xl bg-haven-cream flex items-center justify-center shrink-0">
                <Bell size={16} className="text-haven-brown" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-haven-brown flex-1 text-left">{lang === 'cn' ? '通知' : 'Notifications'}</span>
            </button>
            <button onClick={() => playSound('modalOpen')} className="w-full bg-white rounded-2xl border border-haven-tan/20 shadow-sm flex items-center gap-3 px-4 py-4 active:bg-haven-cream transition-colors">
              <div className="w-9 h-9 rounded-xl bg-haven-cream flex items-center justify-center shrink-0">
                <HelpCircle size={16} className="text-haven-brown" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-haven-brown flex-1 text-left">{lang === 'cn' ? '帮助中心' : 'Help Center'}</span>
            </button>
          </div>

          {/* Sign Out — text link style */}
          <button onClick={handleSignOut} className="mx-auto mt-6 mb-10 flex items-center gap-2 text-haven-moss active:text-haven-brown transition-colors">
            <LogOut size={14} />
            <span className="text-[11px] font-black uppercase tracking-widest">{currentUser?.is_demo ? (lang === 'cn' ? '退出体验' : 'Exit Demo') : (lang === 'cn' ? '退出登录' : 'Sign Out')}</span>
          </button>
        </div>
      )}
      {showDailyDetails && (() => {
        const todayEaten = stats.todayEaten ?? 0;
        const todayWasted = stats.todayWasted ?? 0;
        const total = todayEaten + todayWasted;
        const consumedPct = total > 0 ? Math.round((todayEaten / total) * 100) : 0;
        const wastedPct = total > 0 ? 100 - consumedPct : 0;
        const categoryStats = normalizeDailyCategoryStats(stats.todayCategoryStats);
        const foodStats = normalizeDailyFoodStats(stats.todayFoodStats);
        const topUsed = DAILY_ANALYSIS_CATEGORIES.reduce((best, category) =>
          categoryStats[category.id].eaten > categoryStats[best.id].eaten ? category : best,
          DAILY_ANALYSIS_CATEGORIES[0]
        );
        const topWasted = DAILY_ANALYSIS_CATEGORIES.reduce((best, category) =>
          categoryStats[category.id].wasted > categoryStats[best.id].wasted ? category : best,
          DAILY_ANALYSIS_CATEGORIES[0]
        );
        const cardFor = (category: typeof DAILY_ANALYSIS_CATEGORIES[number], mode: 'used' | 'waste') => {
          const count = mode === 'used' ? categoryStats[category.id].eaten : categoryStats[category.id].wasted;
          const isWaste = mode === 'waste';
          const modeKey = isWaste ? 'wasted' : 'eaten';
          const topItems = foodStats[category.id][modeKey].slice(0, 3);
          return (
            <div className={`rounded-[2rem] border p-5 shadow-sm ${isWaste ? 'border-haven-violet/35 bg-haven-violet' : 'border-haven-sage/55 bg-haven-sage'}`}>
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-white">
                  <img src={`/assets/daily/${category.icon}`} alt="" className="h-full w-full scale-125 rounded-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-haven-brown">
                    <span className={`h-2 w-2 rounded-full ${isWaste ? 'bg-haven-violet' : 'bg-haven-sage'}`} />
                    {mode === 'used' ? (lang === 'cn' ? '最高消耗类别' : 'Top Used Category') : (lang === 'cn' ? '最高浪费类别' : 'Top Waste Category')}
                  </p>
                  <p className="mt-1 font-aahou text-[14pt] text-haven-brown leading-tight">
                    {lang === 'cn' ? (mode === 'used' ? category.usedLabelCn : category.wasteLabelCn) : (mode === 'used' ? category.usedLabelEn : category.wasteLabelEn)}
                  </p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-haven-brown/45">
                    {lang === 'cn' ? '今日数量' : 'Today'} x{count}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <span className="h-px flex-1 border-t border-dashed border-haven-tan/45" />
                <span className="text-[8px] font-black uppercase tracking-widest text-haven-brown">{lang === 'cn' ? '食物详情' : 'Item Details'}</span>
                <span className="h-px flex-1 border-t border-dashed border-haven-tan/45" />
              </div>
              {topItems.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {topItems.map(item => (
                    <div key={item.defId} className="min-h-[78px] rounded-2xl border border-haven-tan/15 bg-white px-2.5 py-3 text-center shadow-sm">
                      <img src={getFoodIconUrl(item.defId)} alt={item.name[lang]} className="mx-auto h-9 w-9 object-contain drop-shadow-sm" />
                      <p className="mt-2 truncate font-aahou text-[8pt] leading-tight text-haven-brown">{item.name[lang]}</p>
                      <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-haven-brown">x{item.count}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-haven-tan/25 bg-white/65 px-4 py-3 text-center text-[9px] font-black uppercase tracking-widest text-haven-brown/35">
                  {lang === 'cn' ? '暂无食物记录' : 'No item records yet'}
                </p>
              )}
            </div>
          );
        };
        return (
          <div className="fixed inset-0 z-[9999] bg-haven-cream overflow-y-auto scrollbar-hide animate-in slide-in-from-bottom-5 fade-in duration-200">
            <div className="min-h-full px-5 pt-8 pb-8">
              <button
                onClick={() => { playSound('modalClose'); setShowDailyDetails(false); }}
                className="absolute right-5 top-5 h-8 w-8 rounded-full bg-white flex items-center justify-center text-haven-brown shadow-sm"
                aria-label={lang === 'cn' ? '关闭' : 'Close'}
              >
                <X size={16} />
              </button>
              <div className="mx-auto mb-1 h-0.5 w-10 rounded-full bg-haven-tan/30" />
              <h2 className="mt-4 text-center font-aahou text-[18pt] uppercase tracking-wide text-haven-brown">
                {lang === 'cn' ? '今日食物详情' : "Today's Food Details"}
              </h2>
              <p className="text-center text-[8px] font-black uppercase tracking-widest text-haven-brown/45">
                {lang === 'cn' ? '基于今日食物记录' : "Based on today's food records"}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[1.5rem] bg-white px-4 py-3 text-center shadow-sm border border-haven-tan/15">
                  <p className="text-[8px] font-black uppercase tracking-widest text-haven-sage">{lang === 'cn' ? '已消耗' : 'Consumed'}</p>
                  <p className="font-aahou text-[26pt] leading-none text-haven-sage">{consumedPct}%</p>
                </div>
                <div className="rounded-[1.5rem] bg-white px-4 py-3 text-center shadow-sm border border-haven-tan/15">
                  <p className="text-[8px] font-black uppercase tracking-widest text-haven-violet">{lang === 'cn' ? '已浪费' : 'Wasted'}</p>
                  <p className="font-aahou text-[26pt] leading-none text-haven-violet">{wastedPct}%</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {cardFor(topUsed, 'used')}
                {cardFor(topWasted, 'waste')}
              </div>

              <div className="mt-5 rounded-[2rem] bg-white border border-haven-tan/15 p-5 shadow-sm">
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-haven-brown">
                  <span className="h-3 w-3 rounded-full bg-haven-violet" />
                  {lang === 'cn' ? '为什么食物被浪费？' : 'Why Was Food Wasted?'}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {WASTE_REASON_OPTIONS.map(reason => {
                    const selected = selectedWasteReason === reason.id;
                    return (
                      <button
                        key={reason.id}
                        onClick={() => setSelectedWasteReason(reason.id)}
                        className={`relative min-h-[82px] rounded-2xl border-2 px-3 text-center shadow-sm transition-all ${selected ? 'border-haven-violet bg-haven-violet/10' : 'border-haven-tan/20 bg-white'}`}
                      >
                        <span className="block font-aahou text-[13pt] leading-tight text-haven-brown">{lang === 'cn' ? reason.cn : reason.en}</span>
                        {selected && <span className="mt-2 block text-[9px] font-black uppercase tracking-widest text-haven-violet">{lang === 'cn' ? '最常见' : 'Most Common'}</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => { playSound('button'); setShowDailyDetails(false); }}
                  className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-haven-violet font-aahou text-[12pt] uppercase tracking-[0.16em] text-haven-brown shadow-lg active:scale-[0.98] transition-transform"
                >
                  {lang === 'cn' ? '确认' : 'Confirm'}
                </button>
              </div>

              <button
                onClick={() => { playSound('modalClose'); setShowDailyDetails(false); }}
                className="mx-auto mt-4 block px-6 py-2 text-[10px] font-black uppercase tracking-widest text-haven-brown/45 underline underline-offset-4 active:text-haven-brown transition-colors"
              >
                {lang === 'cn' ? '返回' : 'Close'}
              </button>
            </div>
          </div>
        );
      })()}
      {view === 'ALMANAC' && <Almanac unlockedIds={unlockedIds} customDefs={customDefs} lang={lang} initialSelectedId={almanacInitialId} onEntryOpen={() => reportTaskDone('almanac').catch(() => {})} onClose={() => { setAlmanacInitialId(undefined); setView('HOME'); }} />}
      {view === 'RECIPES' && <RecipeView recipes={recipes} lang={lang} style={recipeStyle} onBack={() => { setView('HOME'); setShowStylePicker(true); }} onDeleteRecipe={handleDeleteRecipe} />}
      {view === 'SCAN' && <Scanner lang={lang} onScan={handleScan} onCancel={() => setView('HOME')} />}
      {view === 'CLASSIFY' && <ClassificationView pendingItems={pendingItems} lang={lang} onComplete={finalizeItems} onCancel={cancelClassification} allDefs={ALL_DEFINITIONS} />}


      {/* Achievement Detail Popup */}
      {selectedAchievement && (
        <div className="absolute inset-0 z-[9999] bg-haven-brown/40 flex items-center justify-center px-8 animate-in fade-in" onClick={() => { playSound('modalClose'); setSelectedAchievement(null); }}>
          <div className="bg-haven-cream rounded-[2.5rem] p-8 shadow-2xl w-full max-w-xs flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className={`w-24 h-24 rounded-full overflow-hidden border-2 border-haven-tan/30 ${selectedAchievement.unlocked ? '' : 'grayscale opacity-50'}`}>
              <img src={`/assets/achievements/${selectedAchievement.icon}.png`} alt={selectedAchievement.en} className="w-full h-full object-cover scale-125" />
            </div>
            <p className="font-aahou text-[11pt] text-haven-brown uppercase tracking-widest text-center">{lang === 'cn' ? selectedAchievement.cn : selectedAchievement.en}</p>
            <p className="text-[11px] text-haven-brown/70 text-center leading-relaxed">{lang === 'cn' ? selectedAchievement.descCn : selectedAchievement.descEn}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-haven-moss">{selectedAchievement.unlocked ? (lang === 'cn' ? '已解锁' : 'Unlocked') : (lang === 'cn' ? '未解锁' : 'Locked')}</p>
          </div>
        </div>
      )}

      {/* Scan Type Picker */}
      {showScanPicker && (
        <div className="absolute inset-0 z-[9999] bg-haven-brown/40 flex items-end pb-12 px-6 animate-in fade-in" onClick={() => { playSound('modalClose'); setShowScanPicker(false); }}>
          <div className="w-full bg-haven-cream rounded-[2.5rem] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <Plus size={28} className="text-haven-brown mx-auto" strokeWidth={3} />
              <h3 className="font-aahou text-[11pt] text-haven-brown mt-2 uppercase tracking-widest">
                {lang === 'cn' ? '添加食材' : 'ADD ITEM'}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { playSound('button'); setScanMode('food'); setShowScanPicker(false); setView('SCAN'); }}
                className="flex flex-col items-center gap-3 bg-white rounded-2xl p-6 shadow-sm border border-haven-brown/5 active:scale-95 transition-all"
              >
                <Camera size={32} className="text-haven-brown" />
                <span className="font-aahou text-[9pt] text-haven-brown uppercase tracking-widest">
                  {lang === 'cn' ? '拍食材' : 'FOOD'}
                </span>
              </button>
              <button
                onClick={() => { playSound('button'); setScanMode('receipt'); setShowScanPicker(false); setView('SCAN'); }}
                className="flex flex-col items-center gap-3 bg-white rounded-2xl p-6 shadow-sm border border-haven-brown/5 active:scale-95 transition-all"
              >
                <Receipt size={32} className="text-haven-brown" />
                <span className="font-aahou text-[9pt] text-haven-brown uppercase tracking-widest">
                  {lang === 'cn' ? '拍小票' : 'RECEIPT'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showDemoWelcome && (
        <div className="absolute inset-0 z-[10000] flex items-end bg-haven-brown/35 px-5 pb-7 animate-in fade-in" onClick={() => setShowDemoWelcome(false)}>
          <div className="relative w-full overflow-hidden rounded-[2.5rem] bg-[#FBFAF7] px-6 pb-6 pt-7 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="absolute -right-1 -top-2 h-32 w-32 rounded-bl-[3rem] bg-haven-violet/55" aria-hidden="true" />
            <img src="/assets/cat/happy.png" alt="" className="absolute right-4 top-4 h-24 w-24 object-contain" aria-hidden="true" />

            <div className="relative max-w-[220px]">
              <h2 className="font-aahou text-[23pt] leading-[1.05] text-haven-brown">Your fridge<br />is ready.</h2>
              <p className="mt-3 text-[14px] font-semibold leading-relaxed text-haven-brown/65">Six sample foods are waiting inside.</p>
            </div>

            <div className="relative mt-6 flex items-center justify-between rounded-[1.7rem] bg-haven-cream px-4 py-3.5">
              {['tomato', 'banana', 'egg', 'spinach', 'broccoli', 'salmon'].map(foodId => (
                <div key={foodId} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                  <img src={getFoodIconUrl(foodId)} alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
                </div>
              ))}
            </div>

            <button onClick={() => { playSound('button'); setShowDemoWelcome(false); }} className="relative mt-5 flex h-14 w-full items-center justify-center rounded-full bg-haven-sage font-aahou text-[13pt] uppercase tracking-[0.14em] text-haven-brown shadow-md active:scale-[0.98] transition-transform">Open Fridge</button>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
