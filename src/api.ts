export interface Player {
  id: string;
  name: string;
  frequency: number;
  phase?: number;
  elo?: number;
  match_giocati?: number;
}

export interface TournamentMetadata {
  faseGlobale: number;
  bloccoAvanzamento: number;
  statusIntegrita: number;
}

export type Gender = 'maschile' | 'femminile';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbweY7bw4op6aM2Xh7RHmFu01w0SE_cPH0m_1uVqtFXeEyksjuahXdP3Fwk0Y3FA81Tw/exec";

export function setGoogleAccessToken(token: string | null) {}
export function getGoogleAccessToken() { return "dummy"; }
export function setAuthErrorCallback(callback: () => void) {}

async function checkResponse(response: Response, defaultMessage: string) {
  if (!response.ok) {
    throw new Error(defaultMessage);
  }
  const result = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

export async function fetchMetadata(gender: Gender): Promise<TournamentMetadata> {
  const response = await fetch(`${SCRIPT_URL}?action=getMetadata&gender=${gender}`);
  return checkResponse(response, 'Errore nel recupero dei metadati');
}

export async function fetchDatabase(gender: Gender): Promise<Player[]> {
  const response = await fetch(`${SCRIPT_URL}?action=getDatabase&gender=${gender}`);
  return checkResponse(response, 'Errore nel recupero del dataset');
}

export async function syncPhaseOneBatch(
  gender: string,
  acceptedIds: string[],
  rejectedIds: string[],
  currentBlock: number
): Promise<{ success: boolean }> {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify({
      action: 'syncPhaseOneBatch',
      gender,
      acceptedIds,
      rejectedIds,
      currentBlock
    })
  });
  return checkResponse(response, 'Errore nel salvataggio batch Phase 1');
}

export async function syncPhaseTwoBatch(gender: string, logs: { id: string, elo: number, match_giocati: number, phase: number }[]): Promise<{ success: boolean }> {
  if (logs.length === 0) return { success: true };
  
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify({
      action: 'syncPhaseTwoBatch',
      gender,
      logs
    })
  });
  return checkResponse(response, 'Errore nel salvataggio batch Phase 2');
}

export async function syncPhaseThreeBatch(gender: string, logs: { id: string, phase: number }[]): Promise<{ success: boolean }> {
  if (logs.length === 0) return { success: true };
  
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify({
      action: 'syncPhaseThreeBatch',
      gender,
      logs
    })
  });
  return checkResponse(response, 'Errore nel salvataggio batch Phase 3');
}

export async function getFase4State(gender: Gender): Promise<any[]> {
  const response = await fetch(`${SCRIPT_URL}?action=getFase4State&gender=${gender}`);
  return checkResponse(response, 'Errore nel recupero stato Fase 4');
}

export async function saveGiornataFase4(
  gender: string, 
  currentRoundIndex: number, 
  matches: { matchId: string, roundIndex: number, p1Id: string, p2Id: string, p1Vote: string, p2Vote: string, p1Points: number, p2Points: number }[]
): Promise<{ success: boolean }> {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify({
      action: 'saveGiornataFase4',
      gender,
      currentRoundIndex,
      matches
    })
  });
  return checkResponse(response, 'Errore nel salvataggio Giornata Fase 4');
}
