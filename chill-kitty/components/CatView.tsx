import React, { useState, useEffect, useRef } from 'react';
import { Language, AppStats } from '../types';
import { CatData, DailyTask, loadDailyTasks, checkTaskDone, reportTaskDone, claimTask, checkinCat, OutfitItem, reportMoodAction } from '../services/api';
import { getSoundDurationMs, playSound, unlockAudio } from '../utils/sound';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Star, Gift, X, Heart, TrendingUp } from 'lucide-react';

interface CatViewProps {
  lang: Language;
  stats: AppStats;
  catData: CatData;
  setCatData: React.Dispatch<React.SetStateAction<CatData>>;
  onNavigate: (view: string) => void;
  todayStr: string;
  outfitItems: OutfitItem[];
  initialDailyTasks?: DailyTask[];
}

const XP_THRESHOLDS = [30, 50, 70, 90];
const MAX_LEVEL = 5;
const MAX_LEVEL_XP = XP_THRESHOLDS[MAX_LEVEL - 2] ?? XP_THRESHOLDS[XP_THRESHOLDS.length - 1];

type MoodZone = 'happy' | 'normal' | 'sad';

function getMoodZone(mood: number = 10): MoodZone {
  if (mood >= 15) return 'happy';
  if (mood <= 5) return 'sad';
  return 'normal';
}

function getOutfitStorageKey(): string {
  try {
    const raw = sessionStorage.getItem('chill-kitty-user') || localStorage.getItem('chill-kitty-user');
    const userId = raw ? JSON.parse(raw).user_id : 'anonymous';
    return `chill-kitty-outfit:${userId || 'anonymous'}`;
  } catch {
    return 'chill-kitty-outfit:anonymous';
  }
}

