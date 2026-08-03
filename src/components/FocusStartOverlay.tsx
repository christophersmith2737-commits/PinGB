'use client';

import React from 'react';

interface FocusStartOverlayProps {
  phase: 'idle' | 'countdown';
  countdown: number;          // 倒计时数字（3, 2, 1）
  onStart: () => void;
}

const FocusStartOverlay: React.FC<FocusStartOverlayProps> = ({ phase, countdown, onStart }) => {
  if (phase === 'idle') {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
        <button
          onClick={onStart}
          className="px-12 py-6 text-3xl font-bold text-white
                     bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-2xl shadow-2xl
                     hover:from-emerald-500 hover:to-cyan-600 hover:scale-105 active:scale-95
                     transition-all duration-300 animate-pulse"
        >
          START
        </button>
      </div>
    );
  }

  // countdown
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
      <div className="text-8xl font-black text-white animate-bounce drop-shadow-2xl">
        {countdown}
      </div>
    </div>
  );
};

export default FocusStartOverlay;
