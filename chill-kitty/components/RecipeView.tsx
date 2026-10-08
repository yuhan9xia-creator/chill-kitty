
import React from 'react';
import { Recipe, Language } from '../types';
import { UI_STRINGS } from '../translations';
import { ChevronLeft, ChefHat, ShoppingCart, Home, X } from 'lucide-react';
import { getFoodIconUrl } from '../utils/foodIcons';
import { playSound } from '../utils/sound';

interface RecipeViewProps {
  recipes: Recipe[];
  lang: Language;
  style: 'cn_cuisine' | 'western';
  onBack: () => void;
  onDeleteRecipe?: (index: number) => void;
  onLangToggle?: () => void;
}

// Helper: resolve bilingual string or plain string
const bi = (val: string | { en: string; cn: string } | undefined, lang: Language): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val[lang] || val.en || '';
};

const polishChineseRecipeName = (name: string): string => {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const exact: Record<string, string> = {
    'broccoli cauliflower stir-fry': '西兰花炒花椰菜',
    'orange-scented potato tomato stir': '番茄炒土豆',
    'orange-scented potato tomato stir-fry': '番茄炒土豆',
    '橙香土豆番茄炒': '番茄炒土豆',
    '甜菜根紫甘蓝凉拌菜': '凉拌甜菜根和紫甘蓝',
    '茄子青椒炒': '青椒炒茄子',
  };
  if (exact[trimmed]) return exact[trimmed];
  if (exact[lower]) return exact[lower];
  if (/^[\x00-\x7F\s-]+$/.test(trimmed)) {
    if (lower.includes('broccoli') && lower.includes('cauliflower') && lower.includes('stir')) {
      return '西兰花炒花椰菜';
    }
    if (lower.includes('eggplant') && lower.includes('bell pepper')) {
      return '青椒炒茄子';
    }
    if (lower.includes('beet') && lower.includes('red cabbage')) {
      return '凉拌甜菜根和紫甘蓝';
    }
    if (lower.includes('tomato') && lower.includes('potato')) {
      return '番茄炒土豆';
    }
  }
  if (trimmed.includes('土豆') && trimmed.includes('番茄') && (trimmed.includes('橙香') || trimmed.endsWith('炒'))) {
    return '番茄炒土豆';
  }
  return trimmed
    .replace(/(.+)(青椒)炒$/, '$2炒$1')
    .replace(/^甜菜根紫甘蓝凉拌菜$/, '凉拌甜菜根和紫甘蓝');
};

const recipeName = (val: string | { en: string; cn: string } | undefined, lang: Language): string => {
  const resolved = bi(val, lang);
  return lang === 'cn' ? polishChineseRecipeName(resolved) : resolved;
};

const uniqueRecipeIngredients = (ingredients: Recipe['ingredients']): Recipe['ingredients'] => {
  const seen = new Set<string>();
  return ingredients.filter((ing) => {
    const key = `${ing.status}:${ing.id || bi(ing.name, 'en').toLowerCase() || bi(ing.name, 'cn')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const RecipeView: React.FC<RecipeViewProps> = ({ recipes, lang, style: _style, onBack, onDeleteRecipe }) => {
  const t = (key: string) => UI_STRINGS[key]?.[lang] || key;

  return (
    <div className="h-full w-full bg-[#F0EEE9] flex flex-col animate-in fade-in duration-500 overflow-hidden">
      <div className="p-8 bg-[#F0EEE9] border-b border-[#D6B4FC]/30 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => { playSound('modalClose'); onBack(); }} className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-3xl font-aahou text-[#5F4D41] tracking-tight">{t('harvestInspirations')}</h2>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D6B4FC]">{t('culinaryMagic')}</p>
          </div>
        </div>
        <div className="w-10 h-10" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-40 scrollbar-hide">
        {recipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-4">
             <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
               <ChefHat size={48} />
             </div>
             <p className="font-serif italic text-slate-400 text-xl">{lang === 'cn' ? "主厨正在思考中...\n暂时没能变出食谱。" : "The chef is pondering...\nNo recipes could be conjured right now."}</p>
          </div>
        ) : (
          recipes.map((recipe, idx) => {
            const uniqueIngredients = uniqueRecipeIngredients(recipe.ingredients);
            const sanctuaryItems = uniqueIngredients.filter(i => i.status === 'sanctuary');
            const marketItems = uniqueIngredients.filter(i => i.status === 'market');

            return (
              <div key={idx} className="bg-white rounded-[3rem] p-8 shadow-sm border border-slate-100 animate-in slide-in-from-bottom-12 relative overflow-hidden" style={{ animationDelay: `${idx * 150}ms` }}>
                {onDeleteRecipe && (
                  <button
                    type="button"
                    onClick={() => onDeleteRecipe(idx)}
                    className="absolute right-5 top-5 z-20 w-9 h-9 rounded-full bg-[#F0EEE9] text-[#5F4D41]/55 flex items-center justify-center hover:text-[#5F4D41] hover:bg-haven-tan/30 active:scale-95 transition-all"
                    aria-label={lang === 'cn' ? '删除菜谱' : 'Delete recipe'}
                  >
                    <X size={18} strokeWidth={2.6} />
                  </button>
                )}
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1 pr-10">
                      <h3 className="text-xl font-aahou text-[#5F4D41] leading-tight mb-2">{recipeName(recipe.name, lang)}</h3>
                    </div>
                  </div>

                  <p className="text-[#5F4D41] italic text-sm mb-10 leading-relaxed border-l-4 border-[#D6B4FC]/50 pl-4">"{bi(recipe.description, lang)}"</p>

                  <div className="space-y-8">
                    {sanctuaryItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Home size={14} className="text-[#D6B4FC]" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D6B4FC]">{t('fromYourSanctuary')}</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sanctuaryItems.map((ing, iIdx) => (
                            <div key={iIdx} className="px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 bg-white border border-slate-200 text-[#5F4D41] font-bold shadow-sm">
                              {ing.id ? (
                                <img src={getFoodIconUrl(ing.id)} alt={bi(ing.name, lang)} className="w-5 h-5 object-contain flex-shrink-0" />
                              ) : null}
                              {bi(ing.name, lang)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {marketItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <ShoppingCart size={12} className="text-[#D6B4FC]" />
                          <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D6B4FC]">{t('toMarket')}</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {marketItems.map((ing, iIdx) => (
                            <div key={iIdx} className="px-3 py-1.5 rounded-xl text-[11px] bg-white text-[#5F4D41] border border-slate-200 font-medium">
                              {bi(ing.name, lang)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="h-12" />{/* bottom spacing */}
    </div>
  );
};
