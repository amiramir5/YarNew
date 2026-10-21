import React, { Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/900.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import App from './App.tsx';
import { initAuthListener } from './lib/auth';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Unhandled app error caught:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('ky_timer_state_v2');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#f8fafc] text-slate-900 flex items-center justify-center p-6 text-right font-sans"
        >
          <div className="max-w-md w-full bg-white border border-blue-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-md">
              KY
            </div>
            <h1 className="text-xl font-black text-slate-900">
              کنکوریار ۲.۰ — بازیابی خودکار
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              اطلاعات و رکوردهای شما در حافظه دستگاه محفوظ است. برای راه‌اندازی تمیز و شروع مجدد روی دکمه زیر کلیک کنید.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                شروع مجدد برنامه
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Initialize Supabase Auth listener
initAuthListener();

// Offline shell: register the service worker in production builds so the app
// keeps working with no internet — writes stay in the outbox until back online.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL || './'}sw.js`).catch((err) => {
      console.warn('Service worker registration skipped:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

// Register service worker for installable PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('PWA ServiceWorker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err);
      });
  });
}

