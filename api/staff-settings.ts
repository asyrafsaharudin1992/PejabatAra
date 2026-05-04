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

    const SHEET_NAME = 'StaffSettings';

    if (req.method === 'GET') {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:F`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      
      if (data.error && data.error.status === 'NOT_FOUND') {
        // Sheet might not exist yet, return empty list
        return res.status(200).json([]);
      }

      const rows = data.values || [];
      if (rows.length === 0) return res.status(200).json([]);

      const headers = rows[0].map((h: string) => h.toLowerCase());
      const settings = rows.slice(1).map((row: any) => {
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          let val = row[i];
          if (h === 'offdays' && val) {
            try { val = JSON.parse(val); } catch (e) { val = []; }
          }
          obj[h] = val;
        });
        return obj;
      });

      return res.status(200).json(settings);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      
      const { email, name, offDays, leaveStart, leaveEnd } = body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Check if row already exists
      const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:A`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json();
      
      let rows = getData.values || [];
      let rowIndex = rows.findIndex((r: any) => r[0] === email);

      const rowData = [
        email,
        name || "",
        JSON.stringify(offDays || []),
        leaveStart || "",
        leaveEnd || "",
        new Date().toISOString()
      ];

      if (rowIndex === -1) {
        // Append
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:F:append?valueInputOption=RAW`;
        await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] })
        });
      } else {
        // Update
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A${rowIndex + 1}:F${rowIndex + 1}?valueInputOption=RAW`;
        await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] })
        });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
