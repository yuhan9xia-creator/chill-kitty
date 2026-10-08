
import React, { useState, useMemo, useEffect } from 'react';
import { StorageType, FoodItem, Language, FoodDef } from '../types';
import { ChevronDown, ChevronUp, Thermometer, Snowflake, House, Star, Zap, Hand, X } from 'lucide-react';
import { UI_STRINGS } from '../translations';
import { getFoodIconUrl } from '../utils/foodIcons';
import { playSound } from '../utils/sound';

interface ClassificationViewProps {
  pendingItems: Partial<FoodItem>[];
  onComplete: (placedItems: FoodItem[]) => void;
  onCancel: () => void;
  lang: Language;
  allDefs: Record<string, FoodDef>;
  onLangToggle?: () => void;
}

/** Vitality value → color class */
function healthColor(v: number): string {
  if (v >= 0.7) return 'text-emerald-600';
  if (v >= 0.4) return 'text-amber-600';
  return 'text-red-600';
}
function healthBg(v: number): string {
  if (v >= 0.7) return 'bg-emerald-500';
  if (v >= 0.4) return 'bg-amber-500';
  return 'bg-red-500';
}

export const ClassificationView: React.FC<ClassificationViewProps> = ({ pendingItems, onComplete, onCancel, lang, allDefs }) => {
  const [reviewItems, setReviewItems] = useState<Partial<FoodItem>[]>(pendingItems);
  const [assignments, setAssignments] = useState<Record<string, StorageType>>({});
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [isReviewing, setIsReviewing] = useState(pendingItems.length > 0);
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});
  const [undoToast, setUndoToast] = useState<{ item: Partial<FoodItem>; index: number; vitality: number } | null>(null);
  const [quantityMap, setQuantityMap] = useState<Record<string, string>>({});
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [inputWarning, setInputWarning] = useState<string | null>(null);
  // Vitality local state — initialized from AI results
  const [healthMap, setHealthMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    pendingItems.forEach(item => {
      if (item.instanceId) m[item.instanceId] = item.vitality ?? 1.0;
    });
    return m;
  });

  useEffect(() => {
    setReviewItems(pendingItems);
    setAssignments({});
    setActiveItemIndex(0);
    setIsReviewing(pendingItems.length > 0);
    setRemovingIds({});
    setUndoToast(null);
    const nextHealth: Record<string, number> = {};
    const nextQuantity: Record<string, string> = {};
    const nextAmount: Record<string, string> = {};
    pendingItems.forEach(item => {
      if (item.instanceId) {
        nextHealth[item.instanceId] = item.vitality ?? 1.0;
        nextQuantity[item.instanceId] = String(Math.max(1, Math.round(item.quantity ?? 1)));
        nextAmount[item.instanceId] = String(Math.max(0, Math.min(100, Math.round(item.amountPercent ?? 100))));
      }
    });
    setHealthMap(nextHealth);
    setQuantityMap(nextQuantity);
    setAmountMap(nextAmount);
  }, [pendingItems]);

  const t = (key: string) => UI_STRINGS[key]?.[lang] || key;

  const zones = [
    { type: StorageType.ROOM_TEMP, icon: House, label: t('pantryGarden'), cardColor: 'bg-[#DBE63C] border-[#c5d63a]/60 text-[#5F4D41]', badgeColor: 'bg-[#DBE63C] border-[#c5d63a]/60 text-[#5F4D41]' },
    { type: StorageType.FRIDGE, icon: Thermometer, label: t('fridgeSanctuary'), cardColor: 'bg-white border-stone-100 text-[#5F4D41]', badgeColor: 'bg-white border-stone-100 text-[#5F4D41]' },
    { type: StorageType.FREEZER, icon: Snowflake, label: t('iceIsland'), cardColor: 'bg-[#D3DDE7] border-[#b8c9d6]/60 text-[#5F4D41]', badgeColor: 'bg-[#D3DDE7] border-[#b8c9d6]/60 text-[#5F4D41]' },
  ];

  const currentItem = reviewItems[activeItemIndex];
  const isFinished = reviewItems.length > 0 && Object.keys(assignments).length === reviewItems.length;

  const recommendedStorage = useMemo(() => {
    if (!currentItem || !currentItem.defId) return null;
    const def = allDefs[currentItem.defId];
    return def ? def.bestStorage : null;
  }, [currentItem, allDefs]);

  const assign = (type: StorageType) => {
    if (!currentItem || isFinished) return;
    setAssignments(prev => ({ ...prev, [currentItem.instanceId!]: type }));
    if (activeItemIndex < reviewItems.length - 1) {
      setActiveItemIndex(prev => prev + 1);
    }
  };

  const getDispersedCoords = (type: StorageType, index: number) => {
    let baseY = 50;
    if (type === StorageType.ROOM_TEMP) baseY = 25;
    else if (type === StorageType.FRIDGE) baseY = 50;
    else if (type === StorageType.FREEZER) baseY = 75;

    const angle = index * (Math.PI * 0.4); 
    const radius = 5 + (index * 2); 
    
    return {
      x: 50 + Math.cos(angle) * radius + (Math.random() - 0.5) * 5,
      y: baseY + Math.sin(angle) * (radius * 0.5) + (Math.random() - 0.5) * 5
    };
  };

  const getQuantityKind = (item: Partial<FoodItem>) =>
    item.quantityKind || (item.defId ? allDefs[item.defId]?.quantityKind : undefined) || 'countable';

  const getDraftValue = (item: Partial<FoodItem>) => {
    const fallback = getQuantityKind(item) === 'countable'
      ? String(Math.max(1, Math.round(item.quantity ?? 1)))
      : String(Math.max(0, Math.min(100, Math.round(item.amountPercent ?? 100))));
    if (!item.instanceId) return fallback;
    return getQuantityKind(item) === 'countable'
      ? (quantityMap[item.instanceId] ?? fallback)
      : (amountMap[item.instanceId] ?? fallback);
  };

  const setDraftValue = (item: Partial<FoodItem>, rawValue: string) => {
    if (!item.instanceId) return;
    const kind = getQuantityKind(item);
    const digits = rawValue.replace(/[^\d]/g, '');
    if (digits === '') {
      if (kind === 'countable') setQuantityMap(prev => ({ ...prev, [item.instanceId!]: '' }));
      else setAmountMap(prev => ({ ...prev, [item.instanceId!]: '' }));
      return;
    }
    const parsed = Number.parseInt(digits, 10);
    const next = kind === 'countable'
      ? Math.max(1, Math.min(99, parsed))
      : Math.max(0, Math.min(100, parsed));
    if (kind === 'countable') setQuantityMap(prev => ({ ...prev, [item.instanceId!]: String(next) }));
    else setAmountMap(prev => ({ ...prev, [item.instanceId!]: String(next) }));
  };

  const stepDraftValue = (item: Partial<FoodItem>, delta: number) => {
    const kind = getQuantityKind(item);
    const current = Number.parseInt(getDraftValue(item), 10);
    const base = Number.isFinite(current) ? current : 0;
    const next = kind === 'countable'
      ? Math.max(1, Math.min(99, base + delta))
      : Math.max(0, Math.min(100, base + delta));
    setDraftValue(item, String(next));
  };

  const showInputWarning = () => {
    playSound('error');
    setInputWarning(lang === 'cn' ? '请输入数量或百分比' : 'Please enter a quantity or percentage.');
    window.setTimeout(() => setInputWarning(null), 1800);
  };

  const validateReviewInputs = () => {
    const hasEmptyInput = reviewItems.some(item => getDraftValue(item).trim() === '');
    if (hasEmptyInput) {
      showInputWarning();
      return false;
    }
    return true;
  };

  const buildFinalItems = (sourceItems: Partial<FoodItem>[], resolver: (item: Partial<FoodItem>) => StorageType | undefined) => {
    const finalItems: FoodItem[] = [];
    sourceItems.forEach((i) => {
      const kind = getQuantityKind(i);
      const parsedQuantity = Number.parseInt(quantityMap[i.instanceId!] ?? String(i.quantity ?? 1), 10);
      const parsedAmount = Number.parseInt(amountMap[i.instanceId!] ?? String(i.amountPercent ?? 100), 10);
      const count = kind === 'countable' ? Math.max(1, Math.round(Number.isFinite(parsedQuantity) ? parsedQuantity : 1)) : 1;
      const ids = i.backendEntryIds && i.backendEntryIds.length > 0 ? i.backendEntryIds : (i.instanceId ? [i.instanceId] : []);
      const assignedType = resolver(i) || allDefs[i.defId!]?.bestStorage || StorageType.FRIDGE;
      for (let copyIndex = 0; copyIndex < count; copyIndex++) {
        const coords = getDispersedCoords(assignedType, finalItems.length);
        finalItems.push({
          ...i,
          instanceId: ids[copyIndex] || (copyIndex === 0 ? i.instanceId! : `${i.instanceId}-${copyIndex}`),
          storage: assignedType,
          vitality: healthMap[i.instanceId!] ?? i.vitality ?? 1.0,
          quantityKind: kind,
          quantity: 1,
          amountPercent: kind === 'uncountable' ? Math.max(0, Math.min(100, Math.round(Number.isFinite(parsedAmount) ? parsedAmount : 100))) : 100,
          backendEntryIds: ids,
          x: coords.x,
          y: coords.y
        } as FoodItem);
      }
    });
    return finalItems;
  };

  const getBestStorage = (item: Partial<FoodItem>): StorageType => {
    return allDefs[item.defId!]?.bestStorage || StorageType.FRIDGE;
  };

  const handleAutoAssignAll = () => {
    if (!validateReviewInputs()) return;
    playSound('modalOpen');
    const nextAssignments: Record<string, StorageType> = {};
    reviewItems.forEach((item) => {
      if (item.instanceId) nextAssignments[item.instanceId] = getBestStorage(item);
    });
    setAssignments(nextAssignments);
    setActiveItemIndex(Math.max(0, reviewItems.length - 1));
    setIsReviewing(false);
  };

  const handleFinalize = () => {
    playSound('button');
    playSound('addFood');
    const finalItems = buildFinalItems(reviewItems, (i) => assignments[i.instanceId!]);
    onComplete(finalItems);
  };

  const removeReviewItem = (item: Partial<FoodItem>, index: number) => {
    if (!item.instanceId || removingIds[item.instanceId]) return;
    playSound('modalClose');
    const vitality = healthMap[item.instanceId] ?? item.vitality ?? 1.0;
    setRemovingIds(prev => ({ ...prev, [item.instanceId!]: true }));
    window.setTimeout(() => {
      setReviewItems(prev => prev.filter(i => i.instanceId !== item.instanceId));
      setUndoToast({ item, index, vitality });
      setRemovingIds(prev => {
        const next = { ...prev };
        delete next[item.instanceId!];
        return next;
      });
    }, 240);
  };

  const undoRemove = () => {
    if (!undoToast || !undoToast.item.instanceId) return;
    playSound('modalOpen');
    setReviewItems(prev => {
      if (prev.some(item => item.instanceId === undoToast.item.instanceId)) return prev;
      const next = [...prev];
      next.splice(Math.min(undoToast.index, next.length), 0, undoToast.item);
      return next;
    });
    setHealthMap(prev => ({ ...prev, [undoToast.item.instanceId!]: undoToast.vitality }));
    setQuantityMap(prev => ({ ...prev, [undoToast.item.instanceId!]: String(Math.max(1, Math.round(undoToast.item.quantity ?? 1))) }));
    setAmountMap(prev => ({ ...prev, [undoToast.item.instanceId!]: String(Math.max(0, Math.min(100, Math.round(undoToast.item.amountPercent ?? 100)))) }));
    setUndoToast(null);
  };

  // ---------- Review Phase (with vitality editing) ----------
  if (isReviewing) {
    return (
      <div className="relative flex flex-col h-full py-6 px-5 bg-haven-cream">
        {inputWarning && (
          <div className="absolute left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl bg-[#5F4D41] px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-2xl animate-in slide-in-from-top-3 fade-in duration-200">
            {inputWarning}
          </div>
        )}
        {/* Header */}
        <div className="text-center mb-5 px-2">
          <h2 className="text-2xl font-black text-[#5F4D41] tracking-tight">{t('harvestSighted')}</h2>
          <p className="text-[#9B8B7E] text-xs mt-1.5 leading-snug">{t('adjustHint')}</p>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-4 scrollbar-hide">
          {reviewItems.map((item, idx) => {
            const h = healthMap[item.instanceId!] ?? 1.0;
            const isRemoving = item.instanceId ? removingIds[item.instanceId] : false;
            const quantityKind = getQuantityKind(item);
            const draftValue = getDraftValue(item);
            return (
              <div
                key={item.instanceId || idx}
                className={`relative px-4 pt-3 pb-3 bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ease-out ${isRemoving ? 'translate-x-full opacity-0 scale-[0.98]' : 'translate-x-0 opacity-100 scale-100'}`}
              >
                <button
                  type="button"
                  onClick={() => removeReviewItem(item, idx)}
                  className="absolute right-2 top-2 z-10 w-6 h-6 rounded-full bg-[#F0EEE9] text-[#9B8B7E] flex items-center justify-center transition-all active:scale-90 hover:text-[#5F4D41]"
                  aria-label={lang === 'cn' ? '删除食物' : 'Remove food'}
                >
                  <X size={13} strokeWidth={3} />
                </button>
                <div className="flex items-center gap-3">
                  <img
                    src={getFoodIconUrl(item.defId as string)}
                    alt={item.name}
                    className="w-10 h-10 object-contain flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-[#5F4D41] text-[17px] leading-tight truncate">{item.name}</span>
                      {quantityKind === 'countable' && (
                        <span className="shrink-0 text-[13px] font-black text-[#6D4C3D]">{String.fromCharCode(215)}</span>
                      )}
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="0"
                        value={draftValue}
                        onChange={e => setDraftValue(item, e.target.value)}
                        className="h-7 w-10 shrink-0 rounded-lg border border-[#E6DDD6] bg-[#F8F6F2] px-1 text-center text-[12px] font-black text-[#5F4D41] outline-none focus:border-[#D6B4FC]"
                      />
                      <div className="flex h-7 w-5 shrink-0 flex-col overflow-hidden rounded-md border border-[#E6DDD6] bg-[#F8F6F2]">
                        <button
                          type="button"
                          onClick={() => stepDraftValue(item, 1)}
                          className="flex h-1/2 items-center justify-center text-[#6D4C3D] active:bg-[#EEEAE4]"
                          aria-label={lang === 'cn' ? '增加' : 'Increase'}
                        >
                          <ChevronUp size={11} strokeWidth={3} />
                        </button>
                        <button
                          type="button"
                          onClick={() => stepDraftValue(item, -1)}
                          className="flex h-1/2 items-center justify-center border-t border-[#E6DDD6] text-[#6D4C3D] active:bg-[#EEEAE4]"
                          aria-label={lang === 'cn' ? '减少' : 'Decrease'}
                        >
                          <ChevronDown size={11} strokeWidth={3} />
                        </button>
                      </div>
                      {quantityKind === 'uncountable' && (
                        <span className="shrink-0 text-[13px] font-black text-[#6D4C3D]">%</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 pr-6">
                    <p className="text-[9px] font-bold text-[#9B8B7E] tracking-[0.18em] uppercase">{lang === 'cn' ? '新鲜度' : 'Freshness'}</p>
                    <p className={`text-base font-black leading-tight ${healthColor(h)}`}>{Math.round(h * 100)}%</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(h * 100)}
                    onChange={e => {
                      const val = parseInt(e.target.value) / 100;
                      setHealthMap(prev => ({ ...prev, [item.instanceId!]: val }));
                    }}
                    className={`vitality-slider w-full h-0.5 rounded-full appearance-none ${healthBg(h)}`}
                  />
                </div>
              </div>
            );
          })}
          {reviewItems.length === 0 && (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-5 text-center px-8">
              <p className="text-[#9B8B7E] text-xs font-bold leading-relaxed">
                {lang === 'cn' ? '识别结果已全部删除。' : 'All detected items have been removed.'}
              </p>
              <button
                type="button"
                onClick={() => { playSound('modalClose'); onCancel(); }}
                className="h-12 w-full max-w-[220px] rounded-2xl bg-[#5F4D41] text-white text-[11px] font-black uppercase tracking-[0.18em] shadow-sm transition-all active:scale-[0.97]"
              >
                {lang === 'cn' ? '返回原界面' : 'Back'}
              </button>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2.5 pt-6 pb-2">
          <button
            onClick={() => { if (!validateReviewInputs()) return; playSound('modalOpen'); setIsReviewing(false); }}
            disabled={reviewItems.length === 0}
            className="relative flex items-center gap-5 p-1.5 rounded-2xl border-2 border-[#D6B4FC] bg-[#D6B4FC] text-[#5F4D41] transition-all active:scale-[0.97] shadow-sm group disabled:opacity-45 disabled:active:scale-100"
          >
            <div className="p-2 bg-white/40 backdrop-blur rounded-2xl shadow-sm group-hover:rotate-12 transition-transform">
              <Hand size={22} />
            </div>
            <div className="flex-1 text-center">
              <p className="font-black uppercase tracking-[0.15em] text-[11px] pr-[44px]">{t('beginAssignment')}</p>
            </div>
          </button>
          <button
            onClick={handleAutoAssignAll}
            disabled={reviewItems.length === 0}
            className="relative flex items-center gap-5 p-1.5 rounded-2xl border-2 border-[#5F4D41] bg-[#5F4D41] text-white transition-all active:scale-[0.97] shadow-sm group disabled:opacity-45 disabled:active:scale-100"
          >
            <div className="p-2 bg-white/20 backdrop-blur rounded-2xl shadow-sm group-hover:rotate-12 transition-transform">
              <Zap size={22} fill="white" />
            </div>
            <div className="flex-1 text-center">
              <p className="font-black uppercase tracking-[0.15em] text-[11px] pr-[44px]">{t('autoAssignAll')}</p>
            </div>
          </button>
        </div>
        {undoToast && (
          <div className="absolute left-1/2 top-5 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex items-center gap-2 rounded-xl bg-[#5F4D41] px-3 py-2.5 text-white shadow-2xl">
              <img src={getFoodIconUrl(undoToast.item.defId as string)} alt="" className="w-5 h-5 object-contain" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
                {undoToast.item.name} {lang === 'cn' ? '已删除' : 'removed'}
              </span>
              <button type="button" onClick={undoRemove} className="text-[10px] font-black uppercase tracking-widest text-[#D6B4FC] active:scale-95">
                {lang === 'cn' ? '撤销' : 'Undo'}
              </button>
              <button type="button" onClick={() => setUndoToast(null)} className="w-6 h-6 flex items-center justify-center rounded-full text-white/70 active:scale-90" aria-label={lang === 'cn' ? '关闭' : 'Dismiss'}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleAutoAssignRemaining = () => {
    playSound('modalOpen');
    setAssignments(prev => {
      const next = { ...prev };
      reviewItems.forEach((item) => {
        if (item.instanceId && !next[item.instanceId]) {
          next[item.instanceId] = getBestStorage(item);
        }
      });
      return next;
    });
    setActiveItemIndex(Math.max(0, reviewItems.length - 1));
  };

  // ---------- Assignment Phase (fixed scaling) ----------
  return (
    <div className="flex flex-col h-full overflow-y-auto relative pt-4 px-6 bg-[#F0EEE9]">
      <div className="text-center mb-6">
        <h2 className="text-3xl text-[#5F4D41] tracking-tight">{t('assignHome')}</h2>
        <p className="text-slate-400 text-[11px] uppercase tracking-[0.4em] mt-3 bg-slate-50 inline-block px-6 py-2 rounded-full border border-slate-100">
          {isFinished ? t('sortingDone') : `${activeItemIndex + 1} / ${reviewItems.length}`}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        {!isFinished ? (
          <>
            <h3 className="text-2xl text-[#5F4D41] tracking-tight">{currentItem?.name}</h3>
            <div key={currentItem?.instanceId} className="relative group animate-in zoom-in duration-300">
              <div className="absolute inset-0 bg-emerald-400/5 blur-[60px] rounded-full scale-125" />
              <img
                src={getFoodIconUrl(currentItem?.defId as string)}
                alt={currentItem?.name}
                className="w-24 h-24 object-contain drop-shadow-2xl relative z-10"
              />
            </div>
            
            <div className="grid grid-cols-1 w-full gap-2.5 mt-8">
               {zones.map((zone) => {
                 const isRecommended = recommendedStorage === zone.type;
                 return (
                   <button 
                     key={zone.type} 
                     onClick={() => { playSound('addFood'); assign(zone.type); }}
                     className={`relative flex items-center gap-5 p-1.5 rounded-2xl border-2 transition-all active:scale-[0.97] shadow-sm group ${zone.cardColor}`}
                   >
                     {isRecommended && (
                       <div className={`absolute -top-2.5 left-8 text-[9px] px-4 py-1 rounded-full shadow-sm flex items-center gap-1.5 border ${zone.badgeColor}`}>
                         <Star size={10} fill="currentColor" />
                         {t('recommended')}
                       </div>
                     )}
                     <div className="p-3 bg-white/90 backdrop-blur rounded-2xl shadow-sm group-hover:rotate-12 transition-transform">
                       <zone.icon size={22} />
                     </div>
                     <div className="text-left">
                       <p className="uppercase tracking-[0.15em] text-[11px] mb-0.5">{zone.label}</p>
                       <p className="text-[10px] italic opacity-70 leading-tight">
                         {isRecommended ? t('optimalChoice') : t('alternativeShelter')}
                       </p>
                     </div>
                   </button>
                 );
               })}
               <button onClick={handleAutoAssignRemaining} className="relative flex items-center gap-5 p-1.5 rounded-2xl border-2 border-[#5F4D41] transition-all active:scale-[0.97] shadow-sm group bg-[#5F4D41] text-white">
                 <div className="p-3 bg-white/20 backdrop-blur rounded-2xl shadow-sm group-hover:rotate-12 transition-transform">
                   <Zap size={22} />
                 </div>
                 <div className="text-left">
                   <p className="uppercase tracking-[0.15em] text-[11px] mb-0.5">{t('autoAssignRemaining')}</p>
                   <p className="text-[10px] italic opacity-70 leading-tight">{t('autoAssignRemainingHint')}</p>
                 </div>
               </button>
            </div>
          </>
        ) : (
          <div className="w-full text-center animate-in zoom-in duration-700">
            <img
              src="/assets/ui/assign-home.png"
              alt=""
              aria-hidden
              className="mx-auto mb-10 h-40 w-40 object-contain drop-shadow-[0_10px_24px_rgba(95,77,65,0.16)]"
            />
            <h3 className="text-[38px] leading-none text-[#5F4D41] tracking-tight">{t('havenReady')}</h3>
            <p className="mx-auto mt-8 max-w-[260px] text-[15px] italic leading-relaxed text-[#9A93AA]">
              {t('allGuided')}
            </p>
          </div>
        )}
      </div>

      <div className="pb-10 pt-4">
        {isFinished && (
          <button onClick={handleFinalize} className="mx-auto block h-16 w-full max-w-[320px] rounded-[2.5rem] bg-[#6D4C3D] text-[14px] uppercase tracking-[0.42em] text-white shadow-2xl transition-all active:scale-[0.98]">
            {t('enterSanctuary')}
          </button>
        )}
      </div>
    </div>
  );
};
