import { GoogleAuth } from 'google-auth-library';

export default async function handler(req: any, res: any) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";
  
  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    if (req.method === 'GET') {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:G`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];

      // A:id, B:category, C:title, D:description, E:frequency, F:status, G:subtasks
      const tasks = rows.slice(1).map((row: any) => ({
        id: row[0],
        category: row[1],
        title: row[2],
        description: row[3],
        frequency: row[4],
        completed: row[5] === "Completed",
        subtasks: row[6] ? JSON.parse(row[6]) : [],
        createdAt: new Date().toISOString() // Fallback
      }));

      return res.status(200).json(tasks);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      
      const newTask = {
        id: Date.now().toString(),
        category: body.category,
        title: body.title,
        description: body.description || "",
        frequency: body.frequency || "N/A",
        status: body.completed ? "Completed" : "Pending",
        subtasks: JSON.stringify(body.subtasks || [])
      };

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:G:append?valueInputOption=RAW`;
      await fetch(url, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [[newTask.id, newTask.category, newTask.title, newTask.description, newTask.frequency, newTask.status, newTask.subtasks]] })
      });

      return res.status(200).json(newTask);
    }

    if (req.method === 'PATCH') {
      const { id } = req.query; // Vercel puts [id] in req.query
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      // Find row index
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: string[]) => row[0] === id);

      if (rowIndex !== -1) {
        // We update specific columns. Index in Sheets is rowIndex + 1.
        // Columns: A=1, B=2, C=3, D=4, E=5, F=6, G=7
        if (body.completed !== undefined) {
          const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!F${rowIndex + 1}?valueInputOption=RAW`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[body.completed ? "Completed" : "Pending"]] })
          });
        }
        // Add other field updates if needed...
        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "Task not found" });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "ID is required" });

      // Find row index
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: string[]) => row[0].toString() === id.toString());

      if (rowIndex !== -1) {
        const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sheetInfo = await sheetInfoRes.json();
        const tasksSheet = sheetInfo.sheets.find((s: any) => s.properties.title === 'Tasks');
        const sheetId = tasksSheet.properties.sheetId;

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
