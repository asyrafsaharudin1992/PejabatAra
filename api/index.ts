import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import bcrypt from "bcryptjs";

dotenv.config();

// Initialize Express App
const app = express();

// 1. Core Middleware
app.use(cors());
app.use(express.json());

// 2. Logging
app.use((req, res, next) => {
  const incomingUrl = req.url || "";
  const isApi = incomingUrl.startsWith("/api/") || incomingUrl.startsWith("/api?") || incomingUrl === "/api";
  if (isApi) {
    console.log(`[API REQUEST] ${req.method} ${incomingUrl}`);
  }
  next();
});

// 3. API Router
const apiRouter = express.Router();

// Google Sheets Config
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "araofficesynbot@gen-lang-client-0504198581.iam.gserviceaccount.com";
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, '\n');

let doc: GoogleSpreadsheet | null = null;
let connectionError: string | null = null;

const initialTasks = [
  {"id":"qos-followup","category":"Quality of Service","title":"Follow up – referred cases","frequency":"DAILY","description":"Excel follow up for referred cases only."},
  {"id":"qos-plato","category":"Quality of Service","title":"Documenting in Plato","frequency":"DAILY"},
  {"id":"qos-audit-feedback","category":"Quality of Service","title":"Clinical Audit - Individual feedback","frequency":"WHEN_NEEDED"},
  {"id":"qos-audit-reporting","category":"Quality of Service","title":"Clinical Audit - Reporting","frequency":"2_MONTHLY"},
  {"id":"qos-guidelines","category":"Quality of Service","title":"In house guidelines","frequency":"WHEN_NEEDED"},
  {"id":"qos-cme","category":"Quality of Service","title":"CME for doctors","frequency":"MONTHLY", "subtasks": ["Get speaker", "CPD accreditation", "Prepare materials", "Send invites"]},
  {"id":"qos-damage-control","category":"Quality of Service","title":"Damage control","frequency":"WHEN_NEEDED"},
  {"id":"qos-docs-meeting","category":"Quality of Service","title":"Documentation of meeting & ops drive","frequency":"DAILY"},
  {"id":"mkt-social-fb-ig","category":"Marketing","title":"Social media (FB, IG)","frequency":"DAILY"},
  {"id":"mkt-social-tiktok-yt","category":"Marketing","title":"Tiktok, Youtube","frequency":"TWICE_WEEKLY"},
  {"id":"mkt-website","category":"Marketing","title":"Website Update/Review","frequency":"WEEKLY_FRIDAY"},
  {"id":"mkt-google-review","category":"Marketing","title":"Google Review Response","frequency":"DAILY"},
  {"id":"mkt-campaign","category":"Marketing","title":"Monthly Campaign Proposal","frequency":"MONTHLY_2ND_FRI"},
  {"id":"mkt-nole-blasted","category":"Marketing","title":"Nole - Response to blasted messages","frequency":"DAILY"},
  {"id":"mkt-nole-enquiry","category":"Marketing","title":"Nole - Response to enquiry","frequency":"DAILY"},
  {"id":"mkt-offline-panel","category":"Marketing","title":"Offline Panel Proposals","frequency":"DAILY"},
  {"id":"locum-directory","category":"Locum doctors","title":"Locum’s directory update","frequency":"MONTHLY_3RD_4TH_FRI"},
  {"id":"locum-interview","category":"Locum doctors","title":"Locum interview & feedback","frequency":"WHEN_NEEDED"},
  {"id":"locum-schedule","category":"Locum doctors","title":"Doctors’ schedule/Locum slots","frequency":"MONTHLY"},
  {"id":"locum-qr-scan","category":"Locum doctors","title":"Locum QR scan review","frequency":"DAILY"},
  {"id":"teamara-membership","category":"TeamARA","title":"New membership data update","frequency":"DAILY"},
  {"id":"teamara-digital-cards","category":"TeamARA","title":"Sending out digital cards","frequency":"DAILY"},
  {"id":"teamara-collab","category":"TeamARA","title":"Collaboration arrangements","frequency":"UPON_SUGGESTION"},
  {"id":"collab-teamara","category":"Collaborations","title":"TeamARA Collab","frequency":"UPON_SUGGESTION"},
  {"id":"collab-health-event","category":"Collaborations","title":"Health event (eg karnival)","frequency":"UPON_SUGGESTION"}
];