function getOutfitStorage(): Storage {
  try {
    const raw = sessionStorage.getItem('chill-kitty-user');
    return raw && JSON.parse(raw).is_demo ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}

export const CatView: React.FC<CatViewProps> = ({ lang, stats, catData, setCatData, onNavigate, todayStr, outfitItems, initialDailyTasks = [] }) => {
  const t = (en: string, cn: string) => lang === 'cn' ? cn : en;
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  const [checkinBounce, setCheckinBounce] = useState(false);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>(initialDailyTasks);
  const [ready, setReady] = useState(false);
  // normal/happy 两种状态
  const [catState, setCatState] = useState<'normal' | 'happy'>('normal');
  const prevLevel = useRef(catData.level);
  const prevMoodZone = useRef<MoodZone>(getMoodZone(catData.mood));
  const moodZoneReady = useRef(false);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimingTasksRef = useRef<Set<string>>(new Set());
  const failedClaimTasksRef = useRef<Set<string>>(new Set());

  // WebP animation: normal.webp loops automatically, happy.webp is static
  const catImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    return () => {
      if (happyTimer.current) clearTimeout(happyTimer.current);
    };
  }, []);

  const handleCatClick = () => {
    unlockAudio();
    playSound('catNormal');
    if (happyTimer.current) clearTimeout(happyTimer.current);
    setCatState('happy');
    // Restore to the mood-driven idle image when the normal meow finishes.
    happyTimer.current = setTimeout(() => {
      // If mood is Good (≥22), catState 'normal' still shows good.webp via the img src logic — so just reset state
      setCatState('normal');
    }, getSoundDurationMs('catNormal', 900));
    // Report 'play' task as done
    reportTaskDone('play').then(() => {
      setDailyTasks(prev => prev.map(t => (t.action || t.id) === 'play' ? { ...t, done: true } : t));
    }).catch(() => {});
    // Mood: +1 first cat interaction of the day
    reportMoodAction('play').then(r => {
      setCatData(prev => ({
        ...prev,
        mood: r.mood,
        ...(r.mood_play_gained !== undefined && { mood_play_gained: r.mood_play_gained }),
      }));
    }).catch(() => {});
  };

  useEffect(() => {
    if (catData.level > prevLevel.current) {
      prevLevel.current = catData.level;
      playSound('levelUp');
      setLevelUpFlash(true);
      setTimeout(() => setLevelUpFlash(false), 1200);
    }
  }, [catData.level]);

  useEffect(() => {
    const nextZone = getMoodZone(catData.mood);
    if (!moodZoneReady.current) {
      moodZoneReady.current = true;
      prevMoodZone.current = nextZone;
      return;
    }
    if (nextZone !== prevMoodZone.current) {
      if (nextZone === 'happy') playSound('catHappy');
      if (nextZone === 'sad') playSound('catSad');
      prevMoodZone.current = nextZone;
    }
  }, [catData.mood]);

  // Load today's 3 daily tasks from the backend on mount
  useEffect(() => {
    loadDailyTasks().then(setDailyTasks);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialDailyTasks.length > 0) setDailyTasks(initialDailyTasks);
  }, [initialDailyTasks]);

  // Auto check-in on mount if not already checked in today
  const autoCheckinTriggered = useRef(false);
  useEffect(() => {
    if (autoCheckinTriggered.current) return;
    if (!todayStr) return;
    if (catData.last_login_date === undefined && catData.logged_in_today === undefined && catData.already_logged_in_today === undefined) return;
    if (catData.last_checkin === todayStr) return;
    autoCheckinTriggered.current = true;
    handleCheckin();
  }, [todayStr, catData.last_checkin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every time the task panel opens: show existing data immediately, silently refresh in background.
  useEffect(() => {
    if (!tasksExpanded) return;
    let cancelled = false;

    // Background refresh — no await, existing state already visible
    loadDailyTasks().then(fresh => {
      if (!cancelled) setDailyTasks(fresh);
    }).catch(() => {});

    const interval = setInterval(() => {
      loadDailyTasks().then(fresh => {
        if (!cancelled) setDailyTasks(fresh);
      }).catch(() => {});
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tasksExpanded]);

  // "去完成" — navigate to task target
  const handleGoComplete = (task: DailyTask) => {
    const taskAction = task.action || task.id;
    // For backend-detected tasks that require leaving the view (consume/handle_expiring/scan/unlock/recipe),
    // schedule a one-shot check 4s later so the user doesn't have to re-open the dropdown
    const deferredCheck = ['consume', 'handle_expiring', 'scan', 'unlock', 'recipe'];
    if (deferredCheck.includes(taskAction)) {
      setTimeout(() => {
        checkTaskDone(taskAction).then(done => {
          if (done) setDailyTasks(prev => prev.map(t => (t.action || t.id) === taskAction ? { ...t, done: true } : t));
        });
      }, 4000);
    }
    setTasksExpanded(false);
    if (task.nav === 'CAT') {
      // Stay on CAT view — user completes the task themselves (e.g. checkin, play)
    } else {
      onNavigate(task.nav);
    }
  };

  const handleClaimXp = (task: DailyTask) => {
    if (task.claimed || claimingTasksRef.current.has(task.id)) return;
    playSound('taskComplete');
    claimingTasksRef.current.add(task.id);
    // Optimistically update UI immediately
    setDailyTasks(prev => prev.map(t => t.id === task.id ? { ...t, claimed: true } : t));

    // Fire and forget — sync with backend in background
    claimTask(task.id).then(result => {
      if (result.cat) {
        // Backend returned authoritative state — reconcile
        setCatData(result.cat);
      }
      if (result.already_claimed) {
        setDailyTasks(prev => prev.map(t => t.id === task.id ? { ...t, claimed: true } : t));
      }
      if (result.not_done) {
        setDailyTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: false, claimed: false } : t));
      }
      claimingTasksRef.current.delete(task.id);
    }).catch(() => {
      // Network error — revert
      setDailyTasks(prev => prev.map(t => t.id === task.id ? { ...t, claimed: false } : t));
      failedClaimTasksRef.current.add(task.id);
      claimingTasksRef.current.delete(task.id);
    });
  };

  useEffect(() => {
    dailyTasks.forEach(task => {
      if (task.done && !task.claimed && !failedClaimTasksRef.current.has(task.id)) handleClaimXp(task);
    });
  }, [dailyTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayStr;
  const alreadyCheckedIn = catData.last_checkin === today;

  // Current weekday index: 0=Mon, 1=Tue, ..., 6=Sun
  // Parse from the authoritative todayStr prop (synced with backend Python clock)
  const todayWeekday = (() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return (date.getDay() + 6) % 7; // JS getDay(): Sun=0 → remap to Mon=0
  })();

  const weeklyCheckins = catData.weekly_checkins || [false, false, false, false, false, false, false];

  const gainXp = (base: CatData, amount: number): CatData => {
    let newXp = base.xp + amount;
    let newLevel = base.level;
    while (newLevel < MAX_LEVEL) {
      const needed = XP_THRESHOLDS[newLevel - 1];
      if (newXp >= needed) { newXp -= needed; newLevel += 1; }
      else break;
    }
    if (newLevel >= MAX_LEVEL) {
      newLevel = MAX_LEVEL;
      newXp = Math.min(newXp, MAX_LEVEL_XP);
    }
    return { ...base, xp: newXp, level: newLevel };
  };

  const [showOutfitPanel, setShowOutfitPanel] = useState(false);
  const [outfitTab, setOutfitTab] = useState<'All' | 'Hats' | 'Glasses' | 'Accessories'>('All');
  const [selectedOutfit, setSelectedOutfit] = useState<string>(() => getOutfitStorage().getItem(getOutfitStorageKey()) || 'none');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const outfitPanelRef = useRef<HTMLDivElement>(null);
  const visibleOutfitItems = outfitItems.filter(item => outfitTab === 'All' || item.category === outfitTab);

  useEffect(() => {
    const selected = outfitItems.find(item => item.id === selectedOutfit);
    const requiredLevel = selected?.unlockLevel ?? 1;
    if (selectedOutfit !== 'none' && (!selected || catData.level < requiredLevel)) {
      setSelectedOutfit('none');
    }
  }, [catData.level, outfitItems, selectedOutfit]);

  useEffect(() => {
    getOutfitStorage().setItem(getOutfitStorageKey(), selectedOutfit);
  }, [selectedOutfit]);

  // Close outfit: reset scroll and remove panel in the same frame — no delay to avoid blank gap
  const handleCloseOutfit = () => {
    playSound('modalClose');
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
    setShowOutfitPanel(false);
  };

  // Auto-scroll to bottom when outfit panel opens so it appears in view
  useEffect(() => {
    if (showOutfitPanel && scrollAreaRef.current) {
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 50);
    }
  }, [showOutfitPanel]);

  // Suppress transition animations on initial mount
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const completedCount = dailyTasks.filter(t => t.claimed).length;
  const displayedXp = catData.level >= MAX_LEVEL ? Math.min(catData.xp, MAX_LEVEL_XP) : catData.xp;
  const displayedXpCap = catData.level >= MAX_LEVEL
    ? MAX_LEVEL_XP
    : (XP_THRESHOLDS[Math.min(catData.level - 1, XP_THRESHOLDS.length - 1)] ?? MAX_LEVEL_XP);
  const xpPercent = Math.max(Math.min(
    (displayedXp / displayedXpCap) * 100, 100
  ), 0);
  const moodPercent = Math.max(Math.min((catData.mood / 20) * 100, 100), 0);
  const moodColor = '#D8E63C';

  const handleCheckin = async () => {
    if (alreadyCheckedIn) return;
    const shouldPlayCheckinSound = !catData.already_logged_in_today;
    try {
      // Call dedicated backend endpoint — atomic, persistent, cannot be undone
      const updated = await checkinCat();
      if (updated.checkin_performed && shouldPlayCheckinSound) playSound('checkin');
      setCatData({
        ...updated,
        already_logged_in_today: catData.already_logged_in_today,
      });
    } catch {
      // Backend unreachable: optimistic local update as fallback
      if (shouldPlayCheckinSound) playSound('checkin');
      const newCheckins = [...weeklyCheckins];
      newCheckins[todayWeekday] = true;
      const newStreak = newCheckins.filter(Boolean).length;
      setCatData(gainXp(
        { ...catData, streak: newStreak, last_checkin: today, weekly_checkins: newCheckins },
        20,
      ));
    }
    setCheckinBounce(true);
    setTimeout(() => setCheckinBounce(false), 800);
    // Report 'checkin' task as done
    reportTaskDone('checkin').then(() => {
      setDailyTasks(prev => prev.map(t => (t.action || t.id) === 'checkin' ? { ...t, done: true } : t));
    }).catch(() => {});
  };

  const WEEKDAY_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div
      ref={scrollAreaRef}
      className={`h-full bg-haven-cream overflow-y-auto scrollbar-hide ${ready ? '' : '[&_*]:!transition-none'}`}
    >
      <div className="min-h-full flex flex-col">

      {/* Level Bar */}
      <div
        className={[
          'flex-shrink-0 mx-4 mt-4 p-2 rounded-2xl border-2 flex items-center gap-3 shadow-sm transition-all duration-700',
          levelUpFlash
            ? 'bg-haven-sage border-haven-brown/40 scale-[1.02]'
            : 'bg-haven-sage/90 border-haven-brown/10',
        ].join(' ')}
      >
        <div className="w-10 h-10 bg-haven-violet/60 rounded-full flex items-center justify-center shrink-0 border-2 border-haven-brown/10">
          {levelUpFlash
            ? <TrendingUp size={18} className="text-haven-brown" />
            : <Heart size={18} className="text-haven-brown" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-end mb-1">
            <span
              className={[
                'font-aahou text-haven-brown text-[9pt] leading-none transition-all duration-300',
                levelUpFlash ? 'scale-110' : '',
              ].join(' ')}
            >
              LV{catData.level}
            </span>
            <span className="font-aahou text-[9pt] text-haven-brown/60 uppercase tracking-widest">
              {displayedXp}/{displayedXpCap} XP
            </span>
          </div>
          <div className="h-3 bg-haven-brown/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all duration-700"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Daily Tasks */}
      <div className="flex-shrink-0 mx-4 mt-3 relative">
        <button
          onClick={() => { playSound(tasksExpanded ? 'modalClose' : 'modalOpen'); setTasksExpanded(e => !e); }}
          className="w-full bg-haven-violet py-2 px-5 flex items-center justify-between shadow-sm rounded-2xl transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="font-aahou text-[11pt] text-haven-brown uppercase tracking-[0.2em] whitespace-nowrap">
              {t('DAILY TASKS', '\u6bcf\u65e5\u4efb\u52a1')}
            </span>
            <span className="font-aahou bg-haven-brown/20 text-haven-brown text-[9pt] px-2.5 py-0.5 rounded-full">
              {completedCount}/{dailyTasks.length || 3}
            </span>
          </div>
          {tasksExpanded
            ? <ChevronUp size={18} className="text-haven-brown/60" />
            : <ChevronDown size={18} className="text-haven-brown/60" />}
        </button>

        {tasksExpanded && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-haven-sage/95 rounded-2xl shadow-xl overflow-hidden p-2 space-y-1.5">
            {dailyTasks.length === 0 ? (
              [0, 1, 2].map(i => (
                <div key={i} className="h-12 bg-white/50 rounded-xl animate-pulse" />
              ))
            ) : dailyTasks.map(task => {
              const isClaimed = task.claimed;
              const isDone = task.done;
              return (
                <div
                  key={task.id}
                  className={[
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left gap-2',
                    isClaimed
                      ? 'bg-haven-tan/20 opacity-60'
                      : isDone
                        ? 'bg-green-50 shadow-sm border border-green-200/50'
                        : 'bg-white shadow-sm',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isClaimed
                      ? <CheckCircle2 size={16} className="text-green-500 shrink-0" fill="currentColor" />
                      : isDone
                        ? <Gift size={16} className="text-green-500 shrink-0" />
                        : <Circle size={16} className="text-haven-brown/25 shrink-0" />}
                    <span
                      className={[
                        'text-[11px] font-bold text-haven-brown truncate',
                        isClaimed ? 'line-through opacity-50' : '',
                      ].join(' ')}
                    >
                      {lang === 'cn' ? task.name_cn : task.name_en}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[8px] font-black text-haven-brown/60 bg-haven-sage/50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      +{task.xp} XP
                    </span>
                    {isClaimed ? (
                      <span className="inline-flex items-center justify-center w-14 text-[9px] font-bold text-haven-brown/30 py-1 rounded-lg whitespace-nowrap">
                        {lang === 'cn' ? '已领取' : 'CLAIMED'}
                      </span>
                    ) : isDone ? (
                      <span className="inline-flex items-center justify-center w-14 text-[9px] font-bold text-green-600 bg-green-50 py-1 rounded-lg whitespace-nowrap">
                        {lang === 'cn' ? '领取中' : 'AUTO'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleGoComplete(task)}
                        className="inline-flex items-center justify-center w-14 text-[9px] font-bold text-haven-brown bg-haven-violet hover:bg-haven-violet/80 py-1 rounded-lg transition-all active:scale-95 whitespace-nowrap"
                      >
                        {lang === 'cn' ? '去完成' : 'GO'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weekly Check-in */}
      <div className="flex-shrink-0 bg-white mx-4 mt-3 p-3 rounded-[1.5rem] shadow-sm border border-haven-tan/10">
        <div className="flex justify-between items-center mb-3">
          <span className="font-aahou text-[11pt] text-haven-brown uppercase tracking-[0.1em] whitespace-nowrap">
            {t('WEEKLY CHECK-IN', '本周打卡')}
          </span>
          <span className="text-[9px] font-bold text-haven-brown/30">
            {catData.streak}/7
          </span>
        </div>
        <div className="flex justify-between">
          {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
            const isChecked = weeklyCheckins[dayIdx];
            const isToday = dayIdx === todayWeekday;
            const isFuture = dayIdx > todayWeekday;
            const isTodayUnchecked = isToday && !alreadyCheckedIn;

            return (
              <div key={dayIdx} className="flex flex-col items-center gap-1">
                {isChecked ? (
                  (() => {
                    const de = catData.weekly_daily_eaten ?? [];
                    const dw = catData.weekly_daily_wasted ?? [];
                    const dayEaten = de[dayIdx] ?? 0;
                    const dayWasted = dw[dayIdx] ?? 0;
                    const dayTotal = dayEaten + dayWasted;
                    const R = 20, circ = 2 * Math.PI * R;
                    const eatLen = dayTotal > 0 ? circ * (dayEaten / dayTotal) : 0;
                    const todayEaten = stats.todayEaten ?? 0;
                    const todayWasted = stats.todayWasted ?? 0;
                    const showRing = isToday
                      ? (todayEaten + todayWasted > 0)
                      : dayTotal > 0;
                    // For today, use live stats instead of stored snapshot
                    const todayTotal = todayEaten + todayWasted;
                    const todayEatLen = todayTotal > 0 ? circ * (todayEaten / todayTotal) : 0;
                    const activeEatLen = isToday ? todayEatLen : eatLen;
                    const activeTotal = isToday ? todayTotal : dayTotal;
                    const activeWasteLen = activeTotal > 0 ? circ * ((isToday ? todayWasted : dayWasted) / activeTotal) : 0;
                    return (
                      <div className="relative w-9 h-9 flex items-center justify-center">
                        {showRing && (
                          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r={R} fill="none" stroke="#F0EEE9" strokeWidth="4" />
                            <circle cx="22" cy="22" r={R} fill="none" stroke="#D8E63C" strokeWidth="4"
                              strokeDasharray={`${activeEatLen} ${circ - activeEatLen}`} />
                            {activeWasteLen > 0 && (
                              <circle cx="22" cy="22" r={R} fill="none" stroke="#D6B4FC" strokeWidth="4"
                                strokeDasharray={`${activeWasteLen} ${circ - activeWasteLen}`}
                                strokeDashoffset={-activeEatLen} />
                            )}
                          </svg>
                        )}
                        <div
                          className={[
                            'w-9 h-9 bg-green-500 rounded-full flex items-center justify-center',
                            isToday && checkinBounce ? 'animate-bounce' : '',
                          ].join(' ')}
                        >
                          <Star size={18} className="text-white" fill="currentColor" />
                        </div>
                      </div>
                    );
                  })()
                ) : isTodayUnchecked ? (
                  <button
                    onClick={handleCheckin}
                    className="w-9 h-9 rounded-full border-2 border-dashed border-haven-brown/35 flex items-center justify-center hover:border-green-400 hover:bg-green-50 transition-all active:scale-90 animate-pulse"
                    title={t('Check in!', '点击签到！')}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="none"
                      stroke="#a0a0a0"
                      strokeWidth="2"
                      strokeDasharray="3 2"
                    >
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                    </svg>
                  </button>
                ) : isFuture ? (
                  <div className="w-9 h-9 rounded-full border-2 border-dashed border-haven-brown/15 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#d0d0d0" strokeWidth="2" strokeDasharray="3 2">
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full border-2 border-dashed border-haven-brown/15 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#d0d0d0" strokeWidth="2" strokeDasharray="3 2">
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                    </svg>
                  </div>
                )}
                <span className={[
                  'text-[8px] font-bold',
                  isToday ? 'text-haven-brown/70' : 'text-haven-brown/40',
                ].join(' ')}>
                  {lang === 'cn' ? WEEKDAY_CN[dayIdx] : WEEKDAY_EN[dayIdx]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable area: cat + outfit panel */}
      {/* Cat + OUTFIT/MOOD Panel */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden"
      >
        {/* Cat clickable area — WebP animation replaces canvas */}
        <div className="absolute top-0 bottom-0 left-0 right-20 cursor-pointer" onClick={handleCatClick}>
          <img
            ref={catImgRef}
            src={(() => {
              // Click interaction shows happy.webp regardless of mood
              if (catState === 'happy') return '/assets/cat/happy.webp';
              // Mood-based idle state
              const mood = catData.mood ?? 10;
              if (mood >= 15) return '/assets/cat/good.webp';
              if (mood <= 5) return '/assets/cat/sad.webp';
              return '/assets/cat/normal.webp';
            })()}
            alt="cat"
            className="h-[106%] object-contain absolute top-0 bottom-0 left-2 my-auto select-none pointer-events-none"
          />
          {/* Outfit overlay — same size/position as cat canvas; image itself positions the accessory */}
          {selectedOutfit !== 'none' && outfitItems.find(i => i.id === selectedOutfit && catData.level >= (i.unlockLevel ?? 1)) && (() => {
            const item = outfitItems.find(i => i.id === selectedOutfit)!;
            return (
              <img
                src={item.url}
                alt={item.id}
                className="h-[106%] object-contain absolute top-0 bottom-0 left-2 my-auto pointer-events-none select-none animate-cat-float"
              />
            );
          })()}
        </div>

        {/* OUTFIT + MOOD — vertically centered on right side */}
        <div className="absolute right-1 top-[62%] -translate-y-1/2 w-20 flex flex-col items-center gap-4 z-20">
          <button
            onClick={() => {
              if (showOutfitPanel) {
                handleCloseOutfit();
                return;
              }
              playSound('modalOpen');
              setShowOutfitPanel(true);
              reportTaskDone('outfit').then(() => {
                setDailyTasks(prev => prev.map(t => (t.action || t.id) === 'outfit' ? { ...t, done: true } : t));
              }).catch(() => {});
            }}
            className="flex flex-col items-center gap-0 active:scale-95 transition-transform"
          >
            <span className="font-aahou text-[9pt] text-haven-brown/80 uppercase tracking-widest whitespace-nowrap">
              {t('OUTFIT', '\u670d\u88c5')}
            </span>
            <img src="/assets/outfit/button.png" alt="outfit" className="w-[54px] h-[54px] object-contain" />
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-aahou text-[9pt] text-haven-brown/80 uppercase tracking-widest whitespace-nowrap">
              {t('MOOD', '\u5fc3\u60c5')}
            </span>
            {/* group wrapper outside overflow-hidden so tooltip is not clipped */}
            <div className="relative group">
              {/* bar track — overflow-hidden only here */}
              <div className="w-5 h-32 bg-haven-brown/10 rounded-full overflow-hidden flex flex-col justify-end">
                <div
                  className="w-full rounded-full transition-all duration-700"
                  style={{ height: `${moodPercent}%`, backgroundColor: moodColor }}
                />
              </div>
              {/* tooltip — positioned to the left of bar, visible on group hover */}
              <div className="absolute right-[calc(100%+10px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-[1000]">
                <div className="bg-haven-cream border border-haven-brown/15 rounded-2xl shadow-xl px-3.5 py-2.5 whitespace-nowrap">
                  <p className="font-aahou text-[9pt] text-haven-brown leading-snug">
                    {(catData.mood ?? 10) >= 15
                      ? (lang === 'cn' ? '😊 心情好' : '😊 Good')
                      : (catData.mood ?? 10) >= 6
                        ? (lang === 'cn' ? '😐 心情平' : '😐 Normal')
                        : (lang === 'cn' ? '😢 心情差' : '😢 Bad')}
                  </p>
                  <p className="font-aahou text-[8pt] text-haven-brown/40 mt-0.5 leading-none">
                    {catData.mood ?? 10} <span className="text-[7pt]">/ 20</span>
                  </p>
                  <p className="font-aahou text-[7.5pt] text-haven-brown/30 mt-1 leading-none border-t border-haven-brown/10 pt-1">
                    {lang === 'cn' ? '今日已获取' : 'Today gained'}{' '}
                    {(catData.mood_task_gained ?? 0) + (catData.mood_eat_gained ?? 0) + (catData.mood_play_gained ?? 0) + (catData.mood_clean_gained ?? 0)}
                    <span className="text-[7pt]"> / 8</span>
                  </p>
                  <p className="font-aahou text-[7.5pt] text-haven-brown/30 mt-1 leading-none">
                    {lang === 'cn' ? '今日已流失' : 'Today lost'}{' '}
                    {catData.mood_daily_lost ?? catData.mood_discard_lost ?? 0}
                    <span className="text-[7pt]"> / 8</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>{/* end cat+mood area */}
      </div>{/* end min-h-full flex wrapper */}

      {/* Outfit Bottom Extension Panel */}
      {showOutfitPanel && (
        <div ref={outfitPanelRef} className="flex-shrink-0 bg-white border-t border-haven-tan/20">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h3 className="font-aahou text-[14pt] text-haven-brown">
              Outfit
            </h3>
            <button
              onClick={handleCloseOutfit}
              className="w-7 h-7 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X size={18} className="text-haven-brown/60" />
            </button>
          </div>
          {/* Category Tabs */}
          <div className="flex gap-4 px-5 pb-3 border-b border-haven-brown/10">
            {(['All', 'Hats', 'Glasses', 'Accessories'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setOutfitTab(tab)}
                className={`pb-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  outfitTab === tab
                    ? 'text-haven-brown border-b-2 border-haven-brown'
                    : 'text-haven-brown/40'
                }`}
              >
                {lang === 'cn'
                  ? ({ All: '\u5168\u90e8', Hats: '\u5e3d\u5b50', Glasses: '\u773c\u955c', Accessories: '\u9970\u54c1' } as Record<string,string>)[tab]
                  : tab}
              </button>
            ))}
          </div>
          {/* Grid */}
          <div className="px-4 py-3">
            {visibleOutfitItems.length === 0 && outfitTab !== 'All' ? (
              <p className="text-center text-[10px] text-haven-brown/40 py-4 font-aahou">
                {t('No items yet', '\u6682\u65e0\u9053\u5177')}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2.5">
                {/* None option — always show */}
                {(outfitTab === 'All') && (
                <button
                  onClick={() => setSelectedOutfit('none')}
                  className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all active:scale-95 ${
                    selectedOutfit === 'none'
                      ? 'border-green-400 bg-green-50'
                      : 'border-haven-brown/10 bg-haven-cream/50'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
                  </svg>
                  <span className="text-[7px] font-bold text-haven-brown/50 mt-1">None</span>
                  {selectedOutfit === 'none' && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-400 rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-white text-[9px] font-black">{`\u2713`}</span>
                    </div>
                  )}
                </button>
                )}
                {/* Dynamic items from API */}
                {visibleOutfitItems.map(item => {
                  const isSelected = selectedOutfit === item.id;
                  const requiredLevel = item.unlockLevel ?? 1;
                  const isLocked = catData.level < requiredLevel;
                  return (
                    <button
                      key={item.id}
                      disabled={isLocked}
                      onClick={() => {
                        setSelectedOutfit(item.id);
                        reportTaskDone('outfit').catch(() => {});
                      }}
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all active:scale-95 ${
                        isLocked
                          ? 'border-haven-brown/5 bg-haven-cream/40 opacity-55'
                          : isSelected
                          ? 'border-green-400 bg-green-50'
                          : 'border-haven-brown/10 bg-haven-cream/50'
                      }`}
                    >
                      <div className="w-3/5 h-3/5 overflow-hidden rounded-sm">
                        <img
                          src={item.thumbnail ?? item.url}
                          alt={item.id}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <span className={`text-[7px] font-bold text-haven-brown/50 truncate max-w-full px-1 ${isLocked ? 'mt-0.5 mb-2' : 'mt-1'}`}>{item.id}</span>
                      {isLocked && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-black text-haven-brown/45 whitespace-nowrap">
                          LV{requiredLevel}
                        </span>
                      )}
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-400 rounded-full flex items-center justify-center shadow-sm">
                          <span className="text-white text-[9px] font-black">{`\u2713`}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
