import React, { useState, useEffect } from 'react';
import { Player, syncPhaseThreeBatch } from '../api';
import { Info, Save, Undo, List, Check, X, ShieldAlert, User, ArrowRight } from 'lucide-react';

interface PhaseThreeProps {
  dataset: Player[];
  gender: string;
  isDarkMode: boolean;
  onComplete: () => void;
}

interface SeededPlayer extends Player {
  seed: number;
}

interface Match {
  id: string;
  round: number; // 1: 32esimi, 2: 16esimi, 3: Top 16
  indexInRound: number;
  p1: SeededPlayer | null;
  p2: SeededPlayer | null;
  winner: string | 'BOTH' | null;
}

interface ParentVoteState {
  step: number; 
  p1Vote: string | null;
  p2Vote: string | null;
}

interface GameState {
  matches: Match[];
  currentMatchIndex: number;
  actionQueue: { id: string; phase: number }[];
  parentVoteState: ParentVoteState;
}

function getBracketOrder(numPlayers: number): number[] {
  let matches = [1, 2];
  const rounds = Math.log2(numPlayers) - 1;
  for (let r = 1; r <= rounds; r++) {
    const newMatches: number[] = [];
    const sum = Math.pow(2, r + 1) + 1;
    for (let i = 0; i < matches.length; i++) {
      newMatches.push(matches[i], sum - matches[i]);
    }
    matches = newMatches;
  }
  return matches;
}

function initBracket(players: Player[]): GameState {
  // Use players that have completed Phase 2 (they should have phase >= 3 or at least we take top 64 by ELO)
  // We will assume any player reaching Phase 3 is eligible. If they don't have phase updated, we just take top 64.
  const eligible = players.filter(p => p.phase && p.phase >= 2);
  const sorted = [...eligible].sort((a, b) => {
    const eloDiff = (b.elo || 1200) - (a.elo || 1200);
    if (eloDiff !== 0) return eloDiff;
    return Math.random() - 0.5; // Random fallback for ties
  });
  
  const seeded: SeededPlayer[] = sorted.slice(0, 64).map((p, i) => ({ ...p, seed: i + 1 }));
  
  const order = getBracketOrder(64);
  const matches: Match[] = [];
  
  // Round 1: 32 matches
  for (let i = 0; i < 32; i++) {
    const s1 = order[i * 2];
    const s2 = order[i * 2 + 1];
    matches.push({
      id: `R1-${i}`,
      round: 1,
      indexInRound: i,
      p1: seeded.find(p => p.seed === s1) || null,
      p2: seeded.find(p => p.seed === s2) || null,
      winner: null
    });
  }
  
  // Round 2: 16 matches
  for (let i = 0; i < 16; i++) {
    matches.push({ id: `R2-${i}`, round: 2, indexInRound: i, p1: null, p2: null, winner: null });
  }
  
  // Round 3 (Top 16): 8 matches
  for (let i = 0; i < 8; i++) {
    matches.push({ id: `R3-${i}`, round: 3, indexInRound: i, p1: null, p2: null, winner: null });
  }

  return {
    matches,
    currentMatchIndex: 0,
    actionQueue: [],
    parentVoteState: { step: 0, p1Vote: null, p2Vote: null }
  };
}

