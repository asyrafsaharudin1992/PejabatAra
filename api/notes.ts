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

    if (req.method === 'GET') {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!A:G`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];
      return res.status(200).json(rows.slice(1).map((r: any) => ({
        id: r[0], 
        title: r[1], 
        content: r[2], 
        updatedAt: r[3], 
        duedate: r[4],
        category: r[5] || 'General',
        completed: r[6] === 'Completed'
      })));
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      // A=id, B=title, C=content, D=updatedAt, E=duedate, F=category, G=status
      const newNote = [
        Date.now().toString(), 
        body.title || "", 
        body.content || "", 
        new Date().toISOString(), 
        body.duedate || "",
        body.category || "General",
        body.completed ? "Completed" : "Pending"
      ];
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!A:G:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [newNote] })
      });
      return res.status(200).json({ 
        id: newNote[0], 
        title: newNote[1], 
        content: newNote[2], 
        updatedAt: newNote[3], 
        duedate: newNote[4],
        category: newNote[5],
        completed: body.completed || false
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "ID is required" });

      // Find row index
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: string[]) => row[0].toString() === id.toString());

      if (rowIndex !== -1) {
        // Get the sheet ID for Notes to perform a batchUpdate delete
        const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sheetInfo = await sheetInfoRes.json();
        const notesSheet = sheetInfo.sheets.find((s: any) => s.properties.title === 'Notes');
        const sheetId = notesSheet.properties.sheetId;

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
      return res.status(404).json({ error: "Note not found" });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      // Find row index
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: string[]) => row[0].toString() === id?.toString());

      if (rowIndex !== -1) {
        // We update specific columns. Index in Sheets is rowIndex + 1.
        // Columns: A=id, B=title, C=content, D=updatedAt, E=duedate
        if (body.title !== undefined) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!B${rowIndex + 1}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[body.title]] })
          });
        }
        if (body.content !== undefined) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!C${rowIndex + 1}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[body.content]] })
          });
        }
        if (body.duedate !== undefined) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!E${rowIndex + 1}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[body.duedate]] })
          });
        }
        if (body.category !== undefined) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!F${rowIndex + 1}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[body.category]] })
          });
        }
        if (body.completed !== undefined) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!G${rowIndex + 1}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[body.completed ? "Completed" : "Pending"]] })
          });
        }
        // Update timestamp
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Notes!D${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[new Date().toISOString()]] })
        });
        
        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "Note not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
}
