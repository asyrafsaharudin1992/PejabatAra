import { GoogleAuth } from 'google-auth-library';

export default async function handler(req: any, res: any) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";
  
  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || "")
          .replace(/^"/, '') 
          .replace(/"$/, '') 
          .replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const SHEET_NAME = 'History';
    const TRACKER_SHEET = 'Tracker';

    const getColLetter = (index: number) => {
      let letter = '';
      let i = index;
      while (i >= 0) {
        letter = String.fromCharCode((i % 26) + 65) + letter;
        i = Math.floor(i / 26) - 1;
      }
      return letter;
    };

    if (req.method === 'GET') {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:D`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: "Failed to fetch history from Google Sheets", details: errText });
      }
      const data = await response.json();
      const rows = data.values || [];
      return res.status(200).json(rows.slice(1).map((r: any) => ({
        taskId: r[0], title: r[1], dateCompleted: r[2], remarks: r[3] || ""
      })));
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const { taskId, title } = body;
      const todayIso = new Date().toISOString();
      const todayDate = todayIso.split('T')[0];

      // 1. Update History Sheet (List)
      const entry = [taskId, title, todayIso, body.remarks || ""];
      const hRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:D:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [entry] })
      });

      if (!hRes.ok) {
        const errText = await hRes.text();
        return res.status(hRes.status).json({ error: "Failed to append to history", details: errText });
      }

      // 2. Update Tracker Sheet (Matrix) - Optional
      try {
        const tResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TRACKER_SHEET}!A:ZZ`, { headers: { Authorization: `Bearer ${token}` } });
        if (tResponse.ok) {
          const tData = await tResponse.json();
          let rows = tData.values || [["Date"]];

          const searchTitle = title.trim().toLowerCase();
          // Find/Add Task Column
          let colIndex = rows[0].findIndex((h: string) => h && h.trim().toLowerCase() === searchTitle);
          if (colIndex === -1) {
            colIndex = rows[0].length;
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TRACKER_SHEET}!${getColLetter(colIndex)}1?valueInputOption=RAW`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ values: [[title]] })
            });
          }

          // Find/Add Date Row
          let rowIndex = rows.findIndex((r: any) => r[0] === todayDate);
          if (rowIndex === -1) {
            rowIndex = rows.length;
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TRACKER_SHEET}!A${rowIndex + 1}?valueInputOption=RAW`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ values: [[todayDate]] })
            });
          }

          // Set "DONE"
          const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TRACKER_SHEET}!${getColLetter(colIndex)}${rowIndex + 1}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [['DONE']] })
          });
          if (!updateRes.ok) console.error("Failed to update Tracker matrix cell:", await updateRes.text());
        } else {
          console.error("Failed to fetch Tracker sheet:", await tResponse.text());
        }
      } catch (e) {
        console.error("Tracker update failed:", e);
      }

      return res.status(200).json({ taskId: entry[0], title: entry[1], dateCompleted: entry[2], remarks: entry[3] });
    }

    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const { taskId, dateCompleted, remarks } = body;

      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:C`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const rows = getData.values || [];
      const rowIndex = rows.findIndex((row: string[]) => row[0]?.toString() === taskId?.toString() && row[2] === dateCompleted);

      if (rowIndex !== -1) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!D${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[remarks]] })
        });
        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "Entry not found" });
    }

    if (req.method === 'DELETE') {
      const { id, date } = req.query; 
      if (!id || !date) return res.status(400).json({ error: "id and date are required" });

      // 1. Delete from History (List)
      const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!sheetInfoRes.ok) return res.status(sheetInfoRes.status).json({ error: "Failed to fetch spreadsheet info" });
      const sheetInfo = await sheetInfoRes.json();
      const hSheet = sheetInfo.sheets?.find((s: any) => s.properties.title === SHEET_NAME);
      if (!hSheet) return res.status(404).json({ error: "History sheet not found" });
      const hSheetId = hSheet.properties.sheetId;

      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:C`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const hRows = getData.values || [];
      const hRowIndex = hRows.findIndex((row: any) => row[0]?.toString() === id.toString() && row[2] === date);

      if (hRowIndex !== -1) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: hSheetId,
                  dimension: 'ROWS',
                  startIndex: hRowIndex,
                  endIndex: hRowIndex + 1
                }
              }
            }]
          })
        });

        // 2. Clear from Tracker (Matrix) - Optional
        try {
          const dateStr = (date as string).split('T')[0];
          const tTasksRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:C`, { headers: { Authorization: `Bearer ${token}` } });
          const tTasksData = await tTasksRes.ok ? await tTasksRes.json() : { values: [] };
          const tRows = tTasksData.values || [];
          const task = tRows.find((r: any) => r[0] === id);
          const title = task ? task[2] : id;

          const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TRACKER_SHEET}!A:ZZ`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) {
            const data = await response.json();
            const rows = data.values || [];
            const searchTitle = title.trim().toLowerCase();
            const colIndex = rows[0]?.findIndex((h: string) => h && h.trim().toLowerCase() === searchTitle);
            const rowIndex = rows.findIndex((r: any) => r[0] === dateStr);

            if (colIndex !== undefined && colIndex !== -1 && rowIndex !== -1) {
              await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TRACKER_SHEET}!${getColLetter(colIndex)}${rowIndex + 1}?valueInputOption=RAW`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: [['']] })
              });
            }
          }
        } catch (e) {
          console.error("Tracker clear failed:", e);
        }

        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "History entry not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
}
