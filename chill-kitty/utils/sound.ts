export type SoundId =
  | 'bgm'
  | 'button'
  | 'modalOpen'
  | 'modalClose'
  | 'catNormal'
  | 'catHappy'
  | 'catSad'
  | 'eat'
  | 'waste'
  | 'taskComplete'
  | 'checkin'
  | 'levelUp'
  | 'achievement'
  | 'shutter'
  | 'identifySuccess'
  | 'addFood'
  | 'fridgeOpen'
  | 'almanac'
  | 'cook'
  | 'detect'
  | 'error';

const SOUND_FILES: Record<SoundId, string> = {
  bgm: 'bgm.mp3',
  button: 'button.mp3',
  modalOpen: 'modal_open.mp3',
  modalClose: 'modal_close.mp3',
  catNormal: 'cat_normal.mp3',
  catHappy: 'cat_happy.mp3',
  catSad: 'cat_sad.mp3',
  eat: 'eat.mp3',
  waste: 'waste.mp3',
  taskComplete: 'task_complete.mp3',
  checkin: 'checkin.mp3',
  levelUp: 'level_up.mp3',
  achievement: 'achievement.mp3',
  shutter: 'shutter.mp3',
  identifySuccess: 'task_complete.mp3',
  addFood: 'add_food.mp3',
  fridgeOpen: 'fridge_open.mp3',
  almanac: 'almanac.mp3',
  cook: 'cook.mp3',
  detect: 'detect.mp3',
  error: 'error.mp3',
};

const VOLUME: Partial<Record<SoundId, number>> = {
  bgm: 0.042,
  button: 0.34,
  modalOpen: 0.38,
  modalClose: 0.34,
  catNormal: 0.45,
  catHappy: 0.5,
  catSad: 0.45,
  eat: 0.55,
  waste: 0.5,
  taskComplete: 0.55,
  checkin: 0.55,
  levelUp: 0.6,
  achievement: 0.65,
  shutter: 0.5,
  identifySuccess: 0.55,
  addFood: 1,
  fridgeOpen: 0.42,
  almanac: 0.36,
  cook: 0.46,
  detect: 0.46,
  error: 0.42,
};

const cache = new Map<SoundId, HTMLAudioElement>();
const loopPlayers = new Map<SoundId, HTMLAudioElement>();
let bgmAudio: HTMLAudioElement | null = null;
let unlocked = false;
const BGM_ENABLED_KEY = 'chill-kitty-bgm-enabled';
const BGM_VOLUME_KEY = 'chill-kitty-bgm-volume-percent';
const SFX_ENABLED_KEY = 'chill-kitty-sfx-enabled';
const BGM_MAX_VOLUME_PERCENT = 50;
const BGM_DEFAULT_VOLUME_PERCENT = Math.round(((VOLUME.bgm ?? 0.042) * 100));

function readEnabled(key: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(key) !== 'false';
}

function writeEnabled(key: string, enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(enabled));
}

export function isBgmEnabled(): boolean {
  return getBgmVolumePercent() > 0;
}

export function isSfxEnabled(): boolean {
  return readEnabled(SFX_ENABLED_KEY);
}

export function setBgmEnabled(enabled: boolean) {
  setBgmVolumePercent(enabled ? (getBgmVolumePercent() || BGM_DEFAULT_VOLUME_PERCENT) : 0);
}

export function setSfxEnabled(enabled: boolean) {
  writeEnabled(SFX_ENABLED_KEY, enabled);
  if (!enabled) stopLoopSound();
}

function clampBgmVolumePercent(value: number): number {
  if (!Number.isFinite(value)) return BGM_DEFAULT_VOLUME_PERCENT;
  return Math.max(0, Math.min(BGM_MAX_VOLUME_PERCENT, Math.round(value)));
}

function bgmPercentToAudioVolume(percent: number): number {
  return clampBgmVolumePercent(percent) / 100;
}

export function getBgmVolumePercent(): number {
  if (typeof window === 'undefined') return BGM_DEFAULT_VOLUME_PERCENT;
  const stored = window.localStorage.getItem(BGM_VOLUME_KEY);
  if (stored !== null) return clampBgmVolumePercent(Number(stored));
  if (window.localStorage.getItem(BGM_ENABLED_KEY) === 'false') return 0;
  return clampBgmVolumePercent(BGM_DEFAULT_VOLUME_PERCENT);
}

export function setBgmVolumePercent(percent: number) {
  const next = clampBgmVolumePercent(percent);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BGM_VOLUME_KEY, String(next));
  }
  writeEnabled(BGM_ENABLED_KEY, next > 0);

  const audio = bgmAudio ?? cache.get('bgm');
  if (audio) audio.volume = bgmPercentToAudioVolume(next);
  if (next <= 0) {
    stopBgm();
    return;
  }
  startBgm();
}

function getAudio(id: SoundId): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  const cached = cache.get(id);
  if (cached) return cached;

  const audio = new Audio(`/assets/sfx/${SOUND_FILES[id]}`);
  audio.preload = 'auto';
  audio.volume = VOLUME[id] ?? 0.45;
  cache.set(id, audio);
  return audio;
}

export function preloadSounds() {
  (Object.keys(SOUND_FILES) as SoundId[]).forEach(id => {
    const audio = getAudio(id);
    audio?.load();
  });
}

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const audio = getAudio('button');
  if (!audio) return;
  audio.muted = true;
  audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
  }).catch(() => {
    audio.muted = false;
  });
}

export function playSound(id: SoundId) {
  if (id === 'bgm') {
    if (isBgmEnabled()) startBgm();
    return;
  }
  if (!isSfxEnabled()) return;
  const audio = getAudio(id);
  if (!audio) return;
  const player = audio.cloneNode(true) as HTMLAudioElement;
  player.volume = VOLUME[id] ?? audio.volume;
  player.play().catch(() => {});
}

export function startLoopSound(id: SoundId) {
  if (!isSfxEnabled()) return;
  const audio = getAudio(id);
  if (!audio) return;
  const current = loopPlayers.get(id);
  if (current && !current.paused) return;

  const player = audio.cloneNode(true) as HTMLAudioElement;
  player.loop = true;
  player.volume = VOLUME[id] ?? audio.volume;
  player.play().catch(() => {});
  loopPlayers.set(id, player);
}

export function stopLoopSound(id?: SoundId) {
  if (id) {
    const player = loopPlayers.get(id);
    if (!player) return;
    player.pause();
    player.currentTime = 0;
    loopPlayers.delete(id);
    return;
  }

  loopPlayers.forEach(player => {
    player.pause();
    player.currentTime = 0;
  });
  loopPlayers.clear();
}

export function getSoundDurationMs(id: SoundId, fallbackMs = 900): number {
  const audio = getAudio(id);
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return fallbackMs;
  return Math.round(audio.duration * 1000);
}

export function startBgm() {
  const volumePercent = getBgmVolumePercent();
  if (volumePercent <= 0) return;
  const audio = getAudio('bgm');
  if (!audio) return;
  audio.loop = true;
  audio.volume = bgmPercentToAudioVolume(volumePercent);
  bgmAudio = audio;
  if (!audio.paused) return;
  audio.play().catch(() => {
    audio.load();
    audio.addEventListener('canplaythrough', () => {
      audio.play().catch(() => {});
    }, { once: true });
  });
}

export function stopBgm() {
  if (!bgmAudio) return;
  bgmAudio.pause();
}
