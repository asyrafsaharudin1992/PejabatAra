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

    const SHEET_NAME = 'Portal';

    if (req.method === 'GET') {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:E`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];

      // id, folder, title, url, createdAt
      const links = rows.slice(1).map((row: any) => ({
        id: row[0],
        folder: row[1] || "General",
        title: row[2] || "Link",
        url: row[3] || "#",
        createdAt: row[4] || new Date().toISOString()
      }));

      return res.status(200).json(links);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      
      const newRow = [
        Date.now().toString(),
        body.folder || "General",
        body.title || "Untitled",
        body.url || "#",
        new Date().toISOString()
      ];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:E:append?valueInputOption=RAW`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [newRow] })
      });

      return res.status(200).json({
        id: newRow[0],
        folder: newRow[1],
        title: newRow[2],
        url: newRow[3],
        createdAt: newRow[4]
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "ID is required" });

      const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sheetInfo = await sheetInfoRes.json();
      const sheet = sheetInfo.sheets.find((s: any) => s.properties.title === SHEET_NAME);
      const sheetId = sheet.properties.sheetId;

      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const ids = getData.values || [];
      const rowIndex = ids.findIndex((row: any) => row[0].toString() === id.toString());

      if (rowIndex !== -1) {
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
      return res.status(404).json({ error: "Link not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
