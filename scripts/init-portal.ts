import { GoogleAuth } from 'google-auth-library';

async function initPortalSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || "")
      .replace(/\\n/g, '\n')
      .replace(/"/g, '')
      .trim(),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const SHEET_NAME = 'Portal';

  try {
    // 1. Check if sheet exists
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meta = await metaRes.json();
    const sheetExists = meta.sheets.some((s: any) => s.properties.title === SHEET_NAME);

    if (!sheetExists) {
      console.log(`Creating sheet: ${SHEET_NAME}...`);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            addSheet: {
              properties: { title: SHEET_NAME }
            }
          }]
        })
      });
      console.log(`Sheet ${SHEET_NAME} created.`);
    }

    // 2. Add headers
    console.log("Setting headers...");
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:E1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [["id", "folder", "title", "url", "createdAt"]]
      })
    });
    console.log("Headers set successfully.");

  } catch (error) {
    console.error("Error initializing sheet:", error);
  }
}

initPortalSheet();
