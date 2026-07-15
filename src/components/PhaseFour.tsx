import { useState, useEffect, useMemo, useRef } from 'react';
import { Player, getFase4State, saveGiornataFase4 } from '../api';
import { Info, Calendar, Trophy, ArrowRight, Loader2, Check, X, User, Share2 } from 'lucide-react';
import { toPng } from 'html-to-image';

interface PhaseFourProps {
  dataset: Player[];
  gender: 'maschile' | 'femminile';
  onComplete: () => void;
}

export interface PhaseFourPlayer extends Player {
  seed: number;
}

interface Match {
  id: string;
  p1: PhaseFourPlayer;
  p2: PhaseFourPlayer;
  isBye?: boolean;
}

interface Round {
  index: number;
  matches: Match[];
}

export interface MatchResult {
  matchId: string;
  roundIndex: number;
  p1Id: string;
  p2Id: string;
  p1Vote: 'A'|'B'|'D';
  p2Vote: 'A'|'B'|'D';
  p1Points: number;
  p2Points: number;
  isConcordantP1: boolean;
  isConcordantP2: boolean;
}

function computePoints(v1: 'A'|'B'|'D', v2: 'A'|'B'|'D') {
  let p1Points = 0;
  let p2Points = 0;
  let isConcordantP1 = false;
  let isConcordantP2 = false;

  if (v1 === 'A' && v2 === 'A') { p1Points = 3.0; p2Points = 0; isConcordantP1 = true; }
  else if (v1 === 'B' && v2 === 'B') { p1Points = 0; p2Points = 3.0; isConcordantP2 = true; }
  else if (v1 === 'D' && v2 === 'D') { p1Points = 1.5; p2Points = 1.5; }
  else if (v1 === 'A' && v2 === 'B') { p1Points = 1.5; p2Points = 1.5; }
  else if (v1 === 'B' && v2 === 'A') { p1Points = 1.5; p2Points = 1.5; }
  else if ((v1 === 'A' && v2 === 'D') || (v1 === 'D' && v2 === 'A')) { p1Points = 2.25; p2Points = 0.75; }
  else if ((v1 === 'B' && v2 === 'D') || (v1 === 'D' && v2 === 'B')) { p1Points = 0.75; p2Points = 2.25; }

  return { p1Points, p2Points, isConcordantP1, isConcordantP2 };
}

function generateBerger(players: PhaseFourPlayer[]): Round[] {
  let p = [...players];
  const isOdd = p.length % 2 !== 0;
  if (isOdd) {
    p.push({ id: 'BYE', name: 'BYE', frequency: 0, phase: 4, seed: 0 });
  }
  const n = p.length;
  const rounds: Round[] = [];
  
  for (let r = 0; r < n - 1; r++) {
    const matches: Match[] = [];
    for (let i = 0; i < n / 2; i++) {
      const p1 = p[i];
      const p2 = p[n - 1 - i];
      if (p1.id !== 'BYE' && p2.id !== 'BYE') {
        matches.push({ id: `R${r}-M${i}`, p1, p2 });
      }
    }
    rounds.push({ index: r, matches });
    p.splice(1, 0, p.pop()!);
  }
  return rounds.map((r, idx) => ({ ...r, index: idx })); 
}