async function initializeGoogleSheets() {
  if (doc) return;
  try {
    const serviceAccountAuth = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const tempDoc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await tempDoc.loadInfo();
    doc = tempDoc;
    connectionError = null;
    
    // Ensure basic sheets exist
    await doc.sheetsByTitle["Users"] || await doc.addSheet({ title: "Users", headerValues: ["Email", "FullName", "Role", "Password", "LastLogin", "Status", "Location", "ProfilePic"] });
    await doc.sheetsByTitle["Tasks"] || await doc.addSheet({ title: "Tasks", headerValues: ["id", "category", "title", "description", "frequency", "status", "subtasks"] });
    await doc.sheetsByTitle["Tracker"] || await doc.addSheet({ title: "Tracker", headerValues: ["Date"] });
    await doc.sheetsByTitle["Categories"] || await doc.addSheet({ title: "Categories", headerValues: ["name", "color"] });
    await doc.sheetsByTitle["History"] || await doc.addSheet({ title: "History", headerValues: ["taskId", "title", "dateCompleted", "remarks"] });
    await doc.sheetsByTitle["Notes"] || await doc.addSheet({ title: "Notes", headerValues: ["id", "title", "content", "updatedAt", "duedate"] });

    // Seed data if empty
    const usersSheet = doc.sheetsByTitle["Users"];
    const userRows = await usersSheet.getRows();
    if (userRows.length === 0) {
      await usersSheet.addRow({
        Email: "operation@hsohealthcare.com",
        FullName: "Super Admin",
        Role: "Superadmin",
        Password: "operation123",
        LastLogin: new Date().toISOString(),
        Status: "Active",
        Location: "Main Office",
        ProfilePic: ""
      });
    }
  } catch (error: any) {
    console.error("❌ Google Sheets Error:", error.message);
    connectionError = error.message;
    doc = null;
  }
}

// API Routes
apiRouter.get("/ping", (req, res) => res.json({ pong: "ok", time: new Date().toISOString() }));
apiRouter.get("/status", (req, res) => res.json({ connected: !!doc, error: connectionError }));

apiRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["Users"];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get("Email").toLowerCase() === email.toLowerCase());
    if (row) {
      const stored = row.get("Password");
      let isMatch = (stored === password);
      if (!isMatch) {
         try { isMatch = await bcrypt.compare(password, stored); } catch(e) {}
      }
      if (isMatch) {
        row.set("LastLogin", new Date().toISOString());
        await row.save();
        return res.json({
          email: row.get("Email"),
          fullName: row.get("FullName"),
          role: row.get("Role"),
          status: row.get("Status") || "Active",
          location: row.get("Location") || "N/A"
        });
      }
    }
  } catch (e) {}
  res.status(401).json({ error: "Invalid email or password" });
});

apiRouter.get("/tasks", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["Tasks"];
    const rows = await sheet.getRows();
    const data = rows.map(r => ({
      id: r.get("id"),
      title: r.get("title"),
      category: r.get("category"),
      description: r.get("description"),
      completed: r.get("status") === "Completed",
      frequency: r.get("frequency"),
      subtasks: r.get("subtasks") ? JSON.parse(r.get("subtasks")) : [],
      createdAt: r.get("createdAt") || new Date().toISOString(),
    }));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch tasks" }); }
});

