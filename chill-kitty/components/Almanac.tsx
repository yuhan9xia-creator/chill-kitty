
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FOOD_DEFINITIONS as STATIC_DEFS } from '../constants';
import { Language, StorageType, FoodCategory, FoodDef } from '../types';
import { UI_STRINGS } from '../translations';
import { X, LayoutGrid, Apple, Leaf, Beef, GlassWater, Wheat, Search } from 'lucide-react';
import { getFoodIconUrl } from '../utils/foodIcons';
import { KEEP_OR_DISCARD } from '../utils/keepOrDiscard';
import { playSound } from '../utils/sound';

interface AlmanacProps {
  unlockedIds: string[];
  customDefs: Record<string, FoodDef>;
  lang: Language;
  onClose: () => void;
  onLangToggle?: () => void;
  initialSelectedId?: string;
  onEntryOpen?: () => void;
}

export const Almanac: React.FC<AlmanacProps> = ({ unlockedIds, customDefs, lang, onClose, initialSelectedId, onEntryOpen }) => {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [activeTab, setActiveTab] = useState<FoodCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabDrag = useRef({ active: false, startX: 0, scrollLeft: 0 });
  
  const allDefs = useMemo(() => {
    return { ...STATIC_DEFS, ...customDefs };
  }, [customDefs]);
  
  // Explicitly type defArray as FoodDef[] to avoid property access errors on 'unknown' types
  const defArray: FoodDef[] = Object.values(allDefs);
  const selectedDef = selectedId ? allDefs[selectedId] : null;

  useEffect(() => {
    if (selectedDef) onEntryOpen?.();
  }, [selectedDef?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = (key: string) => UI_STRINGS[key]?.[lang] || key;

  const tabs: {id: FoodCategory | 'All', icon: any, label: string}[] = [
    { id: 'All', icon: LayoutGrid, label: lang === 'cn' ? '全部' : 'All' },
    { id: 'Fruit', icon: Apple, label: lang === 'cn' ? '水果' : 'Fruit' },
    { id: 'Vegetable', icon: Leaf, label: lang === 'cn' ? '蔬菜' : 'Veg' },
    { id: 'Protein', icon: Beef, label: lang === 'cn' ? '蛋白质' : 'Protein' },
    { id: 'Dairy', icon: GlassWater, label: lang === 'cn' ? '乳制品' : 'Dairy' },
    { id: 'Grain', icon: Wheat, label: lang === 'cn' ? '谷物' : 'Grain' }
  ];

  const searchLower = searchQuery.toLowerCase().trim();
  const filteredDefs = defArray.filter(d => {
    const matchesTab = activeTab === 'All' || d.category === activeTab;
    const matchesSearch = !searchLower || d.name.en.toLowerCase().includes(searchLower) || d.name.cn.toLowerCase().includes(searchLower);
    // When searching, exclude locked items from results
    if (searchLower && !unlockedIds.includes(d.id)) return false;
    return matchesTab && matchesSearch;
  });

  return (
    <div className="h-full w-full bg-[#F0EEE9] flex flex-col animate-in fade-in duration-500 relative">
      <div className="bg-[#F0EEE9] border-b border-[#5F4D41]/10 sticky top-0 z-50">
        <div className="flex justify-between items-center p-8 pb-4">
          <div>
            <h2 className="text-[17px] font-aahou text-[#5F4D41] tracking-tight whitespace-nowrap">{t('harvestGuideTitle')}</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#5F4D41] mt-0.5">
              {lang === 'cn' ? '食材大全' : 'Food Guide'} · {unlockedIds.length}/{defArray.length} ITEMS
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedDef && (
              <button
                onClick={() => {
                  playSound('modalClose');
                  setSelectedId(null);
                }}
                className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X size={24} />
              </button>
            )}
          </div>
        </div>

        {!selectedDef && (
          <>
            <div className="px-6 pb-2 pt-1">
              <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 cursor-text">
                <Search size={14} className="text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={lang === 'cn' ? '搜索食材...' : 'Search food...'}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => { playSound('modalClose'); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>
            <div
              ref={tabsRef}
              className="flex gap-2 pb-4 px-6 overflow-x-auto scrollbar-hide cursor-grab select-none"
              onMouseDown={e => {
                const el = tabsRef.current;
                if (!el) return;
                tabDrag.current = { active: true, startX: e.pageX, scrollLeft: el.scrollLeft };
              }}
              onMouseMove={e => {
                if (!tabDrag.current.active) return;
                const el = tabsRef.current;
                if (!el) return;
                el.scrollLeft = tabDrag.current.scrollLeft - (e.pageX - tabDrag.current.startX);
              }}
              onMouseUp={() => { tabDrag.current.active = false; }}
              onMouseLeave={() => { tabDrag.current.active = false; }}
            >
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { playSound('almanac'); setActiveTab(tab.id); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id ? 'bg-[#5F4D41] text-white shadow-lg' : 'bg-white/70 text-[#5F4D41]/50 border border-[#5F4D41]/10'
                  }`}
                >
                  <tab.icon size={12} />
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
        {selectedDef ? (
          <div className="animate-in slide-in-from-right duration-500 pb-20">
            <div className="flex flex-col items-center text-center">
               <div className="w-40 h-40 mb-6">
                 <img src={getFoodIconUrl(selectedDef.id)} alt={selectedDef.name[lang]} className="w-full h-full object-contain drop-shadow-xl" />
               </div>
               <h3 className="text-5xl font-aahou text-[#5F4D41] mb-2">{selectedDef.name[lang]}</h3>
               <p className="text-[#D8E63C] italic font-aahou text-xl mb-10">"{selectedDef.lore[lang]}"</p>
               <div className="w-full space-y-6 text-left">
                  <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-[#5F4D41]/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#5F4D41]/40 mb-2">{t('practicalWisdom')}</p>
                    <p className="text-lg text-[#5F4D41] leading-relaxed font-aahou">{selectedDef.realWorldSecret[lang]}</p>
                  </div>
                  <div className="p-6 bg-white rounded-[2rem] border border-[#5F4D41]/10">
                    <p className="text-[10px] font-black text-[#5F4D41]/50 uppercase tracking-widest mb-1">{t('recommended')}</p>
                    <p className="text-[#5F4D41] font-aahou text-lg">"{selectedDef.tips[selectedDef.bestStorage][lang]}"</p>
                  </div>
                  {KEEP_OR_DISCARD[selectedDef.id] && (
                    <>
                    <div className="p-6 bg-white rounded-[2rem] border border-[#5F4D41]/10">
                      <p className="text-[10px] font-black text-[#5F4D41]/50 uppercase tracking-widest mb-3">{lang === 'cn' ? '保留还是丢弃' : 'KEEP OR DISCARD'}</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-black text-[#5F4D41]/50 uppercase tracking-widest mb-0.5">{lang === 'cn' ? '可保留' : 'Still okay if'}</p>
                          <p className="text-[#5F4D41] font-aahou text-base">{KEEP_OR_DISCARD[selectedDef.id].keep[lang]}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-[#5F4D41]/50 uppercase tracking-widest mb-0.5">{lang === 'cn' ? '该丢弃' : 'Discard if'}</p>
                          <p className="text-[#5F4D41] font-aahou text-base">{KEEP_OR_DISCARD[selectedDef.id].discard[lang]}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[9px] font-black text-[#5F4D41]/50 uppercase tracking-widest mt-3 px-1 text-justify" style={{ fontFamily: 'A4E7' }}>{lang === 'cn' ? '仅供参考，如有异味、发霉、渗液等异常情况，请勿食用；如不确定，建议直接丢弃。' : 'For reference only. If you notice mold, unusual smell, leakage, or other signs of spoilage, do not eat it. If in doubt, throw it out.'}</p>
                    </>
                  )}
               </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6 animate-in fade-in duration-500 pb-12">
            {filteredDefs.map((def: FoodDef) => {
              const isUnlocked = unlockedIds.includes(def.id);
              return (
                <button
                  key={def.id}
                  onClick={() => {
                    if (!isUnlocked) return;
                    playSound('modalOpen');
                    setSelectedId(def.id);
                  }}
                  className="flex flex-col items-center group"
                >
                  <div className={`w-full aspect-square rounded-[2rem] flex items-center justify-center shadow-sm border transition-all duration-500 relative overflow-hidden ${
                    isUnlocked
                      ? 'bg-white border-slate-100 group-hover:scale-105 group-hover:shadow-md'
                      : 'bg-slate-100 border-slate-200'
                  }`}>
                    {isUnlocked ? (
                      <img
                        src={getFoodIconUrl(def.id)}
                        alt={def.name[lang]}
                        className="w-3/5 h-3/5 object-contain drop-shadow-sm"
                      />
                    ) : (
                      <>
                        <img
                          src={getFoodIconUrl(def.id)}
                          alt=""
                          className="w-3/5 h-3/5 object-contain"
                          style={{ filter: 'brightness(0) opacity(0.18)' }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-black text-slate-400 select-none">?</span>
                        </div>
                      </>
                    )}
                  </div>
                  <span className={`mt-3 text-[10px] font-black uppercase tracking-widest truncate w-full text-center ${
                    isUnlocked ? 'text-[#5F4D41]' : 'text-[#5F4D41]/30'
                  }`}>
                    {def.name[lang]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
