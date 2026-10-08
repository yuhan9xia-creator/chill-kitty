
import React, { useState, useEffect } from 'react';
import { FoodItem, StorageType, Language, FoodDef, FreshnessState } from '../types';
import { UI_STRINGS } from '../translations';
import { getFoodIconUrl } from '../utils/foodIcons';
import { calculateFreshness } from './FoodCard';

interface FoodSpriteProps {
  item: FoodItem;
  currentDay: number;
  predictionDays: number;
  todayStr: string;
  lang: Language;
  onClick: () => void;
  allDefs: Record<string, FoodDef>;
}

export const FoodSprite: React.FC<FoodSpriteProps> = ({ item, currentDay, predictionDays, todayStr, lang, onClick, allDefs }) => {
  const def = allDefs[item.defId];
  if (!def) return null;

  const { progress, state, remaining } = calculateFreshness(item, predictionDays, allDefs, todayStr);
  const healthPercent = Math.max(0, Math.round((1 - progress) * 100));
  
  const isSpoiled = state === FreshnessState.SPOILED;

  // Animate health bar from 0 → target on mount / when healthPercent changes
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(healthPercent), 120);
    return () => clearTimeout(t);
  }, [healthPercent]);

  const getBarColor = () => {
    if (progress < 0.3) return 'bg-haven-sage';
    if (progress < 0.6) return 'bg-yellow-400';
    if (progress < 0.85) return 'bg-haven-peach';
    return 'bg-haven-red';
  };

  const remainingText = remaining !== undefined
    ? (remaining > 0 ? `${Math.ceil(remaining)}D` : (lang === 'cn' ? '已过期' : 'Expired'))
    : '';

  return (
    <div 
      className="flex flex-col items-center cursor-pointer group select-none"
      onClick={onClick}
    >
      <div className={`w-full bg-white rounded-2xl flex flex-col items-center pt-2.5 pb-2 px-1 shadow-sm border border-haven-tan/20 transition-transform duration-200 active:scale-95 group-hover:shadow-md ${isSpoiled ? 'grayscale' : ''}`}>
        <div className={`transition-transform duration-300 ease-out group-hover:scale-110`}>
           <img
             src={getFoodIconUrl(item.defId)}
             alt={item.name}
             className={`w-10 h-10 object-contain transition-all duration-500 ${isSpoiled ? 'scale-75 opacity-40' : 'drop-shadow-md'}`}
           />
        </div>
        <p className="text-[7px] font-bold text-haven-brown/70 mt-1 truncate w-full text-center px-0.5">{def.name[lang]}</p>
        {!isSpoiled ? (
          <>
            <div className="w-8 h-1 bg-haven-tan/20 rounded-full overflow-hidden mt-1">
              <div className={`h-full transition-all duration-1000 ease-out rounded-full ${getBarColor()}`} style={{ width: `${barWidth}%` }} />
            </div>
            <p className="text-[6px] text-haven-moss mt-0.5">{remainingText}</p>
          </>
        ) : (
          <p className="text-[6px] text-haven-red mt-0.5">{lang === 'cn' ? '已过期' : 'Spoiled'}</p>
        )}
      </div>
    </div>
  );
};
