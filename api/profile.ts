import { GoogleAuth } from 'google-auth-library';

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";

  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const { email, fullName, location, profilePic } = body;

    // Find user row
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!A:A`;
    const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    const getData = await getRes.json();
    const emails = getData.values || [];
    const rowIndex = emails.findIndex((row: string[]) => row[0]?.toLowerCase() === email?.toLowerCase());

    if (rowIndex !== -1) {
      // Columns: A=Email, B=FullName, C=Role, D=Password, E=LastLogin, F=Status, G=Location, H=ProfilePic
      if (fullName) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!B${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[fullName]] })
        });
      }
      if (location) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!G${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[location]] })
        });
      }
      if (profilePic) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!H${rowIndex + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[profilePic]] })
        });
      }
      return res.status(200).json({ success: true });
    }
    return res.status(404).json({ error: "User not found" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
