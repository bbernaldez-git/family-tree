const SPREADSHEET_ID = "1-9qEX-JbZmbPwUMS2SVyNRg7r6m5Ac21osj4pDJcYhM";
const SHEET_NAME = "Members";

function doGet(e) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return createJsonResponse({ status: "success", members: [] });
  }

  const headers = data[0];
  const members = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;

    let member = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      if (val instanceof Date && !isNaN(val.getTime())) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      const key = headers[j] === "NickName" ? "Nickname" : headers[j];
      member[key] = val !== undefined && val !== null ? String(val).trim() : "";
    }

    if (!member.FullName && member.Nickname) {
      member.FullName = member.Nickname;
    }
    members.push(member);
  }

  return createJsonResponse({ status: "success", members: members });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    const payload = JSON.parse(e.postData.contents);
    const data = sheet.getDataRange().getValues();

    // UPDATE EXISTING MEMBER IF action === "update"
    if (payload.action === "update" && payload.MemberID) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.MemberID)) {
          const rowNum = i + 1;
          const existingPhoto = data[i][7];
          const updatedRow = [
            payload.MemberID,
            payload.Role || data[i][1],
            payload.RelatedToID !== undefined ? payload.RelatedToID : data[i][2],
            payload.FullName !== undefined ? payload.FullName : data[i][3],
            payload.Nickname !== undefined ? payload.Nickname : data[i][4],
            payload.Gender !== undefined ? payload.Gender : data[i][5],
            payload.BirthDate !== undefined ? payload.BirthDate : data[i][6],
            payload.PhotoURL || existingPhoto || "",
            payload.Occupation !== undefined ? payload.Occupation : data[i][8],
            payload.Hobbies !== undefined ? payload.Hobbies : data[i][9],
            payload.Sports !== undefined ? payload.Sports : data[i][10],
            payload.Phone !== undefined ? payload.Phone : data[i][11],
            payload.Email !== undefined ? payload.Email : data[i][12],
            payload.City !== undefined ? payload.City : data[i][13],
            JSON.stringify(payload.Socials || {})
          ];
          sheet.getRange(rowNum, 1, 1, 15).setValues([updatedRow]);
          return createJsonResponse({
            status: "success",
            memberId: payload.MemberID,
            message: "Profile updated!"
          });
        }
      }
      return createJsonResponse({ status: "error", message: "Member not found." });
    }

    // CREATE NEW MEMBER
    const lastRow = sheet.getLastRow();
    const newId = "P" + String(lastRow).padStart(3, "0");

    const newRow = [
      newId,
      payload.Role || "Descendant",
      payload.RelatedToID || "",
      payload.FullName || "",
      payload.Nickname || "",
      payload.Gender || "",
      payload.BirthDate || "",
      payload.PhotoURL || "",
      payload.Occupation || "",
      payload.Hobbies || "",
      payload.Sports || "",
      payload.Phone || "",
      payload.Email || "",
      payload.City || "",
      JSON.stringify(payload.Socials || {})
    ];

    sheet.appendRow(newRow);

    return createJsonResponse({
      status: "success",
      memberId: newId,
      message: "Added to family tree!"
    });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
