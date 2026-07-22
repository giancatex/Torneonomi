import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Player, fetchDatabase } from '../api';
import { Trophy, X, Users, Swords, CloudUpload, Loader2, Settings, Info, UserMinus, RotateCcw } from 'lucide-react';

interface PhaseTwoProps {
  dataset: Player[];
  gender: 'maschile' | 'femminile';
  syncWithCloud: (payload: any) => Promise<boolean>;
  isDarkMode: boolean;
  onComplete?: () => void;
}

interface DuelLog {
  id: string;
  elo: number;
  match_giocati: number;
  phase: number;
}

export default function PhaseTwo({ dataset, gender, syncWithCloud, isDarkMode, onComplete }: PhaseTwoProps) {
  const [activePool, setActivePool] = useState<Player[]>([]);
  const [duelQueue, setDuelQueue] = useState<DuelLog[]>([]);
  const [currentPair, setCurrentPair] = useState<[Player, Player] | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const [eliminatedList, setEliminatedList] = useState<Player[]>([]);
  const [showEliminated, setShowEliminated] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [lastDuel, setLastDuel] = useState<{p1: Player, p2: Player, outcome: 'A' | 'B' | 'DRAW'} | null>(null);
  const [duelHistory, setDuelHistory] = useState<{playerA: Player, playerB: Player, outcome: 'A' | 'B' | 'DRAW'}[]>([]);

  useEffect(() => {
    const fetchEliminated = async () => {
      try {
        const data = await fetchDatabase(gender);
        setEliminatedList(data.filter(p => p.phase === 0 && (p.elo || 1200) <= 1150));
      } catch (e) {
        console.error(e);
      }
    };
    fetchEliminated();
  }, [gender]);

  const combinedEliminated = React.useMemo(() => {
    const all = [...eliminatedList];
    const locallyEliminated = dataset.filter(p => (p.phase || 0) >= 2 && !activePool.some(a => a.id === p.id));
    for (const p of locallyEliminated) {
      if (!all.some(e => e.id === p.id)) {
        all.push(p);
      }
    }
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, [eliminatedList, dataset, activePool]);

  // Inizializzazione
  useEffect(() => {
    const initialPool = dataset
      .filter(p => (p.phase || 0) >= 2)
      .map(p => ({
        ...p,
        elo: p.elo ?? 1200,
        match_giocati: p.match_giocati ?? 0
      }));
    setActivePool(initialPool);
  }, [dataset]);

  // Selezione Match
  const pickMatch = useCallback(() => {
    if (activePool.length < 2) return;

    // Shuffle per evitare loop deterministici
    const shuffledPool = [...activePool].sort(() => Math.random() - 0.5);

    // 1. Sfidante A: lowest match_giocati con tie-break casuale
    const minMatches = Math.min(...shuffledPool.map(p => p.match_giocati || 0));
    const candidatesA = shuffledPool.filter(p => (p.match_giocati || 0) === minMatches);
    const playerA = candidatesA[Math.floor(Math.random() * candidatesA.length)];

    // 2. Sfidante B: closest Elo con tie-break casuale tra chi ha meno match
    let playerB: Player | null = null;
    let deltaMax = 30;
    
    while (!playerB && deltaMax <= 2000) { // arbitrary max to prevent infinite loop
      const candidates = shuffledPool.filter(p => 
        p.id !== playerA.id && 
        Math.abs((p.elo || 1200) - (playerA.elo || 1200)) <= deltaMax
      );
      
      if (candidates.length > 0) {
        const minMatchesInCandidates = Math.min(...candidates.map(p => p.match_giocati || 0));
        const bestCandidates = candidates.filter(p => (p.match_giocati || 0) === minMatchesInCandidates);
        playerB = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
      } else {
        deltaMax += 20;
      }
    }

    if (!playerB) {
      // Fallback if something goes wrong
      playerB = shuffledPool.find(p => p.id !== playerA.id) || shuffledPool[1];
    }

    // Posizione A o B casuale
    const pair = Math.random() > 0.5 ? [playerA, playerB] : [playerB, playerA];
    setCurrentPair(pair as [Player, Player]);
  }, [activePool]);

  // Initial pick
  useEffect(() => {
    if (activePool.length >= 2 && !currentPair && !isFinished) {
      pickMatch();
    }
  }, [activePool, currentPair, isFinished, pickMatch]);

  // Controlla Condizione di Terminazione
  useEffect(() => {
    if (activePool.length === 0 || isFinished) return;

    const sortedByElo = [...activePool].sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
    const top64 = sortedByElo.slice(0, 64);
    
    const triggerA = activePool.length === 64;
    const triggerB = top64.length === 64 && top64.every(p => (p.match_giocati || 0) >= 10);

    if (triggerA || triggerB) {
      setIsFinished(true);
      setCurrentPair(null);
      
      // Force Fase = 0 for remaining outside top 64
      const updates: DuelLog[] = [];
      const finalPool = [...activePool];
      
      for (let i = 64; i < sortedByElo.length; i++) {
        const p = sortedByElo[i];
        p.phase = 0;
        updates.push({
          id: p.id,
          elo: p.elo || 1200,
          match_giocati: p.match_giocati || 0,
          phase: 0
        });
      }
      
      setActivePool(top64);
      setDuelQueue(prev => [...prev, ...updates]);
      
      // Force final sync in a bit
      setTimeout(() => triggerSync(true), 1000);
    }
  }, [activePool, isFinished]);

  const triggerSync = async (force = false) => {
    if ((duelQueue.length < 20 && !force) || isSyncing || duelQueue.length === 0) return;
    
    setIsSyncing(true);
    const payloadQueue = [...duelQueue];
    setDuelQueue([]); // Svuota subito
    
    try {
      const success = await syncWithCloud(payloadQueue);
      if (!success) {
        throw new Error("Sync failed");
      }
    } catch (e) {
      // Reintegra
      setDuelQueue(prev => [...payloadQueue, ...prev]);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-Sync Resiliente
  useEffect(() => {
    if (duelQueue.length >= 1 && !isSyncing) {
      triggerSync();
    }
  }, [duelQueue.length, isSyncing]);

  const handleOutcome = (outcome: 'A' | 'B' | 'DRAW') => {
    if (!currentPair) return;

    const [playerA, playerB] = currentPair;

    // Salva copia esatta dello stato precedente dei due sfidanti
    const origA: Player = { ...playerA };
    const origB: Player = { ...playerB };

    const eloA = playerA.elo || 1200;
    const eloB = playerB.elo || 1200;
    
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedB = 1 - expectedA;
    
    const K = 32;
    let scoreA = 0.5;
    let scoreB = 0.5;
    
    if (outcome === 'A') {
      scoreA = 1; scoreB = 0;
    } else if (outcome === 'B') {
      scoreA = 0; scoreB = 1;
    }

    const newEloA = Math.round(eloA + K * (scoreA - expectedA));
    const newEloB = Math.round(eloB + K * (scoreB - expectedB));
    
    const pAMatches = (playerA.match_giocati || 0) + 1;
    const pBMatches = (playerB.match_giocati || 0) + 1;

    const dropA = newEloA <= 1150;
    const dropB = newEloB <= 1150;

    const logs: DuelLog[] = [];
    
    const newPool = activePool.filter(p => {
      if (p.id === playerA.id) {
        if (dropA) {
          logs.push({ id: p.id, elo: newEloA, match_giocati: pAMatches, phase: 0 });
          return false;
        }
        p.elo = newEloA;
        p.match_giocati = pAMatches;
        logs.push({ id: p.id, elo: newEloA, match_giocati: pAMatches, phase: p.phase || 2 });
        return true;
      }
      if (p.id === playerB.id) {
        if (dropB) {
          logs.push({ id: p.id, elo: newEloB, match_giocati: pBMatches, phase: 0 });
          return false;
        }
        p.elo = newEloB;
        p.match_giocati = pBMatches;
        logs.push({ id: p.id, elo: newEloB, match_giocati: pBMatches, phase: p.phase || 2 });
        return true;
      }
      return true;
    });

    setDuelHistory(prev => [...prev, { playerA: origA, playerB: origB, outcome }]);
    setLastDuel({ p1: origA, p2: origB, outcome });

    setActivePool(newPool);
    setDuelQueue(prev => [...prev, ...logs]);
    setCurrentPair(null); // will trigger pickMatch
  };

  const handleUndoLastDuel = () => {
    if (duelHistory.length === 0) return;

    const last = duelHistory[duelHistory.length - 1];
    const newHistory = duelHistory.slice(0, -1);
    setDuelHistory(newHistory);

    const origA = last.playerA;
    const origB = last.playerB;

    // Ripristina origA e origB in activePool con ELO e match giocati originali
    setActivePool(prevPool => {
      let pool = [...prevPool];
      let hasA = false;
      let hasB = false;

      pool = pool.map(p => {
        if (p.id === origA.id) {
          hasA = true;
          return { ...origA };
        }
        if (p.id === origB.id) {
          hasB = true;
          return { ...origB };
        }
        return p;
      });

      if (!hasA) pool.push({ ...origA });
      if (!hasB) pool.push({ ...origB });

      return pool;
    });

    // Invia log di ripristino
    const restoreLogs: DuelLog[] = [
      { id: origA.id, elo: origA.elo || 1200, match_giocati: origA.match_giocati || 0, phase: origA.phase || 2 },
      { id: origB.id, elo: origB.elo || 1200, match_giocati: origB.match_giocati || 0, phase: origB.phase || 2 }
    ];
    setDuelQueue(prev => [...prev, ...restoreLogs]);

    // Imposta la coppia corrente sui due giocatori per ripetere lo scontro
    setCurrentPair([origA, origB]);

    // Aggiorna banner ultimo scontro
    if (newHistory.length > 0) {
      const prevDuel = newHistory[newHistory.length - 1];
      setLastDuel({ p1: prevDuel.playerA, p2: prevDuel.playerB, outcome: prevDuel.outcome });
    } else {
      setLastDuel(null);
    }

    if (isFinished) {
      setIsFinished(false);
    }
  };

  const calculateProgress = () => {
    if (activePool.length === 0) return 0;
    
    const initialCount = dataset.filter(p => (p.phase || 0) >= 2).length;
    let progressA = 0;
    if (initialCount > 64) {
      const targetEliminations = initialCount - 64;
      const currentEliminations = initialCount - activePool.length;
      progressA = (currentEliminations / targetEliminations) * 100;
    } else {
      progressA = 100;
    }

    const sortedByElo = [...activePool].sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
    const top64 = sortedByElo.slice(0, 64);
    const targetMatches = 64 * 10;
    let currentMatches = 0;
    for (const p of top64) {
      currentMatches += Math.min(p.match_giocati || 0, 10);
    }
    const progressB = (currentMatches / targetMatches) * 100;

    // Poiché la fase finisce quando *almeno una* delle due condizioni si verifica (OR),
    // il progresso reale verso la fine è il valore più alto tra i due.
    const percent = Math.floor(Math.max(progressA, progressB));
    return Math.min(100, Math.max(0, percent));
  };

  const bgClasses = isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900';
  const cardClasses = isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-200 hover:bg-slate-50';

  return (
    <div className={`h-full w-full flex flex-col ${bgClasses}`}>
      <div className="flex justify-center items-center p-4 shrink-0 border-b border-opacity-20 border-current">
        <div className="w-full max-w-sm h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${calculateProgress()}%` }}
          />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {isFinished ? (
          <div className="text-center space-y-4">
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto" />
            <h2 className="text-2xl font-bold">Fase 2 Completata!</h2>
            <p className="opacity-80">I Top 64 sono stati definiti.</p>
            {duelQueue.length > 0 && <p className="text-sm text-blue-400">Sincronizzazione in corso...</p>}
            
            <div className="flex flex-col sm:flex-row justify-center gap-4 mt-6">
              <button 
                onClick={() => setShowLeaderboard(true)}
                className={`px-6 py-3 rounded-xl border font-medium flex items-center justify-center gap-2 transition-colors ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Trophy className="w-5 h-5" />
                Classifica Completa
              </button>
              
              {onComplete && duelQueue.length === 0 && (
                <button 
                  onClick={onComplete}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
                >
                  Procedi alla Fase 3
                </button>
              )}
            </div>
          </div>
        ) : activePool.length < 2 ? (
          <div className="text-center p-8">
            <Trophy className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-lg opacity-80">Non ci sono abbastanza superstiti (minimo 2) per iniziare i duelli.</p>
          </div>
        ) : currentPair ? (
          <div className="w-full max-w-4xl flex flex-col md:flex-row gap-6 md:gap-8 items-stretch h-full py-8">
            <button 
              onClick={() => handleOutcome('A')}
              className={`flex-1 flex flex-col items-center justify-center border rounded-2xl p-8 transition-all shadow-sm ${cardClasses}`}
            >
              <h2 className="text-3xl md:text-5xl font-bold mb-6 text-center">{currentPair[0].name}</h2>
              <div className="flex gap-4 opacity-70 text-sm md:text-base">
                <span>Elo: {currentPair[0].elo}</span>
                <span>•</span>
                <span>Match: {currentPair[0].match_giocati}</span>
              </div>
            </button>

            <div className="flex items-center justify-center shrink-0 relative w-full sm:w-auto h-16 sm:h-auto my-2 sm:my-0">
              <button 
                onClick={() => handleOutcome('DRAW')}
                className={`absolute left-4 sm:left-auto sm:right-[calc(100%+1rem)] px-4 py-2 text-sm font-medium rounded-full transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-black'}`}
              >
                Pareggio
              </button>
              <div className={`p-4 rounded-full ${isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                <Swords className="w-8 h-8" />
              </div>
              <button 
                onClick={() => setShowSettings(true)}
                className={`absolute right-4 sm:right-auto sm:left-[calc(100%+1rem)] p-3 rounded-full transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-black'}`}
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>

            <button 
              onClick={() => handleOutcome('B')}
              className={`flex-1 flex flex-col items-center justify-center border rounded-2xl p-8 transition-all shadow-sm ${cardClasses}`}
            >
              <h2 className="text-3xl md:text-5xl font-bold mb-6 text-center">{currentPair[1].name}</h2>
              <div className="flex gap-4 opacity-70 text-sm md:text-base">
                <span>Elo: {currentPair[1].elo}</span>
                <span>•</span>
                <span>Match: {currentPair[1].match_giocati}</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="animate-pulse">Caricamento sfidanti...</div>
        )}
      </div>



      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm flex flex-col rounded-2xl shadow-2xl overflow-hidden p-6 gap-6 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" />
                Opzioni Torneo
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center p-4 rounded-xl border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-lg">{activePool.length} Superstiti</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden max-w-[200px]">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${calculateProgress()}%` }}
                  />
                </div>
                <span className="text-xs opacity-70 mt-2">Progresso Fase 2: {calculateProgress()}%</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setShowSettings(false);
                    setShowLeaderboard(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                >
                  <Trophy className="w-5 h-5" />
                  Classifica
                </button>
                <button 
                  onClick={() => {
                    setShowSettings(false);
                    setShowEliminated(true);
                  }}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-medium transition-colors ${
                    isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <UserMinus className="w-5 h-5" />
                  Eliminati ({combinedEliminated.length})
                </button>
              </div>

              <button 
                onClick={() => {
                  setShowSettings(false);
                  handleUndoLastDuel();
                }}
                disabled={duelHistory.length === 0}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDarkMode ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <RotateCcw className="w-5 h-5" />
                Annulla e rigioca scontro precedente
              </button>

              <button 
                onClick={() => {
                  setShowSettings(false);
                  setShowRules(true);
                }}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-medium transition-colors ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Info className="w-5 h-5" />
                Regole Fase 2
              </button>
              
              <button 
                onClick={() => {
                  triggerSync(true);
                  setShowSettings(false);
                }}
                disabled={isSyncing || duelQueue.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-50 mt-2"
              >
                {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
                Salva in Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaderboard && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm">
          <div className={`w-full max-w-2xl h-[95vh] sm:max-h-[80vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className={`flex justify-between items-center p-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Classifica
              </h3>
              <button 
                onClick={() => setShowLeaderboard(false)}
                className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 sm:p-4">
              <div className="flex flex-col gap-2">
                {[...activePool, ...combinedEliminated].sort((a, b) => (b.elo || 1200) - (a.elo || 1200)).map((player, idx) => {
                  const isEliminated = combinedEliminated.some(e => e.id === player.id);
                  const isPassed = isFinished && !isEliminated;
                  
                  return (
                  <div key={player.id} className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border ${
                    isEliminated 
                      ? (isDarkMode ? 'bg-red-900/20 border-red-800/50 opacity-60' : 'bg-red-50 border-red-200 opacity-60')
                      : isPassed
                        ? (isDarkMode ? 'bg-emerald-900/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200')
                        : (isDarkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-200')
                  }`}>
                    <div className="flex items-center gap-2 sm:gap-4 truncate mr-2">
                      <span className={`w-6 sm:w-8 text-center font-bold text-sm sm:text-base shrink-0 ${idx < 3 && !isEliminated ? 'text-yellow-500' : 'opacity-50'}`}>
                        #{idx + 1}
                      </span>
                      <span className="font-medium text-base sm:text-lg truncate flex items-center gap-2">
                        {player.name}
                        {isPassed && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">Passato</span>}
                        {isEliminated && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400">Eliminato</span>}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center sm:gap-6 text-xs sm:text-sm opacity-80 shrink-0">
                      <span className="sm:w-24 text-right">Elo: <span className={`font-mono font-bold ${isEliminated ? 'text-red-400' : 'text-blue-400'}`}>{player.elo}</span></span>
                      <span className="sm:w-20 text-right">Match: {player.match_giocati}</span>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          </div>
        </div>
      )}

      {showEliminated && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm">
          <div className={`w-full max-w-2xl h-[95vh] sm:max-h-[80vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className={`flex justify-between items-center p-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <UserMinus className="w-5 h-5 text-red-500" />
                Nomi Eliminati
              </h3>
              <button 
                onClick={() => setShowEliminated(false)}
                className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 sm:p-4">
              <div className="flex flex-col gap-2">
                {combinedEliminated.length === 0 ? (
                  <p className="text-center opacity-60 p-4">Nessun nome ancora eliminato.</p>
                ) : (
                  combinedEliminated.map((player) => (
                    <div key={player.id} className={`flex items-center p-2 sm:p-3 rounded-lg border ${isDarkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="font-medium text-base sm:text-lg truncate">{player.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRules && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm">
          <div className={`w-full max-w-lg flex flex-col rounded-2xl shadow-2xl overflow-hidden p-6 gap-6 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-500" />
                Regole Fase 2
              </h3>
              <button 
                onClick={() => setShowRules(false)}
                className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex flex-col gap-4 text-sm sm:text-base opacity-90 overflow-y-auto max-h-[70vh] pr-2">
              <p>In questa fase i nomi superstiti si scontrano a due a due per determinare i migliori 64.</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Clicca sul nome che preferisci per farlo vincere. Guadagnerà punteggio Elo, l'altro lo perderà.</li>
                <li>Se non sai decidere, clicca su <strong>Pareggio</strong> per assegnare a entrambi lo stesso punteggio.</li>
              </ul>
              <p>Un nome viene <strong className="text-red-400">eliminato automaticamente</strong> se il suo Elo scende sotto 1150.</p>
              <p>La fase 2 termina quando restano in gara esattamente 64 superstiti.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
