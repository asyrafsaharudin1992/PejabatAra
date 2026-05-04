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

    // Helper to ensure sheet exists and has headers
    const ensureSheet = async () => {
      const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const metadataRes = await fetch(metadataUrl, { headers: { Authorization: `Bearer ${token}` } });
      const metadata = await metadataRes.json();
      
      if (metadata.error) {
        console.error('Error fetching spreadsheet metadata:', metadata.error);
        throw new Error(`Failed to fetch spreadsheet metadata: ${metadata.error.message}`);
      }
      
      const sheet = metadata.sheets?.find((s: any) => s.properties.title === SHEET_NAME);
      if (!sheet) {
        console.log(`Sheet "${SHEET_NAME}" not found. Attempting to create...`);
        // Create the sheet
        const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
        const createRes = await fetch(createUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
          })
        });
        const createData = await createRes.json();
        if (createData.error) {
          console.error('Error creating sheet:', createData.error);
          throw new Error(`Failed to create "${SHEET_NAME}" sheet: ${createData.error.message}`);
        }
        
        console.log(`Sheet "${SHEET_NAME}" created successfully. Adding headers...`);
        // Add headers
        const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:F1?valueInputOption=RAW`;
        const headRes = await fetch(headersUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['Email', 'Name', 'OffDays', 'LeaveStart', 'LeaveEnd', 'UpdatedAt']] })
        });
        const headData = await headRes.json();
        if (headData.error) {
          console.error('Error adding headers:', headData.error);
        }
      } else {
        // Check if headers exist
        const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:F1`;
        const checkRes = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}` } });
        const checkData = await checkRes.json();
        if (!checkData.values || checkData.values.length === 0) {
          const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:F1?valueInputOption=RAW`;
          await fetch(headersUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [['Email', 'Name', 'OffDays', 'LeaveStart', 'LeaveEnd', 'UpdatedAt']] })
          });
        }
      }
    };

    if (req.method === 'GET') {
      await ensureSheet();
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:F`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      
      const rows = data.values || [];
      if (rows.length <= 1) return res.status(200).json([]);

      const headers = rows[0].map((h: string) => h.toLowerCase().trim());
      const settings = rows.slice(1).map((row: any) => {
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          let val = row[i];
          if (h === 'offdays' && val) {
            try { 
              // Handle if it's already a JSON string or a comma separated list
              if (val.startsWith('[') || val.startsWith('{')) {
                val = JSON.parse(val); 
              } else {
                val = val.split(',').map((s: string) => s.trim());
              }
            } catch (e) { val = []; }
          }
          obj[h] = val;
        });
        return obj;
      });

      return res.status(200).json(settings);
    }

    if (req.method === 'POST') {
      await ensureSheet();
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