export default function PhaseFour({ dataset, gender, onComplete }: PhaseFourProps) {
  const [calendar, setCalendar] = useState<Round[]>([]);
  const [matchMatrix, setMatchMatrix] = useState<MatchResult[]>([]);
  const [players, setPlayers] = useState<PhaseFourPlayer[]>([]);
  
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  
  const [voteState, setVoteState] = useState<{ step: number, p1Vote: 'A'|'B'|'D'|null, p2Vote: 'A'|'B'|'D'|null }>({ step: 1, p1Vote: null, p2Vote: null });
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const [showInfo, setShowInfo] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    async function init() {
      const eligible = dataset.filter(p => p.phase && p.phase >= 4).sort((a, b) => {
        const diff = (b.elo || 1200) - (a.elo || 1200);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      }).map((p, i) => ({ ...p, seed: i + 1 }));
      setPlayers(eligible);

      let cal: Round[] = [];
      const savedCal = localStorage.getItem(`fase4_v3_calendar_${gender}`);
      if (savedCal) {
        cal = JSON.parse(savedCal);
      } else {
        cal = generateBerger(eligible);
        localStorage.setItem(`fase4_v3_calendar_${gender}`, JSON.stringify(cal));
      }
      setCalendar(cal);

      let mMatrix: MatchResult[] = [];
      try {
        const cloudState = await getFase4State(gender);
        if (cloudState && cloudState.length > 0) {
          mMatrix = cloudState.map((r: any) => ({
            ...r,
            roundIndex: r.roundIndex !== undefined ? r.roundIndex : parseInt(r.matchId.split('-')[0].replace('R', ''), 10),
            isConcordantP1: r.p1Vote === 'A' && r.p2Vote === 'A',
            isConcordantP2: r.p1Vote === 'B' && r.p2Vote === 'B'
          }));
          localStorage.setItem(`fase4_v3_matrix_${gender}`, JSON.stringify(mMatrix));
        } else {
          const savedMatrix = localStorage.getItem(`fase4_v3_matrix_${gender}`);
          if (savedMatrix) mMatrix = JSON.parse(savedMatrix);
        }
      } catch (e) {
        const savedMatrix = localStorage.getItem(`fase4_v3_matrix_${gender}`);
        if (savedMatrix) mMatrix = JSON.parse(savedMatrix);
      }
      
      setMatchMatrix(mMatrix);
      
      let nextR = 0;
      let nextM = 0;
      let done = false;
      
      for (let r = 0; r < cal.length; r++) {
        for (let m = 0; m < cal[r].matches.length; m++) {
          const match = cal[r].matches[m];
          const hasResult = mMatrix.find(x => (x.p1Id === match.p1.id && x.p2Id === match.p2.id) || (x.p1Id === match.p2.id && x.p2Id === match.p1.id));
          if (!hasResult) {
            nextR = r;
            nextM = m;
            done = true;
            break;
          }
        }
        if (done) break;
      }
      
      if (!done && cal.length > 0) {
        setIsFinished(true);
      } else {
        setCurrentRoundIndex(nextR);
        setCurrentMatchIndex(nextM);
      }
      
      setIsLoading(false);
    }
    init();
  }, [dataset, gender]);

  const handleVote = (vote: 'A'|'B'|'D') => {
    if (voteState.step === 1) {
      setVoteState({ ...voteState, p1Vote: vote, step: 2 });
    } else if (voteState.step === 3) {
      const v1 = voteState.p1Vote!;
      const v2 = vote;
      const pts = computePoints(v1, v2);
      
      const currentRound = calendar[currentRoundIndex];
      const match = currentRound.matches[currentMatchIndex];
      
      const res: MatchResult = {
        matchId: match.id,
        roundIndex: currentRoundIndex,
        p1Id: match.p1.id,
        p2Id: match.p2.id,
        p1Vote: v1,
        p2Vote: v2,
        ...pts
      };
      
      const newMatrix = [...matchMatrix, res];
      setMatchMatrix(newMatrix);
      localStorage.setItem(`fase4_v3_matrix_${gender}`, JSON.stringify(newMatrix));
      
      setLastResult(res);
      setVoteState({ step: 4, p1Vote: v1, p2Vote: v2 });
    }
  };

  const handleUndo = () => {
    if (voteState.step === 2) {
      setVoteState({ step: 1, p1Vote: null, p2Vote: null });
    } else if (voteState.step === 3) {
      setVoteState({ step: 1, p1Vote: null, p2Vote: null });
    } else if (lastResult) {
      const newMatrix = [...matchMatrix];
      newMatrix.pop();
      setMatchMatrix(newMatrix);
      localStorage.setItem(`fase4_v3_matrix_${gender}`, JSON.stringify(newMatrix));
      setLastResult(null);
      setVoteState({ ...voteState, step: 3, p2Vote: null });
    }
  };

  const advanceMatch = async () => {
    const currentRound = calendar[currentRoundIndex];
    if (currentMatchIndex + 1 < currentRound.matches.length) {
      setCurrentMatchIndex(currentMatchIndex + 1);
      setVoteState({ step: 1, p1Vote: null, p2Vote: null });
      setLastResult(null);
    } else {
      setIsSyncing(true);
      try {
        const matchesToSave = matchMatrix.filter(m => m.roundIndex === currentRoundIndex);
        await saveGiornataFase4(gender, currentRoundIndex, matchesToSave);
        
        if (currentRoundIndex + 1 < calendar.length) {
          setCurrentRoundIndex(currentRoundIndex + 1);
          setCurrentMatchIndex(0);
          setVoteState({ step: 1, p1Vote: null, p2Vote: null });
          setLastResult(null);
        } else {
          setIsFinished(true);
        }
      } catch (e) {
        alert("Errore nel salvataggio. Riprova.");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const calculateAvulsa = (id1: string, id2: string, matrix: MatchResult[]) => {
    let pts = 0;
    matrix.forEach(m => {
      if (m.p1Id === id1 && m.p2Id === id2) pts += m.p1Points;
      if (m.p2Id === id1 && m.p1Id === id2) pts += m.p2Points;
    });
    return pts;
  };

  const leaderboard = useMemo(() => {
    if (!players.length) return [];
    const stats = new Map<string, { pts: number, concordant: number, elo: number, id: string, name: string, seed: number }>();
    players.forEach(p => stats.set(p.id, { pts: 0, concordant: 0, elo: p.elo || 1200, id: p.id, name: p.name, seed: p.seed }));
    
    matchMatrix.forEach(m => {
      const s1 = stats.get(m.p1Id);
      const s2 = stats.get(m.p2Id);
      if (s1 && s2) {
        s1.pts += m.p1Points;
        s2.pts += m.p2Points;
        if (m.isConcordantP1) s1.concordant += 1;
        if (m.isConcordantP2) s2.concordant += 1;
      }
    });

    const arr = Array.from(stats.values());
    arr.sort((a, b) => b.pts - a.pts);
    
    let i = 0;
    while (i < arr.length) {
      let j = i + 1;
      while (j < arr.length && arr[j].pts === arr[i].pts) {
        j++;
      }
      if (j - i > 1) {
        const tiedGroup = arr.slice(i, j);
        const tiedIds = new Set(tiedGroup.map(p => p.id));
        tiedGroup.forEach(p => {
          let avulsaPts = 0;
          matchMatrix.forEach(m => {
            if (m.p1Id === p.id && tiedIds.has(m.p2Id)) avulsaPts += m.p1Points;
            if (m.p2Id === p.id && tiedIds.has(m.p1Id)) avulsaPts += m.p2Points;
          });
          (p as any).avulsaPts = avulsaPts;
        });
        tiedGroup.sort((a, b) => {
          const aAv = (a as any).avulsaPts;
          const bAv = (b as any).avulsaPts;
          if (bAv !== aAv) return bAv - aAv;
          if (b.concordant !== a.concordant) return b.concordant - a.concordant;
          if (b.elo !== a.elo) return b.elo - a.elo;
          return a.id.localeCompare(b.id);
        });
        for (let k = 0; k < tiedGroup.length; k++) {
          arr[i + k] = tiedGroup[k];
        }
      }
      i = j;
    }
    return arr;
  }, [players, matchMatrix]);

  const leaderboardRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!leaderboardRef.current) return;
    try {
      const dataUrl = await toPng(leaderboardRef.current, { backgroundColor: '#0f172a' }); // bg-slate-900
      const link = document.createElement('a');
      link.download = `Classifica_Fase4_${gender}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Errore esportazione", e);
    }
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-100"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;
  }

  if (isFinished) {
    const maxPts = leaderboard.length > 0 ? leaderboard[0].pts : 0;
    const winners = leaderboard.filter(p => p.pts === maxPts);
    
    return (
      <div className="flex-1 overflow-y-auto bg-slate-900 text-slate-100 relative">
        {/* Container nascosto per l'esportazione della classifica completa */}
        <div className="fixed top-0 left-[-9999px] w-[600px] bg-slate-900 p-8 flex flex-col gap-4" ref={leaderboardRef}>
          <div className="text-center mb-6">
            <h2 className="text-3xl font-black text-slate-100">Classifica Finale</h2>
            <p className="text-lg text-slate-400">Torneo Nomi {gender === 'maschile' ? 'Maschili' : 'Femminili'}</p>
          </div>
          {leaderboard.map((p, idx) => (
            <div key={p.id} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
              <div className="flex items-center gap-4">
                <span className="text-slate-500 font-bold w-8 text-xl">{idx + 1}.</span>
                <span className="font-bold text-2xl text-slate-100">{p.name}</span>
              </div>
              <div className="text-right">
                <div className="text-blue-400 font-bold tabular-nums text-2xl">{p.pts.toFixed(2)} pt</div>
                <div className="text-slate-500 text-sm">Conc: {p.concordant} | Elo: {Math.round(p.elo)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="min-h-full p-8 flex flex-col items-center justify-center mx-auto max-w-md w-full">
          <Trophy className="w-24 h-24 text-yellow-400 mb-6 shrink-0" />
          <h2 className="text-3xl font-bold mb-6 shrink-0">Torneo Concluso!</h2>
          <div className="flex flex-col gap-4 w-full mb-8">
            {winners.map((w, idx) => (
              <div key={w.id} className={`bg-slate-800 border rounded-2xl p-6 shadow-2xl flex flex-col items-center w-full ${idx === 0 ? 'border-yellow-500/50' : 'border-slate-700'}`}>
                <span className={`text-sm font-bold mb-1 ${idx === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{idx === 0 ? 'VINCITORE' : `${idx + 1}° CLASSIFICATO (PARI PUNTI)`}</span>
                <span className="text-3xl sm:text-4xl font-black mb-2 text-center w-full break-words">{w.name}</span>
                <span className="text-slate-400 tabular-nums">{w.pts.toFixed(2)} Punti</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowLeaderboard(true)} className="w-full px-6 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold transition-colors mb-4">Classifica Completa</button>
          <button onClick={onComplete} className="w-full px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold transition-colors">Torna alla Home</button>
        </div>

        {showLeaderboard && (
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
             <div className="bg-slate-900 border border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden relative">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center z-10">
                  <h3 className="text-xl font-bold">Classifica Finale</h3>
                  <div className="flex gap-2">
                    <button onClick={handleExport} className="p-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors rounded-lg"><Share2 className="w-5 h-5"/></button>
                    <button onClick={() => setShowLeaderboard(false)} className="p-2 bg-slate-800 rounded-lg"><X className="w-5 h-5"/></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex flex-col gap-2 bg-slate-900">
                    <div className="text-center mb-4">
                    <h2 className="text-xl font-black text-slate-100">Classifica Finale</h2>
                    <p className="text-sm text-slate-400">Torneo Nomi {gender === 'maschile' ? 'Maschili' : 'Femminili'}</p>
                  </div>
                  {leaderboard.map((p, idx) => (
                    <div key={p.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-bold w-6">{idx + 1}.</span>
                        <span className="font-bold text-lg">{p.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-blue-400 font-bold tabular-nums">{p.pts.toFixed(2)} pt</div>
                        <div className="text-xs text-slate-500">Conc: {p.concordant} | Elo: {p.elo}</div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  const currentRound = calendar[currentRoundIndex];
  const currentMatch = currentRound?.matches[currentMatchIndex];

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 overflow-hidden relative">
      <div className="h-14 border-b border-slate-800 flex justify-between items-center px-4 shrink-0 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex flex-col">
          <span className="font-bold text-sm text-slate-400">
            Giornata {currentRoundIndex + 1} di {calendar.length}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            Match {currentMatchIndex + 1} di {currentRound?.matches.length || 0}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowInfo(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"><Info className="w-5 h-5 text-blue-400"/></button>
          <button onClick={() => setShowCalendar(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"><Calendar className="w-5 h-5 text-indigo-400"/></button>
          <button onClick={() => setShowLeaderboard(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"><Trophy className="w-5 h-5 text-yellow-400"/></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {voteState.step === 1 || voteState.step === 3 ? (
          <div className="w-full max-w-md flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-center text-slate-300">
              Turno {voteState.step === 1 ? 'Giancarlo' : 'Sara'}
            </h2>
            <div className="text-center text-sm text-slate-500 font-medium">Scegli chi vince</div>
            
            <button onClick={() => handleVote('A')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-2xl flex flex-col items-center justify-center transition-all shadow-lg active:scale-95 w-full min-w-0 min-h-[100px]">
              <span className="text-2xl sm:text-3xl font-black text-slate-100 break-words whitespace-normal leading-tight w-full text-center">{currentMatch?.p1.name}</span>
            </button>
            <button onClick={() => handleVote('D')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-4 rounded-2xl flex flex-col items-center justify-center transition-all shadow-md active:scale-95 w-full min-h-[60px]">
              <span className="font-bold text-slate-400">Pareggio</span>
            </button>
            <button onClick={() => handleVote('B')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-2xl flex flex-col items-center justify-center transition-all shadow-lg active:scale-95 w-full min-w-0 min-h-[100px]">
              <span className="text-2xl sm:text-3xl font-black text-slate-100 break-words whitespace-normal leading-tight w-full text-center">{currentMatch?.p2.name}</span>
            </button>
            {(voteState.step === 3) && (
              <button onClick={handleUndo} className="mt-4 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold transition-colors w-full text-slate-400">
                Annulla e rinizia match
              </button>
            )}
          </div>
        ) : voteState.step === 2 ? (
          <div className="w-full max-w-sm flex flex-col items-center text-center gap-8">
             <User className="w-20 h-20 text-slate-600" />
             <h2 className="text-2xl font-bold text-slate-300">Passa il dispositivo a Sara</h2>
             <button onClick={() => setVoteState({ ...voteState, step: 3 })} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-colors">
               Sono Sara, Inizia
             </button>
             <button onClick={handleUndo} className="mt-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold transition-colors w-full text-slate-400">
               Annulla voto di Giancarlo
             </button>
          </div>
        ) : (
          <div className="w-full max-w-md flex flex-col items-center text-center gap-6 px-2">
             <h2 className="text-2xl font-bold text-green-400">Esito Match</h2>
             <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 sm:p-6 w-full flex justify-between items-center shadow-xl">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <span className="font-black text-lg sm:text-2xl text-slate-200 mb-2 break-words whitespace-normal leading-tight w-full text-center">{currentMatch?.p1.name}</span>
                  <span className="bg-blue-900 text-blue-300 px-3 py-1 rounded-full font-bold tabular-nums text-sm sm:text-lg">+{lastResult?.p1Points.toFixed(2)}</span>
                </div>
                <div className="px-2 sm:px-4 text-slate-600 font-bold shrink-0">VS</div>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <span className="font-black text-lg sm:text-2xl text-slate-200 mb-2 break-words whitespace-normal leading-tight w-full text-center">{currentMatch?.p2.name}</span>
                  <span className="bg-blue-900 text-blue-300 px-3 py-1 rounded-full font-bold tabular-nums text-sm sm:text-lg">+{lastResult?.p2Points.toFixed(2)}</span>
                </div>
             </div>
             <button 
               onClick={advanceMatch} 
               disabled={isSyncing}
               className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
             >
               {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Prossimo Match'}
               {!isSyncing && <ArrowRight className="w-5 h-5" />}
             </button>
             <button onClick={handleUndo} disabled={isSyncing} className="mt-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold transition-colors w-full text-slate-400 disabled:opacity-50">
               Annulla voto
             </button>
          </div>
        )}
      </div>

      {showInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm p-6 rounded-2xl flex flex-col shadow-2xl">
            <h3 className="text-xl font-bold mb-4">Sistema a Somma Costante</h3>
            <div className="text-sm text-slate-300 mb-4 flex flex-col gap-2">
              <p>Ogni scontro assegna 3 punti totali (1.5 punti per votante).</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400">
                <li><strong className="text-slate-200">A + A:</strong> 3.0 pt a A, 0.0 a B</li>
                <li><strong className="text-slate-200">A + B:</strong> 1.5 pt a A, 1.5 a B</li>
                <li><strong className="text-slate-200">Par + Par:</strong> 1.5 pt a A, 1.5 a B</li>
                <li><strong className="text-slate-200">A + Par:</strong> 2.25 pt a A, 0.75 a B</li>
              </ul>
            </div>
            <button onClick={() => setShowInfo(false)} className="w-full bg-slate-800 py-3 rounded-xl font-bold hover:bg-slate-700 transition-colors">Chiudi</button>
          </div>
        </div>
      )}

      {showCalendar && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden">
             <div className="p-4 border-b border-slate-800 flex justify-between items-center">
               <h3 className="text-xl font-bold">Calendario Scontri</h3>
               <button onClick={() => setShowCalendar(false)} className="p-2 bg-slate-800 rounded-lg"><X className="w-5 h-5"/></button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
               {calendar.map(r => (
                 <div key={r.index} className="flex flex-col gap-2">
                   <h4 className="font-bold text-slate-400 text-sm uppercase tracking-wider">Giornata {r.index + 1}</h4>
                   <div className="flex flex-col gap-2">
                     {r.matches.map(m => {
                       const res = matchMatrix.find(x => (x.p1Id === m.p1.id && x.p2Id === m.p2.id) || (x.p1Id === m.p2.id && x.p2Id === m.p1.id));
                       return (
                         <div key={m.id} className={`flex justify-between items-center p-3 rounded-lg border ${res ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800'}`}>
                           <span className="font-bold w-[35%] text-xs sm:text-sm truncate text-right px-1" title={m.p1.name}>{m.p1.name}</span>
                           <div className="w-[30%] flex justify-center text-[10px] sm:text-xs font-bold tabular-nums">
                             {res ? <span className="text-blue-400 bg-blue-900/30 px-1 py-1 rounded w-full text-center">{res.p1Points.toFixed(2)} - {res.p2Points.toFixed(2)}</span> : <span className="text-slate-600 px-2 py-1">VS</span>}
                           </div>
                           <span className="font-bold w-[35%] text-xs sm:text-sm truncate text-left px-1" title={m.p2.name}>{m.p2.name}</span>
                         </div>
                       )
                     })}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}

      {showLeaderboard && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden relative">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center z-10">
               <h3 className="text-xl font-bold">Classifica (Live)</h3>
               <div className="flex gap-2">
                 <button onClick={() => setShowLeaderboard(false)} className="p-2 bg-slate-800 rounded-lg"><X className="w-5 h-5"/></button>
               </div>
             </div>
             <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
               <div className="text-center mb-4">
                 <h2 className="text-xl font-black text-slate-100">Classifica Live</h2>
                 <p className="text-sm text-slate-400">Torneo Nomi {gender === 'maschile' ? 'Maschili' : 'Femminili'}</p>
               </div>
               {leaderboard.map((p, idx) => (
                 <div key={p.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                   <div className="flex items-center gap-3">
                     <span className="text-slate-500 font-bold w-6 text-right">{idx + 1}.</span>
                     <span className="font-bold text-lg">{p.name}</span>
                   </div>
                   <div className="text-right">
                     <div className="text-blue-400 font-bold tabular-nums text-lg">{p.pts.toFixed(2)}</div>
                     
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
