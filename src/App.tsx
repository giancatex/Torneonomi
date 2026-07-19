/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Header from './components/Header';
import PhaseOne from './components/PhaseOne';
import PhaseTwo from './components/PhaseTwo';
import PhaseThree from './components/PhaseThree';
import PhaseFour from './components/PhaseFour';
import { Gender } from './types';
import { fetchDatabase, fetchMetadata, Player, syncPhaseTwoBatch } from './api';
import { Users, User, Play, ArrowLeft, Loader2 } from 'lucide-react';

export default function App() {
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [selectedGender, setSelectedGender] = useState<Gender>(null);
  
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);
  const [currentPhaseMeta, setCurrentPhaseMeta] = useState<number>(1);
  const [currentBlockMeta, setCurrentBlockMeta] = useState<number>(0);
  
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [tournamentData, setTournamentData] = useState<Player[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isHeaderHidden, setIsHeaderHidden] = useState<boolean>(false);
  




  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleHome = () => {
    setCurrentPhase(0);
    setSelectedGender(null);
  };

  const handleGlobalBack = () => {
    if (currentPhase > 0) {
      setCurrentPhase(0);
    } else if (selectedGender) {
      setSelectedGender(null);
    }
  };

  const handleGenderSelect = async (gender: Gender) => {
    setSelectedGender(gender);
    setIsLoadingMeta(true);
    try {
      const meta = await fetchMetadata(gender);
      setCurrentPhaseMeta(meta.faseGlobale);
      setCurrentBlockMeta(meta.bloccoAvanzamento);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const handleSyncFromSheet = async () => {
    if (!selectedGender) return;
    setIsDownloading(true);
    try {
      // Pulisce lo stato locale
      localStorage.removeItem(`optin_block_${selectedGender}`);
      localStorage.removeItem(`optin_accepted_${selectedGender}`);
      localStorage.removeItem(`optin_rejected_${selectedGender}`);
      localStorage.removeItem(`optin_saved_names_${selectedGender}`);
      localStorage.removeItem(`saved_count_${selectedGender}`);
      localStorage.removeItem(`bracket_state_${selectedGender}`);
      localStorage.removeItem(`fase4_v2_calendar_${selectedGender}`);
      localStorage.removeItem(`fase4_v2_matrix_${selectedGender}`);

      const meta = await fetchMetadata(selectedGender);
      const data = await fetchDatabase(selectedGender);
      
      if (meta.faseGlobale === 1) {
        // Calcola i salvati attuali dal foglio (fase >= 2)
        const savedCount = data.filter(p => p.phase && p.phase >= 2).length;
        localStorage.setItem(`saved_count_${selectedGender}`, savedCount.toString());
        
        // Estrae solo quelli da processare (fase === 1)
        const unprocessed = data.filter(p => p.phase === 1);
        setTournamentData(unprocessed);
        setCurrentBlockMeta(0); // Ripartiamo dal blocco 0 per i rimanenti
      } else {
        setTournamentData(data.filter(p => p.phase && p.phase > 0));
      }
      
      setCurrentPhaseMeta(meta.faseGlobale);
      setCurrentPhase(meta.faseGlobale);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloading(false);
    }
  };

  const loadTournamentData = async () => {
    if (selectedGender) {
      setIsDownloading(true);
      try {
        const data = await fetchDatabase(selectedGender);
        
        if (currentPhaseMeta === 1) {
          const localAccepted = JSON.parse(localStorage.getItem(`optin_accepted_${selectedGender}`) || '[]');
          const localRejected = JSON.parse(localStorage.getItem(`optin_rejected_${selectedGender}`) || '[]');
          
          const savedCount = data.filter(p => p.phase && p.phase >= 2).length + localAccepted.length;
          localStorage.setItem(`saved_count_${selectedGender}`, savedCount.toString());
          
          const unprocessed = data.filter(p => p.phase === 1 && !localAccepted.includes(p.id) && !localRejected.includes(p.id));
          setTournamentData(unprocessed);
          setCurrentBlockMeta(0);
        } else {
          setTournamentData(data.filter(p => p.phase && p.phase > 0));
        }

        setCurrentPhase(currentPhaseMeta);
      } catch (e) {
        console.error(e);
      } finally {
        setIsDownloading(false);
      }
    }
  };

  // Funzione helper per determinare il titolo della fase
  const getPhaseTitle = (phase: number) => {
    switch (phase) {
      case 1: return "1 - Inizializzazione";
      case 2: return "2 - Rating Elo";
      case 3: return "3 - Gironi";
      case 4: return "4 - Torneo Round-Robin";
      default: return `${phase}`;
    }
  };

  return (
    <div className={`${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} h-screen w-screen flex flex-col overflow-hidden transition-colors`}>
      <div className={`transition-all duration-300 ease-in-out shrink-0 ${isHeaderHidden && currentPhase === 1 ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-32 opacity-100'}`}>
        <Header 
          isDarkMode={isDarkMode} 
          toggleTheme={toggleTheme} 
          onHome={handleHome} 
          onBack={handleGlobalBack} 
          showBack={currentPhase > 0 || selectedGender !== null} 
          onSyncFromSheet={selectedGender && currentPhase === 0 ? handleSyncFromSheet : undefined}
        />
      </div>
      
      <main className={`flex-1 relative flex flex-col ${currentPhase === 0 ? 'p-4 overflow-y-auto' : 'min-h-0'}`}>
        {currentPhase === 0 && (
          <div className="flex-1 flex flex-col justify-center items-center max-w-md mx-auto w-full gap-6">
            {!selectedGender ? (
              <>
                <div className="text-center space-y-2 mb-4">
                  <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Seleziona il Torneo</h2>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Scegli la categoria per iniziare.</p>
                </div>

                <div className="flex flex-col w-full gap-4">
                  <button
                    onClick={() => handleGenderSelect('maschile')}
                    className={`${isDarkMode ? 'bg-slate-800 border-slate-700 hover:border-blue-500 hover:bg-slate-700' : 'bg-white border-slate-200 hover:border-blue-500 hover:bg-blue-50'} border rounded-xl p-6 transition-all flex items-center group shadow-sm`}
                  >
                    <div className={`p-3 rounded-full mr-4 transition-colors ${isDarkMode ? 'bg-slate-700 text-blue-400 group-hover:bg-blue-500 group-hover:text-white' : 'bg-blue-100 text-blue-600 group-hover:bg-blue-500 group-hover:text-white'}`}>
                      <User className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Torneo Maschile</h3>
                    </div>
                  </button>

                  <button
                    onClick={() => handleGenderSelect('femminile')}
                    className={`${isDarkMode ? 'bg-slate-800 border-slate-700 hover:border-pink-500 hover:bg-slate-700' : 'bg-white border-slate-200 hover:border-pink-500 hover:bg-pink-50'} border rounded-xl p-6 transition-all flex items-center group shadow-sm`}
                  >
                    <div className={`p-3 rounded-full mr-4 transition-colors ${isDarkMode ? 'bg-slate-700 text-pink-400 group-hover:bg-pink-500 group-hover:text-white' : 'bg-pink-100 text-pink-600 group-hover:bg-pink-500 group-hover:text-white'}`}>
                      <User className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Torneo Femminile</h3>
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full flex flex-col gap-6">
                <div className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-6 w-full text-center shadow-lg transition-colors`}>
                  {isLoadingMeta ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                      <p className={`font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Recupero metadati in corso...</p>
                    </div>
                  ) : isDownloading ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                      <p className={`font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Download dataset in corso...</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-6">
                        <h2 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                          Torneo {selectedGender === 'maschile' ? 'Maschile' : 'Femminile'}
                        </h2>
                        <div className={`inline-flex flex-col items-center px-4 py-3 rounded-lg border mt-2 ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                          <p className={`font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                            Fase Attuale: <span className="text-blue-500">{getPhaseTitle(currentPhaseMeta)}</span>
                          </p>
                          {currentPhaseMeta === 1 && (
                            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              Blocco raggiunto: <span className={isDarkMode ? 'text-slate-200' : 'text-slate-700'}>{currentBlockMeta}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={loadTournamentData}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-3 flex items-center justify-center transition-colors shadow-sm"
                        >
                          <Play className="w-5 h-5 mr-2" />
                          {currentPhaseMeta === 1 ? 'Avvia Torneo' : 'Riprendi Torneo'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {currentPhase > 0 && (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {currentPhase === 1 ? (
              <PhaseOne 
                dataset={tournamentData} 
                resumeBlock={currentBlockMeta}
                isDarkMode={isDarkMode}
                gender={selectedGender!}
                onScrollDirectionChange={setIsHeaderHidden}
                onComplete={async (savedNames) => {
                  console.log("Fase 1 completata, salvati:", savedNames);
                  setCurrentPhaseMeta(2);
                  setCurrentPhase(2);
                  setIsDownloading(true);
                  try {
                    const data = await fetchDatabase(selectedGender!);
                    setTournamentData(data.filter(p => p.phase && p.phase > 0));
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsDownloading(false);
                  }
                }} 
              />
            ) : currentPhase === 2 ? (
              <PhaseTwo 
                dataset={tournamentData}
                gender={selectedGender!}
                syncWithCloud={async (payload) => {
                  const res = await syncPhaseTwoBatch(selectedGender!, payload);
                  return res.success;
                }}
                isDarkMode={isDarkMode}
                onComplete={async () => {
                  console.log("Fase 2 completata");
                  setCurrentPhaseMeta(3);
                  setCurrentPhase(3);
                  setIsDownloading(true);
                  try {
                    const data = await fetchDatabase(selectedGender!);
                    setTournamentData(data.filter(p => p.phase && p.phase > 0));
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsDownloading(false);
                  }
                }}
              />
            ) : currentPhase === 3 ? (
              <PhaseThree 
                dataset={tournamentData}
                gender={selectedGender!}
                isDarkMode={isDarkMode}
                onComplete={async () => {
                  console.log("Fase 3 completata");
                  setCurrentPhaseMeta(4);
                  setCurrentPhase(4);
                  setIsDownloading(true);
                  try {
                    const data = await fetchDatabase(selectedGender!);
                    setTournamentData(data.filter(p => p.phase && p.phase > 0));
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsDownloading(false);
                  }
                }}
              />
            ) : currentPhase === 4 ? (
              <PhaseFour 
                dataset={tournamentData}
                gender={selectedGender!}
                onComplete={() => {
                  setCurrentPhase(0);
                  setSelectedGender(null);
                }}
              />
            ) : (
              <div className="flex-1 flex flex-col p-4">
                <div className="flex justify-end mb-6">
                  <span className={`px-3 py-1 rounded-full text-xs border ${isDarkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
                    Fase {currentPhase}
                  </span>
                </div>
                
                <div className={`flex-1 border rounded-xl p-6 flex items-center justify-center shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-center">
                    <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      Torneo {selectedGender === 'maschile' ? 'Maschile' : 'Femminile'}
                    </h2>
                    <p className={`mt-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Elaborazione {getPhaseTitle(currentPhase)} in corso...
                    </p>
                    
                    <button
                      onClick={() => {
                        const nextPhase = currentPhase + 1;
                        setCurrentPhase(nextPhase);
                        setCurrentPhaseMeta(nextPhase);
                      }}
                      className={`mt-8 px-6 py-2 rounded-lg text-sm font-medium transition-colors border ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'}`}
                    >
                      Simula passaggio a Fase {currentPhase + 1}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
