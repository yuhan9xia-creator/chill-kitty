import React, { useState } from 'react';
import { Cat } from 'lucide-react';
import { authLogin, authRegister, AuthResult } from '../services/api';

interface Props {
  onSuccess: (user: AuthResult) => void;
  onDemo: () => void;
}

type Screen = 'login' | 'register';

const EyeIcon: React.FC<{ open: boolean }> = ({ open }) => open ? (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
) : (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12a18.45 18.45 0 015.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12a18.5 18.5 0 01-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const AuthView: React.FC<Props> = ({ onSuccess, onDemo }) => {
  const [screen, setScreen] = useState<Screen>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  const reset = (next: Screen) => {
    setScreen(next);
    setError('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (screen === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (screen === 'login') {
        const result = await authLogin(username.trim(), password);
        onSuccess(result);
      } else {
        await authRegister(username.trim(), password);
        setJustRegistered(true);
        reset('login');
      }
    } catch (err: any) {
      // Parse backend error message
      const msg: string = err.message ?? '';
      if (msg.includes('409') || msg.includes('already taken')) {
        setError('This username is already taken.');
      } else if (msg.includes('401') || msg.includes('Invalid')) {
        setError('Incorrect username or password.');
      } else if (msg.includes('400')) {
        // Extract message from "后端错误 400: ..." body
        const match = msg.match(/:\s*(.+)$/);
        setError(match ? match[1].replace(/[{}"]/g, '').replace('detail:', '').trim() : 'Invalid input.');
      } else if (msg.includes('超时') || msg.includes('timeout') || msg.includes('AbortError')) {
        setError('Request timed out. Please check if the backend is running.');
      } else if (msg.includes('网络') || msg.includes('network') || msg.includes('Failed to fetch')) {
        setError('Cannot connect to server. Please check your network.');
      } else {
        // Show actual error for debugging
        setError(`Error: ${msg.slice(0, 120)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#F0EEE9] px-6">

      {/* Header pill */}
      <div className="w-full max-w-[340px] bg-[#C8D930] rounded-full px-6 py-4 flex items-center gap-3 mb-6 shadow-sm">
        <div className="w-10 h-10 bg-white/50 rounded-full flex items-center justify-center text-[#3D4A0A]">
          <Cat size={22} strokeWidth={2.3} />
        </div>
        <span className="font-aahou text-[#3D4A0A] text-xl tracking-wide">
          {screen === 'login' ? 'Login' : 'Register'}
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-[340px] bg-white rounded-[2rem] shadow-md p-7">

        <p className="font-aahou text-center text-[#2D2A7B] text-lg mb-6 leading-snug">
          {screen === 'login'
            ? 'Nice to meet you, Meow! Shall we check the fridge?'
            : 'Create a new Kitty'}
        </p>

        {justRegistered && screen === 'login' && (
          <p className="text-center text-[12px] text-[#3D9A4A] font-bold mb-2">Account created! Please log in.</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            maxLength={30}
            autoComplete="username"
            className="w-full px-5 py-4 rounded-2xl bg-[#F3F3F3] text-[#3D3D3D] placeholder-[#ADADAD] font-aahou text-[15px] outline-none focus:ring-2 focus:ring-[#C8D930]/60 transition"
          />

          {/* Password field with show/hide toggle */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={screen === 'login' ? 'current-password' : 'new-password'}
              className="w-full px-5 py-4 pr-12 rounded-2xl bg-[#F3F3F3] text-[#3D3D3D] placeholder-[#ADADAD] font-aahou text-[15px] outline-none focus:ring-2 focus:ring-[#C8D930]/60 transition [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ADADAD] active:text-[#3D3D3D] transition"
              tabIndex={-1}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          {/* Confirm password — register only */}
          {screen === 'register' && (
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                autoComplete="new-password"
                className="w-full px-5 py-4 pr-12 rounded-2xl bg-[#F3F3F3] text-[#3D3D3D] placeholder-[#ADADAD] font-aahou text-[15px] outline-none focus:ring-2 focus:ring-[#C8D930]/60 transition [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ADADAD] active:text-[#3D3D3D] transition"
                tabIndex={-1}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
          )}

          {error && (
            <p className="text-center text-[12px] text-red-500 font-bold -mt-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password || (screen === 'register' && !confirmPassword)}
            className="w-full py-4 bg-[#D6B4FC] text-[#5B2D8E] rounded-2xl font-aahou uppercase tracking-[0.3em] text-[15px] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? (
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            ) : (
              screen === 'login' ? 'LOGIN' : 'REGISTER'
            )}
          </button>
        </form>
      </div>

      {screen === 'login' && (
        <button
          type="button"
          onClick={onDemo}
          className="mt-4 w-full max-w-[340px] rounded-full bg-[#C8D930] py-4 font-aahou text-[15px] uppercase tracking-[0.16em] text-[#3D4A0A] shadow-sm transition-all active:scale-[0.98]"
        >
          Try Quick Demo
        </button>
      )}

      {/* Switch screen pill */}
      <button
        onClick={() => reset(screen === 'login' ? 'register' : 'login')}
        className="mt-3 w-full max-w-[340px] bg-[#D6B4FC] rounded-full py-4 font-aahou text-[#5B2D8E] text-[15px] uppercase tracking-[0.16em] text-center active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2"
      >
        {screen === 'register' && (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {screen === 'login'
          ? 'NO ACCOUNT? REGISTER'
          : 'BACK TO LOGIN'}
      </button>
    </div>
  );
};

export default AuthView;
