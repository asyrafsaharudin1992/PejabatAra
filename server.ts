import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import bcrypt from "bcryptjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Core Middleware
  app.use(cors());
  app.use(express.json());

  // 2. Comprehensive Logging & API Path Patching
  app.use((req, res, next) => {
    const incomingUrl = req.url || '';
    console.log(`[Express Incoming] ${req.method} ${incomingUrl} (Original: ${req.originalUrl || 'N/A'})`);
    
    // API Path Patching: If a request hits this server but is missing the /api prefix,
    // and it matches a known API endpoint, we restore the prefix for the router.
    const apiEndpoints = ['ping', 'status', 'login', 'tasks', 'notes', 'history', 'categories', 'users', 'sync', 'change-password', 'profile', 'reconnect'];
    const pathPart = incomingUrl.split('?')[0];
    const pathSegments = pathPart.split('/').filter(Boolean);
    const firstSegment = pathSegments[0];

    // If it DOES NOT start with /api, check if it should
    if (!incomingUrl.startsWith('/api')) {
      if (apiEndpoints.includes(firstSegment) || (!pathPart.includes('.') && firstSegment)) {
        const oldUrl = req.url;
        req.url = '/api' + (incomingUrl.startsWith('/') ? '' : '/') + incomingUrl;
        console.log(`[Express Patch] ${oldUrl} -> ${req.url}`);
      }
    }
    next();
  });

  // 3. API Router Definition
  const apiRouter = express.Router();

  // Mount API Router early
  app.use("/api", apiRouter);

  apiRouter.get("/ping", (req, res) => {
    res.json({ pong: "router", time: new Date().toISOString() });
  });

  apiRouter.get("/status", (req, res) => {
    res.json({ 
      connected: !!doc, 
      error: connectionError,
      spreadsheetId: SPREADSHEET_ID,
      serviceAccount: SERVICE_ACCOUNT_EMAIL
    });
  });

  apiRouter.post("/reconnect", async (req, res) => {
    await initializeGoogleSheets();
    res.json({ 
      connected: !!doc, 
      error: connectionError 
    });
  });

  // Auth Routes
  apiRouter.post("/login", async (req, res) => {
    const { email, password } = req.body;
    console.log(`[Login Attempt] ${email}`);
    
    if (!doc) {
      console.error("[Login Error] Database not connected");
      return res.status(503).json({ error: "Database connecting... please try again in a few seconds", code: "DATABASE_PENDING" });
    }

    try {
      const sheet = doc.sheetsByTitle["Users"];
      const rows = await sheet.getRows();
      const row = rows.find(r => r.get("Email").toLowerCase() === email.toLowerCase());
      
      if (row) {
        const storedPassword = row.get("Password");
        let isMatch = false;

        // 1. Check Plain Text
        if (storedPassword === password) {
          isMatch = true;
        } else {
          // 2. Check Hashed
          try {
            isMatch = await bcrypt.compare(password, storedPassword);
          } catch (e) {
            isMatch = false;
          }
        }

        if (isMatch) {
          row.set("LastLogin", new Date().toISOString());
          await row.save();
          return res.json({
            email: row.get("Email"),
            fullName: row.get("FullName"),
            role: row.get("Role"),
            status: row.get("Status") || "Active",
            location: row.get("Location") || "N/A",
            profilePic: row.get("ProfilePic") || ""
          });
        }
      }
    } catch (e) {
      console.error("[Login Error] Exception:", e);
      return res.status(500).json({ error: "Internal server error during login" });
    }

    res.status(401).json({ error: "Invalid email or password" });
  });

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

  // Google Sheets Setup
  const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || "1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE";
  const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "araofficesynbot@gen-lang-client-0504198581.iam.gserviceaccount.com";
  // For the private key, we handle both newlines and escaped newlines (\n) which are common in env vars
  const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, '\n') || `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCl+QjMqgu7Vq/Y
SqF1C8AlrCHgqqcFE8I/ejzxwgwDwwreF2+sv47DKQSTPh4DJAg53IxNAp0o1gtv
XlDzfLY0WMWmeQRlGVs5iir2CbNxdmvcjQpOTXf5nNBf7WLrC+0eNVrVC0JX8Ufv
oW80F8pJ4d3XOmZYq60qj3MkdbJENi1cMw+XbNzP6Xk62Gi8hrui3d5EZBGSNJNf
ysZrojCevNyw3JLl4aYnvfDGeu9r5yWCw14zyPWAw7k8Z5gc+9ZEU7QMRqIczJHO
zcVVp5aKaJ8OvGCoDrrKdeKsLXr0O7TFGATPwvQTuhfi+vp2q7UfpgVnx8Dnl4wS
xfUAWSZLAgMBAAECggEAFSHq0WhbWwyUEjWabjVDT2il3Z3M61QTORLe3Kdo8Tet
1A5m3Td8vXOlDfxsRNkbJQbkZE/PY+oxBYqcQwxfhLXC4Mnq2daLK33gr3gXvXwn
Cqt4ovSxMHqbe4NVw3i+xchkWtj2pwzlLGlBKABZdOPJ48QfUO32/ALM1dkYjB+n
TwuG+BekNpoTEMi6bbkIKlBrTs7DL1eBBcVMUzZ05pgUASXwF6n+rn8Gb9T7z2Vt
tWsnXn4Pu/oth13Hmq0JYGjx/5SkpghH7nktJreyWDFf3yEl4wJL2tzVjmCbe0jo
hAepmobWossA05tQc5ptG4lWpA7gBMNDFnWGhflquQKBgQDT2HerwgrQwWF+/qsH
4NOdChUhenfncxOiCAb2oGxUIz0arIhzidwjY8jyjf69jJHEV97yCzt9TFsq5pHS
2cIEVtF/y/WB7u8TOKy6kH/LSNXDAZV2FEbt6Ki1tijaHN7pwWUQ/NGZjdzExB5+
zTrtHGLwTHFbPjfkzrEg/SIFIwKBgQDIkOniJnLVnA80c92jLBByuRoMURtdPqkp
QxPVqyCBWWZt7zkp6O1PVSN1UgsIB7MZsL+dRVTgGPvz2bLjumTIwaSstgr0v3BP
Nd7o70Blg1PASW94rVSTF+22jKGOHXeU8d5/PQg8LW2qSo8b7lGDVtU/H+xqHwTB
pJvoaf3QuQKBgFzrlAIoiKnsSKF1fvtjqC43n/EhULqahUALGVLQJvP4yPKMPwW+
sGpteFS758Koh7+Bc27jcmKRPWPh4pCDp1BT7GyLv9IQRZk+wLTMcOFvvyNb7Hzw
g/QSmv2pOt4Az93kUDpVSnJ6AR3lkCK6TmB2lQcl4IrPDaE08AiyP1vVAoGAPog3
84OLUCA8+VyaoLIvWqVtgqOTBYpw0WWRfI/DLbEC54mrZ+6wdoiT6pMuz00fQQZD
Z7RjFw+TFl8skCXgIFuHjTWgytgZGwkvu65EhKHibdQ3hgd8k/Pk8IJ+KEH1s6GJ
fmA3/hMn2u0uG0Y9cdaT2/+HBTswj3NUDK1nLjkCgYBTssisGSe6AXwJws51YT+s
Z72hqpv3nCm5C5rJng5T9V2txzhvTOGXCKI1L5kdXtEUWZefDQPqNd2c1dO6EsHg
ZOM7sQ5Gv5ral7woQ4R74n5OYOJmGwLJpSlzQvhryG8Taf6eDWQST9ohYpkBJ9hH
N8gKncAa0H6OPxGehbOw6A==
-----END PRIVATE KEY-----`;

  let doc: GoogleSpreadsheet | null = null;
  let connectionError: string | null = null;

  const isTaskDueOn = (task: any, date: Date) => {
    const freq = (task.frequency || "DAILY").toUpperCase();
    const dayName = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][date.getDay()];
    const dayOfMonth = date.getDate();
    
    if (freq === "DAILY") return true;
    if (freq === "WHEN_NEEDED" || freq === "UPON_SUGGESTION") return true; // Show them always or handle specially
    if (freq.startsWith("WEEKLY_")) {
      const targetDay = freq.split("_")[1];
      return dayName === targetDay;
    }
    if (freq === "TWICE_WEEKLY") return [1, 4].includes(date.getDay()); // Mon, Thu example
    if (freq === "MONTHLY") return dayOfMonth === 1;
    if (freq === "2_MONTHLY") return dayOfMonth === 1 && date.getMonth() % 2 === 0;
    
    // Complex ones like MONTHLY_2ND_FRI
    if (freq === "MONTHLY_2ND_FRI") {
      if (dayName !== "FRIDAY") return false;
      const weekNum = Math.ceil(dayOfMonth / 7);
      return weekNum === 2;
    }
    if (freq === "MONTHLY_3RD_4TH_FRI") {
      if (dayName !== "FRIDAY") return false;
      const weekNum = Math.ceil(dayOfMonth / 7);
      return weekNum === 3 || weekNum === 4;
    }

    return true; // Default to true if unknown to avoid missing tasks
  };

  async function initializeGoogleSheets() {
    try {
      console.log(`📡 Attempting to connect to Google Sheet ID: ${SPREADSHEET_ID}`);
      const serviceAccountAuth = new JWT({
        email: SERVICE_ACCOUNT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const tempDoc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
      await tempDoc.loadInfo();
      doc = tempDoc;
      connectionError = null;
      console.log(`✅ Connected to Google Sheet: ${doc.title}`);

      // Initial Sync/Setup
      const tasksSheet = doc.sheetsByTitle["Tasks"] || (await doc.addSheet({ 
        title: "Tasks", 
        headerValues: ["id", "category", "title", "description", "frequency", "status", "subtasks"] 
      }));
      
      const trackerSheet = doc.sheetsByTitle["Tracker"] || (await doc.addSheet({
        title: "Tracker",
        headerValues: ["Date"]
      }));

      const categoriesSheet = doc.sheetsByTitle["Categories"] || (await doc.addSheet({
        title: "Categories",
        headerValues: ["name", "color"]
      }));

      const usersSheet = doc.sheetsByTitle["Users"] || (await doc.addSheet({
        title: "Users",
        headerValues: ["Email", "FullName", "Role", "Password", "LastLogin", "Status", "Location", "ProfilePic"]
      }));

      const catRows = await categoriesSheet.getRows();
      if (catRows.length === 0) {
        await categoriesSheet.addRows([
          { name: "Quality of Service", color: "bg-[#E1F5FE] text-[#0288D1]" },
          { name: "Marketing", color: "bg-pink-100 text-pink-600" },
          { name: "Locum Doctors", color: "bg-[#E8F5E9] text-[#388E3C]" },
          { name: "TeamARA", color: "bg-[#FFF3E0] text-[#F57C00]" },
          { name: "Collaborations", color: "bg-[#F3E5F5] text-[#7B1FA2]" },
          { name: "Corporate", color: "bg-emerald-100 text-emerald-600" }
        ]);
      }

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
        console.log("👤 Initial Superadmin created (Password: operation123)");
      }
      
      const rows = await tasksSheet.getRows();
      // Force overwrite if row count doesn't match or first ID is different
      if (rows.length !== initialTasks.length || (rows.length > 0 && rows[0].get("id") !== initialTasks[0].id)) {
        console.log("🚀 FORCE OVERWRITING Tasks sheet with new master list...");
        await tasksSheet.clearRows();
        await tasksSheet.addRows(initialTasks.map(t => ({
          id: t.id,
          category: t.category,
          title: t.title,
          description: t.description || "",
          frequency: t.frequency || "N/A",
          status: "Pending",
          subtasks: JSON.stringify(t.subtasks || [])
        })));

        // Update Tracker headers
        const trackerHeaders = ["Date", ...initialTasks.map(t => t.title)];
        await trackerSheet.setHeaderRow(trackerHeaders);
        console.log("✨ Master list force sync complete.");
      }
    } catch (error: any) {
      connectionError = error.message;
      if (error.message.includes("404")) {
        connectionError = `Sheet Not Found (404). Ensure the Sheet ID is correct and the sheet exists.`;
      } else if (error.message.includes("403") || error.message.includes("permission")) {
        connectionError = `Permission Denied (403). Please share your Google Sheet with: ${SERVICE_ACCOUNT_EMAIL}`;
      } else if (error.message.includes("invalid_grant")) {
        connectionError = `Authentication Failed (invalid_grant). The Service Account key is invalid.`;
      }
      
      console.error("❌ GOOGLE SHEETS CONNECTION ERROR:");
      console.error(`- Message: ${error.message}`);
      doc = null;
    }
  }

  // (isTaskDueOn was here)

  // User Management
  apiRouter.post("/change-password", async (req, res) => {
    const { email, currentPassword, newPassword } = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Users"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("Email").toLowerCase() === email.toLowerCase());
        
        if (row) {
          const storedPassword = row.get("Password");
          let isMatch = (storedPassword === currentPassword);
          
          if (!isMatch) {
            try {
              isMatch = await bcrypt.compare(currentPassword, storedPassword);
            } catch (e) {
              isMatch = false;
            }
          }

          if (isMatch) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            row.set("Password", hashedPassword);
            await row.save();
            return res.json({ success: true });
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    res.status(400).json({ error: "Incorrect current password" });
  });

  apiRouter.patch("/profile", async (req, res) => {
    const { email, fullName, profilePic, location } = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Users"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("Email").toLowerCase() === email.toLowerCase());
        if (row) {
          if (fullName) row.set("FullName", fullName);
          if (profilePic !== undefined) row.set("ProfilePic", profilePic);
          if (location) row.set("Location", location);
          await row.save();
          return res.json({ success: true });
        }
      } catch (e) {
        console.error(e);
      }
    }
    res.status(404).json({ error: "User not found" });
  });

  // User Management Routes (Superadmin only)
  apiRouter.get("/users", async (req, res) => {
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Users"];
        const rows = await sheet.getRows();
        const data = rows.map(row => ({
          email: row.get("Email"),
          fullName: row.get("FullName"),
          role: row.get("Role"),
          lastLogin: row.get("LastLogin"),
          status: row.get("Status") || "Active",
          location: row.get("Location") || "Main Office"
        }));
        return res.json(data);
      } catch (e) {
        console.error(e);
      }
    }
    res.json([]);
  });

  apiRouter.post("/users/reset-password", async (req, res) => {
    const { email } = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Users"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("Email").toLowerCase() === email.toLowerCase());
        if (row) {
          row.set("Password", "Ara12345"); // Plain text as requested
          await row.save();
          console.log(`🔐 Password reset for ${email} to Ara12345`);
          return res.json({ success: true, tempPassword: "Ara12345" });
        }
        return res.status(404).json({ error: "User not found" });
      } catch (e: any) {
        console.error("Reset password error:", e.message);
        return res.status(500).json({ error: e.message });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.post("/users", async (req, res) => {
    const { email, fullName, role, password, location } = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Users"];
        const hashedPassword = await bcrypt.hash(password || "staff123", 10);
        await sheet.addRow({
          Email: email,
          FullName: fullName,
          Role: role,
          Password: hashedPassword,
          LastLogin: "",
          Status: "Active",
          Location: location || "Main Office",
          ProfilePic: ""
        });
        return res.json({ success: true });
      } catch (e: any) {
        console.error("Add user error:", e.message);
        return res.status(500).json({ error: e.message });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.delete("/users/:email", async (req, res) => {
    const { email } = req.params;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Users"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("Email").toLowerCase() === email.toLowerCase());
        if (row) {
          await row.delete();
          return res.json({ success: true });
        }
      } catch (e) {
        console.error(e);
      }
    }
    res.status(404).json({ error: "User not found" });
  });

  apiRouter.post("/sync", async (req, res) => {
    await initializeGoogleSheets();
    res.json({ connected: !!doc, error: connectionError });
  });

  apiRouter.get("/tasks", async (req, res) => {
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Tasks"] || (await doc.addSheet({ 
          title: "Tasks", 
          headerValues: ["id", "category", "title", "description", "frequency", "status", "subtasks"] 
        }));
        const rows = await sheet.getRows();
        const data = rows.map(row => ({
          id: row.get("id"),
          title: row.get("title"),
          category: row.get("category"),
          description: row.get("description"),
          completed: row.get("status") === "Completed",
          frequency: row.get("frequency"),
          subtasks: row.get("subtasks") ? JSON.parse(row.get("subtasks")) : [],
          createdAt: row.get("createdAt") || new Date().toISOString(),
        }));
        return res.json(data);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to fetch tasks" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.post("/tasks", async (req, res) => {
    const newTask = { ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() };
    if (doc) {
      try {
        const tasksSheet = doc.sheetsByTitle["Tasks"] || (await doc.addSheet({ 
          title: "Tasks", 
          headerValues: ["id", "category", "title", "description", "frequency", "status", "subtasks"] 
        }));
        await tasksSheet.addRow({
          id: newTask.id,
          category: newTask.category,
          title: newTask.title,
          description: newTask.description || "",
          frequency: newTask.frequency || "N/A",
          status: newTask.completed ? "Completed" : "Pending",
          subtasks: JSON.stringify(newTask.subtasks || [])
        });

        // Update Tracker headers dynamically
        const trackerSheet = doc.sheetsByTitle["Tracker"];
        await trackerSheet.loadHeaderRow();
        let headers = trackerSheet.headerValues;
        if (!headers.includes(newTask.title)) {
          headers.push(newTask.title);
          await trackerSheet.setHeaderRow(headers);
        }
        return res.json(newTask);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to save task" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.patch("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Tasks"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("id") === id);
        if (row) {
          if (updates.completed !== undefined) row.set("status", updates.completed ? "Completed" : "Pending");
          if (updates.title !== undefined) row.set("title", updates.title);
          if (updates.category !== undefined) row.set("category", updates.category);
          if (updates.description !== undefined) row.set("description", updates.description);
          if (updates.frequency !== undefined) row.set("frequency", updates.frequency);
          if (updates.subtasks !== undefined) row.set("subtasks", JSON.stringify(updates.subtasks));
          await row.save();
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "Task not found" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to update task" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.delete("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Tasks"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("id") === id);
        if (row) {
          await row.delete();
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "Task not found" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to delete task" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.get("/history", async (req, res) => {
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["History"] || (await doc.addSheet({ 
          title: "History", 
          headerValues: ["taskId", "title", "dateCompleted", "remarks"] 
        }));
        const rows = await sheet.getRows();
        const data = rows.map(row => ({
          taskId: row.get("taskId"),
          title: row.get("title"),
          dateCompleted: row.get("dateCompleted"),
          remarks: row.get("remarks"),
        }));
        return res.json(data);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to fetch history" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.get("/categories", async (req, res) => {
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Categories"] || (await doc.addSheet({ 
          title: "Categories", 
          headerValues: ["name", "color"] 
        }));
        const rows = await sheet.getRows();
        const data = rows.map(row => ({
          name: row.get("name"),
          color: row.get("color"),
        }));
        return res.json(data);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to fetch categories" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.post("/categories", async (req, res) => {
    const newCategory = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Categories"] || (await doc.addSheet({ 
          title: "Categories", 
          headerValues: ["name", "color"] 
        }));
        await sheet.addRow(newCategory);
        return res.json(newCategory);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to save category" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.post("/history", async (req, res) => {
    const { taskId, title, remarks } = req.body;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const entry = {
      taskId,
      title,
      dateCompleted: now.toISOString(),
      remarks: remarks || ""
    };

    if (doc) {
      try {
        const historySheet = doc.sheetsByTitle["History"] || (await doc.addSheet({ 
          title: "History", 
          headerValues: ["taskId", "title", "dateCompleted", "remarks"] 
        }));
        await historySheet.addRow(entry);

        // Update Tracker
        const trackerSheet = doc.sheetsByTitle["Tracker"];
        await trackerSheet.loadHeaderRow();
        let headers = trackerSheet.headerValues;
        
        // Ensure title is in headers
        if (!headers.includes(title)) {
          headers.push(title);
          await trackerSheet.setHeaderRow(headers);
        }

        const trackerRows = await trackerSheet.getRows();
        let row = trackerRows.find(r => r.get("Date") === dateStr);
        
        if (!row) {
          // Create new row for today
          const rowData: any = { Date: dateStr };
          // Initialize other cells
          headers.forEach(h => {
            if (h !== "Date") {
              rowData[h] = "";
            }
          });
          rowData[title] = "DONE";
          await trackerSheet.addRow(rowData);
        } else {
          row.set(title, "DONE");
          await row.save();
        }
        return res.json(entry);
      } catch (e) {
        console.error("Tracker update error:", e);
        return res.status(500).json({ error: "Failed to update tracker" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.patch("/history", async (req, res) => {
    const { taskId, dateCompleted, remarks } = req.body;
    // Only allow editing if it's today
    const entryDate = new Date(dateCompleted);
    const today = new Date();
    if (entryDate.toDateString() !== today.toDateString()) {
      return res.status(403).json({ error: "Cannot edit past history" });
    }

    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["History"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("taskId") === taskId && r.get("dateCompleted") === dateCompleted);
        if (row) {
          row.set("remarks", remarks);
          await row.save();
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "History entry not found" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to update history" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.delete("/history/:taskId", async (req, res) => {
    const { taskId } = req.params;
    const { dateCompleted } = req.query;
    
    if (!dateCompleted) return res.status(400).json({ error: "dateCompleted is required" });

    const entryDate = new Date(dateCompleted as string);
    const today = new Date();
    if (entryDate.toDateString() !== today.toDateString()) {
      return res.status(403).json({ error: "Cannot untick past history" });
    }

    if (doc) {
      try {
        const tasksSheet = doc.sheetsByTitle["Tasks"];
        const tRows = await tasksSheet.getRows();
        const task = tRows.find(r => r.get("id") === taskId);
        const title = task ? task.get("title") : null;

        const sheet = doc.sheetsByTitle["History"];
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("taskId") === taskId && r.get("dateCompleted") === dateCompleted);
        if (row) {
          await row.delete();
          
          if (title) {
            const trackerSheet = doc.sheetsByTitle["Tracker"];
            const trackerRows = await trackerSheet.getRows();
            const dateStr = entryDate.toISOString().split("T")[0];
            const trackerRow = trackerRows.find(r => r.get("Date") === dateStr);
            if (trackerRow) {
              trackerRow.set(title, "");
              await trackerRow.save();
            }
          }
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "History entry not found" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to delete history" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.get("/notes", async (req, res) => {
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Notes"] || (await doc.addSheet({ 
          title: "Notes", 
          headerValues: ["id", "title", "content", "updatedAt", "duedate"] 
        }));
        
        // Ensure headers are correct
        await sheet.loadHeaderRow();
        const currentHeaders = sheet.headerValues;
        const expectedHeaders = ["id", "title", "content", "updatedAt", "duedate"];
        if (currentHeaders.join(',') !== expectedHeaders.join(',')) {
          await sheet.setHeaderRow(expectedHeaders);
        }

        const rows = await sheet.getRows();
        const data = rows.map(row => ({
          id: row.get("id"),
          title: row.get("title"),
          content: row.get("content"),
          updatedAt: row.get("updatedAt"),
          duedate: row.get("duedate"),
        }));
        return res.json(data);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to fetch notes from Google Sheets" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.post("/notes", async (req, res) => {
    const { title, content, duedate } = req.body;
    const newNote = { 
      id: Date.now().toString(), 
      title: title || "",
      content: content || "",
      updatedAt: new Date().toISOString(),
      duedate: duedate || ""
    };
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Notes"] || (await doc.addSheet({ 
          title: "Notes", 
          headerValues: ["id", "title", "content", "updatedAt", "duedate"] 
        }));
        await sheet.addRow(newNote);
        return res.json(newNote);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to save note to Google Sheets" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.patch("/notes/:id", async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Notes"];
        if (!sheet) return res.status(404).json({ error: "Notes sheet not found" });
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("id") === id);
        if (row) {
          if (updates.title !== undefined) row.set("title", updates.title);
          if (updates.content !== undefined) row.set("content", updates.content);
          if (updates.duedate !== undefined) row.set("duedate", updates.duedate);
          row.set("updatedAt", new Date().toISOString());
          await row.save();
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "Note not found" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to update note" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  apiRouter.delete("/notes/:id", async (req, res) => {
    const { id } = req.params;
    if (doc) {
      try {
        const sheet = doc.sheetsByTitle["Notes"];
        if (!sheet) return res.status(404).json({ error: "Notes sheet not found" });
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get("id") === id);
        if (row) {
          await row.delete();
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "Note not found" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to delete note" });
      }
    }
    res.status(503).json({ error: "Database not connected" });
  });

  // Final catch-all for apiRouter to prevent falling through to main app
  apiRouter.all("*", (req, res) => {
    console.log(`[404 apiRouter] ${req.method} ${req.url} (Matched Prefix /api)`);
    res.status(404).json({ error: `API endpoint ${req.method} ${req.url} not found (apiRouter)` });
  });

  // Final Catch-all for undefined /api routes on the main app
  app.all("/api/*", (req, res) => {
    console.log(`[404 Main App] ${req.method} ${req.url} (Bypassed Router)`);
    res.status(404).json({ 
      error: `Main app /api catch-all: ${req.method} ${req.url} not found`,
      path: req.path,
      originalUrl: req.originalUrl
    });
  });

  // Global Error Handler (Must return JSON for all API calls)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[Global Error] ${req.method} ${req.url}:`, err);
    if (req.url.startsWith('/api') || req.headers.accept?.includes('application/json')) {
      return res.status(err.status || 500).json({
        error: err.message || "Internal Server Error",
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
    next(err);
  });

  // Start initialization in background
  initializeGoogleSheets().catch(err => {
    console.error("❌ Background initialization failed:", err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Ensure API routes come BEFORE vite.middlewares
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    
    app.get("*", (req, res) => {
      // Final fallback for SPA
      const isApiRequest = req.path.startsWith("/api/") || req.url.startsWith("/api/");
      const prefersJson = req.headers.accept?.includes("application/json");

      if (isApiRequest || prefersJson) {
        console.log(`[SPA Fallback Blocked] API request for ${req.url} was going to get index.html`);
        return res.status(404).json({ 
          error: `API route ${req.method} ${req.url} not found (SPA Fallback Blocked)`,
          isApiRequest,
          prefersJson
        });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.VERCEL === undefined) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();
export default async (req: any, res: any) => {
  const app = await appPromise;
  
  // Vercel Path Patching (Critical)
  const incomingUrl = req.url || '';
  console.log(`[Vercel Handler] Initial: ${req.method} ${incomingUrl}`);

  // If Vercel rewrites or environment oddities strip /api, we restore it for Express
  if (!incomingUrl.startsWith('/api')) {
    // Determine if this is an API call attempting to reach server.ts
    // In vercel.json, /api/(.*) points here.
    // If it hits here and doesn't start with /api, we must restore it.
    const pathPart = incomingUrl.split('?')[0];
    const isStatic = pathPart.includes('.');
    
    if (!isStatic) {
      const oldUrl = req.url;
      req.url = '/api' + (incomingUrl.startsWith('/') ? '' : '/') + incomingUrl;
      console.log(`[Vercel Handler] Patched: ${oldUrl} -> ${req.url}`);
    }
  }

  app(req, res);
};