export default function PhaseThree({ dataset, gender, isDarkMode, onComplete }: PhaseThreeProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [showInfo, setShowInfo] = useState(false);
  const [showBracket, setShowBracket] = useState(false);
  const [bracketTab, setBracketTab] = useState(1);
  const [showResultsType, setShowResultsType] = useState<'promossi' | 'eliminati' | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`bracket_state_${gender}`);
    if (saved) {
      setState(JSON.parse(saved));
    } else {
      const freshState = initBracket(dataset);
      setState(freshState);
      localStorage.setItem(`bracket_state_${gender}`, JSON.stringify(freshState));
    }
  }, [dataset, gender]);

  useEffect(() => {
    if (state && state.actionQueue.length >= 5 && !isSyncing) {
      performSync();
    }
    if (state) {
      localStorage.setItem(`bracket_state_${gender}`, JSON.stringify(state));
    }
  }, [state]);

  const performSync = async () => {
    if (!state || state.actionQueue.length === 0) return;
    setIsSyncing(true);
    const queueToSync = [...state.actionQueue];
    setState(s => s ? { ...s, actionQueue: [] } : s);
    
    try {
      await syncPhaseThreeBatch(gender, queueToSync);
    } catch (e) {
      console.error(e);
      setState(s => s ? { ...s, actionQueue: [...queueToSync, ...s.actionQueue] } : s);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleWin = (winnerId: string, both: boolean = false) => {
    if (!state) return;
    const newState = JSON.parse(JSON.stringify(state)) as GameState;
    const match = newState.matches[newState.currentMatchIndex];
    
    match.winner = both ? 'BOTH' : winnerId;
    
    const p1 = match.p1;
    const p2 = match.p2;
    
    if (match.round === 1 || match.round === 2) {
      if (p1 && p2) {
        const loserId = p1.id === winnerId ? p2.id : p1.id;
        newState.actionQueue.push({ id: loserId, phase: 0 });
      }
      
      const nextMatchRoundOffset = match.round === 1 ? 32 : 48;
      const nextMatchIndexOffset = Math.floor(match.indexInRound / 2);
      const nextMatch = newState.matches[nextMatchRoundOffset + nextMatchIndexOffset];
      const isP1 = match.indexInRound % 2 === 0;
      
      const winnerPlayer = p1?.id === winnerId ? p1 : (p2?.id === winnerId ? p2 : null);
      if (isP1) {
        nextMatch.p1 = winnerPlayer;
      } else {
        nextMatch.p2 = winnerPlayer;
      }
    } else if (match.round === 3) {
      if (both) {
        if (p1) newState.actionQueue.push({ id: p1.id, phase: 4 });
        if (p2) newState.actionQueue.push({ id: p2.id, phase: 4 });
      } else {
        if (p1 && p2) {
          const loserId = p1.id === winnerId ? p2.id : p1.id;
          newState.actionQueue.push({ id: winnerId, phase: 4 });
          newState.actionQueue.push({ id: loserId, phase: 0 });
        } else if (p1 || p2) {
          newState.actionQueue.push({ id: winnerId, phase: 4 });
        }
      }
    }
    
    newState.currentMatchIndex++;
    newState.parentVoteState = { step: 0, p1Vote: null, p2Vote: null };
    
    setHistoryStack([...historyStack, state]);
    setState(newState);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setHistoryStack(historyStack.slice(0, -1));
    setState(prev);
  };

  const updateVoteState = (updates: Partial<ParentVoteState>) => {
    if (!state) return;
    const newState = JSON.parse(JSON.stringify(state)) as GameState;
    newState.parentVoteState = { ...newState.parentVoteState, ...updates };
    setState(newState);
  };

  const resolveTop16 = (papaChoice: string) => {
    updateVoteState({ step: 4, p2Vote: papaChoice });
  };

  const advanceTop16 = () => {
    const mammaChoice = state!.parentVoteState.p1Vote;
    const papaChoice = state!.parentVoteState.p2Vote;
    if (mammaChoice === papaChoice) {
      handleWin(papaChoice!, false);
    } else {
      handleWin('', true); // BOTH
    }
  };

  const getResults = () => {
    if (!state) return { promossi: [], eliminati: [] };
    const promossi: SeededPlayer[] = [];
    const eliminati: SeededPlayer[] = [];

    for (const match of state.matches) {
      if (match.round === 1 || match.round === 2) {
        if (match.winner) {
          if (match.p1 && match.winner !== match.p1.id) eliminati.push(match.p1);
          if (match.p2 && match.winner !== match.p2.id) eliminati.push(match.p2);
        }
      } else if (match.round === 3) {
        if (match.winner === 'BOTH') {
          if (match.p1) promossi.push(match.p1);
          if (match.p2) promossi.push(match.p2);
        } else if (match.winner) {
          if (match.p1?.id === match.winner) promossi.push(match.p1);
          else if (match.p1) eliminati.push(match.p1);
          
          if (match.p2?.id === match.winner) promossi.push(match.p2);
          else if (match.p2) eliminati.push(match.p2);
        }
      }
    }
    return { promossi, eliminati };
  };

  if (!state) return <div className="p-8 text-center text-slate-400">Caricamento tabellone...</div>;

  if (state.currentMatchIndex >= 56) {
    const { promossi, eliminati } = getResults();
    
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-6 gap-6 relative ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-lg">
          <Check className="w-10 h-10" />
        </div>
        <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Fase 3 Completata!</h2>
        <p className={`text-center max-w-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tutti i match sono stati disputati. I promossi accedono alla Fase 4.</p>
        
        <div className="w-full flex gap-4 mt-2">
          <button 
            onClick={() => setShowResultsType('promossi')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm shadow-md transition-colors ${isDarkMode ? 'bg-slate-800 text-green-400 hover:bg-slate-700' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
          >
            Promossi ({promossi.length})
          </button>
          <button 
            onClick={() => setShowResultsType('eliminati')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm shadow-md transition-colors ${isDarkMode ? 'bg-slate-800 text-red-400 hover:bg-slate-700' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
          >
            Eliminati ({eliminati.length})
          </button>
        </div>

        <button 
          onClick={async () => {
            if (state.actionQueue.length > 0) {
              await performSync();
            }
            onComplete();
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-xl w-full flex items-center justify-center shadow-md transition-colors mt-4"
        >
          {isSyncing ? 'Sincronizzazione...' : 'Procedi alla Fase 4'}
          {!isSyncing && <ArrowRight className="w-5 h-5 ml-2" />}
        </button>

        {showResultsType && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className={`border rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'}`}>
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className={`text-xl font-bold ${showResultsType === 'promossi' ? 'text-green-500' : 'text-red-500'}`}>
                  {showResultsType === 'promossi' ? 'Nomi Promossi alla Fase 4' : 'Nomi Eliminati'}
                </h3>
                <button onClick={() => setShowResultsType(null)} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 gap-2 flex flex-col">
                {(showResultsType === 'promossi' ? promossi : eliminati).map(p => (
                  <div key={p.id} className={`p-3 rounded-xl border flex justify-between items-center ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{p.name}</span>
                    
                  </div>
                ))}
                {(showResultsType === 'promossi' ? promossi : eliminati).length === 0 && (
                  <div className="text-center text-slate-500 p-4">Nessun nome in questa lista.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const m = state.matches[state.currentMatchIndex];
  
  if (!m.p1 || !m.p2) {
     return (
       <div className={`flex-1 flex flex-col items-center justify-center p-6 gap-6 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
         <h3 className={`text-xl font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Passaggio Turno Automatico</h3>
         <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Match incompleto (Avversario assente)</p>
         <button onClick={() => handleWin(m.p1?.id || m.p2?.id || 'none')} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl text-white font-bold w-full shadow-md">
           Avanza
         </button>
       </div>
     );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-0 relative ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className={`flex justify-between items-center p-4 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="flex gap-2">
          <button onClick={() => setShowInfo(true)} className={`p-3 rounded-xl transition-colors ${isDarkMode ? 'bg-slate-800 text-blue-400 hover:bg-slate-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
            <Info className="w-5 h-5" />
          </button>
          <button onClick={() => setShowBracket(true)} className={`p-3 rounded-xl transition-colors ${isDarkMode ? 'bg-slate-800 text-purple-400 hover:bg-slate-700' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
            <List className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleUndo} disabled={historyStack.length === 0} className={`p-3 rounded-xl transition-colors disabled:opacity-30 disabled:grayscale ${isDarkMode ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
            <Undo className="w-5 h-5" />
          </button>
          <button onClick={performSync} disabled={isSyncing || state.actionQueue.length === 0} className={`p-3 rounded-xl transition-colors disabled:opacity-30 ${isDarkMode ? 'bg-slate-800 text-green-400 hover:bg-slate-700' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
            <Save className="w-5 h-5" />
          </button>
        </div>
      </div>

      {m.round === 3 ? (
        <div className="flex-1 overflow-y-auto relative">
          <div className="absolute top-4 w-full text-center z-10 pointer-events-none">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold shadow-sm border ${isDarkMode ? 'bg-slate-800 text-amber-400 border-slate-700' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
              Match {m.indexInRound + 1} di 8
            </span>
          </div>
          {state.parentVoteState.step === 0 && (
            <div className="flex-1 min-h-full flex flex-col items-center justify-center p-6 gap-6">
              <ShieldAlert className="w-16 h-16 text-amber-500" />
              <h3 className="text-2xl font-bold text-amber-500 text-center">Ottavi di Finale - Top 16</h3>
              <p className={`text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Il voto è segreto e congiunto tra Mamma e Papà.</p>
              <button className="bg-amber-600 hover:bg-amber-500 px-6 py-4 rounded-xl font-bold text-white w-full shadow-lg transition-transform active:scale-95 mt-4"
                onClick={() => updateVoteState({ step: 1 })}>
                Inizia Voto Mamma
              </button>
            </div>
          )}
          {state.parentVoteState.step === 1 && (
            <div className="flex-1 min-h-full flex flex-col p-6 gap-6 justify-center">
              <h3 className="text-2xl font-bold text-pink-500 text-center">Turno Mamma</h3>
              <p className={`text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Scegli chi passa il turno. Papà non deve guardare!</p>
              <div className="flex flex-col gap-4 mt-4">
                <button className={`p-6 border-2 border-pink-500 rounded-xl font-bold text-xl shadow-lg transition-transform active:scale-95 ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-slate-800 hover:bg-pink-50'}`} onClick={() => updateVoteState({ step: 2, p1Vote: m.p1!.id })}>
                  {m.p1!.name}
                </button>
                <button className={`p-6 border-2 border-pink-500 rounded-xl font-bold text-xl shadow-lg transition-transform active:scale-95 ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-slate-800 hover:bg-pink-50'}`} onClick={() => updateVoteState({ step: 2, p1Vote: m.p2!.id })}>
                  {m.p2!.name}
                </button>
              </div>
            </div>
          )}
          {state.parentVoteState.step === 2 && (
            <div className="flex-1 min-h-full flex flex-col items-center justify-center p-6 gap-6">
              <User className="w-16 h-16 text-blue-500" />
              <h3 className="text-2xl font-bold text-blue-500 text-center">Passa il telefono a Papà</h3>
              <button className="bg-blue-600 hover:bg-blue-500 px-6 py-4 rounded-xl font-bold text-white w-full shadow-lg transition-transform active:scale-95 mt-4"
                onClick={() => updateVoteState({ step: 3 })}>
                Sono Papà, Inizia Voto
              </button>
            </div>
          )}
          {state.parentVoteState.step === 3 && (
            <div className="flex-1 min-h-full flex flex-col p-6 gap-6 justify-center">
              <h3 className="text-2xl font-bold text-blue-500 text-center">Turno Papà</h3>
              <p className={`text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Scegli chi passa il turno. La scelta di Mamma è nascosta.</p>
              <div className="flex flex-col gap-4 mt-4">
                <button className={`p-6 border-2 border-blue-500 rounded-xl font-bold text-xl shadow-lg transition-transform active:scale-95 ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-slate-800 hover:bg-blue-50'}`} onClick={() => resolveTop16(m.p1!.id)}>
                  {m.p1!.name}
                </button>
                <button className={`p-6 border-2 border-blue-500 rounded-xl font-bold text-xl shadow-lg transition-transform active:scale-95 ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-slate-800 hover:bg-blue-50'}`} onClick={() => resolveTop16(m.p2!.id)}>
                  {m.p2!.name}
                </button>
              </div>
            </div>
          )}
          {state.parentVoteState.step === 4 && (
            <div className="flex-1 min-h-full flex flex-col p-6 gap-6 justify-center items-center pt-16">
              <h3 className="text-2xl font-bold text-green-500 text-center">Risultato Voto</h3>
              {state.parentVoteState.p1Vote === state.parentVoteState.p2Vote ? (
                <div className={`text-center flex flex-col gap-4 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  <p>Siete d'accordo!</p>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                    {state.parentVoteState.p1Vote === m.p1!.id ? m.p1!.name : m.p2!.name} passa il turno!
                  </p>
                </div>
              ) : (
                <div className={`text-center flex flex-col gap-4 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  <p className="text-amber-500 font-bold text-xl">Voto Disgiunto!</p>
                  <p>Mamma ha votato: <br /><strong className={`text-lg ${isDarkMode ? 'text-pink-400' : 'text-pink-600'}`}>{state.parentVoteState.p1Vote === m.p1!.id ? m.p1!.name : m.p2!.name}</strong></p>
                  <p>Papà ha votato: <br /><strong className={`text-lg ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{state.parentVoteState.p2Vote === m.p1!.id ? m.p1!.name : m.p2!.name}</strong></p>
                  <p className="text-green-500 font-bold mt-2">Entrambi passano alla Fase 4!</p>
                </div>
              )}
              <button className="bg-green-600 hover:bg-green-500 px-6 py-4 rounded-xl font-bold text-white w-full shadow-lg transition-transform active:scale-95 mt-4"
                onClick={advanceTop16}>
                Avanza al prossimo match
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-6 gap-6 justify-center overflow-y-auto">
          <div className="text-center">
            <span className={`inline-block px-4 py-1 rounded-full text-sm font-bold mb-2 border ${isDarkMode ? 'bg-slate-800 text-blue-400 border-slate-700' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
              {m.round === 1 ? '32esimi di Finale' : '16esimi di Finale'}
            </span>
            <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Match {m.indexInRound + 1} di {m.round === 1 ? 32 : 16}</p>
          </div>
          
          <button 
            onClick={() => handleWin(m.p1!.id)}
            className={`relative flex flex-col p-6 rounded-2xl border-2 shadow-lg active:scale-95 transition-all text-left ${isDarkMode ? 'border-slate-700 bg-slate-800 hover:border-blue-500' : 'border-slate-200 bg-white hover:border-blue-500'}`}
          >
            
            <span className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{m.p1!.name}</span>
          </button>

          <div className="flex justify-center -my-3 relative z-10">
            <div className={`rounded-full w-12 h-12 flex items-center justify-center font-bold text-sm shadow-md border ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>
              VS
            </div>
          </div>

          <button 
            onClick={() => handleWin(m.p2!.id)}
            className={`relative flex flex-col p-6 rounded-2xl border-2 shadow-lg active:scale-95 transition-all text-left ${isDarkMode ? 'border-slate-700 bg-slate-800 hover:border-rose-500' : 'border-slate-200 bg-white hover:border-rose-500'}`}
          >
            
            <span className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{m.p2!.name}</span>
          </button>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`border rounded-2xl p-6 w-full max-w-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'}`}>
            <h3 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Informazioni Tabellone</h3>
            <p className={`text-sm mb-4 leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Il tabellone a 64 è generato seguendo le regole tennistiche (es. Seed 1 contro 64). I Seed sono assegnati in base al Rating ELO raggiunto nella Fase 2.
            </p>
            <p className={`text-sm mb-6 leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <strong>Ottavi (Top 16):</strong> Il voto diventa segreto e congiunto. Se Mamma e Papà scelgono lo stesso vincitore, quest'ultimo avanza. Se le scelte sono discordanti (Voto Disgiunto), entrambi avanzano alla Fase 4!
            </p>
            <button onClick={() => setShowInfo(false)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">Chiudi</button>
          </div>
        </div>
      )}

      {showBracket && (
        <div className={`fixed inset-0 z-50 flex flex-col ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
          <div className={`flex justify-between items-center p-4 border-b shrink-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-200 bg-white'}`}>
            <h3 className={`text-xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Tabellone</h3>
            <button onClick={() => setShowBracket(false)} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className={`flex overflow-x-auto p-2 border-b shrink-0 gap-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200 bg-white'}`}>
            {[1, 2, 3].map(r => (
              <button 
                key={r} 
                onClick={() => setBracketTab(r)}
                className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-colors ${bracketTab === r ? 'bg-blue-600 text-white' : (isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}`}
              >
                {r === 1 ? '32esimi' : r === 2 ? '16esimi' : 'Ottavi'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 gap-3 flex flex-col">
            {state.matches.filter(ma => ma.round === bracketTab).map(ma => (
              <div key={ma.id} className={`rounded-xl p-4 border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Match {ma.indexInRound + 1}</div>
                <div className={`flex justify-between items-center py-1 ${ma.winner === ma.p1?.id || ma.winner === 'BOTH' ? 'text-blue-500 font-bold' : (isDarkMode ? 'text-slate-300' : 'text-slate-700')}`}>
                  <span>{ma.p1 ? `${ma.p1.seed}. ${ma.p1.name}` : '(Bye)'}</span>
                  {ma.winner === ma.p1?.id && <Check className="w-4 h-4" />}
                </div>
                <div className={`h-px my-1 w-full opacity-50 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                <div className={`flex justify-between items-center py-1 ${ma.winner === ma.p2?.id || ma.winner === 'BOTH' ? 'text-blue-500 font-bold' : (isDarkMode ? 'text-slate-300' : 'text-slate-700')}`}>
                  <span>{ma.p2 ? `${ma.p2.seed}. ${ma.p2.name}` : '(Bye)'}</span>
                  {ma.winner === ma.p2?.id && <Check className="w-4 h-4" />}
                </div>
                {ma.winner === 'BOTH' && <div className="mt-2 text-xs font-bold text-amber-500 text-center uppercase">Voto Disgiunto: Entrambi Promossi</div>}
                {!ma.winner && ma.indexInRound === state.currentMatchIndex && ma.round === state.matches[state.currentMatchIndex].round && (
                  <div className="mt-2 text-xs font-bold text-green-500 text-center uppercase animate-pulse">In Corso</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