apiRouter.post("/tasks", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const newTask = { ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() };
    const sheet = doc.sheetsByTitle["Tasks"];
    await sheet.addRow({
      id: newTask.id,
      category: newTask.category,
      title: newTask.title,
      description: newTask.description || "",
      frequency: newTask.frequency || "N/A",
      status: newTask.completed ? "Completed" : "Pending",
      subtasks: JSON.stringify(newTask.subtasks || [])
    });
    res.json(newTask);
  } catch (e) { res.status(500).json({ error: "Failed to save task" }); }
});

apiRouter.patch("/tasks/:id", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["Tasks"];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get("id") === req.params.id);
    if (row) {
      const updates = req.body;
      if (updates.completed !== undefined) row.set("status", updates.completed ? "Completed" : "Pending");
      if (updates.title !== undefined) row.set("title", updates.title);
      if (updates.category !== undefined) row.set("category", updates.category);
      if (updates.subtasks !== undefined) row.set("subtasks", JSON.stringify(updates.subtasks));
      await row.save();
      return res.json({ success: true });
    }
    res.status(404).json({ error: "Task not found" });
  } catch (e) { res.status(500).json({ error: "Failed to update task" }); }
});

apiRouter.get("/history", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["History"];
    const rows = await sheet.getRows();
    res.json(rows.map(r => ({
      taskId: r.get("taskId"),
      title: r.get("title"),
      dateCompleted: r.get("dateCompleted"),
      remarks: r.get("remarks")
    })));
  } catch (e) { res.status(500).json({ error: "Failed to fetch history" }); }
});

apiRouter.post("/history", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const entry = { ...req.body, dateCompleted: new Date().toISOString() };
    const sheet = doc.sheetsByTitle["History"];
    await sheet.addRow(entry);
    res.json(entry);
  } catch (e) { res.status(500).json({ error: "Failed to save history" }); }
});

apiRouter.get("/notes", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["Notes"];
    const rows = await sheet.getRows();
    res.json(rows.map(r => ({
      id: r.get("id"),
      title: r.get("title"),
      content: r.get("content"),
      updatedAt: r.get("updatedAt"),
      duedate: r.get("duedate")
    })));
  } catch (e) { res.status(500).json({ error: "Failed to fetch notes" }); }
});

apiRouter.post("/notes", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const newNote = { ...req.body, id: Date.now().toString(), updatedAt: new Date().toISOString() };
    const sheet = doc.sheetsByTitle["Notes"];
    await sheet.addRow(newNote);
    res.json(newNote);
  } catch (e) { res.status(500).json({ error: "Failed to save note" }); }
});

apiRouter.get("/categories", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["Categories"];
    const rows = await sheet.getRows();
    res.json(rows.map(r => ({ name: r.get("name"), color: r.get("color") })));
  } catch (e) { res.status(500).json({ error: "Failed to fetch categories" }); }
});

apiRouter.get("/users", async (req, res) => {
  if (!doc) return res.status(503).json({ error: "Database not connected" });
  try {
    const sheet = doc.sheetsByTitle["Users"];
    const rows = await sheet.getRows();
    res.json(rows.map(r => ({
      email: r.get("Email"),
      fullName: r.get("FullName"),
      role: r.get("Role"),
      lastLogin: r.get("LastLogin"),
      status: r.get("Status") || "Active"
    })));
  } catch (e) { res.status(500).json({ error: "Failed to fetch users" }); }
});

// Final mount
app.use("/api", apiRouter);

// Vercel Export
let initializing = false;
export default async (req: any, res: any) => {
  if (!doc && !initializing) {
    initializing = true;
    await initializeGoogleSheets();
    initializing = false;
  }
  return app(req, res);
};

// DEV SERVER FALLBACK (Mandatory for AI Studio Preview)
async function startDevServer() {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL === undefined) {
    const PORT = 3000;
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("✅ Vite middleware attached for preview");
    } catch (e) {
      console.error("Vite failed, falling back to static", e);
    }
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Preview Server running on http://localhost:${PORT}`);
    });
  }
}

if (process.env.VERCEL === undefined) {
  startDevServer();
}
