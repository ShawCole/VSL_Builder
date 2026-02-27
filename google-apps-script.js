/**
 * Google Apps Script — Feedback Notes Backend
 *
 * Setup:
 * 1. Create a Google Sheet with headers in row 1:
 *    ID | Note | Section | Status | Timestamp | Avatar | HookIndex
 * 2. Open Extensions → Apps Script, paste this file
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the deployment URL into your .env as NEXT_PUBLIC_FEEDBACK_SCRIPT_URL
 */

const SHEET_NAME = "Notes";

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function doGet() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) {
    return h.toString().toLowerCase().trim();
  });
  const rows = [];

  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }

  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var sheet = getSheet();

  if (body.action === "create") {
    sheet.appendRow([
      body.id,
      body.note,
      body.section,
      body.status || "open",
      body.timestamp,
      body.avatar,
      body.hookindex,
    ]);
    return ContentService.createTextOutput(
      JSON.stringify({ success: true })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === "update") {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === body.id) {
        sheet.getRange(i + 1, 4).setValue(body.status); // Status = column 4
        break;
      }
    }
    return ContentService.createTextOutput(
      JSON.stringify({ success: true })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ error: "Unknown action" })
  ).setMimeType(ContentService.MimeType.JSON);
}
