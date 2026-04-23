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

    const SHEET_NAME = 'Users';

    if (req.method === 'GET') {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:G`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const rows = data.values || [];
      return res.status(200).json(rows.slice(1).map((r: any) => ({
        email: r[0], fullName: r[1], role: r[2], lastLogin: r[4], status: r[5] || "Active"
      })));
    }

    if (req.method === 'DELETE') {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Step A: Get sheetId
      const sheetInfoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sheetInfo = await sheetInfoRes.json();
      const sheet = sheetInfo.sheets.find((s: any) => s.properties.title === SHEET_NAME);
      const sheetId = sheet.properties.sheetId;

      // Step B: Find Row
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      const emails = getData.values || [];
      const rowIndex = emails.findIndex((row: string[]) => row[0]?.toLowerCase() === (email as string).toLowerCase());

      if (rowIndex !== -1) {
        // Step C: batchUpdate deleteDimension
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
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
}
