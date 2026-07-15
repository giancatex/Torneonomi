function saveBatchPhase1(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ... Logica esistente di salvataggio nel foglio Master_M o Master_F tramite setValues() ...
    
    const metaSheet = ss.getSheetByName('Meta_Stato');
    const metaData = metaSheet.getDataRange().getValues();
    
    let targetRow = -1;
    for (let i = 1; i < metaData.length; i++) {
      if (metaData[i][0] === payload.gender) {
        targetRow = i + 1; // Apps Script è 1-based
        break;
      }
    }
    
    if (targetRow !== -1) {
      const colonnaBlocco = 3; // Assumendo che Blocco_Avanzamento sia la colonna C
      metaSheet.getRange(targetRow, colonnaBlocco).setValue(payload.currentBlock);
    } else {
      throw new Error("ID_Torneo non trovato nel foglio Meta_Stato");
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
