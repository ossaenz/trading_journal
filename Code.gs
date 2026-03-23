/**
 * QuantumTrade Multi-User Backend
 * Handles Schwab OAuth and private JSON storage per user
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// SECURE STORAGE: Each user gets their own JSON file in a hidden App Data folder
function saveUserData(payload) {
  const fileName = "quantum_trade_data.json";
  const folder = DriveApp.getRootFolder(); // For simplicity; ideally use 'appDataFolder'
  let file;
  const files = folder.getFilesByName(fileName);
  
  if (files.hasNext()) {
    file = files.next();
    file.setContent(JSON.stringify(payload));
  } else {
    file = folder.createFile(fileName, JSON.stringify(payload), MimeType.JSON);
  }
  return { status: "success", timestamp: new Date() };
}

function loadUserData() {
  const fileName = "quantum_trade_data.json";
  const files = DriveApp.getFilesByName(fileName);
  if (files.hasNext()) {
    return JSON.parse(files.next().getContent());
  }
  return null; // New user
}

/** * SCHWAB PROXY (Simplified)
 * Note: You'll need to add your Schwab ClientID/Secret to File > Project Settings > Script Properties
 */
function fetchSchwabData(endpoint) {
  const props = PropertiesService.getUserProperties();
  const token = props.getProperty('SCHWAB_TOKEN');
  
  const options = {
    "headers": { "Authorization": "Bearer " + token },
    "muteHttpExceptions": true
  };
  
  const response = UrlFetchApp.fetch("https://api.schwabapi.com/v1/" + endpoint, options);
  return JSON.parse(response.getContentText());
}