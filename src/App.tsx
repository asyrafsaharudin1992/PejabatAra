/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  CheckSquare, 
  StickyNote, 
  User, 
  Plus, 
  Search, 
  Bell, 
  Cloud, 
  CloudOff,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Edit2,
  MoreVertical,
  Clock,
  AlertCircle,
  Trash2,
  Loader2,
  Calendar,
  FolderOpen,
  ExternalLink,
  PlusCircle,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isSameMonth } from "date-fns";
import { cn } from "./lib/utils";

type Category = "Quality of Service" | "Marketing" | "Locum Doctors" | "TeamARA" | "Collaborations";

interface Subtask {
  text: string;
  completed: boolean;
}

interface Task {
  id: string;
  title: string;
  category: Category;
  description?: string;
  frequency?: string;
  subtasks?: (string | Subtask)[];
  completed: boolean;
  deadline?: string;
  createdAt: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  duedate: string;
}

interface PortalLink {
  id: string;
  title: string;
  folder: string;
  url: string;
  createdAt: string;
}

interface HistoryEntry {
  taskId: string;
  title: string;
  dateCompleted: string;
  remarks: string;
}

interface CategoryData {
  name: string;
  color: string;
}

interface UserData {
  email: string;
  fullName: string;
  role: "Superadmin" | "Staff";
  lastLogin?: string;
  status?: string;
  location?: string;
  profilePic?: string;
}

const INITIAL_CATEGORIES: CategoryData[] = [
  { name: "Quality of Service", color: "bg-[#E1F5FE] text-[#0288D1]" },
  { name: "Marketing", color: "bg-pink-100 text-pink-600" },
  { name: "Locum Doctors", color: "bg-[#E8F5E9] text-[#388E3C]" },
  { name: "TeamARA", color: "bg-[#FFF3E0] text-[#F57C00]" },
  { name: "Collaborations", color: "bg-[#F3E5F5] text-[#7B1FA2]" },
  { name: "Corporate", color: "bg-emerald-100 text-emerald-600" }
];

