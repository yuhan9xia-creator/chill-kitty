
import React from 'react';
import { SanctuaryNote, Language } from '../types';
import { UI_STRINGS } from '../translations';
import { X, MailOpen, Sparkles, Clock, Star } from 'lucide-react';

interface MailboxProps {
  notes: SanctuaryNote[];
  lang: Language;
  onClose: () => void;
  onClear: () => void;
  onLangToggle?: () => void;
}

export const Mailbox: React.FC<MailboxProps> = ({ notes, lang, onClose, onClear }) => {
  const t = (key: string) => UI_STRINGS[key]?.[lang] || key;

  // Post-it colors mapping based on rarity or just sequence
  const colors = ['bg-yellow-50', 'bg-emerald-50', 'bg-orange-50', 'bg-sky-50', 'bg-rose-50'];

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="w-full max-w-md h-[85vh] bg-[#fdfaf5] rounded-[3.5rem] shadow-2xl flex flex-col relative overflow-hidden border border-white/20">
        
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shadow-inner">
               <MailOpen size={24} />
             </div>
             <div>
               <h2 className="text-2xl font-serif text-slate-800 tracking-tight">{t('mailboxTitle')}</h2>
               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Chronological Archive</p>
             </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 relative scrollbar-hide space-y-8">
          {notes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
              <Sparkles size={60} className="text-slate-400" />
              <p className="font-serif italic text-xl">{t('noNotes')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {notes.map((note, idx) => {
                const isRare = note.rarity === 'Rare';
                return (
                  <div 
                    key={note.id}
                    className={`${isRare ? 'bg-indigo-50 border-indigo-200' : colors[idx % colors.length] + ' border-black/5'} p-7 rounded-[2.5rem] shadow-sm border relative animate-in slide-in-from-bottom-8 duration-500 overflow-hidden group`}
                    style={{ 
                      animationDelay: `${idx * 100}ms`,
                      transform: `rotate(${(idx % 2 === 0 ? 0.5 : -0.5) * (1 + Math.random())}deg)`
                    }}
                  >
                    {!note.isRead && (
                      <div className="absolute top-4 right-4 bg-rose-500 text-white text-[8px] font-black px-2 py-1 rounded-full animate-pulse shadow-lg z-20">
                        NEW
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl drop-shadow-sm emoji-font group-hover:scale-110 transition-transform">{note.senderEmoji}</span>
                        <div>
                          <span className="font-black uppercase tracking-widest text-[9px] text-slate-500 block leading-none">{note.senderName}</span>
                          <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter flex items-center gap-1 mt-1">
                            <Clock size={8} /> Day {note.daySent}
                          </span>
                        </div>
                      </div>
                      {isRare && (
                        <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg shadow-sm">
                          <Star size={12} fill="currentColor" />
                        </div>
                      )}
                    </div>

                    <p className={`font-serif italic text-slate-800 leading-relaxed ${isRare ? 'text-xl font-semibold text-indigo-900' : 'text-lg'}`}>
                      "{note.message}"
                    </p>

                    <div className="absolute bottom-[-10px] right-[-10px] opacity-[0.03] group-hover:opacity-5 transition-opacity">
                      <Sparkles size={80} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {notes.length > 0 && (
          <div className="p-8 bg-white border-t border-slate-100 shadow-2xl">
            <button 
              onClick={onClear}
              className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.5em] text-[10px] shadow-lg active:scale-95 transition-all"
            >
              {lang === 'cn' ? "收藏这些瞬间" : "Archive These Moments"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
