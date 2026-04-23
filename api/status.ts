export default function handler(req: any, res: any) {
  res.status(200).json({ 
    connected: true, 
    spreadsheetId: process.env.GOOGLE_SHEET_ID ? "Configured" : "Missing",
    time: new Date().toISOString()
  });
}
