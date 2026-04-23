import { GoogleAuth } from 'google-auth-library';

export default async function handler(req: any, res: any) {
  // Support POST for login
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const { email, password } = body;

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
    const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";

    // Fetch Users sheet: Col A=Email, B=FullName, C=Role, D=Password, E=LastLogin, F=Status, G=Location, H=ProfilePic
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!A:H`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: 'Google Sheets API error', details: err });
    }

    const data = await response.json();
    const rows = data.values || [];

    // Find user (skip header row 0)
    const userRowIndex = rows.findIndex((row: string[], idx: number) => 
      idx > 0 && row[0]?.toLowerCase() === email?.toLowerCase()
    );

    if (userRowIndex !== -1) {
      const userRow = rows[userRowIndex];
      const storedPassword = userRow[3];

      if (storedPassword === password) {
        // Update LastLogin (Cell E is index 4. Row in Sheets is index + 1)
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!E${userRowIndex + 1}?valueInputOption=RAW`;
        await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [[new Date().toISOString()]] })
        });

        return res.status(200).json({
          email: userRow[0],
          fullName: userRow[1],
          role: userRow[2],
          status: userRow[5] || "Active",
          location: userRow[6] || "N/A",
          profilePic: userRow[7] || ""
        });
      }
    }

    return res.status(401).json({ error: 'Invalid email or password' });
  } catch (error: any) {
    console.error('[Login API Error]:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
