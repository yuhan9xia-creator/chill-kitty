
import React, { useState, useEffect } from 'react';
import { FoodItem, FreshnessState, FoodDef } from '../types';
import { FRESHNESS_COLORS } from '../constants';
import { Clock, Info, ShieldAlert } from 'lucide-react';
import { getFoodIconUrl } from '../utils/foodIcons';

// Added missing FoodCardProps interface
interface FoodCardProps {
  item: FoodItem;
  currentDay: number;
  onClick: () => void;
  allDefs: Record<string, FoodDef>;
}

/**
 * Get local date string (YYYY-MM-DD) in local timezone.
 */
export const getLocalDateStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Centralized vitality calculation using formula from food definition.
 * Uses real calendar dates (item.addedDate) for automatic daily freshness updates.
 * @param todayStr - local date string (YYYY-MM-DD) for consistent date comparison
 * @param predictionOffset - extra simulated days from the preview slider
 */
export const calculateFreshness = (item: FoodItem, predictionOffset: number, allDefs: Record<string, FoodDef>, todayStr?: string): { state: FreshnessState; progress: number; remaining: number } => {
  const def = allDefs[item.defId];
  if (!def) return { state: FreshnessState.FRESH, progress: 0, remaining: 0 };

  // Guard: find lifespan by storage key, fall back to bestStorage lifespan, then 7
  const lifespan = def.baseLifespan[item.storage]
    ?? def.baseLifespan[def.bestStorage]
    ?? 7;

  // Compute elapsed days from real calendar date
  let realDays = 0;
  if (item.addedDate) {
    const today = todayStr || getLocalDateStr();
    const added = new Date(item.addedDate + 'T00:00:00');
    const now = new Date(today + 'T00:00:00');
    realDays = Math.max(0, Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24)));
  }
  // t = real days elapsed + prediction offset + manual damage days
  const t = realDays + predictionOffset + (item.damageDays || 0);

  // Initial vitality from AI assessment or user input (stored in sanctuary)
  const v0 = Math.max(0.001, Math.min(1, item.vitality ?? 1.0));

  // Calculate vitality using the food's decay formula with initial vitality v0
  const formula = def.storageVitalityFormula?.[item.storage] ?? def.vitalityFormula;
  let vitality: number;

  if (!formula || formula.type === 'linear') {
    // Linear: v(t) = v0 - t / maxDays
    // maxDays = bestStorage lifespan (the food's maximum shelf life under best conditions)
    const maxDays = def.baseLifespan[def.bestStorage] ?? lifespan;
    vitality = v0 - t / maxDays;
  } else if (formula.type === 'logistic') {
    // Logistic: v(t) = 1 / (1 + ((1 - v0) / v0) * exp(declineRate * t))
    // When v0 = 1.0 exactly, (1-v0)/v0 = 0 making the formula degenerate (always 1).
    // Cap v0 at 0.9999 to keep the decay curve active for perfectly fresh items.
    const r = formula.declineRate;
    const v0c = Math.min(v0, 0.9999);
    vitality = 1 / (1 + ((1 - v0c) / v0c) * Math.exp(r * t));
  } else if (formula.type === 'exponential') {
    // Exponential: v(t) = v0 * exp(-declineRate * t)
    // Rapid initial drop then long tail
    vitality = v0 * Math.exp(-formula.declineRate * t);
  } else {
    vitality = v0 - t / lifespan;
  }

  vitality = Math.max(0, Math.min(1, vitality));
  const progress = 1 - vitality;

  // Calculate remaining days until spoiled (vitality <= 0.15, i.e. progress >= 0.85)
  const SPOIL_V = 0.15;
  let remaining: number;
  if (vitality <= SPOIL_V) {
    remaining = 0;
  } else if (!formula || formula.type === 'linear') {
    const maxDays = def.baseLifespan[def.bestStorage] ?? lifespan;
    remaining = maxDays * (vitality - SPOIL_V);
  } else if (formula.type === 'logistic') {
    const r = formula.declineRate;
    const ratio = 1 / vitality - 1;
    const target = 1 / SPOIL_V - 1; // ≈ 5.667
    remaining = ratio > 0 ? Math.max(0, Math.log(target / ratio) / r) : lifespan;
  } else if (formula.type === 'exponential') {
    const r = formula.declineRate;
    remaining = Math.max(0, Math.log(vitality / SPOIL_V) / r);
  } else {
    remaining = lifespan * (vitality - SPOIL_V);
  }

  let state = FreshnessState.FRESH;
  if (progress < 0.25) state = FreshnessState.FRESH;
  else if (progress < 0.5) state = FreshnessState.STABLE;
  else if (progress < 0.6) state = FreshnessState.FRAGILE;
  else if (progress < 0.85) state = FreshnessState.URGENT;
  else state = FreshnessState.SPOILED;

  return { state, progress, remaining };
};

