import { useState, useMemo, useRef, useEffect, UIEvent } from 'react';
import { Player, syncPhaseOneBatch } from '../api';
import { CloudUpload, Loader2, Info, X } from 'lucide-react';

interface PhaseOneProps {
  dataset: Player[];
  resumeBlock: number;
  onComplete: (savedNames: Player[]) => void;
  isDarkMode: boolean;
  gender: 'maschile' | 'femminile';
  onScrollDirectionChange?: (isScrollingDown: boolean) => void;
}

interface HistoryState {
  blockIndex: number;
  savedNames: Player[];
  savedNamesCount: number;
  pendingAccepted: string[];
  pendingRejected: string[];
}

export default function PhaseOne({ dataset, resumeBlock, onComplete, isDarkMode, gender, onScrollDirectionChange }: PhaseOneProps) {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(() => {
    const saved = localStorage.getItem(`optin_block_${gender}`);
    return saved ? parseInt(saved, 10) : resumeBlock;
  });

  const [pendingAccepted, setPendingAccepted] = useState<string[]>(() => {
    const saved = localStorage.getItem(`optin_accepted_${gender}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [pendingRejected, setPendingRejected] = useState<string[]>(() => {
    const saved = localStorage.getItem(`optin_rejected_${gender}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [savedNames, setSavedNames] = useState<Player[]>(() => {
    const saved = localStorage.getItem(`optin_saved_names_${gender}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [savedNamesCount, setSavedNamesCount] = useState<number>(() => {
    const saved = localStorage.getItem(`saved_count_${gender}`);
    if (saved) return parseInt(saved, 10);
    const legacySaved = localStorage.getItem(`optin_saved_names_${gender}`);
    if (legacySaved) return JSON.parse(legacySaved).length;
    return 0;
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  useEffect(() => {
    setHasScrolledToBottom(false);
    lastScrollTop.current = 0;
    if (onScrollDirectionChange) onScrollDirectionChange(false);
    setTimeout(() => {
      if (scrollContainerRef.current) {
        const { scrollTop, clientHeight, scrollHeight } = scrollContainerRef.current;
        if (scrollHeight <= clientHeight + 10) {
          setHasScrolledToBottom(true);
        }
      }
    }, 100);
  }, [currentBlockIndex, onScrollDirectionChange]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    
    // Direction tracking
    if (onScrollDirectionChange) {
      if (scrollTop > lastScrollTop.current && scrollTop > 50) {
        onScrollDirectionChange(true); // scrolling down
      } else if (scrollTop < lastScrollTop.current) {
        onScrollDirectionChange(false); // scrolling up
      }
    }
    lastScrollTop.current = scrollTop;

    if (!hasScrolledToBottom) {
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        setHasScrolledToBottom(true);
      }
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [historyBuffer, setHistoryBuffer] = useState<HistoryState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const blocks = useMemo(() => {
    if (!dataset || dataset.length === 0) return [];

    // 1. Stratificazione
    const stratificato: Record<number, Player[]> = {};
    dataset.forEach(p => {
      const freq = p.frequency || 0;
      if (!stratificato[freq]) stratificato[freq] = [];
      stratificato[freq].push(p);
    });

    // 2. Calcolo Pesi
    const pesi: Record<number, number> = {};
    Object.keys(stratificato).forEach(k => {
      const freq = parseInt(k, 10);
      pesi[freq] = stratificato[freq].length / dataset.length;
    });

    // 3. Randomizzazione Deterministica
    // Usiamo un seed basato sulla lunghezza del dataset per avere sempre lo stesso shuffle
    // a parità di dataset (così i ricaricamenti non rimescolano i blocchi già visti)
    let seed = dataset.length;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const randomizza = (arr: Player[]) => {
      const m = [...arr];
      for (let i = m.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [m[i], m[j]] = [m[j], m[i]];
      }
      return m;
    };

    const estratificatiShuffled: Record<number, Player[]> = {};
    Object.keys(stratificato).forEach(k => {
      estratificatiShuffled[parseInt(k, 10)] = randomizza(stratificato[parseInt(k, 10)]);
    });

    // 4 & 5. Composizione Blocco & Compensazione Resti
    const result: Player[][] = [];
    const size = 50;
    const numBlocchi = Math.ceil(dataset.length / size);

    for (let b = 0; b < numBlocchi; b++) {
      const block: Player[] = [];
      
      Object.keys(pesi).forEach(k => {
        const freq = parseInt(k, 10);
        if (b === numBlocchi - 1) {
          block.push(...estratificatiShuffled[freq]);
          estratificatiShuffled[freq] = [];
        } else {
          const daPrendere = Math.floor(size * pesi[freq]);
          const presi = estratificatiShuffled[freq].splice(0, Math.min(daPrendere, estratificatiShuffled[freq].length));
          block.push(...presi);
        }
      });

      if (b !== numBlocchi - 1) {
        // Compensazione
        while (block.length < size) {
          let maxFreq = -1;
          let maxRem = -1;
          Object.keys(estratificatiShuffled).forEach(k => {
            const freq = parseInt(k, 10);
            if (estratificatiShuffled[freq].length > maxRem) {
              maxRem = estratificatiShuffled[freq].length;
              maxFreq = freq;
            }
          });
          
          if (maxFreq !== -1 && maxRem > 0) {
            const preso = estratificatiShuffled[maxFreq].shift();
            if (preso) block.push(preso);
          } else {
            break;
          }
        }
      }

      // 6. Ordinamento
      const groupA = block.filter(p => p.frequency === 1 || p.frequency === 2);
      const groupB = block.filter(p => p.frequency === 3 || p.frequency === 4);
      
      groupA.sort((a, b) => a.name.localeCompare(b.name));
      groupB.sort((a, b) => a.name.localeCompare(b.name));
      
      result.push([...groupA, ...groupB]);
    }

    return result;
  }, [dataset]);

  const currentBlock = blocks[currentBlockIndex] || [];
  const totaleBlocchi = blocks.length;

  // Calcolo minimo obbligatorio
  const nomiMancanti = Math.max(0, 250 - savedNamesCount);
  const blocchiRimanenti = Math.max(1, totaleBlocchi - currentBlockIndex);
  const minRequired = Math.min(currentBlock.length, Math.ceil(nomiMancanti / blocchiRimanenti));

  const handleCellClick = (player: Player) => {
    const isSelected = selectedIds.includes(player.id);
    
    if (isSelected) {
      setSelectedIds(prev => prev.filter(id => id !== player.id));
    } else {
      setSelectedIds(prev => [...prev, player.id]);
    }
  };

  const handleSync = async (
    acceptedToSync: string[] = pendingAccepted, 
    rejectedToSync: string[] = pendingRejected, 
    blockToSync: number = currentBlockIndex,
    namesToComplete?: Player[]
  ) => {
    setIsSyncing(true);
    try {
      const res = await syncPhaseOneBatch(gender, acceptedToSync, rejectedToSync, blockToSync);
      if (res.success) {
        setPendingAccepted([]);
        setPendingRejected([]);
        localStorage.setItem(`optin_accepted_${gender}`, JSON.stringify([]));
        localStorage.setItem(`optin_rejected_${gender}`, JSON.stringify([]));
        
        if (namesToComplete) {
          onComplete(namesToComplete);
        }
      }
    } catch (error) {
      console.error("Sync error", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCommit = () => {
    setHistoryBuffer({
      blockIndex: currentBlockIndex,
      savedNames: [...savedNames],
      savedNamesCount: savedNamesCount,
      pendingAccepted: [...pendingAccepted],
      pendingRejected: [...pendingRejected]
    });

    const selectedPlayers = currentBlock.filter(p => selectedIds.includes(p.id));
    const newSavedNames = [...savedNames, ...selectedPlayers];
    setSavedNames(newSavedNames);
    localStorage.setItem(`optin_saved_names_${gender}`, JSON.stringify(newSavedNames));

    const newSavedNamesCount = savedNamesCount + selectedIds.length;
    setSavedNamesCount(newSavedNamesCount);
    localStorage.setItem(`saved_count_${gender}`, newSavedNamesCount.toString());

    const blockAccepted = selectedIds;
    const blockRejected = currentBlock.map(p => p.id).filter(id => !selectedIds.includes(id));

    const newPendingAccepted = [...pendingAccepted, ...blockAccepted];
    const newPendingRejected = [...pendingRejected, ...blockRejected];
    
    setPendingAccepted(newPendingAccepted);
    setPendingRejected(newPendingRejected);
    localStorage.setItem(`optin_accepted_${gender}`, JSON.stringify(newPendingAccepted));
    localStorage.setItem(`optin_rejected_${gender}`, JSON.stringify(newPendingRejected));

    setSelectedIds([]);

    const nextIndex = currentBlockIndex + 1;
    setCurrentBlockIndex(nextIndex);
    localStorage.setItem(`optin_block_${gender}`, nextIndex.toString());

    if (nextIndex >= totaleBlocchi) {
      handleSync(newPendingAccepted, newPendingRejected, nextIndex, newSavedNames);
    }
  };

  const handleRollback = () => {
    if (historyBuffer) {
      setCurrentBlockIndex(historyBuffer.blockIndex);
      setSavedNames(historyBuffer.savedNames);
      setSavedNamesCount(historyBuffer.savedNamesCount);
      setPendingAccepted(historyBuffer.pendingAccepted);
      setPendingRejected(historyBuffer.pendingRejected);
      
      localStorage.setItem(`optin_block_${gender}`, historyBuffer.blockIndex.toString());
      localStorage.setItem(`optin_saved_names_${gender}`, JSON.stringify(historyBuffer.savedNames));
      localStorage.setItem(`saved_count_${gender}`, historyBuffer.savedNamesCount.toString());
      localStorage.setItem(`optin_accepted_${gender}`, JSON.stringify(historyBuffer.pendingAccepted));
      localStorage.setItem(`optin_rejected_${gender}`, JSON.stringify(historyBuffer.pendingRejected));
      
      setSelectedIds([]); 
      setHistoryBuffer(null);
    }
  };

  const isSelectionValid = selectedIds.length >= minRequired;
  const pendingCount = pendingAccepted.length + pendingRejected.length;

  return (
    <div className={`flex flex-col h-full w-full transition-colors relative ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className={`h-14 shrink-0 px-4 flex items-center justify-between border-b ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">Blocco: {currentBlockIndex + 1} / {totaleBlocchi}</div>
          <button onClick={() => setShowInfo(true)} className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-blue-400' : 'hover:bg-slate-200 text-blue-600'}`}>
            <Info className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium">Salvati: {savedNamesCount} / Target: 250</div>
          <button 
            onClick={() => handleSync()}
            disabled={isSyncing || pendingCount === 0}
            className={`relative flex items-center p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
            title="Sincronizza Cloud"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
            {pendingCount > 0 && !isSyncing && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto p-2 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}
      >
        {currentBlockIndex >= totaleBlocchi ? (
          <div className="flex flex-col items-center justify-center h-full">
            {isSyncing ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-sm font-medium">Sincronizzazione finale in corso...</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-4">Completato. In attesa di sincronizzazione...</p>
                <button
                  onClick={() => handleSync()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500"
                >
                  Riprova Sincronizzazione
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {currentBlock.map(player => {
              const isSelected = selectedIds.includes(player.id);
              return (
                <button
                  key={player.id}
                  onClick={() => handleCellClick(player)}
                  className={`h-16 md:h-20 text-base md:text-lg font-medium text-center px-2 flex items-center justify-center rounded-lg shadow-sm transition-transform active:scale-95 border ${
                    isSelected 
                      ? 'bg-emerald-600 border-emerald-500 text-white' 
                      : (isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800')
                  }`}
                >
                  <span className="select-none">
                    {player.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {currentBlockIndex < totaleBlocchi && (
        <div className={`shrink-0 p-2 text-center text-sm font-medium border-t ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          {!hasScrolledToBottom ? (
            <span className="text-amber-500">Scorri fino in fondo per vedere tutti i nomi.</span>
          ) : !isSelectionValid ? (
            <span className="text-amber-500">Seleziona almeno {minRequired} nomi per proseguire.</span>
          ) : (
            <span className="text-emerald-500">Pronto per procedere.</span>
          )}
        </div>
      )}

      <footer className={`h-16 shrink-0 grid grid-cols-2 gap-4 p-3 border-t ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="h-full">
          {historyBuffer && currentBlockIndex < totaleBlocchi && (
            <button
              onClick={handleRollback}
              disabled={isSyncing}
              className={`w-full h-full rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                isDarkMode 
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              Annulla Ultimo
            </button>
          )}
        </div>
        <button
          onClick={handleCommit}
          disabled={isSyncing || currentBlockIndex >= totaleBlocchi || !hasScrolledToBottom || !isSelectionValid}
          className="w-full h-full rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm font-semibold flex items-center justify-center col-start-2 disabled:opacity-50"
        >
          Conferma e Procedi
        </button>
      </footer>

      {showInfo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`border rounded-2xl p-6 w-full max-w-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'}`}>
            <h3 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Regole Fase 1</h3>
            <p className={`text-sm mb-4 leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              In questa fase ti verranno mostrati blocchi di 50 nomi. Dovrai selezionare un minimo di nomi (calcolato in modo dinamico) in ogni blocco.
            </p>
            <p className={`text-sm mb-4 leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              I nomi sono stratificati e randomizzati per darti una scelta bilanciata. Per procedere al blocco successivo, devi scorrere fino in fondo.
            </p>
            <p className={`text-sm mb-6 leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              L'obiettivo è salvare almeno 250 nomi complessivi, che accederanno alla Fase 2.
            </p>
            <button onClick={() => setShowInfo(false)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">Chiudi</button>
          </div>
        </div>
      )}
    </div>
  );
}
