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

    const SHEET_NAME = 'Tracker';

    const getColLetter = (index: number) => {
      let letter = '';
      while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    if (req.method === 'GET') {
      // 1. Fetch Task ID Mapping
      const tasksResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:C`, { headers: { Authorization: `Bearer ${token}` } });
      const tasksData = await tasksResponse.json();
      const taskRows = tasksData.values || [];
      const titleToId: Record<string, string> = {};
      taskRows.slice(1).forEach((r: any) => {
        if (r[0] && r[2]) titleToId[r[2]] = r[0];
      });

      // 2. Fetch Tracker Data
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:ZZ`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];
      if (rows.length === 0) return res.status(200).json([]);

      const headers = rows[0]; // Task Titles
      const historyEntries: any[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const date = row[0];
        if (!date) continue;

        for (let j = 1; j < row.length; j++) {
          if (row[j] === 'DONE' && headers[j]) {
            const title = headers[j];
            historyEntries.push({
              taskId: titleToId[title] || title,
              title: title,
              dateCompleted: new Date(date).toISOString(),
              remarks: "" 
            });
          }
        }
      }
      return res.status(200).json(historyEntries);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const { taskId, title } = body;
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch current matrix
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:ZZ`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      let rows = data.values || [["Date"]];

      // 2. Find or Add Task Column
      let colIndex = rows[0].indexOf(title);
      if (colIndex === -1) {
        colIndex = rows[0].length;
        // Update header row
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!${getColLetter(colIndex)}1?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[title]] })
        });
      }

      // 3. Find or Add Date Row
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === today) {
          rowIndex = i;
          break;
        }
      }

      if (rowIndex === -1) {
        rowIndex = rows.length;
        // Append new row with date
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[today]] })
        });
      }

      // 4. Set "DONE"
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!${getColLetter(colIndex)}${rowIndex + 1}?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [['DONE']] })
      });

      return res.status(200).json({ taskId, title, dateCompleted: new Date().toISOString(), remarks: "" });
    }

    if (req.method === 'DELETE') {
      const { id, date } = req.query; 
      if (!id || !date) return res.status(400).json({ error: "id and date are required" });

      const dateStr = new Date(date).toISOString().split('T')[0];

      // 1. Fetch Task Info to get Title
      const tasksResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:C`, { headers: { Authorization: `Bearer ${token}` } });
      const tasksData = await tasksResponse.json();
      const taskRows = tasksData.values || [];
      const task = taskRows.find((r: any) => r[0] === id);
      const title = task ? task[2] : id; 

      // 2. Fetch current matrix
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:ZZ`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];

      // 3. Finding row and col
      const colIndex = rows[0]?.indexOf(title);
      const rowIndex = rows.findIndex((r: any) => r[0] === dateStr);

      if (colIndex !== -1 && rowIndex !== -1) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!${getColLetter(colIndex)}${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['']] })
        });
        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "Entry not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
}