export const FoodCard: React.FC<FoodCardProps> = ({ item, currentDay, onClick, allDefs }) => {
  const { state, progress, remaining } = calculateFreshness(item, currentDay, allDefs);
  const [isHovered, setIsHovered] = useState(false);

  const isSpoiled = state === FreshnessState.SPOILED;
  const healthPercent = Math.max(0, Math.round((1 - progress) * 100));

  // Animate bar from 0 → target on mount
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(healthPercent), 100);
    return () => clearTimeout(t);
  }, [healthPercent]);

  const getBarColor = () => {
    if (progress < 0.3) return 'bg-emerald-400';
    if (progress < 0.6) return 'bg-yellow-400';
    if (progress < 0.85) return 'bg-orange-500';
    return 'bg-rose-500';
  };

  const getDialogue = () => {
    if (isSpoiled) return "I'm gone... composting time.";
    if (progress > 0.8) return "Quick! Eat me today!";
    if (progress > 0.5) return "I'm starting to fade...";
    return "I'm feeling great!";
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          w-full flex flex-col p-5 bg-white border border-slate-100 rounded-[2rem] transition-all duration-500
          ${isHovered ? 'shadow-xl -translate-y-1 bg-slate-50' : 'shadow-sm'}
          ${isSpoiled ? 'grayscale opacity-70' : ''}
        `}
      >
        <div className="flex items-start w-full mb-4">
          <div className={`
            w-16 h-16 bg-white rounded-3xl flex items-center justify-center mr-4 shadow-inner border border-slate-50
            transition-transform duration-700 ${!isSpoiled && 'group-hover:scale-110 group-hover:rotate-6'}
          `}>
            <img src={getFoodIconUrl(item.defId)} alt={item.name} className="w-10 h-10 object-contain" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{item.name}</h3>
            <div className="flex items-center gap-1.5 text-slate-400">
               <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full">{item.storage}</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${FRESHNESS_COLORS[state]}`}>
              {state}
            </span>
          </div>
        </div>

        {/* Health Bar Section */}
        <div className="w-full space-y-2">
          <div className="flex justify-between items-end px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Vitality</span>
            <span className={`text-[11px] font-black ${isSpoiled ? 'text-slate-400' : 'text-slate-800'}`}>{healthPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner p-[2px]">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${isSpoiled ? 'bg-slate-300' : getBarColor()}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
        
        {/* Predictive Dialogue on Hover */}
        <div className={`
          mt-4 overflow-hidden transition-all duration-300
          ${isHovered ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}
        `}>
          <div className="flex items-center gap-2 bg-white/80 p-3 rounded-2xl border border-slate-100">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <p className="text-xs italic text-slate-500 font-medium">"{getDialogue()}"</p>
          </div>
        </div>
      </button>

      {/* Days Left Floating Tooltip */}
      {isHovered && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in zoom-in duration-200">
          <div className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 whitespace-nowrap">
            {isSpoiled ? (
              <>
                <ShieldAlert size={14} className="text-rose-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Spoiled {Math.abs(remaining).toFixed(0)} days ago</span>
              </>
            ) : (
              <>
                <Clock size={14} className="text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Expect {remaining.toFixed(1)} more days</span>
              </>
            )}
          </div>
          <div className="w-3 h-3 bg-slate-900 rotate-45 mx-auto -mt-1.5 shadow-xl" />
        </div>
      )}
    </div>
  );
};
