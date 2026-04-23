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

    // A=id, B=category, C=title, D=description, E=frequency, F=status, G=subtasks, H=createdAt
    const SHEET_NAME = 'Tasks';

    if (req.method === 'GET') {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:H`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];

      const tasks = rows.slice(1).map((row: any) => ({
        id: row[0],
        category: row[1],
        title: row[2],
        description: row[3] || "",
        frequency: row[4] || "DAILY",
        completed: row[5] === "Completed",
        subtasks: row[6] ? JSON.parse(row[6]) : [],
        createdAt: row[7] || new Date().toISOString()
      }));

      return res.status(200).json(tasks);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      
      const newTaskRow = [
        Date.now().toString(), // id
        body.category || "General",
        body.title || "Untitled Task",
        body.description || "",
        body.frequency || "DAILY",
        body.completed ? "Completed" : "Pending",
        JSON.stringify(body.subtasks || []),
        new Date().toISOString() // createdAt
      ];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:H:append?valueInputOption=RAW`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [newTaskRow] })
      });

      return res.status(200).json({
        id: newTaskRow[0],
        category: newTaskRow[1],
        title: newTaskRow[2],
        description: newTaskRow[3],
        frequency: newTaskRow[4],
        completed: body.completed,
        subtasks: body.subtasks || [],
        createdAt: newTaskRow[7]
      });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "ID is required" });
      
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      // Step 1: Find Row
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: any) => row[0] === id);

      if (rowIndex === -1) return res.status(404).json({ error: "Task not found" });

      // Step 2: Update (Cols B to G)
      // We skip A (id) and H (createdAt)
      const updateRow = [
        body.category,
        body.title,
        body.description || "",
        body.frequency || "DAILY",
        body.completed === undefined ? undefined : (body.completed ? "Completed" : "Pending"),
        body.subtasks ? JSON.stringify(body.subtasks) : undefined
      ];

      // Update specific cells based on what's provided
      // Alternatively, update the whole range B:G for that row
      const currentRowRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A${rowIndex + 1}:G${rowIndex + 1}`, {
         headers: { Authorization: `Bearer ${token}` }
      });
      const currentRowData = await currentRowRes.json();
      const currentRow = currentRowData.values[0];

      const finalRow = [
        body.category || currentRow[1],
        body.title || currentRow[2],
        body.description !== undefined ? body.description : currentRow[3],
        body.frequency || currentRow[4],
        body.completed !== undefined ? (body.completed ? "Completed" : "Pending") : currentRow[5],
        body.subtasks ? JSON.stringify(body.subtasks) : currentRow[6]
      ];

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!B${rowIndex + 1}:G${rowIndex + 1}?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [finalRow] })
      });

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "ID is required" });

      // Step A: Get sheetId
      const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sheetInfo = await sheetInfoRes.json();
      const sheet = sheetInfo.sheets.find((s: any) => s.properties.title === SHEET_NAME);
      const sheetId = sheet.properties.sheetId;

      // Step B: Find rowIndex
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: any) => row[0].toString() === id.toString());

      if (rowIndex !== -1) {
        // Step C: deleteDimension
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1
                }
              }
            }]
          })
        });
        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "Task not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
