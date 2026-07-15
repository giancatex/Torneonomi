# Istruzioni Google Apps Script

Copia e incolla questo codice nel tuo Google Apps Script editor. Assicurati di salvare e fare un nuovo "Nuovo Deployment" come applicazione web ("Esegui come: me", "Chi ha accesso: Tutti").

```javascript
const SPREADSHEET_ID = "14r4MWglj5zQ5PgJfaQBxqp1gj1cqWPJ8msA5BF4h8Lk"; // Usa il tuo vero Spreadsheet ID

function doGet(e) {
  const action = e.parameter.action;
  const gender = e.parameter.gender;
  
  if (action === 'getMetadata') {
    return handleGetMetadata(gender);
  } else if (action === 'getDatabase') {
    return handleGetDatabase(gender);
  } else if (action === 'getFase4State') {
    return handleGetFase4State(gender);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: "Azione GET non valida"})).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: "Body non valido"})).setMimeType(ContentService.MimeType.JSON);
  }
  
  const action = body.action;
  if (action === 'syncPhaseOneBatch') {
    return handleSyncPhaseOneBatch(body);
  } else if (action === 'syncPhaseTwoBatch') {
    return handleSyncPhaseTwoBatch(body);
  } else if (action === 'syncPhaseThreeBatch') {
    return handleSyncPhaseThreeBatch(body);
  } else if (action === 'saveGiornataFase4') {
    return handleSaveGiornataFase4(body);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: "Azione POST non valida"})).setMimeType(ContentService.MimeType.JSON);
}

function handleGetMetadata(gender) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Meta_Stato");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Foglio Meta_Stato non trovato"})).setMimeType(ContentService.MimeType.JSON);
  
  const data = sheet.getRange("A2:D" + Math.max(2, sheet.getLastRow())).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (isSameGender(row[0], gender)) {
      return ContentService.createTextOutput(JSON.stringify({
        faseGlobale: parseInt(row[1] || '1', 10),
        bloccoAvanzamento: parseInt(row[2] || '0', 10),
        statusIntegrita: parseInt(row[3] || '1', 10)
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    faseGlobale: 1,
    bloccoAvanzamento: 0,
    statusIntegrita: 1
  })).setMimeType(ContentService.MimeType.JSON);
}

function isSameGender(sheetValue, targetGender) {
  if (!sheetValue || !targetGender) return false;
  const s = String(sheetValue).trim().toLowerCase();
  const t = String(targetGender).trim().toLowerCase();
  if (s === t) return true;
  if (t === 'maschile' && (s === 'm' || s === 'maschile')) return true;
  if (t === 'femminile' && (s === 'f' || s === 'femminile')) return true;
  return false;
}

function handleGetDatabase(gender) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = gender === 'maschile' ? 'Master_M' : 'Master_F';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Foglio non trovato: " + sheetName})).setMimeType(ContentService.MimeType.JSON);
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  const data = sheet.getRange("A2:G" + lastRow).getValues();
  const result = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      result.push({
        id: String(row[0]),
        name: String(row[1]),
        frequency: parseInt(row[3] || '0', 10),
        phase: parseInt(row[4] || '0', 10),
        elo: row[5] ? parseInt(row[5], 10) : 1200,
        match_giocati: row[6] ? parseInt(row[6], 10) : 0
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function handleSyncPhaseOneBatch(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = body.gender === 'maschile' ? 'Master_M' : 'Master_F';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Foglio non trovato"})).setMimeType(ContentService.MimeType.JSON);
  
  const acceptedIds = body.acceptedIds || [];
  const rejectedIds = body.rejectedIds || [];
  const currentBlock = body.currentBlock;
  
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange("A2:A" + lastRow).getValues();
    const phaseRange = sheet.getRange("E2:E" + lastRow);
    const phases = phaseRange.getValues();
    
    let updated = false;
    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i][0]);
      if (acceptedIds.includes(id)) {
        phases[i][0] = 2;
        updated = true;
      } else if (rejectedIds.includes(id)) {
        phases[i][0] = 0;
        updated = true;
      }
    }
    if (updated) {
      phaseRange.setValues(phases);
    }
  }
  
  const metaSheet = ss.getSheetByName("Meta_Stato");
  if (metaSheet) {
    const mRow = metaSheet.getLastRow();
    let found = false;
    if (mRow >= 2) {
      const mData = metaSheet.getRange("A2:A" + mRow).getValues();
      for (let i = 0; i < mData.length; i++) {
        if (isSameGender(mData[i][0], body.gender)) {
          metaSheet.getRange(i + 2, 3).setValue(currentBlock);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      const genderCode = body.gender === 'maschile' ? 'M' : 'F';
      metaSheet.appendRow([genderCode, 1, currentBlock, 'OK']);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
}

function handleSyncPhaseTwoBatch(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = body.gender === 'maschile' ? 'Master_M' : 'Master_F';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Foglio non trovato"})).setMimeType(ContentService.MimeType.JSON);
  
  const logs = body.logs || [];
  if (logs.length === 0) return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
  
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange("A2:A" + lastRow).getValues();
    const targetRange = sheet.getRange("E2:G" + lastRow);
    const targetData = targetRange.getValues();
    
    let updated = false;
    const idMap = {};
    for (let i = 0; i < ids.length; i++) {
      idMap[String(ids[i][0])] = i;
    }
    
    for (const log of logs) {
      const idx = idMap[String(log.id)];
      if (idx !== undefined) {
        targetData[idx][0] = log.phase;
        targetData[idx][1] = log.elo;
        targetData[idx][2] = log.match_giocati;
        updated = true;
      }
    }
    
    if (updated) {
      targetRange.setValues(targetData);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
}

function handleSyncPhaseThreeBatch(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = body.gender === 'maschile' ? 'Master_M' : 'Master_F';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Foglio non trovato"})).setMimeType(ContentService.MimeType.JSON);
  
  const logs = body.logs || [];
  if (logs.length === 0) return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
  
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange("A2:A" + lastRow).getValues();
    const phaseRange = sheet.getRange("E2:E" + lastRow);
    const phaseData = phaseRange.getValues();
    
    let updated = false;
    const idMap = {};
    for (let i = 0; i < ids.length; i++) {
      idMap[String(ids[i][0])] = i;
    }
    
    for (const log of logs) {
      const idx = idMap[String(log.id)];
      if (idx !== undefined) {
        phaseData[idx][0] = log.phase;
        updated = true;
      }
    }
    
    if (updated) {
      phaseRange.setValues(phaseData);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
}

function handleGetFase4State(gender) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Log_partite");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  const data = sheet.getRange("A2:I" + lastRow).getValues();
  const result = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (isSameGender(row[0], gender)) {
      result.push({
        matchId: String(row[1]),
        roundIndex: parseInt(row[2], 10),
        p1Id: String(row[3]),
        p2Id: String(row[4]),
        p1Vote: String(row[5]),
        p2Vote: String(row[6]),
        p1Points: parseFloat(row[7]),
        p2Points: parseFloat(row[8])
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function handleSaveGiornataFase4(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Log_partite");
  if (!sheet) {
    sheet = ss.insertSheet("Log_partite");
    sheet.appendRow(["Gender", "MatchId", "RoundIndex", "P1_Id", "P2_Id", "P1_Vote", "P2_Vote", "P1_Points", "P2_Points", "Timestamp"]);
  }
  
  const matches = body.matches || [];
  if (matches.length > 0) {
    const rows = matches.map(m => [
      body.gender, m.matchId, m.roundIndex, m.p1Id, m.p2Id, m.p1Vote, m.p2Vote, m.p1Points, m.p2Points, new Date()
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  // Aggiorna metadati
  const metaSheet = ss.getSheetByName("Meta_Stato");
  if (metaSheet) {
    const mRow = metaSheet.getLastRow();
    if (mRow >= 2) {
      const mData = metaSheet.getRange("A2:A" + mRow).getValues();
      for (let i = 0; i < mData.length; i++) {
        if (isSameGender(mData[i][0], body.gender)) {
          metaSheet.getRange(i + 2, 3).setValue(body.currentRoundIndex + 1); // aggiorna blocco (round)
          break;
        }
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
}
```