const INITIAL_TASKS: Task[] = [
  {"id":"qos-followup","category":"Quality of Service","title":"Follow up – referred cases","frequency":"DAILY","description":"Excel follow up for referred cases only.","completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-plato","category":"Quality of Service","title":"Documenting in Plato","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-audit-feedback","category":"Quality of Service","title":"Clinical Audit - Individual feedback","frequency":"WHEN_NEEDED","completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-audit-reporting","category":"Quality of Service","title":"Clinical Audit - Reporting","frequency":"2_MONTHLY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-guidelines","category":"Quality of Service","title":"In house guidelines","frequency":"WHEN_NEEDED","completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-cme","category":"Quality of Service","title":"CME for doctors","frequency":"MONTHLY","subtasks": ["Get speaker", "CPD accreditation", "Prepare materials", "Send invites"],"completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-damage-control","category":"Quality of Service","title":"Damage control","frequency":"WHEN_NEEDED","completed":false,"createdAt":new Date().toISOString()},
  {"id":"qos-docs-meeting","category":"Quality of Service","title":"Documentation of meeting & ops drive","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-social-fb-ig","category":"Marketing","title":"Social media (FB, IG)","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-social-tiktok-yt","category":"Marketing","title":"Tiktok, Youtube","frequency":"TWICE_WEEKLY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-website","category":"Marketing","title":"Website Update/Review","frequency":"WEEKLY_FRIDAY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-google-review","category":"Marketing","title":"Google Review Response","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-campaign","category":"Marketing","title":"Monthly Campaign Proposal","frequency":"MONTHLY_2ND_FRI","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-nole-blasted","category":"Marketing","title":"Nole - Response to blasted messages","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-nole-enquiry","category":"Marketing","title":"Nole - Response to enquiry","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"mkt-offline-panel","category":"Marketing","title":"Offline Panel Proposals","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"locum-directory","category":"Locum Doctors","title":"Locum’s directory update","frequency":"MONTHLY_3RD_4TH_FRI","completed":false,"createdAt":new Date().toISOString()},
  {"id":"locum-interview","category":"Locum Doctors","title":"Locum interview & feedback","frequency":"WHEN_NEEDED","completed":false,"createdAt":new Date().toISOString()},
  {"id":"locum-schedule","category":"Locum Doctors","title":"Doctors’ schedule/Locum slots","frequency":"MONTHLY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"locum-qr-scan","category":"Locum Doctors","title":"Locum QR scan review","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"teamara-membership","category":"TeamARA","title":"New membership data update","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"teamara-digital-cards","category":"TeamARA","title":"Sending out digital cards","frequency":"DAILY","completed":false,"createdAt":new Date().toISOString()},
  {"id":"teamara-collab","category":"TeamARA","title":"Collaboration arrangements","frequency":"UPON_SUGGESTION","completed":false,"createdAt":new Date().toISOString()},
  {"id":"collab-teamara","category":"Collaborations","title":"TeamARA Collab","frequency":"UPON_SUGGESTION","completed":false,"createdAt":new Date().toISOString()},
  {"id":"collab-health-event","category":"Collaborations","title":"Health event (eg karnival)","frequency":"UPON_SUGGESTION","completed":false,"createdAt":new Date().toISOString()}
];

export default function App() {
  const [taskCategories, setTaskCategories] = useState<CategoryData[]>(INITIAL_CATEGORIES);
  const [activeTab, setActiveTab] = useState("Overview");
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; error: string | null }>({ connected: false, error: null });
  const [isLoading, setIsLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState<string>("Quality of Service");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteDueDate, setNewNoteDueDate] = useState("");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [portalLinks, setPortalLinks] = useState<PortalLink[]>([]);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isAddingPortal, setIsAddingPortal] = useState(false);
  const [newPortalTitle, setNewPortalTitle] = useState("");
  const [newPortalUrl, setNewPortalUrl] = useState("");
  const [newPortalFolder, setNewPortalFolder] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [selectedPortalFolder, setSelectedPortalFolder] = useState("All");
  const [editingPortalLink, setEditingPortalLink] = useState<PortalLink | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("bg-blue-100 text-blue-600");
  const [isSyncing, setIsSyncing] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: "delete" | "reset" | null;
    targetEmail: string;
    onConfirm?: () => void;
  }>({ isOpen: false, title: "", message: "", action: null, targetEmail: "" });
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const debounceTimer = React.useRef<NodeJS.Timeout | null>(null);

  const PRESET_COLORS = [
    "bg-blue-100 text-blue-600",
    "bg-purple-100 text-purple-600",
    "bg-green-100 text-green-600",
    "bg-orange-100 text-orange-600",
    "bg-pink-100 text-pink-600",
    "bg-gray-100 text-gray-600"
  ];

  useEffect(() => {
    // Clean potentially corrupted data
    localStorage.removeItem("notes");
    localStorage.removeItem("araoffice_notes");

    const savedUser = localStorage.getItem("araoffice_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed && typeof parsed === "object") {
          setUser(parsed);
        }
      } catch (e) {
        console.error("Error parsing saved user:", e);
        localStorage.removeItem("araoffice_user");
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (activeTab === "Calendar") {
      fetchData(true);
    }
  }, [activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoginLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem("araoffice_user", JSON.stringify(data));
      } else {
        setLoginError(data.error || "Login failed");
      }
    } catch (error) {
      setLoginError("Connection error. Please try again.");
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("araoffice_user");
    setActiveTab("Overview");
  };

  const safeFormat = (dateStr: string | undefined | null, formatStr: string, fallback = "N/A") => {
    if (!dateStr) return fallback;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return fallback;
      return format(date, formatStr);
    } catch (e) {
      console.error("Error formatting date:", dateStr, e);
      return fallback;
    }
  };

  const fetchData = async (silent = false) => {
    if (!user) return;
    if (user.role === "Superadmin" && !silent) setIsUsersLoading(true);
    
    const fetchJson = async (url: string) => {
      try {
        console.log(`[fetchData] Fetching ${url}...`);
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text();
          console.error(`[fetchData] HTTP error! status: ${res.status} for ${url}. Response:`, text.substring(0, 100));
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error(`[fetchData] Expected JSON from ${url} but got ${contentType}. Response:`, text.substring(0, 100));
          throw new Error(`Expected JSON from ${url} but got ${contentType}`);
        }
        const data = await res.json();
        console.log(`[fetchData] Successfully fetched ${url}. Data length:`, Array.isArray(data) ? data.length : 'Object');
        return data;
      } catch (e) {
        console.error(`[fetchData] Error in fetchJson for ${url}:`, e);
        throw e;
      }
    };

    try {
      const [status, tasksData, notesData, historyData, taskCategoriesData, portalData] = await Promise.all([
        fetchJson("/api/status"),
        fetchJson("/api/tasks"),
        fetchJson("/api/notes"),
        fetchJson("/api/history"),
        fetchJson("/api/categories"),
        fetchJson("/api/portal")
      ]);
      
      setConnectionStatus(status);
      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(notesData)) setNotes(notesData);
      if (Array.isArray(historyData)) setHistory(historyData);
      if (Array.isArray(taskCategoriesData)) setTaskCategories(taskCategoriesData);
      if (Array.isArray(portalData)) setPortalLinks(portalData);

      if (user.role === "Superadmin") {
        try {
          const usersData = await fetchJson("/api/users");
          if (Array.isArray(usersData)) setAllUsers(usersData);
        } catch (e) {
          console.error("Error fetching users:", e);
        } finally {
          if (!silent) setIsUsersLoading(false);
        }
      }
    } catch (error) {
      console.error("Fetch data error:", error);
      setConnectionStatus({ connected: false, error: "Connection lost. Retrying..." });
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const addUser = async (newUser: any) => {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("User added successfully!");
        fetchData();
      } else {
        showNotification(data.error || "Failed to add user", "error");
      }
    } catch (error: any) {
      console.error("Add user error:", error);
      showNotification("Connection error. Failed to add user.", "error");
    }
  };

  const deleteUser = (email: string) => {
    console.log("🗑️ Delete user clicked for:", email);
    setConfirmModal({
      isOpen: true,
      title: "Delete User",
      message: `Are you sure you want to delete ${email}? This action cannot be undone.`,
      action: "delete",
      targetEmail: email
    });
  };

  const resetPassword = (email: string) => {
    console.log("🔐 Reset password clicked for:", email);
    setConfirmModal({
      isOpen: true,
      title: "Reset Password",
      message: `Reset password for ${email} to 'Ara12345'?`,
      action: "reset",
      targetEmail: email
    });
  };

    const handleConfirmAction = async () => {
    const { action, targetEmail, onConfirm } = confirmModal;
    
    if (onConfirm) {
      await onConfirm();
      return;
    }

    console.log("✅ Confirming action:", action, "for:", targetEmail);
    if (!action || !targetEmail) return;

    try {
      if (action === "delete") {
        const res = await fetch(`/api/users?email=${targetEmail}`, {
          method: "DELETE",
        });
        if (res.ok) {
          showNotification("User deleted successfully");
          fetchData(true);
        } else {
          showNotification("Failed to delete user", "error");
        }
      } else if (action === "reset") {
        const res = await fetch("/api/users/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: targetEmail }),
        });
        const data = await res.json();
        if (res.ok) {
          showNotification(`Password reset to 'Ara12345'`);
          fetchData(true);
        } else {
          showNotification(data.error || "Failed to reset password", "error");
        }
      }
    } catch (error) {
      console.error("Action error:", error);
      showNotification("Connection error", "error");
    } finally {
      setConfirmModal(prev => ({ ...prev, isOpen: false, action: null }));
    }
  };


  const changePassword = async (passwords: any) => {
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, ...passwords }),
      });
      return await res.json();
    } catch (error) {
      return { error: "Connection error" };
    }
  };

  const updateProfile = async (data: any) => {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, ...data }),
      });
      if (res.ok) {
        const updatedUser = { ...user!, ...data };
        setUser(updatedUser);
        localStorage.setItem("araoffice_user", JSON.stringify(updatedUser));
        return { success: true };
      }
      return await res.json();
    } catch (error) {
      return { error: "Connection error" };
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newCat = { name: newCategoryName, color: newCategoryColor };
    
    // Optimistic update
    setTaskCategories([...taskCategories, newCat]);
    setIsCategoryModalOpen(false);
    setNewCategoryName("");

    try {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCat),
      });
    } catch (error) {
      console.error("Add category error:", error);
      fetchData(); // Rollback
    }
  };

  function getCategoryColor(catName: string) {
    if (!taskCategories) return "bg-gray-100 text-gray-600";
    const cat = taskCategories.find(c => c.name === catName);
    return cat ? cat.color : "bg-gray-100 text-gray-600";
  }

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const task = {
      title: newTaskTitle,
      category: newTaskCategory,
      completed: false,
    };

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      const savedTask = await res.json();
      setTasks([...tasks, savedTask]);
      setNewTaskTitle("");
    } catch (error) {
      console.error("Add task error:", error);
    }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    try {
      await fetch(`/api/tasks?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !completed } : t));
    } catch (error) {
      console.error("Toggle task error:", error);
    }
  };

  const toggleSubtask = async (taskId: string, subtaskIndex: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const updatedSubtasks = task.subtasks.map((st, idx) => {
      if (idx !== subtaskIndex) return st;
      const isObject = typeof st !== 'string';
      return {
        text: isObject ? st.text : st,
        completed: isObject ? !st.completed : true
      };
    });

    // Optimistic update
    setTasks(tasks.map(t => t.id === taskId ? { ...t, subtasks: updatedSubtasks } : t));

    try {
      await fetch(`/api/tasks?id=${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtasks: updatedSubtasks }),
      });
    } catch (error) {
      console.error("Toggle subtask error:", error);
      fetchData(); // Rollback
    }
  };

  const getCalendarEvents = (tasks: Task[], notes: Note[], history: HistoryEntry[]) => {
    const events: any[] = [];
    if (tasks && Array.isArray(tasks)) {
      tasks.forEach(t => events.push({ ...t, calendarType: 'task' }));
    }
    if (notes && Array.isArray(notes)) {
      notes.filter(n => n.duedate).forEach(n => events.push({ ...n, calendarType: 'note', startDate: n.duedate, endDate: n.duedate }));
    }
    if (history && Array.isArray(history)) {
      history.forEach(h => events.push({ ...h, calendarType: 'history', startDate: h.dateCompleted, endDate: h.dateCompleted }));
    }
    return events;
  };

  const addNote = async () => {
    if (!newNoteTitle.trim()) {
      showNotification("Please provide a title", "error");
      return;
    }
    if (!newNoteDueDate) {
      showNotification("Please select a due date", "error");
      return;
    }

    setIsSavingNote(true);
    const newNoteData = { 
      title: newNoteTitle,
      content: newNoteContent,
      duedate: newNoteDueDate
    };

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNoteData),
      });
      
      if (!res.ok) throw new Error("Failed to save note to Google Sheets");
      
      const savedNote = await res.json();
      setNotes(prev => [savedNote, ...prev]);
      setNewNoteTitle("");
      setNewNoteContent("");
      setNewNoteDueDate("");
      setIsAddingNote(false);
      showNotification("Note saved successfully");
    } catch (error: any) {
      console.error("Add note error:", error);
      showNotification(error.message || "Failed to save note", "error");
    } finally {
      setIsSavingNote(false);
    }
  };

  const updateNoteStatus = async (id: string, status: "Pending" | "Done") => {
    try {
      await fetch(`/api/notes?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setNotes(notes.map(n => n.id === id ? { ...n, status } : n));
      showNotification(`Note marked as ${status}`);
    } catch (error) {
      console.error("Update note error:", error);
      showNotification("Failed to update note", "error");
    }
  };

  const deleteNote = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Note",
      message: "Are you sure you want to delete this note?",
      action: null, // We'll handle this directly for now or add a new action
      targetEmail: "",
      onConfirm: async () => {
        try {
          await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
          setNotes(notes.filter(n => n.id !== id));
          showNotification("Note deleted");
        } catch (error) {
          console.error("Delete note error:", error);
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    } as any); // Type cast because I changed the interface earlier, I should probably update the interface to handle generic actions
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      // MESTI GUNA ?id= BUKAN /${id}
      const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setTasks(tasks.filter(t => t.id !== id));
        showNotification("Task deleted");
      } else {
         showNotification("Failed to delete task", "error");
      }
    } catch (error) {
      console.error("Delete task error:", error);
    }
  };

  const updateTaskRemark = (id: string, remark: string) => {
    // Optimistic update
    setTasks(tasks.map(t => t.id === id ? { ...t, description: remark } : t));

    // Debounced sync
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        await fetch(`/api/tasks?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: remark }),
        });
      } catch (error) {
        console.error("Sync remark error:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 2000);
  };

  const isTaskDueToday = (task: Task) => {
    const date = new Date();
    const freq = (task.frequency || "DAILY").toUpperCase();
    const dayName = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][date.getDay()];
    const dayOfMonth = date.getDate();
    
    if (freq === "DAILY") return true;
    if (freq === "WHEN_NEEDED" || freq === "UPON_SUGGESTION") return true;
    if (freq.startsWith("WEEKLY_")) {
      const targetDay = freq.split("_")[1];
      return dayName === targetDay;
    }
    if (freq === "TWICE_WEEKLY") return [1, 4].includes(date.getDay());
    if (freq === "MONTHLY") return dayOfMonth === 1;
    if (freq === "2_MONTHLY") return dayOfMonth === 1 && date.getMonth() % 2 === 0;
    
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

    return true;
  };

  const updateHistoryRemark = async (taskId: string, dateCompleted: string, remarks: string) => {
    // Optimistic update
    setHistory(history.map(h => 
      (h.taskId === taskId && h.dateCompleted === dateCompleted) 
        ? { ...h, remarks } 
        : h
    ));

    setIsSyncing(true);
    try {
      await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, dateCompleted, remarks }),
      });
    } catch (error) {
      console.error("Update history error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const completeTaskForToday = async (task: Task) => {
    const now = new Date();
    const optimisticEntry = {
      taskId: task.id,
      title: task.title,
      dateCompleted: now.toISOString(),
      remarks: task.description || ""
    };

    // Optimistic update
    setHistory([optimisticEntry, ...history]);

    setIsSyncing(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          title: task.title,
          remarks: task.description || ""
        }),
      });
      const newEntry = await res.json();
      // Replace optimistic entry with real one if needed (e.g. if ID was generated on server)
      setHistory(prev => prev.map(h => h === optimisticEntry ? newEntry : h));
    } catch (error) {
      console.error("Complete task error:", error);
      // Rollback
      setHistory(history);
    } finally {
      setIsSyncing(false);
    }
  };

  const undoTaskCompletion = async (taskId: string, dateCompleted: string) => {
    // Optimistic update
    setHistory(history.filter(h => !(h.taskId === taskId && h.dateCompleted === dateCompleted)));

    setIsSyncing(true);
    try {
      await fetch(`/api/history?id=${taskId}&date=${encodeURIComponent(dateCompleted)}`, {
        method: "DELETE"
      });
    } catch (error) {
      console.error("Undo completion error:", error);
      // Rollback
      fetchData(); // Refresh to be safe
    } finally {
      setIsSyncing(false);
    }
  };

  const updateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    try {
      await fetch(`/api/tasks?id=${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingTask),
      });
      setTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t));
      setIsEditModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Update task error:", error);
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask({ ...task });
    setIsEditModalOpen(true);
  };

  const addPortalLink = async () => {
    if (!newPortalTitle.trim() || !newPortalUrl.trim()) return;
    
    setIsPortalLoading(true);
    const folder = newPortalFolder.trim() || "General";
    
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPortalTitle,
          url: newPortalUrl.startsWith("http") ? newPortalUrl : `https://${newPortalUrl}`,
          folder: folder
        }),
      });
      
      if (res.ok) {
        const newLink = await res.json();
        setPortalLinks([newLink, ...portalLinks]);
        setNewPortalTitle("");
        setNewPortalUrl("");
        setNewPortalFolder("");
        setIsAddingPortal(false);
        showNotification("Link added to portal");
      }
    } catch (error) {
      showNotification("Failed to add link", "error");
    } finally {
      setIsPortalLoading(false);
    }
  };

  const updatePortalLink = async () => {
    if (!editingPortalLink || !newPortalTitle.trim() || !newPortalUrl.trim()) return;
    
    setIsPortalLoading(true);
    const folder = newPortalFolder.trim() || "General";
    const updatedLink = {
      ...editingPortalLink,
      title: newPortalTitle,
      url: newPortalUrl.startsWith("http") ? newPortalUrl : `https://${newPortalUrl}`,
      folder: folder
    };

    try {
      const res = await fetch(`/api/portal?id=${editingPortalLink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedLink),
      });
      
      if (res.ok) {
        setPortalLinks(portalLinks.map(l => l.id === editingPortalLink.id ? updatedLink : l));
        setNewPortalTitle("");
        setNewPortalUrl("");
        setNewPortalFolder("");
        setEditingPortalLink(null);
        setIsAddingPortal(false);
        showNotification("Link updated");
      }
    } catch (error) {
      showNotification("Failed to update link", "error");
    } finally {
      setIsPortalLoading(false);
    }
  };

  const openPortalEdit = (link: PortalLink) => {
    setEditingPortalLink(link);
    setNewPortalTitle(link.title);
    setNewPortalUrl(link.url);
    setNewPortalFolder(link.folder);
    setIsAddingPortal(true);
  };

  const deletePortalLink = async (id: string) => {
    if (!confirm("Are you sure you want to delete this link?")) return;
    try {
      await fetch(`/api/portal?id=${id}`, { method: "DELETE" });
      setPortalLinks(portalLinks.filter(l => l.id !== id));
      showNotification("Link removed");
    } catch (error) {
      showNotification("Failed to delete link", "error");
    }
  };

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => 
      prev.includes(folderName) ? prev.filter(f => f !== folderName) : [...prev, folderName]
    );
  };

  const groupedPortalLinks = portalLinks.reduce((acc, link) => {
    const folder = link.folder || "General";
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(link);
    return acc;
  }, {} as Record<string, PortalLink[]>);

  const todayTasks = tasks.filter(t => isTaskDueToday(t));
  const remainingTodayTasks = todayTasks.filter(t => !history.some(h => h.taskId === t.id && isSameDay(new Date(h.dateCompleted), new Date())));

  const departmentLoad = taskCategories.map(cat => {
    const total = todayTasks.filter(t => t.category === cat.name).length;
    const completed = todayTasks.filter(t => t.category === cat.name && history.some(h => h.taskId === t.id && isSameDay(new Date(h.dateCompleted), new Date()))).length;
    
    let barColor = "bg-accent-blue";
    if (cat.name === "TeamARA") barColor = "bg-orange-500";
    else if (cat.name === "Marketing") barColor = "bg-pink-500";
    else if (cat.name === "Quality of Service") barColor = "bg-blue-500";
    else if (cat.name === "Locum Doctors") barColor = "bg-green-500";
    else if (cat.name === "Collaborations") barColor = "bg-purple-500";
    else if (cat.name === "Corporate") barColor = "bg-emerald-500";

    return {
      name: cat.name,
      total,
      completed,
      percentage: total > 0 ? (completed / total) * 100 : 0,
      barColor
    };
  });

  const completionRate = tasks.length > 0 
    ? Math.round((history.filter(h => isSameDay(new Date(h.dateCompleted), new Date())).length / tasks.length) * 100) 
    : 0;

  const upcomingDeadlines = tasks.filter(t => !history.some(h => h.taskId === t.id && isSameDay(new Date(h.dateCompleted), new Date()))).length;

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-apple flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px] bg-white p-10 rounded-[32px] shadow-apple border border-border-apple/50"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-accent-blue rounded-[20px] flex items-center justify-center shadow-xl shadow-accent-blue/20 mb-6">
              <LayoutDashboard className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">AraOffice</h1>
            <p className="text-text-secondary text-sm font-medium mt-1">Sign in to your workstation</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest ml-1">Email Address</label>
              <input 
                type="email" 
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="name@hsohealthcare.com"
                className="w-full bg-[#F8F9FA] border border-border-apple rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest ml-1">Password</label>
              <input 
                type="password" 
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F8F9FA] border border-border-apple rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
              />
            </div>

            {loginError && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 text-xs font-medium text-center bg-red-50 py-2 rounded-lg"
              >
                {loginError}
              </motion.p>
            )}

            <button 
              type="submit"
              disabled={isLoginLoading}
              className="w-full bg-accent-blue text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent-blue/25 hover:shadow-xl hover:shadow-accent-blue/30 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {isLoginLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-10 pt-10 border-t border-border-apple/50 text-center">
            <p className="text-[11px] text-text-secondary font-medium uppercase tracking-widest">
              Clinic Management System v2.0
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg-apple text-text-primary font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] bg-white border-r border-border-apple flex flex-col px-4 py-8">
        <div className="px-4 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-blue rounded-xl flex items-center justify-center shadow-lg shadow-accent-blue/20">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold tracking-tight leading-tight">AraOffice</h1>
              <p className="text-[11px] text-text-secondary font-medium uppercase tracking-wider">Workstation</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-1 px-2">
          {[
            { id: "Overview", icon: LayoutDashboard, roles: ["Superadmin", "Staff"] },
            { id: "All Tasks", icon: CheckSquare, roles: ["Superadmin"] },
            { id: "Calendar", icon: Calendar, roles: ["Superadmin", "Staff"] },
            { id: "Notes", icon: StickyNote, roles: ["Superadmin", "Staff"] },
            { id: "History", icon: Clock, roles: ["Superadmin", "Staff"] },
            { id: "Portal", icon: Globe, roles: ["Superadmin", "Staff"] },
            { id: "Users", icon: User, roles: ["Superadmin"] },
            { id: "Profile", icon: User, roles: ["Superadmin", "Staff"] },
          ].filter(item => item.roles.includes(user?.role || "Staff")).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center px-4 py-3 text-[14px] font-bold rounded-apple-sm transition-all duration-200 group",
                activeTab === item.id 
                  ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" 
                  : "text-text-secondary hover:bg-gray-50 hover:text-text-primary"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 mr-3 transition-colors",
                activeTab === item.id ? "text-white" : "text-text-secondary group-hover:text-text-primary"
              )} />
              {item.id}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-2 space-y-4">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-[14px] font-bold rounded-apple-sm text-red-500 hover:bg-red-50 transition-all"
          >
            <CloudOff className="w-5 h-5 mr-3" />
            Sign Out
          </button>

          <div className={cn(
            "p-4 rounded-2xl flex flex-col gap-2 transition-all border",
            connectionStatus.connected 
              ? "bg-green-50 border-green-100" 
              : "bg-red-50 border-red-100"
          )}>
            <div className="flex items-center justify-between">
              <span className={cn(
                "text-[11px] font-bold uppercase tracking-widest",
                connectionStatus.connected ? "text-green-600" : "text-red-600"
              )}>
                {connectionStatus.connected ? (isSyncing ? "Syncing..." : "Cloud Sync") : "Offline"}
              </span>
              <div className={cn(
                "w-2 h-2 rounded-full",
                isSyncing ? "animate-spin border-t-2 border-green-500 bg-transparent" : "animate-pulse",
                connectionStatus.connected ? "bg-green-500" : "bg-red-500"
              )} />
            </div>
            <p className={cn(
              "text-[10px] font-medium leading-tight",
              connectionStatus.connected ? "text-green-700/70" : "text-red-700/70"
            )}>
              {connectionStatus.connected 
                ? "Database is active and syncing in real-time." 
                : connectionStatus.error || "Connection lost. Please check your sheet permissions."}
            </p>
            {!connectionStatus.connected && (
              <button 
                onClick={async () => {
                  setIsSyncing(true);
                  try {
                    const res = await fetch("/api/reconnect", { method: "POST" });
                    const status = await res.json();
                    setConnectionStatus(status);
                    if (status.connected) {
                      fetchData();
                      showNotification("Reconnected successfully");
                    } else {
                      showNotification(status.error || "Failed to reconnect", "error");
                    }
                  } catch (e) {
                    showNotification("Network error while reconnecting", "error");
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                className="mt-2 w-full py-2 bg-white border border-red-200 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-red-50 transition-all"
              >
                Retry Connection
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{activeTab}</h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border border-border-apple rounded-full pl-10 pr-4 py-1.5 text-sm w-64 shadow-apple focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
              />
            </div>
            <button className="p-2 bg-white rounded-full shadow-apple hover:shadow-md transition-all border border-border-apple">
              <Bell className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6"
          >
            {activeTab === "Overview" && (
              <>
                {/* Welcome Message */}
                <div className="flex flex-col gap-1 mb-2">
                  <h2 className="text-[28px] font-bold tracking-tight text-text-primary">
                    Welcome {user?.fullName?.split(' ')[0]}! 👋
                  </h2>
                  <p className="text-[14px] text-text-secondary font-medium">
                    This is your Operation Command Center. Have a productive day managing your clinic's excellence.
                  </p>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-6">
                  {[
                    { label: "Daily Completion", value: `${completionRate}%`, color: "text-accent-blue" },
                    { label: "Upcoming Deadlines", value: upcomingDeadlines.toString().padStart(2, '0'), color: "text-orange-500" },
                    { label: "Total Tasks Managed", value: tasks.length, color: "text-accent-green" },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-[20px] shadow-apple border border-border-apple/50 hover:shadow-apple-hover transition-all duration-300 group">
                      <p className="text-[11px] font-bold text-text-secondary uppercase tracking-widest mb-2">{stat.label}</p>
                      <h3 className={cn("text-[32px] font-bold tracking-tight", stat.color)}>{stat.value}</h3>
                    </div>
                  ))}
                </div>

                {/* Department Load Chart */}
                <div className="bg-white p-6 rounded-[20px] shadow-apple border border-border-apple/50">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[18px] font-bold tracking-tight">Department Load</h4>
                    <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">Today's Distribution</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-6">
                    {departmentLoad.filter(d => d.total > 0).map((dept, idx) => (
                      <div key={idx} className="flex flex-col gap-2">
                        <div className="flex justify-between items-end">
                          <span className="text-[13px] font-bold text-text-primary">{dept.name}</span>
                          <span className="text-[11px] font-bold text-text-secondary">{dept.completed}/{dept.total} Tasks</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${dept.percentage}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full rounded-full", dept.barColor)}
                          />
                        </div>
                      </div>
                    ))}
                    {departmentLoad.filter(d => d.total > 0).length === 0 && (
                      <div className="col-span-full py-4 text-center">
                        <p className="text-[13px] text-text-secondary italic">No tasks scheduled for today.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_340px] gap-6 flex-grow">
                  {/* Today's Focus Card */}
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center px-2">
                      <div className="flex flex-col">
                        <h4 className="text-[18px] font-bold tracking-tight">Today's Focus</h4>
                        <span className="text-[12px] font-medium text-text-secondary">{remainingTodayTasks.length} tasks remaining</span>
                      </div>
                        {user?.role === "Superadmin" && (
                          <button 
                            onClick={() => setActiveTab("All Tasks")} 
                            className="bg-white border border-border-apple text-text-primary px-4 py-2 rounded-xl text-[13px] font-bold hover:bg-gray-50 transition-all shadow-apple flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            New Task
                          </button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {todayTasks
                        .filter(t => !history.some(h => h.taskId === t.id && isSameDay(new Date(h.dateCompleted), new Date())))
                        .map(task => (
                        <div key={task.id} className="bg-white p-5 rounded-[20px] shadow-apple border border-border-apple/50 hover:shadow-apple-hover transition-all duration-300 group">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-4 flex-1">
                              <button 
                                onClick={() => completeTaskForToday(task)}
                                className="w-6 h-6 rounded-lg border-2 border-border-apple hover:border-accent-blue hover:bg-accent-blue/5 flex items-center justify-center transition-all group/tick"
                              >
                                <CheckCircle2 className="w-4 h-4 text-transparent group-hover/tick:text-accent-blue/30" />
                              </button>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider", getCategoryColor(task.category))}>
                                    {task.category}
                                  </span>
                                  {task.frequency && (
                                    <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {task.frequency.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </div>
                                <h5 className="text-[16px] font-bold text-text-primary leading-tight">{task.title}</h5>
                              </div>
                            </div>
                            <button 
                              onClick={() => user?.role === "Superadmin" && openEditModal(task)}
                              className={cn(
                                "p-2 hover:bg-gray-50 rounded-xl transition-all text-text-secondary hover:text-text-primary hover:scale-110 active:scale-95",
                                user?.role !== "Superadmin" && "opacity-0 pointer-events-none"
                              )}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {task.subtasks && task.subtasks.length > 0 && (
                            <div className="ml-10 mb-5 space-y-3">
                              {task.subtasks.map((st, idx) => {
                                const isObj = typeof st !== 'string';
                                const text = isObj ? st.text : st;
                                const completed = isObj ? st.completed : false;
                                
                                return (
                                  <button 
                                    key={idx} 
                                    onClick={() => toggleSubtask(task.id, idx)}
                                    className="flex items-center gap-3 group/st w-full text-left"
                                  >
                                    <div className={cn(
                                      "w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center",
                                      completed 
                                        ? "bg-accent-blue border-accent-blue" 
                                        : "border-border-apple/60 group-hover/st:border-accent-blue/40"
                                    )}>
                                      {completed && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                    </div>
                                    <span className={cn(
                                      "text-[13px] font-medium leading-tight transition-all",
                                      completed ? "text-text-secondary/50 line-through" : "text-text-secondary"
                                    )}>
                                      {text}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          
                          <div className="bg-[#F8F9FA] border border-border-apple/60 rounded-xl p-3 mb-1 ml-10">
                              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1">Remarks</p>
                              <textarea 
                                value={task.description || ""}
                                onChange={(e) => updateTaskRemark(task.id, e.target.value)}
                                placeholder="Add specific remarks for today..."
                                className="w-full bg-transparent text-[13px] text-text-primary/80 leading-relaxed italic border-none focus:ring-0 p-0 resize-none min-h-[40px] cursor-text"
                              />
                            </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    {/* Calendar Card */}
                    <div className="bg-white p-6 rounded-[20px] shadow-apple border border-border-apple/50">
                      <CalendarView mini events={getCalendarEvents(tasks, notes, history)} categories={taskCategories} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "Users" && user?.role === "Superadmin" && (
              <UserManagement 
                allUsers={allUsers} 
                onAddUser={addUser} 
                onDeleteUser={deleteUser} 
                onResetPassword={resetPassword}
                isLoading={isUsersLoading}
              />
            )}

            {activeTab === "Profile" && (
              <Profile 
                user={user} 
                onUpdateProfile={updateProfile} 
                onChangePassword={changePassword} 
                onLogout={handleLogout}
              />
            )}

            {activeTab === "All Tasks" && user?.role === "Superadmin" && (
              <div className="flex flex-col gap-6">
                <div className="bg-white p-8 rounded-[24px] shadow-apple border border-border-apple/50">
                  <h4 className="text-[20px] font-bold tracking-tight mb-6">Create New Task</h4>
                  <form onSubmit={addTask} className="grid grid-cols-1 md:grid-cols-[1fr_200px_160px] gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Task Title</label>
                      <input 
                        type="text" 
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="What needs to be done?" 
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Category</label>
                      <select 
                        value={newTaskCategory}
                        onChange={(e) => setNewTaskCategory(e.target.value)}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        {taskCategories && taskCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full bg-accent-blue text-white px-6 py-3 rounded-xl shadow-lg shadow-accent-blue/20 hover:bg-[#0077ED] transition-all font-bold text-sm">
                        Add Task
                      </button>
                    </div>
                  </form>
                </div>

                {/* Department Filters */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setSelectedCategory("All")}
                    className={cn(
                      "px-6 py-2 rounded-full text-[13px] font-bold transition-all shadow-apple border",
                      selectedCategory === "All"
                        ? "bg-accent-blue text-white border-accent-blue shadow-lg shadow-accent-blue/20"
                        : "bg-white text-text-secondary border-border-apple hover:bg-gray-50"
                    )}
                  >
                    All
                  </button>
                  {taskCategories && taskCategories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => setSelectedCategory(cat.name)}
                      className={cn(
                        "px-6 py-2 rounded-full text-[13px] font-bold transition-all shadow-apple border",
                        selectedCategory === cat.name
                          ? "bg-accent-blue text-white border-accent-blue shadow-lg shadow-accent-blue/20"
                          : "bg-white text-text-secondary border-border-apple hover:bg-gray-50"
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                  {user?.role === "Superadmin" && (
                    <button
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold text-text-secondary bg-gray-50 border border-border-apple/50 hover:bg-gray-100 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      New Category
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AnimatePresence mode="popLayout">
                    {tasks
                      .filter(t => selectedCategory === "All" || t.category === selectedCategory)
                      .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(task => (
                      <motion.div 
                        key={task.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white p-6 rounded-[24px] shadow-apple border border-border-apple/50 hover:shadow-apple-hover transition-all duration-300 flex flex-col"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={cn("px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider", getCategoryColor(task.category))}>
                                {task.category}
                              </span>
                              {task.frequency && (
                                <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {task.frequency.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                            <h5 className="text-[17px] font-bold text-text-primary leading-tight">{task.title}</h5>
                            <p className="text-[11px] text-text-secondary mt-1 font-medium">Created on {format(new Date(task.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <div className="flex gap-1 relative">
                            {user?.role === "Superadmin" && (
                              <>
                                <button 
                                  onClick={() => openEditModal(task)}
                                  className="p-2 hover:bg-gray-50 rounded-xl transition-all text-text-secondary hover:text-text-primary hover:scale-110 active:scale-95 cursor-pointer"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <div className="relative group/menu">
                                  <button className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-text-secondary hover:text-text-primary cursor-pointer">
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                  <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-border-apple rounded-xl shadow-lg opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-10 overflow-hidden">
                                    <button 
                                      onClick={() => openEditModal(task)}
                                      className="w-full px-4 py-2 text-left text-[13px] font-bold text-text-primary hover:bg-gray-50 flex items-center gap-2"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                      Edit Task
                                    </button>
                                    <button 
                                      onClick={() => deleteTask(task.id)}
                                      className="w-full px-4 py-2 text-left text-[13px] font-bold text-red-500 hover:bg-red-50 flex items-center gap-2"
                                    >
                                      <Plus className="w-3.5 h-3.5 rotate-45" />
                                      Delete Task
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="mb-4 space-y-2.5">
                            {task.subtasks.map((st, idx) => {
                              const isObj = typeof st !== 'string';
                              const text = isObj ? st.text : st;
                              const completed = isObj ? st.completed : false;
                              
                              return (
                                <div key={idx} className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-4 h-4 rounded-full border transition-all flex items-center justify-center",
                                    completed ? "bg-accent-blue border-accent-blue" : "border-border-apple/60"
                                  )}>
                                    {completed && <div className="w-1 h-1 bg-white rounded-full" />}
                                  </div>
                                  <span className={cn(
                                    "text-[13px] font-medium leading-tight",
                                    completed ? "text-text-secondary/50 line-through" : "text-text-secondary"
                                  )}>
                                    {text}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        <div className="bg-[#F8F9FA] border border-border-apple/60 rounded-2xl p-4 flex-grow">
                          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2">Remarks / Description</p>
                          <p className="text-[14px] text-text-primary/80 leading-relaxed italic">
                            {task.description || "No specific remarks for this task yet. Click edit to add details."}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {tasks.filter(t => selectedCategory === "All" || t.category === selectedCategory).filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-white rounded-[32px] border border-dashed border-border-apple/60">
                      <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-text-secondary/30" />
                      </div>
                      <h5 className="text-[18px] font-bold text-text-primary mb-1">No tasks found</h5>
                      <p className="text-[14px] text-text-secondary font-medium">No tasks found for this department matching your search.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "History" && (
              <div className="bg-white p-8 rounded-[24px] shadow-apple border border-border-apple/50">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="text-[22px] font-bold tracking-tight">Task History</h4>
                    <p className="text-[14px] text-text-secondary font-medium">Review and edit your daily completions</p>
                  </div>
                  <div className="flex items-center gap-3 bg-[#F8F9FA] p-1 rounded-xl border border-border-apple/50">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm border border-border-apple/40">
                      <div className="w-2 h-2 rounded-full bg-accent-green" />
                      <span className="text-[11px] font-bold uppercase tracking-wider">Completed</span>
                    </div>
                  </div>
                </div>
                <HistoryCalendar 
                  history={history} 
                  onUpdateRemark={updateHistoryRemark} 
                  onUndo={undoTaskCompletion}
                />
              </div>
            )}

            {activeTab === "Portal" && (
              <div className="flex flex-col gap-10">
                <div className="flex items-center justify-between">
                  <h1 className="text-[34px] font-bold tracking-tight text-text-primary">Portal</h1>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setIsAddingPortal(true);
                        setEditingPortalLink(null);
                        setNewPortalTitle("");
                        setNewPortalUrl("");
                        setNewPortalFolder("");
                      }}
                      className="bg-white border border-border-apple text-text-primary px-6 py-3 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all shadow-apple flex items-center gap-2"
                    >
                      <PlusCircle className="w-5 h-5 text-text-secondary" />
                      <span>New Folder</span>
                    </button>
                    <button 
                      onClick={() => {
                        setIsAddingPortal(!isAddingPortal);
                        if (isAddingPortal) {
                          setEditingPortalLink(null);
                          setNewPortalTitle("");
                          setNewPortalUrl("");
                          setNewPortalFolder("");
                        }
                      }}
                      className="bg-accent-blue text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20 flex items-center gap-2"
                    >
                      <PlusCircle className="w-5 h-5" />
                      <span>{isAddingPortal ? "Cancel" : "New Link"}</span>
                    </button>
                  </div>
                </div>

                {isAddingPortal && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-8 rounded-[32px] border border-border-apple shadow-apple"
                  >
                    <h3 className="text-[18px] font-bold mb-6">{editingPortalLink ? "Edit Portal Link" : "Add New Link"}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest ml-1">Link Title</label>
                        <input 
                          type="text"
                          value={newPortalTitle}
                          onChange={(e) => setNewPortalTitle(e.target.value)}
                          placeholder="e.g. Plato CMS"
                          className="w-full bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest ml-1">URL Address</label>
                        <input 
                          type="text"
                          value={newPortalUrl}
                          onChange={(e) => setNewPortalUrl(e.target.value)}
                          placeholder="plato.com"
                          className="w-full bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-text-secondary uppercase tracking-widest ml-1">Folder Name</label>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={newPortalFolder}
                            onChange={(e) => setNewPortalFolder(e.target.value)}
                            placeholder="e.g. Quality of Service"
                            className="flex-1 bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                          />
                          <button 
                            onClick={editingPortalLink ? updatePortalLink : addPortalLink}
                            disabled={isPortalLoading}
                            className="bg-accent-blue text-white px-6 py-3 rounded-xl font-bold text-sm hover:shadow-xl transition-all disabled:opacity-50"
                          >
                            {isPortalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingPortalLink ? "Update" : "Save")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Folders Section */}
                <div className="space-y-6">
                  <h2 className="text-[20px] font-bold text-text-primary">Folders</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* All Links folder */}
                    <button 
                      onClick={() => setSelectedPortalFolder("All")}
                      className={cn(
                        "p-6 rounded-[24px] border transition-all text-left flex flex-col gap-1",
                        selectedPortalFolder === "All" 
                          ? "bg-[#EBF5FF] border-accent-blue/30 shadow-sm" 
                          : "bg-white border-border-apple hover:border-accent-blue/20"
                      )}
                    >
                      <h3 className={cn("text-[16px] font-bold", selectedPortalFolder === "All" ? "text-accent-blue" : "text-text-primary")}>All Links</h3>
                      <p className="text-[12px] font-medium text-text-secondary">{portalLinks.length} items</p>
                    </button>
                    
                    {/* Custom folders */}
                    {Object.entries(groupedPortalLinks).map(([folder, links]) => (
                      <button 
                        key={folder}
                        onClick={() => setSelectedPortalFolder(folder)}
                        className={cn(
                          "p-6 rounded-[24px] border transition-all text-left flex flex-col gap-1",
                          selectedPortalFolder === folder
                            ? "bg-[#EBF5FF] border-accent-blue/30 shadow-sm" 
                            : "bg-white border-border-apple hover:border-accent-blue/20"
                        )}
                      >
                        <h3 className={cn("text-[16px] font-bold", selectedPortalFolder === folder ? "text-accent-blue" : "text-text-primary")}>{folder}</h3>
                        <p className="text-[12px] font-medium text-text-secondary">{(links as PortalLink[]).length} items</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Links Section */}
                <div className="space-y-6">
                  <h2 className="text-[20px] font-bold text-text-primary">
                    {selectedPortalFolder === "All" ? "All Links" : `${selectedPortalFolder}`}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(selectedPortalFolder === "All" 
                      ? portalLinks 
                      : (groupedPortalLinks[selectedPortalFolder] as PortalLink[] || [])
                    ).map((link) => (
                      <div 
                        key={link.id} 
                        className="group bg-white border border-border-apple rounded-[24px] p-6 flex flex-col justify-between hover:border-accent-blue/30 hover:shadow-apple transition-all duration-300"
                      >
                        <div>
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="text-[17px] font-bold text-text-primary leading-tight group-hover:text-accent-blue transition-colors">{link.title}</h3>
                            {user?.role === "Superadmin" && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  onClick={() => openPortalEdit(link)}
                                  className="p-2 text-text-secondary hover:text-accent-blue hover:bg-blue-50 rounded-lg transition-all"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => deletePortalLink(link.id)}
                                  className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-[12px] text-text-secondary truncate mb-6">{link.url}</p>
                        </div>
                        <a 
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full bg-[#F8F9FA] text-text-primary py-3 rounded-xl font-bold text-[13px] hover:bg-accent-blue hover:text-white transition-all text-center flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open Link
                        </a>
                      </div>
                    ))}
                  </div>
                  
                  {portalLinks.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-center opacity-60">
                      <Globe className="w-12 h-12 mb-4 text-text-secondary" />
                      <h6 className="text-[18px] font-bold">Portal is empty</h6>
                      <p className="text-sm font-medium">Add frequently used clinical resources and internal dashboards here</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "Calendar" && (
              <div className="bg-white p-8 rounded-[24px] shadow-apple border border-border-apple/50">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-accent-blue animate-spin mb-4" />
                    <p className="text-text-secondary font-bold uppercase tracking-widest text-[11px]">Loading Calendar...</p>
                  </div>
                ) : (
                  <CalendarView events={getCalendarEvents(tasks, notes, history)} categories={taskCategories} />
                )}
              </div>
            )}

            {activeTab === "Notes" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[24px] shadow-apple border border-border-apple/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center">
                      <StickyNote className="w-6 h-6 text-accent-blue" />
                    </div>
                    <div>
                      <h4 className="text-[20px] font-bold tracking-tight">Notes & Reminders</h4>
                      <p className="text-[13px] text-text-secondary font-medium">Manage clinic reminders and tasks</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                      <input 
                        type="text"
                        placeholder="Search notes..."
                        value={noteSearchQuery}
                        onChange={(e) => setNoteSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-border-apple rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                      />
                    </div>
                    <button 
                      onClick={() => setIsAddingNote(!isAddingNote)}
                      className="flex items-center gap-2 bg-accent-blue text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Note</span>
                    </button>
                  </div>
                </div>

                <div className={cn("grid gap-6", isAddingNote ? "grid-cols-1 lg:grid-cols-[380px_1fr]" : "grid-cols-1")}>
                  {isAddingNote && (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white p-8 rounded-[24px] shadow-apple border border-border-apple/50 h-fit sticky top-6"
                    >
                      <h5 className="text-[16px] font-bold mb-6">Create Reminder</h5>
                      <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Title</label>
                          <input 
                            type="text"
                            value={newNoteTitle}
                            onChange={(e) => setNewNoteTitle(e.target.value)}
                            placeholder="Note title"
                            className="w-full bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Content</label>
                          <textarea 
                            value={newNoteContent}
                            onChange={(e) => setNewNoteContent(e.target.value)}
                            placeholder="Write your reminder here..."
                            className="w-full h-32 bg-[#F8F9FA] border border-border-apple rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 resize-none transition-all"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Due Date (Optional)</label>
                          <input 
                            type="date"
                            value={newNoteDueDate}
                            onChange={(e) => setNewNoteDueDate(e.target.value)}
                            className="w-full bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                          />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button 
                            onClick={() => setIsAddingNote(false)}
                            className="flex-1 px-4 py-3 rounded-xl font-bold text-sm border border-border-apple text-text-secondary hover:bg-gray-50 transition-all"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={addNote}
                            disabled={isSavingNote}
                            className={cn(
                              "flex-1 bg-accent-blue text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2",
                              isSavingNote && "opacity-70 cursor-not-allowed"
                            )}
                          >
                            {isSavingNote ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : "Save Note"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className={cn("grid gap-6", isAddingNote ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
                    {isLoading ? (
                      <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-[24px] border border-border-apple/50 shadow-apple">
                        <Loader2 className="w-10 h-10 text-accent-blue animate-spin mb-4" />
                        <p className="text-text-secondary font-bold uppercase tracking-widest text-[11px]">Loading Notes...</p>
                      </div>
                    ) : !notes || notes.length === 0 ? (
                      <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-[24px] border border-border-apple/50 shadow-apple">
                        <StickyNote className="w-12 h-12 text-gray-200 mb-4" />
                        <p className="text-text-secondary font-bold uppercase tracking-widest text-[11px]">No notes found</p>
                        <button 
                          onClick={() => setIsAddingNote(true)}
                          className="mt-4 text-accent-blue font-bold text-sm hover:underline"
                        >
                          Create your first note
                        </button>
                      </div>
                    ) : (
                      notes
                        .filter(note => 
                          (note.title?.toLowerCase() || "").includes(noteSearchQuery.toLowerCase()) ||
                          (note.content?.toLowerCase() || "").includes(noteSearchQuery.toLowerCase())
                        )
                        .map(note => {
                          const isOverdue = note.duedate && new Date(note.duedate) < new Date();
                          return (
                            <motion.div 
                              layout
                              key={note.id} 
                              className={cn(
                                "bg-white p-6 rounded-[24px] shadow-sm border transition-all duration-300 flex flex-col h-full group",
                                isOverdue ? "border-red-200 bg-red-50/30" : "border-border-apple/50 hover:shadow-md"
                              )}
                            >
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-bold text-[18px] tracking-tight text-text-primary">
                                      {note.title || "Untitled Note"}
                                    </h5>
                                    {isOverdue && (
                                      <span className="bg-red-100 text-red-600 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Overdue</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => deleteNote(note.id)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F8F9FA] text-text-secondary hover:bg-red-50 hover:text-red-500 transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              
                              <div className="flex-1 mb-6 min-h-[120px]">
                                <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                                  {note.content || <span className="italic opacity-50">No content provided.</span>}
                                </p>
                              </div>

                              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border-apple/30">
                                <div className="flex items-center gap-2">
                                  {note.duedate && (
                                    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium", isOverdue ? "bg-red-50 text-red-600" : "bg-gray-50 text-text-secondary")}>
                                      <Calendar className="w-3.5 h-3.5" />
                                      <span>Due: {safeFormat(note.duedate, "MMM d, yyyy")}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-text-secondary font-medium">
                                    Updated: {safeFormat(note.updatedAt, "MMM d")}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingTask && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[22px] font-bold tracking-tight">Edit Task</h4>
                  <button 
                    onClick={() => setIsEditModalOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Plus className="w-5 h-5 rotate-45 text-text-secondary" />
                  </button>
                </div>

                <form onSubmit={updateTask} className="space-y-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Task Title</label>
                    <input 
                      type="text" 
                      value={editingTask.title}
                      onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                      className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Category</label>
                        <select 
                          value={editingTask.category}
                          onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value })}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                        >
                          {taskCategories && taskCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Frequency</label>
                      <select 
                        value={editingTask.frequency}
                        onChange={(e) => setEditingTask({ ...editingTask, frequency: e.target.value })}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY_FRIDAY">Weekly (Friday)</option>
                        <option value="TWICE_WEEKLY">Twice Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                        <option value="MONTHLY_2ND_FRI">Monthly (2nd Fri)</option>
                        <option value="MONTHLY_3RD_4TH_FRI">Monthly (3rd/4th Fri)</option>
                        <option value="2_MONTHLY">2-Monthly</option>
                        <option value="WHEN_NEEDED">When Needed</option>
                        <option value="UPON_SUGGESTION">Upon Suggestion</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Subtasks (one per line)</label>
                    <textarea 
                      value={(editingTask.subtasks || []).join("\n")}
                      onChange={(e) => setEditingTask({ ...editingTask, subtasks: e.target.value.split("\n").filter(s => s.trim()) })}
                      placeholder="Enter subtasks..."
                      className="w-full h-24 bg-[#F8F9FA] border border-border-apple rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue resize-none transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Remarks / Description</label>
                    <textarea 
                      value={editingTask.description || ""}
                      onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                      className="w-full h-32 bg-[#F8F9FA] border border-border-apple rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue resize-none transition-all"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="flex-1 bg-gray-50 text-text-primary py-3.5 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-accent-blue text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Category Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl border border-border-apple overflow-hidden"
            >
              <div className="p-8">
                <h3 className="text-[22px] font-bold tracking-tight mb-6">New Category</h3>
                <div className="space-y-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Category Name</label>
                    <input 
                      type="text" 
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Operations"
                      className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Pick a Color</label>
                    <div className="grid grid-cols-3 gap-3">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewCategoryColor(color)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-[11px] font-bold transition-all border",
                            newCategoryColor === color 
                              ? "ring-2 ring-accent-blue ring-offset-2 border-transparent" 
                              : "border-border-apple/50 hover:border-accent-blue/30"
                          )}
                        >
                          <span className={cn("px-2 py-0.5 rounded-md", color)}>Sample</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsCategoryModalOpen(false)}
                      className="flex-1 px-6 py-3 rounded-xl font-bold text-sm border border-border-apple hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={addCategory}
                      className="flex-1 bg-accent-blue text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                    >
                      Add Category
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 border",
              notification.type === "success" 
                ? "bg-white text-green-600 border-green-100" 
                : "bg-white text-red-600 border-red-100"
            )}
          >
            {notification.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {notification.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl border border-border-apple p-8 text-center"
            >
              <div className="w-16 h-16 bg-orange-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-[20px] font-bold tracking-tight mb-2">{confirmModal.title}</h3>
              <p className="text-[14px] text-text-secondary font-medium mb-8 leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-sm border border-border-apple hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmAction}
                  className="flex-1 bg-accent-blue text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserManagement({ allUsers, onAddUser, onDeleteUser, onResetPassword, isLoading }: { 
  allUsers: UserData[], 
  onAddUser: (user: any) => void, 
  onDeleteUser: (email: string) => void,
  onResetPassword: (email: string) => void,
  isLoading: boolean
}) {
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", fullName: "", role: "Staff", password: "", location: "Main Office" });

  if (isLoading) {
    return (
      <div className="bg-white p-12 rounded-[24px] shadow-apple border border-border-apple/50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin mb-4" />
        <p className="text-text-secondary font-medium">Loading user data from Google Sheets...</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-[24px] shadow-apple border border-border-apple/50">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h4 className="text-[22px] font-bold tracking-tight">User Management</h4>
          <p className="text-[14px] text-text-secondary font-medium">Manage staff access and roles</p>
        </div>
        <button 
          onClick={() => setIsAddUserModalOpen(true)}
          className="bg-accent-blue text-white px-6 py-2.5 rounded-xl font-bold text-[13px] hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add New User
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-apple/50">
              <th className="py-4 px-4 text-[11px] font-bold text-text-secondary uppercase tracking-widest">Full Name</th>
              <th className="py-4 px-4 text-[11px] font-bold text-text-secondary uppercase tracking-widest">Email</th>
              <th className="py-4 px-4 text-[11px] font-bold text-text-secondary uppercase tracking-widest">Role</th>
              <th className="py-4 px-4 text-[11px] font-bold text-text-secondary uppercase tracking-widest">Status</th>
              <th className="py-4 px-4 text-[11px] font-bold text-text-secondary uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.email} className="border-b border-border-apple/30 hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-4 font-bold text-[14px]">{u.fullName}</td>
                <td className="py-4 px-4 text-[14px] text-text-secondary">{u.email}</td>
                <td className="py-4 px-4">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                    u.role === "Superadmin" ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                  )}>
                    {u.role}
                  </span>
                </td>
                <td className="py-4 px-4 text-[12px] text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                    {u.status || "Active"}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => onResetPassword(u.email)}
                      title="Reset Password"
                      className="p-2 hover:bg-orange-50 rounded-lg text-text-secondary hover:text-orange-500 transition-all"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => onDeleteUser(u.email)}
                      title="Delete User"
                      className="p-2 hover:bg-red-50 rounded-lg text-text-secondary hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isAddUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddUserModalOpen(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl border border-border-apple p-8"
            >
              <h3 className="text-[22px] font-bold tracking-tight mb-6">Add New User</h3>
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                    placeholder="John Doe"
                    className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    type="email" 
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="john@hsohealthcare.com"
                    className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Initial Password</label>
                  <input 
                    type="text" 
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="staff123"
                    className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Role</label>
                  <select 
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Superadmin">Superadmin</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Location</label>
                  <select 
                    value={newUser.location}
                    onChange={(e) => setNewUser({ ...newUser, location: e.target.value })}
                    className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                  >
                    <option value="Main Office">Main Office</option>
                    <option value="Kajang">Kajang</option>
                    <option value="Semenyih">Semenyih</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsAddUserModalOpen(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-sm border border-border-apple hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      onAddUser(newUser);
                      setIsAddUserModalOpen(false);
                      setNewUser({ email: "", fullName: "", role: "Staff", password: "", location: "Main Office" });
                    }}
                    className="flex-1 bg-accent-blue text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                  >
                    Create User
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Profile({ user, onUpdateProfile, onChangePassword, onLogout }: { 
  user: UserData | null, 
  onUpdateProfile: (data: any) => Promise<any>,
  onChangePassword: (passwords: any) => Promise<any>,
  onLogout: () => void
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [location, setLocation] = useState(user?.location || "Main Office");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
      setLocation(user.location || "Main Office");
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onUpdateProfile({ fullName, location });
    if (res.success) {
      setMessage({ text: "Profile updated successfully!", type: "success" });
      setTimeout(() => setIsSettingsOpen(false), 1500);
    } else {
      setMessage({ text: res.error || "Failed to update profile", type: "error" });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setMessage({ text: "New passwords do not match", type: "error" });
      return;
    }
    const res = await onChangePassword(passwords);
    if (res.success) {
      setMessage({ text: "Password changed successfully!", type: "success" });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setIsSettingsOpen(false), 1500);
    } else {
      setMessage({ text: res.error || "Failed to change password", type: "error" });
    }
  };

  const handlePhotoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
          const profilePic = readerEvent.target?.result as string;
          await onUpdateProfile({ profilePic });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-[32px] shadow-apple border border-border-apple/50 overflow-hidden">
        {/* Header/Banner */}
        <div className="h-48 bg-gradient-to-r from-accent-blue to-accent-blue/60 relative">
          <div className="absolute -bottom-16 left-12">
            <div className="relative group">
              <div className="w-32 h-32 rounded-[32px] bg-white p-1 shadow-2xl border-4 border-white overflow-hidden">
                {user?.profilePic ? (
                  <img src={user.profilePic} alt="Profile" className="w-full h-full object-cover rounded-[28px]" />
                ) : (
                  <div className="w-full h-full bg-gray-50 flex items-center justify-center rounded-[28px]">
                    <User className="w-12 h-12 text-text-secondary/30" />
                  </div>
                )}
              </div>
              <button 
                onClick={handlePhotoUpload}
                className="absolute bottom-1 right-1 p-2 bg-white rounded-xl shadow-lg border border-border-apple hover:scale-110 transition-all text-accent-blue"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-20 pb-12 px-12">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-[28px] font-bold tracking-tight text-text-primary mb-1">{user?.fullName}</h3>
              <p className="text-[15px] font-medium text-text-secondary">{user?.email}</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="bg-white border border-border-apple text-text-primary px-6 py-2.5 rounded-xl font-bold text-[13px] hover:bg-gray-50 transition-all shadow-apple flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Account Settings
              </button>
              <button 
                onClick={onLogout}
                className="bg-red-50 text-red-500 px-6 py-2.5 rounded-xl font-bold text-[13px] hover:bg-red-100 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4 rotate-45" />
                Sign Out
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-[#F8F9FA] p-6 rounded-[24px] border border-border-apple/40">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Role</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-[16px] font-bold text-text-primary">{user?.role === "Superadmin" ? "Super Admin" : "Staff"}</span>
              </div>
            </div>
            <div className="bg-[#F8F9FA] p-6 rounded-[24px] border border-border-apple/40">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Status</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent-green/10 rounded-xl flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                </div>
                <span className="text-[16px] font-bold text-text-primary">{user?.status || "Active"}</span>
              </div>
            </div>
            <div className="bg-[#F8F9FA] p-6 rounded-[24px] border border-border-apple/40">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Location</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-[16px] font-bold text-text-primary">{user?.location || "Main Office"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl border border-border-apple overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-[24px] font-bold tracking-tight">Account Settings</h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                    <Plus className="w-6 h-6 rotate-45 text-text-secondary" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[16px] font-bold mb-4">Personal Information</h4>
                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Full Name</label>
                        <input 
                          type="text" 
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Location</label>
                        <select 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                        >
                          <option value="Main Office">Main Office</option>
                          <option value="Kajang">Kajang</option>
                          <option value="Semenyih">Semenyih</option>
                          <option value="Seri Kembangan">Seri Kembangan</option>
                        </select>
                      </div>
                      <button 
                        type="submit"
                        className="w-full bg-accent-blue text-white py-3 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                      >
                        Save Changes
                      </button>
                    </form>
                  </div>

                  <div>
                    <h4 className="text-[16px] font-bold mb-4">Security</h4>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Current Password</label>
                        <input 
                          type="password" 
                          required
                          value={passwords.currentPassword}
                          onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">New Password</label>
                        <input 
                          type="password" 
                          required
                          value={passwords.newPassword}
                          onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Confirm New Password</label>
                        <input 
                          type="password" 
                          required
                          value={passwords.confirmPassword}
                          onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all"
                        />
                      </div>
                      <button 
                        type="submit"
                        className="w-full bg-accent-blue text-white py-3 rounded-xl font-bold text-sm hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20"
                      >
                        Update Password
                      </button>
                    </form>
                  </div>
                </div>

                {message.text && (
                  <div className={cn(
                    "mt-6 p-4 rounded-xl text-sm font-bold text-center",
                    message.type === "success" ? "bg-green-50 text-green-600 border border-green-100" : "bg-red-50 text-red-600 border border-red-100"
                  )}>
                    {message.text}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryCalendar({ history, onUpdateRemark, onUndo }: { 
  history: HistoryEntry[], 
  onUpdateRemark: (taskId: string, date: string, remark: string) => void,
  onUndo: (taskId: string, date: string) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const completionsForDate = selectedDate 
    ? history.filter(h => {
        try {
          const d = new Date(h.dateCompleted);
          if (isNaN(d.getTime())) return false;
          return isSameDay(d, selectedDate);
        } catch (e) {
          return false;
        }
      })
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-10">
      <div className="bg-[#F8F9FA] p-8 rounded-[24px] border border-border-apple/60">
        <div className="flex justify-between items-center mb-8">
          <h5 className="text-[18px] font-bold tracking-tight">{format(currentMonth, "MMMM yyyy")}</h5>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-border-apple transition-all"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={nextMonth} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-border-apple transition-all"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-3">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2">{d}</div>
          ))}
          {days.map((day, i) => {
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const hasCompletions = history.some(h => {
              try {
                const d = new Date(h.dateCompleted);
                if (isNaN(d.getTime())) return false;
                return isSameDay(d, day);
              } catch (e) {
                return false;
              }
            });
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border group",
                  isSelected 
                    ? "bg-accent-blue text-white border-accent-blue shadow-lg shadow-accent-blue/20" 
                    : "bg-white hover:bg-gray-50 border-border-apple/40 hover:border-border-apple",
                  !isSameMonth(day, currentMonth) && "opacity-20"
                )}
              >
                <span className={cn("text-[15px] font-bold", isToday && !isSelected && "text-accent-blue")}>
                  {format(day, "d")}
                </span>
                {hasCompletions && (
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full mt-1",
                    isSelected ? "bg-white" : "bg-accent-green"
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
          <h5 className="text-[18px] font-bold tracking-tight">
            {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
          </h5>
          <div className="bg-accent-green/10 text-accent-green px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider">
            {completionsForDate.length} Done
          </div>
        </div>

                <div className="flex-1 space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
          {completionsForDate.length > 0 ? (
            completionsForDate.map((entry, i) => {
              let isTodayEntry = false;
              try {
                const d = new Date(entry.dateCompleted);
                if (!isNaN(d.getTime())) {
                  isTodayEntry = isSameDay(d, new Date());
                }
              } catch (e) {}
              return (
                <div key={i} className="bg-white p-5 rounded-[20px] border border-border-apple/50 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent-green/10 rounded-lg flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-accent-green" />
                      </div>
                      <h6 className="text-[15px] font-bold text-text-primary">{entry.title}</h6>
                    </div>
                    {isTodayEntry && (
                      <button 
                        onClick={() => onUndo(entry.taskId, entry.dateCompleted)}
                        className="text-[10px] font-bold text-accent-blue uppercase tracking-widest hover:underline"
                      >
                        Untick
                      </button>
                    )}
                  </div>
                  <div className="bg-[#F8F9FA] border border-border-apple/60 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1">Remarks</p>
                    {isTodayEntry ? (
                      <textarea 
                        value={entry.remarks || ""}
                        onChange={(e) => onUpdateRemark(entry.taskId, entry.dateCompleted, e.target.value)}
                        placeholder="Edit remarks for today..."
                        className="w-full bg-transparent text-[13px] text-text-primary/80 leading-relaxed italic border-none focus:ring-0 p-0 resize-none min-h-[40px]"
                      />
                    ) : (
                      <p className="text-[13px] text-text-primary/80 leading-relaxed italic">
                        {entry.remarks || "No remarks recorded."}
                      </p>
                    )}
                  </div>
                  {!isTodayEntry && (
                    <div className="mt-3 flex items-center gap-1.5 text-text-secondary">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Locked</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#F8F9FA] rounded-[24px] border border-dashed border-border-apple">
              <Clock className="w-8 h-8 text-text-secondary/30 mb-3" />
              <p className="text-[14px] text-text-secondary italic">No tasks completed on this day.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const isTaskOnDay = (task: Task, day: Date) => {
  if (task.deadline) {
    try {
      const d = new Date(task.deadline);
      if (!isNaN(d.getTime()) && isSameDay(d, day)) return true;
    } catch (e) {
      // Ignore invalid deadline
    }
  }
  
  const dayOfWeek = format(day, "EEEE"); // e.g. "Friday"
  const dayOfMonth = day.getDate();
  
  switch (task.frequency) {
    case "DAILY": return true;
    case "WEEKLY_FRIDAY": return dayOfWeek === "Friday";
    case "TWICE_WEEKLY": return dayOfWeek === "Tuesday" || dayOfWeek === "Thursday";
    case "MONTHLY": return dayOfMonth === 1; // Default to 1st of month
    case "MONTHLY_2ND_FRI": {
      if (dayOfWeek !== "Friday") return false;
      const firstDay = startOfMonth(day);
      let count = 0;
      for (let d = 0; d < 31; d++) {
        const checkDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), d + 1);
        if (checkDate.getMonth() !== firstDay.getMonth()) break;
        if (format(checkDate, "EEEE") === "Friday") {
          count++;
          if (count === 2 && isSameDay(checkDate, day)) return true;
        }
      }
      return false;
    }
    case "MONTHLY_3RD_4TH_FRI": {
      if (dayOfWeek !== "Friday") return false;
      const firstDay = startOfMonth(day);
      let count = 0;
      for (let d = 0; d < 31; d++) {
        const checkDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), d + 1);
        if (checkDate.getMonth() !== firstDay.getMonth()) break;
        if (format(checkDate, "EEEE") === "Friday") {
          count++;
          if ((count === 3 || count === 4) && isSameDay(checkDate, day)) return true;
        }
      }
      return false;
    }
    default: return false;
  }
};

function CalendarView({ mini, events = [], categories = [] }: { 
  mini?: boolean, 
  events?: any[], 
  categories?: CategoryData[]
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getTaskColor = (catName: string) => {
    const cat = categories.find(c => c.name === catName);
    if (!cat) return "bg-gray-400";
    if (cat.color.includes("pink")) return "bg-pink-500";
    if (cat.color.includes("blue") || cat.color.includes("accent-blue")) return "bg-blue-500";
    if (cat.color.includes("green") || cat.color.includes("emerald")) return "bg-green-500";
    if (cat.color.includes("orange")) return "bg-orange-500";
    if (cat.color.includes("purple")) return "bg-purple-500";
    return "bg-accent-blue";
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h4 className={cn("font-semibold", mini ? "text-[15px]" : "text-lg")}>
          {format(currentMonth, "MMMM yyyy")}
        </h4>
        <div className="flex space-x-1">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft className="w-4 h-4 text-text-secondary" /></button>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight className="w-4 h-4 text-text-secondary" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={`${d}-${i}`} className="text-center text-[11px] font-bold text-text-secondary uppercase">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: (startOfMonth(currentMonth).getDay() + 6) % 7 }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        
        {days.map(day => {
          const dayEvents = events.filter(e => {
            if (e.calendarType === 'task') return isTaskOnDay(e, day);
            if (e.calendarType === 'note' || e.calendarType === 'history') {
              try {
                const d = new Date(e.startDate || e.duedate || e.dateCompleted);
                return !isNaN(d.getTime()) && isSameDay(d, day);
              } catch {
                return false;
              }
            }
            return false;
          });
          
          const dayTasks = dayEvents.filter(e => e.calendarType === 'task');
          const dayNotes = dayEvents.filter(e => e.calendarType === 'note');
          const dayHistory = dayEvents.filter(e => e.calendarType === 'history');
          const isTodayDay = isToday(day);
          
          return (
            <div 
              key={day.toString()} 
              className={cn(
                "aspect-square flex flex-col items-center justify-center rounded-lg relative transition-all group",
                isTodayDay ? "bg-accent-blue text-white" : "hover:bg-gray-50"
              )}
            >
              <span className={cn("text-[13px] font-medium z-10")}>{format(day, "d")}</span>
              
              <div className="flex gap-0.5 mt-1">
                {dayTasks.slice(0, 3).map((t, idx) => (
                  <div 
                    key={`t-${idx}`} 
                    className={cn("w-1 h-1 rounded-full", isTodayDay ? "bg-white" : getTaskColor(t.category))} 
                  />
                ))}
                {dayNotes.length > 0 && (
                  <div className={cn("w-1 h-1 rounded-full", isTodayDay ? "bg-white" : "bg-orange-500")} />
                )}
                {dayHistory.length > 0 && (
                  <div className={cn("w-1 h-1 rounded-full", isTodayDay ? "bg-white" : "bg-green-500")} />
                )}
              </div>

              {/* Tooltip on hover */}
              {!mini && (dayTasks.length > 0 || dayNotes.length > 0 || dayHistory.length > 0) && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white rounded-xl shadow-2xl border border-border-apple p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50">
                  <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2">Schedule</p>
                  <div className="space-y-2">
                    {dayTasks.map(t => (
                      <div key={`tt-${t.id}`} className="flex items-center gap-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full", getTaskColor(t.category))} />
                        <span className="text-[11px] font-medium text-text-primary truncate">{t.title}</span>
                      </div>
                    ))}
                    {dayNotes.map(n => (
                      <div key={`tn-${n.id}`} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        <span className="text-[11px] font-medium text-text-primary truncate">{n.title}</span>
                      </div>
                    ))}
                    {dayHistory.map((h, i) => (
                      <div key={`th-${i}`} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[11px] font-medium text-text-primary truncate">{h.title || 'Completed'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
