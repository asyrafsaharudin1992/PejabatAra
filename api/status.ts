export default function handler(req: any, res: any) {
  const mask = (str: string | undefined) => {
    if (!str) return "Missing";
    if (str.length < 10) return "Present (Too Short)";
    return `${str.substring(0, 5)}...${str.substring(str.length - 5)}`;
  };

  res.status(200).json({ 
    connected: true, 
    spreadsheetId: mask(process.env.GOOGLE_SHEET_ID),
    serviceAccountEmail: mask(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    privateKey: mask(process.env.GOOGLE_PRIVATE_KEY),
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
}
