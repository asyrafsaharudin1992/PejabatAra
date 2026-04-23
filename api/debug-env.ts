export default function handler(req: any, res: any) {
  const mask = (str: string | undefined) => {
    if (!str) return "Missing";
    if (str.length < 10) return "Too Short";
    return str.substring(0, 5) + "..." + str.substring(str.length - 5);
  };

  const pk = process.env.GOOGLE_PRIVATE_KEY;
  let pkStatus = "OK";
  if (!pk) pkStatus = "Missing";
  else if (!pk.includes("BEGIN PRIVATE KEY")) pkStatus = "Invalid Format (Missing Header)";
  else if (pk.includes("\\n") && pk.includes("\n")) pkStatus = "Mixed Newlines (Suspicious)";
  
  res.status(200).json({
    GOOGLE_SHEET_ID: mask(process.env.GOOGLE_SHEET_ID),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: mask(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    GOOGLE_PRIVATE_KEY_STATUS: pkStatus,
    GOOGLE_PRIVATE_KEY_PREVIEW: mask(pk),
    NODE_VERSION: process.version,
    ENV: process.env.NODE_ENV || "development"
  });
}
