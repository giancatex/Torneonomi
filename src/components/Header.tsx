import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Home, ArrowLeft, Settings, Download } from 'lucide-react';

interface HeaderProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
  onHome: () => void;
  onBack: () => void;
  showBack: boolean;
  onSyncFromSheet?: () => void;
}

export default function Header({ isDarkMode, toggleTheme, onHome, onBack, showBack, onSyncFromSheet }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className={`${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'} border-b shadow-sm py-4 shrink-0 flex items-center justify-between px-4 w-full z-10 transition-colors`}>
      <div className="flex items-center w-24 gap-1">
        <button onClick={onHome} className={`rounded-full ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'} transition-colors flex items-center justify-center overflow-hidden`}>
          <img 
            src="/1.png" 
            alt="Home" 
            className="w-14 h-14 object-contain" 
            referrerPolicy="no-referrer" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'block';
              e.currentTarget.parentElement?.classList.add('p-2');
            }} 
          />
          <Home className="w-6 h-6" style={{ display: 'none' }} />
        </button>
        {showBack && (
          <button onClick={onBack} className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'} transition-colors`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <div className="flex items-center justify-center flex-1">
        <span className="text-xl mr-2">👶</span>
        <h1 className="text-lg font-bold tracking-tight">Torneo Nomi <span className="text-xs font-normal text-slate-500 ml-1">v 1.7</span></h1>
      </div>
      
      <div className="flex items-center justify-end w-24 gap-1 relative">
        <button onClick={toggleTheme} className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'} transition-colors`}>
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        {onSyncFromSheet && (
          <div ref={settingsRef} className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'} transition-colors`}
            >
              <Settings className="w-5 h-5" />
            </button>
            {showSettings && (
              <div className={`absolute right-0 top-full mt-2 w-56 rounded-lg shadow-xl border z-50 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'} py-1`}>
                <button
                  onClick={() => {
                    setShowSettings(false);
                    onSyncFromSheet();
                  }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                >
                  <Download className="w-4 h-4" />
                  Sincronizza da Google Sheet
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
