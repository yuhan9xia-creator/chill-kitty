
import React from 'react';
import { Refrigerator, Plus, BookOpen, User, Cat } from 'lucide-react';
import { ViewState } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeView?: ViewState | 'SPLASH';
  onViewChange?: (view: ViewState) => void;
  onPlusClick?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, onPlusClick }) => {
  const showNav = activeView && ['HOME', 'ALMANAC', 'PROFILE', 'CAT'].includes(activeView);
  const baseItemClass = 'flex items-center justify-center transition-all duration-200';
  const inactiveItemClass = 'w-11 h-11 text-haven-brown/60';
  const activeItemClass = 'w-12 h-12 rounded-2xl bg-white text-haven-brown shadow-[0_8px_18px_rgba(109,76,61,0.14)]';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F0EEE9', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden' }}>
    <div style={{ width: '393px', height: 'var(--app-h, 100dvh)', transform: 'scale(var(--app-scale, 1))', transformOrigin: 'top center', flexShrink: 0 }} className="bg-haven-cream shadow-2xl md:border-x border-haven-tan/20 flex flex-col relative overflow-hidden">
      <main className="flex-1 relative overflow-hidden">
        {children}
      </main>

      {showNav && onViewChange && (
        <div className="h-[76px] bg-haven-sage border-t border-haven-brown/10 flex items-start justify-between px-7 pt-2 relative z-[999]">
          <button
            onClick={() => onViewChange('CAT')}
            className={`${baseItemClass} ${activeView === 'CAT' ? activeItemClass : inactiveItemClass}`}
          >
            <Cat size={18} strokeWidth={2.3} />
          </button>

          <button
            onClick={() => onViewChange('HOME')}
            className={`${baseItemClass} ${activeView === 'HOME' ? activeItemClass : inactiveItemClass}`}
          >
            <Refrigerator size={17} strokeWidth={2.3} />
          </button>

          <div className="w-[72px] h-12 shrink-0" />
          <button
            onClick={() => onPlusClick ? onPlusClick() : onViewChange('SCAN')}
            className="absolute left-1/2 -translate-x-1/2 -top-[14px] w-16 h-16 bg-haven-brown text-white rounded-full flex items-center justify-center shadow-[0_10px_20px_rgba(109,76,61,0.22)] active:scale-95 transition-all border-[4px] border-haven-sage z-10"
          >
            <Plus size={28} strokeWidth={3.4} />
          </button>

          <button
            onClick={() => onViewChange('ALMANAC')}
            className={`${baseItemClass} ${activeView === 'ALMANAC' ? activeItemClass : inactiveItemClass}`}
          >
            <BookOpen size={18} strokeWidth={2.3} />
          </button>

          <button
            onClick={() => onViewChange('PROFILE')}
            className={`${baseItemClass} ${activeView === 'PROFILE' ? activeItemClass : inactiveItemClass}`}
          >
            <User size={18} strokeWidth={2.3} />
          </button>
        </div>
      )}
    </div>
    </div>
  );
};
