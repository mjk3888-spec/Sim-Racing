/**
 * LUMINARY SYNC SCRIPT — Google Apps Script web app backend for the
 * Luminary Endurance Manager live sync (the "Luminary Sync Script" referenced
 * in the app's Live Sync setup instructions).
 *
 * Sharing model: broadcast. ONE strategist edits; every push overwrites the
 * stored state (last write wins). Teammates poll and render. This script is
 * intentionally a dumb mailbox — no merging, no multi-writer conflict logic.
 *
 * Wire contract (must match pushState()/pullState() in index.html):
 *   POST  body: {"action":"write","ts":<ms epoch>,"state":"<JSON string>"}
 *         resp: {"ok":true}
 *   GET   ?action=read&ts=<lastSeenTs>
 *         resp: {"ts":<ms epoch>,"state":"<JSON string>"}
 *
 * SETUP (one time, by the strategist):
 *   1. Create a Google Sheet at sheets.google.com (any name).
 *   2. Extensions → Apps Script. Delete any existing code, paste this file.
 *   3. Deploy → New deployment → Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. Copy the Web App URL into the app: Team/Event Config → Live Sync → Connect.
 *   5. Share that same URL with teammates; they paste it into their installs.
 *
 * State is chunked across rows because a single Sheets cell caps at 50,000
 * characters and a full event state can exceed that.
 */

var SHEET_NAME = 'LUM_SYNC';
var CHUNK_SIZE = 45000;

function getSyncSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action !== 'write') {
      return jsonResponse_({ ok: false, error: 'unknown action' });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getSyncSheet_();
      var state = String(body.state || '');
      var chunks = [];
      for (var i = 0; i < state.length; i += CHUNK_SIZE) {
        chunks.push([state.substring(i, i + CHUNK_SIZE)]);
      }
      sheet.clearContents();
      sheet.getRange(1, 1).setValue(Number(body.ts) || Date.now());
      sheet.getRange(1, 2).setValue(chunks.length);
      if (chunks.length) {
        sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
      }
    } finally {
      lock.releaseLock();
    }
    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'read') {
      var sheet = getSyncSheet_();
      var ts = Number(sheet.getRange(1, 1).getValue()) || 0;
      var chunkCount = Number(sheet.getRange(1, 2).getValue()) || 0;
      var state = '';
      if (chunkCount > 0) {
        var values = sheet.getRange(2, 1, chunkCount, 1).getValues();
        state = values.map(function (row) { return String(row[0]); }).join('');
      }
      return jsonResponse_({ ts: ts, state: state });
    }
    return jsonResponse_({ ok: true, service: 'luminary-sync' });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
