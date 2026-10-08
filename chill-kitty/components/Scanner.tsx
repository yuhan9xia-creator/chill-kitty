
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, X, Image as ImageIcon } from 'lucide-react';
import { Language } from '../types';
import { UI_STRINGS } from '../translations';
import { playSound } from '../utils/sound';

interface ScannerProps {
  onScan: (base64: string) => void;
  onCancel: () => void;
  lang: Language;
  onLangToggle?: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onCancel, lang }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [zoom, setZoom] = useState(1);
  const hasNativeZoom = useRef(false);
  const nativeZoomRange = useRef({ min: 1, max: 1 });
  const lastPinchDist = useRef(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const t = (key: string) => UI_STRINGS[key]?.[lang] || key;

  // Cleanup function to reliably release camera
  const stopCamera = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' }, 
          audio: false 
        });
        // If component unmounted during await, release immediately
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
        }
        // Detect native zoom capability
        const videoTrack = stream.getVideoTracks()[0];
        trackRef.current = videoTrack;
        const caps = videoTrack.getCapabilities?.() as any;
        if (caps?.zoom) {
          hasNativeZoom.current = true;
          nativeZoomRange.current = { min: caps.zoom.min, max: caps.zoom.max };
          setZoom(caps.zoom.min);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Camera error:", err);
          setError(t('cameraError'));
        }
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [lang, stopCamera]);

  const applyZoom = useCallback((value: number) => {
    if (hasNativeZoom.current && trackRef.current) {
      const clamped = Math.max(nativeZoomRange.current.min, Math.min(nativeZoomRange.current.max, value));
      trackRef.current.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
      setZoom(clamped);
    } else {
      // CSS transform fallback: max 4x
      const clamped = Math.max(1, Math.min(4, value));
      setZoom(clamped);
    }
  }, []);

  // Pinch-to-zoom touch handlers
  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastPinchDist.current > 0) {
          const scale = dist / lastPinchDist.current;
          setZoom(prev => {
            const next = prev * scale;
            const maxZoom = hasNativeZoom.current ? nativeZoomRange.current.max : 4;
            const minZoom = hasNativeZoom.current ? nativeZoomRange.current.min : 1;
            const clamped = Math.max(minZoom, Math.min(maxZoom, next));
            if (hasNativeZoom.current && trackRef.current) {
              trackRef.current.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
            }
            return clamped;
          });
        }
        lastPinchDist.current = dist;
      }
    };

    const onTouchEnd = () => {
      lastPinchDist.current = 0;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Optimized image processing for speed: 1024px is sufficient for Gemini 3
  const processImage = useCallback((source: HTMLVideoElement | HTMLImageElement) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    
    // Optimized resolution for faster recognition
    const MAX_WIDTH = 1024;
    const MAX_HEIGHT = 1024;
    
    let width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    let height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    if (width > height) {
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(source, 0, 0, width, height);
      // JPEG quality 0.8 is the sweet spot for vision APIs
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
    return null;
  }, []);

  const capture = useCallback(() => {
    if (videoRef.current) {
      playSound('shutter');
      const base64 = processImage(videoRef.current);
      if (base64) {
        stopCamera();
        onScan(base64);
      }
    }
  }, [onScan, processImage, stopCamera]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      playSound('button');
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const base64 = processImage(img);
          if (base64) {
            stopCamera();
            onScan(base64);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-end items-center p-6 text-white">
        <button onClick={() => { playSound('modalClose'); stopCamera(); onCancel(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
      </div>

      <div ref={videoContainerRef} className="flex-1 relative overflow-hidden bg-slate-900 flex items-center justify-center touch-none">
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/50 animate-pulse flex flex-col items-center gap-2">
              <RefreshCw className="animate-spin" />
              <span>{t('initializingLens')}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/50 p-8 text-center flex flex-col items-center gap-4">
               <div className="p-4 bg-white/5 rounded-full"><ImageIcon size={48} /></div>
               <p className="max-w-[200px]">{error}</p>
            </div>
          </div>
        )}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className={`w-full h-full object-contain transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}
          style={!hasNativeZoom.current && zoom > 1 ? { transform: `scale(${zoom})` } : undefined}
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Scanner Overlay UI */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
           <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl"></div>
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl"></div>
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl"></div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl"></div>
           </div>
        </div>
        {/* Zoom indicator — always shown when zoomed beyond 1x */}
        {isReady && zoom > 1.05 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-4 py-1.5">
            <span className="text-white text-sm font-medium">{zoom.toFixed(1)}x</span>
          </div>
        )}
      </div>

      <div className="p-8 pb-12 flex items-center justify-center gap-8 bg-black">
        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button 
          onClick={() => { playSound('button'); fileInputRef.current?.click(); }}
          className="p-4 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          title="Upload"
        >
          <ImageIcon size={28} />
        </button>
        <button 
          onClick={capture}
          disabled={!isReady}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
          title="Capture"
        >
          <div className="w-16 h-16 rounded-full bg-white"></div>
        </button>
        <div className="w-[60px]"></div>
      </div>
    </div>
  );
};
