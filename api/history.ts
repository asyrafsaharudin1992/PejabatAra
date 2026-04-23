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
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/History!A:D`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];
      return res.status(200).json(rows.slice(1).map((r: any) => ({
        taskId: r[0], title: r[1], dateCompleted: r[2], remarks: r[3]
      })));
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const entry = [body.taskId, body.title, new Date().toISOString(), body.remarks || ""];
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/History!A:D:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [entry] })
      });
      return res.status(200).json({ taskId: entry[0], title: entry[1], dateCompleted: entry[2], remarks: entry[3] });
    }

    if (req.method === 'DELETE') {
      const { taskId, dateCompleted } = req.query;
      if (!taskId || !dateCompleted) return res.status(400).json({ error: "taskId and dateCompleted are required" });

      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/History!A:C`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const rows = getData.values || [];
      const rowIndex = rows.findIndex((row: string[]) => row[0] === taskId && row[2] === dateCompleted);

      if (rowIndex !== -1) {
        const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sheetInfo = await sheetInfoRes.json();
        const historySheet = sheetInfo.sheets.find((s: any) => s.properties.title === 'History');
        const sheetId = historySheet.properties.sheetId;

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
      return res.status(404).json({ error: "History entry not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
}
