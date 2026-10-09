/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  LayoutDashboard, 
  Check,
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
  Globe,
  Library,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isSameMonth, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "./lib/utils";
import { isSupabaseConfigured, signOutSupabase } from "./lib/supabase";
import { officeFetch as fetch } from "./lib/officeApi";
import { loadQualityWorkspace } from "./lib/qualityData";
import { useSharedReferences } from "./lib/useSharedReferences";
import { KnowledgeView, ResourceModal } from "./ReferenceHub";
import { KnowledgeResource, knowledgeResources } from "./portalData";
import { useVisitingFrom } from "./lib/officeVisit";

type Category = "Quality of Service" | "Marketing" | "Locum Doctors" | "TeamARA" | "Collaborations";

interface Subtask {
  text: string;
  completed: boolean;
  completedAt?: string;
}

interface Task {
  id: string;
  title: string;
  category: Category;
  description?: string;
  frequency?: string;
  frequencyDetail?: string;
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
  category?: string;
  completed?: boolean;
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
  subtasks?: string[];
  category?: string;
  source?: "manual" | "tracker";
  readOnly?: boolean;
}

interface CategoryData {
  name: string;
  color: string;
}

interface LeavePeriod {
  start: string;
  end: string;
}

interface StaffSettings {
  email: string;
  name: string;
  offdays: string[];
  leaveperiods: LeavePeriod[];
  updatedat: string;
}

interface UserData {
  email: string;
  fullName: string;
  role: "Superadmin" | "Staff";
  lastLogin?: string;
  status?: string;
  location?: string;
  profilePic?: string;
  officeAccess?: string[];
  homeOffice?: string;
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
  const [staffSettings, setStaffSettings] = useState<StaffSettings[]>([]);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; error: string | null }>({ connected: false, error: null });
  const [isLoading, setIsLoading] = useState(true);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState<string>("Quality of Service");
  const [newTaskFrequency, setNewTaskFrequency] = useState<string>("When Needed");
  const [newTaskFrequencyDetail, setNewTaskFrequencyDetail] = useState<string>("Monday");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteDueDate, setNewNoteDueDate] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<string>("Quality of Service");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
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
  const [editSubtasksText, setEditSubtasksText] = useState("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("bg-blue-100 text-blue-600");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isQuickPickOpen, setIsQuickPickOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayRemarks, setTodayRemarks] = useState<Record<string, string>>({});
  
  const lastDateRef = useRef<string>(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    const todayStr = format(currentTime, "yyyy-MM-dd");
    if (todayStr !== lastDateRef.current) {
      lastDateRef.current = todayStr;
      setSelectedForTodayIds([]);
    }
  }, [currentTime]);

  const getHijriDate = () => {
    try {
      return new Intl.DateTimeFormat('en-u-ca-islamic-uma-nu-latn', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(currentTime);
    } catch (e) {
      return format(currentTime, "d MMMM yyyy");
    }
  };

  const quote = useMemo(() => {
    const quotes = [
      "The best of people are those that are most beneficial to people.",
      "Work for this world as if you will live forever, and for the Hereafter as if you will die tomorrow.",
      "Indeed, with hardship comes ease.",
      "The most beloved of deeds to Allah are those that are most consistent, even if they are small.",
      "O you who have believed, seek help through patience and prayer.",
      "Your wealth and your children are but a trial, and Allah has with Him a great reward.",
      "He who has a thousand friends has not a friend to spare, and he who has one enemy will meet him everywhere.",
      "Patience is the key to paradise.",
      "The tongue is like a lion, if you let it loose, it will wound someone.",
      "A man's worth is proportional to his ambitions."
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }, []);

  const [selectedForTodayIds, setSelectedForTodayIds] = useState<string[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [systemAdminAccount, setSystemAdminAccount] = useState<UserData | null>(null);
  const references = useSharedReferences(knowledgeResources, user?.email, user?.role === "Superadmin", (saved, message) => showNotification(message, saved ? "success" : "error"));
  const [selectedResource, setSelectedResource] = useState<KnowledgeResource | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"admin" | "staff">(() => localStorage.getItem("ara_view_mode") === "staff" ? "staff" : "admin");
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
    const savedUser = localStorage.getItem("araoffice_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed && typeof parsed === "object") {
          setSystemAdminAccount(parsed.role === "Superadmin" ? parsed : null);
          setUser(localStorage.getItem("ara_view_mode") === "staff" ? { ...parsed, role: "Staff" } : parsed);
        }
      } catch (e) {
        console.error("Error parsing saved user:", e);
        localStorage.removeItem("araoffice_user");
      }
    }
    setSessionResolved(true);
  }, []);

  // Quality & Corporate is entered through the AraOffice lobby. Keep one
  // shared session so staff never see a second, legacy sign-in screen here.
  useEffect(() => {
    if (sessionResolved && !user && window.location.hash.startsWith("#office/quality")) {
      window.location.hash = "";
    }
  }, [sessionResolved, user]);

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (activeTab === "Calendar") {
      fetchData(true);
    }
  }, [activeTab]);

  const handleLogout = async () => {
    setUser(null);
    localStorage.removeItem("araoffice_user");
    localStorage.removeItem("ara_portal_session");
    localStorage.removeItem("ara_view_mode");
    await signOutSupabase();
    setActiveTab("Overview");
    window.location.hash = "";
  };

  const switchWorkspaceMode = (mode: "admin" | "staff") => {
    if (!systemAdminAccount) return;
    localStorage.setItem("ara_view_mode", mode);
    setWorkspaceMode(mode);
    setUser(mode === "staff" ? { ...systemAdminAccount, role: "Staff" } : systemAdminAccount);
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

    if (isSupabaseConfigured) {
      try {
        const workspace = await loadQualityWorkspace(false);
        setConnectionStatus({ connected: true, error: null });
        setTasks(workspace.tasks as Task[]);
        setNotes(workspace.notes as Note[]);
        setHistory(workspace.history as HistoryEntry[]);
        setTaskCategories(workspace.categories.filter((category) => category.name !== "General"));
        setPortalLinks(workspace.links as PortalLink[]);
        setStaffSettings(workspace.settings as StaffSettings[]);
        if (user.role === "Superadmin") setAllUsers(workspace.users as UserData[]);
      } catch (error) {
        console.error("Supabase workspace load failed:", error);
        setConnectionStatus({ connected: false, error: "Unable to load workspace data." });
      } finally {
        if (user.role === "Superadmin" && !silent) setIsUsersLoading(false);
        if (!silent) setIsLoading(false);
      }
      return;
    }
    
    setConnectionStatus({ connected: false, error: "Supabase is not configured." });
    setIsLoading(false);
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

  const deleteCategory = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the "${name}" category?`)) return;
    
    // Optimistic update
    setTaskCategories(prev => prev.filter(c => c.name !== name));
    
    try {
      const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      
      // If 404, it might be a hardcoded category that hasn't been saved to sheets yet
      // We don't want to rollback in that case, because the optimistic update already removed it.
      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to delete category");
      }
      
      showNotification("Category deleted successfully");
    } catch (error: any) {
      console.error("Delete category error:", error);
      showNotification(error.message || "Failed to delete category", "error");
      fetchData(); // Rollback on actual error
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
      frequency: newTaskFrequency,
      frequencyDetail: ["Weekly", "Monthly", "2-Monthly", "3-Monthly"].includes(newTaskFrequency) ? newTaskFrequencyDetail : undefined,
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
      const text = isObject ? st.text : st;
      const completed = isObject ? !st.completed : true;
      return {
        text,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined
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

  const isStaffMemberOnLeave = (staffEmail: string, date: Date) => {
    const staff = staffSettings.find(s => s.email?.toLowerCase() === staffEmail?.toLowerCase());
    if (!staff) return false;
    
    // Check recurring off-days
    const dayName = format(date, "EEEE");
    if (staff.offdays && Array.isArray(staff.offdays) && staff.offdays.includes(dayName)) return true;
    
    // Check specific leave periods
    if (staff.leaveperiods && Array.isArray(staff.leaveperiods)) {
      try {
        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return staff.leaveperiods.some(period => {
          if (!period.start || !period.end) return false;
          const start = new Date(period.start);
          const end = new Date(period.end);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
          
          const sDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          const eDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          return checkDate >= sDate && checkDate <= eDate;
        });
      } catch (e) {
        console.error("Error checking leave periods:", e);
      }
    }
    return false;
  };

  const getCalendarEvents = (tasks: Task[], notes: Note[], history: HistoryEntry[]) => {
    const events: any[] = [];
    
    // Add leave events for all staff - expanding ranges to daily events
    staffSettings.forEach(staff => {
      if (staff.leaveperiods && Array.isArray(staff.leaveperiods)) {
        staff.leaveperiods.forEach(p => {
          if (!p.start || !p.end) return;
          try {
            const start = new Date(p.start);
            const end = new Date(p.end);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
            
            const intervalDays = eachDayOfInterval({ 
              start: new Date(start.getFullYear(), start.getMonth(), start.getDate()), 
              end: new Date(end.getFullYear(), end.getMonth(), end.getDate()) 
            });
            
            intervalDays.forEach(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              events.push({
                id: `leave-${staff.email}-${dateStr}`,
                title: `OFF: ${staff.name.split(' ')[0]}`,
                category: "Leave" as Category,
                calendarType: 'history',
                dateCompleted: dateStr,
                isLeave: true,
                staffName: staff.name
              });
            });
          } catch (e) {
            console.error("Error expanding leave period:", e);
          }
        });
      }
    });

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
      duedate: newNoteDueDate,
      category: newNoteCategory,
      completed: false
    };

    try {
      if (editingNote) {
        const res = await fetch(`/api/notes?id=${editingNote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newNoteData),
        });
        
        if (!res.ok) throw new Error("Failed to update note");
        
        setNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, ...newNoteData, updatedAt: new Date().toISOString() } : n));
        showNotification("Note updated successfully");
      } else {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newNoteData),
        });
        
        if (!res.ok) throw new Error("Failed to save note");
        
        const savedNote = await res.json();
        setNotes(prev => [savedNote, ...prev]);
        showNotification("Note saved successfully");
      }

      setNewNoteTitle("");
      setNewNoteContent("");
      setNewNoteDueDate("");
      setIsAddingNote(false);
      setEditingNote(null);
    } catch (error: any) {
      console.error("Save note error:", error);
      showNotification(error.message || "Failed to save note", "error");
    } finally {
      setIsSavingNote(false);
    }
  };

  const openNoteEdit = (note: Note) => {
    setEditingNote(note);
    setNewNoteTitle(note.title);
    setNewNoteContent(note.content);
    setNewNoteDueDate(note.duedate || "");
    setNewNoteCategory(note.category || "Quality of Service");
    setIsAddingNote(true);
    // Scroll to form if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateNoteStatus = async (id: string, completed: boolean) => {
    try {
      const note = notes.find(n => n.id === id);
      
      await fetch(`/api/notes?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });

      // If marking as completed, also add to history so it shows up in history/tracker
      if (completed && note) {
        try {
          await fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: note.id,
              title: note.title,
              remarks: "Note Completed",
              dateCompleted: new Date().toISOString()
            })
          });
          // Refresh data to show new history entry
          fetchData(true);
        } catch (historyError) {
          console.error("Failed to add note to history:", historyError);
        }
      }

      setNotes(notes.map(n => n.id === id ? { ...n, completed } : n));
      showNotification(`Note marked as ${completed ? "completed" : "pending"}`);
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

  const isTaskDueToday = (task: Task) => isTaskOnDay(task, currentTime);
    
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
    const taskRemark = todayRemarks[task.id] || "";

    // Collect the subtasks that are ticked (completed today) so they can be
    // recorded in the history alongside DONE + remarks.
    const tickedSubtasks = (task.subtasks || [])
      .filter(st => {
        if (typeof st === 'string') return false;
        if (!st.completed) return false;
        if (!st.completedAt) return true;
        try { return isSameDay(new Date(st.completedAt), currentTime); }
        catch (e) { return true; }
      })
      .map(st => (typeof st === 'string' ? st : st.text));

    const optimisticEntry = {
      taskId: task.id,
      title: task.title,
      dateCompleted: now.toISOString(),
      remarks: taskRemark,
      subtasks: tickedSubtasks
    };

    // Optimistic update
    setHistory([optimisticEntry, ...history]);
    setTodayRemarks(prev => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });

    setIsSyncing(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          title: task.title,
          remarks: taskRemark,
          subtasks: tickedSubtasks
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

    // Parse the free-text subtasks box into subtasks, preserving the
    // completed / completedAt state of any subtask whose text is unchanged.
    const prevSubtasks = editingTask.subtasks || [];
    const parsedSubtasks = editSubtasksText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(text => {
        const existing = prevSubtasks.find(st => (typeof st === 'string' ? st : st.text) === text);
        return existing !== undefined ? existing : text;
      });

    const taskToSave = { ...editingTask, subtasks: parsedSubtasks };

    try {
      await fetch(`/api/tasks?id=${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskToSave),
      });
      setTasks(tasks.map(t => t.id === editingTask.id ? taskToSave : t));
      setIsEditModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Update task error:", error);
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask({ ...task });
    setEditSubtasksText((task.subtasks || []).map(st => typeof st === 'string' ? st : st.text).join("\n"));
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

  const todayTasks = useMemo(() => {
    return tasks.filter(t => 
      isTaskDueToday(t) || 
      selectedForTodayIds.includes(t.id) ||
      history.some(h => {
        try {
          const d = new Date(h.dateCompleted);
          return h.taskId === t.id && isSameDay(d, currentTime);
        } catch (e) { return false; }
      })
    );
  }, [tasks, history, currentTime, isTaskDueToday, selectedForTodayIds]);

  const todayNotes = notes.filter(n => n.duedate && isSameDay(new Date(n.duedate), currentTime));
  
  const combinedTodayItems = [
    ...todayTasks.map(t => ({ ...t, type: 'task' as const })),
    ...todayNotes.map(n => ({ ...n, type: 'note' as const, id: n.id, title: n.title, category: n.category || '' }))
  ];

  const remainingTodayItems = combinedTodayItems.filter(item => {
    if (item.type === 'task') {
      return !isTaskCompletedForCycle(item as Task, history, currentTime);
    }
    return !item.completed;
  });

  const dynamicCategories = useMemo(() => {
    const categoriesFromTasks = Array.from(new Set(tasks.map(t => t.category))).filter((cat: any): cat is string => !!cat && typeof cat === 'string' && cat !== "General" && cat.trim() !== "");
    const categoriesFromNotes = Array.from(new Set(notes.map(n => n.category))).filter((cat: any): cat is string => !!cat && typeof cat === 'string' && cat !== "General" && cat.trim() !== "");
    const allUsedCategories = Array.from(new Set([...categoriesFromTasks, ...categoriesFromNotes]));
    
    // Use taskCategories as the source of truth for categories that should exist
    // Plus any used categories in case they were orphaned
    const mergedCategories = Array.from(new Set([
      ...taskCategories.map(c => c.name), 
      ...allUsedCategories
    ])).filter(cat => cat !== "General");
    
    return mergedCategories.map(cat => {
      const original = taskCategories.find(c => c.name === cat) || INITIAL_CATEGORIES.find(c => c.name === cat);
      return {
        name: cat,
        color: original ? original.color : "bg-blue-100 text-blue-600"
      };
    });
  }, [tasks, notes, taskCategories]);

  const staffOnLeaveToday = useMemo(() => {
    return staffSettings.filter(s => isStaffMemberOnLeave(s.email, currentTime));
  }, [staffSettings, currentTime]);

  const departmentLoad = dynamicCategories.map(cat => {
    // For "ALL tasks" including "When Necessary", we look at all tasks in category
    const categoryTasks = tasks.filter(t => t.category === cat.name);
    const categoryNotes = notes.filter(n => n.category === cat.name);
    
    // Tasks due today or "When Needed" tasks that are pending
    const tasksDueToday = categoryTasks.filter(t => isTaskDueToday(t));
    const notesDueToday = categoryNotes.filter(n => n.duedate && isSameDay(new Date(n.duedate), currentTime));
    
    // Tasks completed today (from history)
    const tasksCompletedToday = categoryTasks.filter(t => 
      history.some(h => h.taskId === t.id && isSameDay(new Date(h.dateCompleted), currentTime))
    );
    
    // Notes completed (from note status)
    const notesCompletedToday = categoryNotes.filter(n => n.completed && n.duedate && isSameDay(new Date(n.duedate), currentTime));

    const total = Math.max(tasksDueToday.length + notesDueToday.length, tasksCompletedToday.length + notesCompletedToday.length);
    const completed = tasksCompletedToday.length + notesCompletedToday.length;
    
    if (cat.name === "General") return null;

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

  const totalCompletedToday = history.filter(h => isSameDay(new Date(h.dateCompleted), currentTime)).length;
  const totalNotesCompletedToday = todayNotes.filter(n => n.completed).length;
  const totalCompletedTodayCount = totalCompletedToday + totalNotesCompletedToday;
  const totalItemsTodayCount = todayTasks.length + todayNotes.length;

  const completionRate = (totalItemsTodayCount > 0 || totalCompletedTodayCount > 0)
    ? Math.round((totalCompletedTodayCount / Math.max(totalItemsTodayCount, totalCompletedTodayCount)) * 100) 
    : 0;

  const upcomingDeadlines = remainingTodayItems.length;
  const trackerHistory = history.filter(entry => entry.source === "tracker");
  const recordedWorkdays = new Set(trackerHistory.map(entry => String(entry.dateCompleted).slice(0, 10))).size;
  const latestRecordedDate = history[0]?.dateCompleted ? new Date(history[0].dateCompleted) : null;
  const visitor = useVisitingFrom("quality");
  const latestRecordedKey = history[0]?.dateCompleted ? String(history[0].dateCompleted).slice(0, 10) : "";
  const latestDayActivity = latestRecordedKey
    ? history.filter(entry => String(entry.dateCompleted).slice(0, 10) === latestRecordedKey)
    : [];
  const thisMonthActivity = history.filter(entry => {
    const date = new Date(entry.dateCompleted);
    return !isNaN(date.getTime()) && isSameMonth(date, currentTime);
  }).length;
  const latestWorkstreams = Array.from(new Set(latestDayActivity.map(entry => entry.category).filter(Boolean)));

  // The lobby owns authentication for every office. If a user navigates
  // directly to this office without a session, return to that single sign-in.
  if (!sessionResolved || !user) return null;

  return (
    <div className="quality-office-shell flex min-h-screen bg-[#f7fafc] text-text-primary font-sans overflow-x-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] bg-[#083a55] text-white border-0 flex flex-col px-4 py-8">
        <div className="px-4 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0b587b] rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold tracking-tight leading-tight">AraOffice</h1>
              <p className="text-[11px] text-[#70d8fa] font-bold uppercase tracking-[0.18em]">Quality & Corporate</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-1 px-2">
          {[
            { id: "Overview", icon: LayoutDashboard, roles: ["Superadmin", "Staff"] },
            { id: "All Tasks", icon: CheckSquare, roles: ["Superadmin", "Staff"] },
            { id: "Notes", icon: StickyNote, roles: ["Superadmin", "Staff"] },
            { id: "History", icon: Clock, roles: ["Superadmin", "Staff"] },
            { id: "Portal", icon: Globe, roles: ["Superadmin", "Staff"] },
            { id: "Reference", icon: Library, roles: ["Superadmin", "Staff"] },
          ].filter(item => item.roles.includes(user?.role || "Staff")).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center px-4 py-3 text-[14px] font-bold rounded-apple-sm transition-all duration-200 group",
                activeTab === item.id 
                  ? "bg-white text-[#162a43] shadow-lg shadow-black/10" 
                  : "text-[#b8cddd] hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 mr-3 transition-colors",
                activeTab === item.id ? "text-[#7357ff]" : "text-[#b8cddd] group-hover:text-white"
              )} />
              {item.id}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-2 space-y-4">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-[14px] font-bold rounded-apple-sm text-[#ff9eae] hover:bg-white/10 transition-all"
          >
            <CloudOff className="w-5 h-5 mr-3" />
            Sign Out
          </button>

        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        {systemAdminAccount && (
          <section className="flex flex-col gap-3 rounded-[20px] border border-[#dce4ed] bg-white px-5 py-4 shadow-[0_10px_30px_rgba(21,53,72,0.05)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b9aca]">System Admin preview</p>
              <p className="mt-1 text-[13px] font-semibold text-[#29465a]">
                {workspaceMode === "admin" ? "Administrator controls are enabled" : "Viewing Quality & Corporate as staff"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-[#f1f5f7] p-1 ring-1 ring-[#dce4ed]">
                <button type="button" onClick={() => switchWorkspaceMode("admin")} className={cn("rounded-lg px-4 py-2 text-xs font-bold transition", workspaceMode === "admin" ? "bg-[#0b587b] text-white shadow-sm" : "text-slate-500 hover:text-[#0b587b]")}>Admin View</button>
                <button type="button" onClick={() => switchWorkspaceMode("staff")} className={cn("rounded-lg px-4 py-2 text-xs font-bold transition", workspaceMode === "staff" ? "bg-[#0b587b] text-white shadow-sm" : "text-slate-500 hover:text-[#0b587b]")}>Staff View</button>
              </div>
              <button type="button" onClick={() => { localStorage.removeItem("ara_view_mode"); window.location.hash = "#office/admin"; }} className="rounded-xl border border-[#dce4ed] bg-white px-4 py-2.5 text-xs font-bold text-[#0b587b] transition hover:border-[#0b587b]/30 hover:bg-[#f7fafb]">Control Centre</button>
            </div>
          </section>
        )}
        {connectionStatus.error && (
          <div role="alert" className="rounded-xl bg-red-50 px-5 py-4 text-sm text-red-800 flex items-center justify-between gap-4">
            <span>Workspace data could not be loaded. Your saved records have not been deleted.</span>
            <button type="button" onClick={() => fetchData()} className="font-semibold">Try again</button>
          </div>
        )}
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{activeTab}</h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden lg:flex flex-col items-end gap-0.5 border-r border-border-apple/40 pr-4 mr-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-text-primary tracking-tight">
                  {format(currentTime, "EEEE, d MMM yyyy")}
                </span>
                <span className="text-[11px] font-bold text-accent-blue bg-accent-blue/5 px-2 py-0.5 rounded-lg uppercase tracking-tight">
                  {getHijriDate()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-mono font-bold text-text-primary tabular-nums tracking-tighter">
                  {format(currentTime, "HH:mm:ss")}
                </span>
                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest bg-gray-100 px-1.5 py-0.5 rounded">
                  GMT+8 (KL)
                </span>
              </div>
              <p className="text-[10px] text-text-secondary italic font-medium mt-1 opacity-80 max-w-[350px] text-right">
                "{quote}"
              </p>
            </div>
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
                <section className="relative overflow-hidden rounded-[28px] bg-[#0b405c] px-8 py-8 text-white shadow-[0_22px_60px_rgba(11,64,92,0.18)]">
                  <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[#1a6a8d]/50 blur-3xl" />
                  <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#79d6f7]">Quality &amp; Corporate Office</p>
                      <h2 className="text-[38px] font-semibold leading-tight tracking-[-0.035em]">
                        {visitor ? `Welcome, ${visitor}.` : `Welcome back, ${user?.fullName?.split(' ')[0]}.`}
                      </h2>
                      <p className="mt-3 max-w-xl text-[15px] leading-6 text-white/70">
                        {visitor ? "This is the Quality & Corporate page." : "A clear view of today’s priorities and the work already recorded by your team."}
                      </p>
                    </div>
                    <div className="min-w-[230px] rounded-[20px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Latest record</p>
                      <p className="mt-2 text-[18px] font-semibold tracking-tight">
                        {latestRecordedDate && !isNaN(latestRecordedDate.getTime()) ? format(latestRecordedDate, "d MMMM yyyy") : "No activity yet"}
                      </p>
                      <p className="mt-1 text-[12px] text-white/60">{latestDayActivity.length} completed activities</p>
                    </div>
                  </div>
                </section>

                <section className="overflow-hidden rounded-[24px] border border-[#e3e9ed] bg-white shadow-[0_14px_40px_rgba(21,53,72,0.055)]">
                  <div className="grid grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: "Recorded workdays", value: recordedWorkdays, detail: "From daily tracker" },
                      { label: "Activity this month", value: thisMonthActivity, detail: "Completed items" },
                      { label: "Task library", value: tasks.length, detail: "Active references" },
                      { label: "Today’s queue", value: upcomingDeadlines, detail: `${completionRate}% complete` },
                    ].map((stat, index) => (
                      <div key={stat.label} className={cn("px-7 py-6", index > 0 && "border-l border-[#edf1f3]", index > 1 && "border-t lg:border-t-0")}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8192a0]">{stat.label}</p>
                        <p className="mt-3 text-[31px] font-semibold tracking-[-0.04em] text-[#102b3d]">{stat.value}</p>
                        <p className="mt-1 text-[12px] text-[#7b8d9a]">{stat.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[24px] border border-[#e3e9ed] bg-white p-7 shadow-[0_14px_40px_rgba(21,53,72,0.045)]">
                    <div className="mb-6 flex items-end justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1b8bb6]">Latest activity</p>
                        <h3 className="mt-1 text-[21px] font-semibold tracking-tight text-[#102b3d]">
                          {latestRecordedDate && !isNaN(latestRecordedDate.getTime()) ? format(latestRecordedDate, "EEEE, d MMMM") : "No record available"}
                        </h3>
                      </div>
                      <button onClick={() => setActiveTab("History")} className="text-[12px] font-semibold text-[#0b587b] hover:text-[#063a51]">View history</button>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                      {latestDayActivity.slice(0, 8).map((entry, index) => (
                        <div key={`${entry.taskId}-${index}`} className="flex min-h-[54px] items-center gap-3 border-t border-[#edf1f3] py-3.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e9f7f1]">
                            <CheckCircle2 className="h-4 w-4 text-[#159468]" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#183348]">{entry.title}</p>
                            <p className="truncate text-[11px] text-[#8595a1]">{entry.remarks || entry.category || "Completed"}</p>
                          </div>
                        </div>
                      ))}
                      {latestDayActivity.length === 0 && <p className="py-8 text-sm text-[#80919d]">No completed activities have been recorded.</p>}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-[#e3e9ed] bg-[#f3f8fa] p-7">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#728895]">Workstreams recorded</p>
                    <div className="mt-5 space-y-3">
                      {latestWorkstreams.map(workstream => {
                        const count = latestDayActivity.filter(entry => entry.category === workstream).length;
                        return (
                          <div key={workstream} className="flex items-center justify-between rounded-[14px] bg-white px-4 py-3 shadow-[0_5px_16px_rgba(18,51,70,0.04)]">
                            <span className="text-[13px] font-semibold text-[#183348]">{workstream}</span>
                            <span className="text-[12px] font-semibold tabular-nums text-[#0b587b]">{count}</span>
                          </div>
                        );
                      })}
                      {latestWorkstreams.length === 0 && <p className="text-sm text-[#80919d]">No workstreams recorded yet.</p>}
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-6 flex-grow">
                  {/* Today's Focus Card */}
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center px-2">
                      <div className="flex flex-col">
                        <h4 className="text-[18px] font-bold tracking-tight">Today's Focus</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-text-secondary">{remainingTodayItems.length} items remaining</span>
                          {user && isStaffMemberOnLeave(user.email, currentTime) && (
                            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              You are on Leave Today
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 relative">
                        {isQuickPickOpen && (
                          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-border-apple rounded-2xl shadow-2xl z-50 p-4 animate-in fade-in slide-in-from-top-2">
                            <h6 className="text-[12px] font-bold text-text-secondary uppercase tracking-widest mb-3 px-2">Pick Other Task</h6>
                            <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
                              {tasks
                                .filter(t => !isTaskDueToday(t) && !selectedForTodayIds.includes(t.id))
                                .filter(t => !history.some(h => h.taskId === t.id && isSameDay(new Date(h.dateCompleted), currentTime)))
                                .map(task => (
                                  <button
                                    key={task.id}
                                    onClick={() => {
                                      setSelectedForTodayIds(prev => [...prev, task.id]);
                                      setIsQuickPickOpen(false);
                                    }}
                                    className="w-full text-left p-3 rounded-xl hover:bg-blue-50 transition-colors flex flex-col"
                                  >
                                    <span className="text-[13px] font-bold text-text-primary">{task.title}</span>
                                    <span className="text-[10px] text-text-secondary font-medium">{task.category} • {task.frequency}</span>
                                  </button>
                                ))}
                              {tasks.filter(t => !isTaskDueToday(t)).length === 0 && (
                                <p className="text-[12px] text-text-secondary text-center py-4">No other tasks to pick from.</p>
                              )}
                            </div>
                          </div>
                        )}
                        <button 
                          onClick={() => setIsQuickPickOpen(!isQuickPickOpen)} 
                          className="bg-white border border-border-apple text-text-primary px-4 py-2 rounded-xl text-[13px] font-bold hover:bg-gray-50 transition-all shadow-apple flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Add Task
                        </button>
                        {user?.role === "Superadmin" && (
                          <button 
                            onClick={() => setActiveTab("All Tasks")} 
                            className="bg-accent-blue text-white px-4 py-2 rounded-xl text-[13px] font-bold hover:bg-[#0077ED] transition-all shadow-lg shadow-accent-blue/20 flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            Manage
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="overflow-hidden rounded-[20px] border border-[#e2e9ed] bg-white shadow-[0_12px_34px_rgba(21,53,72,0.045)] divide-y divide-[#edf1f3]">
                      {remainingTodayItems.map((item) => (
                        <div key={`${item.type}-${item.id}`} className="group px-4 py-3.5 transition-colors hover:bg-[#fbfcfd]">
                          <div className="grid items-center gap-3 sm:grid-cols-[28px_minmax(220px,1fr)] xl:grid-cols-[28px_minmax(260px,1fr)_minmax(220px,0.75fr)_32px]">
                            <button
                              onClick={() => {
                                if (item.type === 'task') {
                                  completeTaskForToday(item as Task);
                                } else {
                                  const note = item as Note;
                                  updateNoteStatus(note.id, true);
                                }
                              }}
                              aria-label={`Complete ${item.title}`}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-[#cfdbe1] bg-white transition-all hover:border-[#0b82ad] hover:bg-[#edf8fc] group/tick"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-transparent group-hover/tick:text-[#0b82ad]/40" />
                            </button>

                            <div className="min-w-0">
                              <h5 className="truncate text-[14px] font-semibold tracking-tight text-[#183348]">{item.title}</h5>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
                                <span className={item.type === 'note' ? 'text-orange-600' : 'text-[#1b82a9]'}>{item.category || (item.type === 'note' ? 'Note' : '')}</span>
                                <span className="h-1 w-1 rounded-full bg-[#c7d3d9]" />
                                <span className="text-[#82939e]">{item.type === 'task' ? formatTaskSchedule(item as Task) : 'Note'}</span>
                              </div>
                            </div>

                            {item.type === 'task' ? (
                              <div className="col-span-2 sm:col-start-2 xl:col-span-1 xl:col-start-auto">
                                <input
                                  value={todayRemarks[item.id] || ""}
                                  onChange={(e) => setTodayRemarks(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  placeholder="Add remarks…"
                                  aria-label={`Remarks for ${item.title}`}
                                  className="h-9 w-full rounded-[10px] border border-[#e0e7eb] bg-[#f7f9fa] px-3 text-[12px] text-[#365064] outline-none transition focus:border-[#91cde2] focus:bg-white focus:ring-2 focus:ring-[#0b82ad]/8"
                                />
                              </div>
                            ) : <div className="hidden xl:block" />}

                            {item.type === 'task' && user?.role === "Superadmin" ? (
                              <button 
                                onClick={() => openEditModal(item as Task)}
                                aria-label={`Edit ${item.title}`}
                                className="hidden h-8 w-8 items-center justify-center rounded-lg text-[#81929e] transition hover:bg-[#edf3f5] hover:text-[#183348] xl:flex"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            ) : <div className="hidden xl:block" />}
                          </div>
                          
                          {item.type === 'task' && (item as Task).subtasks && (item as Task).subtasks.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5 pl-0 sm:pl-10">
                              {(item as Task).subtasks.map((st, idx) => {
                                const isObj = typeof st !== 'string';
                                const text = isObj ? st.text : st;
                                let completed = false;
                                if (isObj && st.completed) {
                                  if (st.completedAt) {
                                    try {
                                      completed = isSameDay(new Date(st.completedAt), currentTime);
                                    } catch (e) {
                                      completed = false;
                                    }
                                  } else {
                                    completed = true;
                                  }
                                }
                                
                                return (
                                  <button 
                                    key={idx} 
                                    onClick={() => toggleSubtask(item.id, idx)}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[10px] font-medium transition",
                                      completed ? "border-[#b9dfd0] bg-[#eff9f5] text-[#4d7f6b] line-through" : "border-[#dce5e9] bg-white text-[#607684] hover:border-[#9fcddd]"
                                    )}
                                  >
                                    <div className={cn(
                                      "flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-all",
                                      completed 
                                        ? "border-[#159468] bg-[#159468]"
                                        : "border-[#aebdc5]"
                                    )}>
                                      {completed && <Check className="h-2.5 w-2.5 text-white" />}
                                    </div>
                                    <span>{text}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                      {remainingTodayItems.length === 0 && (
                        <div className="flex items-center justify-center gap-3 bg-[#f8fafb] px-5 py-8 text-center">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                            <Zap className="h-4 w-4 text-[#7f9ba9]" />
                          </div>
                          <div className="text-left"><p className="text-[13px] font-semibold text-[#183348]">Queue clear</p><p className="text-[11px] text-[#82939e]">You're all caught up for today.</p></div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </>
            )}


            {activeTab === "All Tasks" && user?.role !== "Superadmin" && (
              <section className="flex flex-col gap-6">
                <div className="rounded-[28px] bg-[#0b405c] px-8 py-8 text-white shadow-[0_20px_55px_rgba(11,64,92,0.16)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#79d6f7]">Task library</p>
                  <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                      <h2 className="text-[34px] font-semibold tracking-[-0.035em]">Work, clearly organised.</h2>
                      <p className="mt-2 text-[14px] text-white/65">{tasks.length} recurring responsibilities across {dynamicCategories.length} workstreams.</p>
                    </div>
                    <div className="rounded-[16px] border border-white/15 bg-white/10 px-5 py-3 text-right">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Current view</p>
                      <p className="mt-1 text-[14px] font-semibold">{selectedCategory === "All" ? "All workstreams" : selectedCategory}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["All", ...dynamicCategories.map(category => category.name)].map(category => (
                    <button key={category} onClick={() => setSelectedCategory(category)} className={cn(
                      "rounded-full px-4 py-2 text-[12px] font-semibold transition-colors",
                      selectedCategory === category ? "bg-[#123f58] text-white" : "bg-white text-[#617684] hover:bg-[#edf4f7]"
                    )}>{category}</button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-[24px] border border-[#e3e9ed] bg-white shadow-[0_14px_40px_rgba(21,53,72,0.045)]">
                  {tasks
                    .filter(task => selectedCategory === "All" || task.category === selectedCategory)
                    .filter(task => `${task.title} ${task.category}`.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((task, index) => (
                    <article key={task.id} className={cn("grid gap-4 px-7 py-5 md:grid-cols-[1fr_190px] md:items-center", index > 0 && "border-t border-[#edf1f3]")}>
                      <div>
                        <p className="text-[15px] font-semibold tracking-tight text-[#183348]">{task.title}</p>
                      </div>
                      <div className="md:text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#1b82a9]">{task.category}</p>
                        <p className="mt-1 text-[12px] text-[#8495a0]">{formatTaskSchedule(task)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {activeTab === "All Tasks" && user?.role === "Superadmin" && (
              <div className="flex flex-col gap-6">
                <div className="rounded-[28px] bg-[#0b405c] px-8 py-8 text-white shadow-[0_20px_55px_rgba(11,64,92,0.16)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#79d6f7]">Task library</p>
                  <div className="mt-2 flex items-end justify-between gap-6">
                    <div>
                      <h2 className="text-[34px] font-semibold tracking-[-0.035em]">A quieter way to manage work.</h2>
                      <p className="mt-2 text-[14px] text-white/65">Review responsibilities, cadence and guidance in one place.</p>
                    </div>
                    <div className="hidden rounded-[16px] border border-white/15 bg-white/10 px-5 py-3 text-right md:block">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Task library</p>
                      <p className="mt-1 text-[22px] font-semibold">{tasks.length}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[24px] shadow-[0_14px_40px_rgba(21,53,72,0.045)] border border-[#e3e9ed]">
                  <div className="mb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1b82a9]">Create</p>
                    <h4 className="mt-1 text-[20px] font-semibold tracking-tight">Add a new responsibility</h4>
                  </div>
                  <form onSubmit={addTask} className="grid grid-cols-1 md:grid-cols-[1fr_200px_200px_160px] gap-4">
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
                        {dynamicCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Frequency</label>
                      <select 
                        value={newTaskFrequency}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewTaskFrequency(val);
                          if (val === "Weekly") {
                            setNewTaskFrequencyDetail("Monday");
                          } else if (["Monthly", "2-Monthly", "3-Monthly"].includes(val)) {
                            setNewTaskFrequencyDetail("1");
                          } else {
                            setNewTaskFrequencyDetail("");
                          }
                        }}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Twice Weekly">Twice Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="2-Monthly">2-Monthly</option>
                        <option value="3-Monthly">3-Monthly</option>
                        <option value="When Needed">When Needed</option>
                        <option value="Upon Suggestion">Upon Suggestion</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full bg-accent-blue text-white px-6 py-3 rounded-xl shadow-lg shadow-accent-blue/20 hover:bg-[#0077ED] transition-all font-bold text-sm">
                        Add Task
                      </button>
                    </div>
                  </form>

                  {/* Conditional frequency sub-options for creating */}
                  {newTaskFrequency === "Weekly" && (
                    <div className="flex flex-col gap-1.5 mt-4 max-w-xs">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Select Day</label>
                      <select 
                        value={newTaskFrequencyDetail || "Monday"}
                        onChange={(e) => setNewTaskFrequencyDetail(e.target.value)}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {["Monthly", "2-Monthly", "3-Monthly"].includes(newTaskFrequency) && (
                    <div className="flex flex-col gap-1.5 mt-4 max-w-xs">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Due Day Each Cycle</label>
                      <select 
                        value={newTaskFrequencyDetail || "1"}
                        onChange={(e) => setNewTaskFrequencyDetail(e.target.value)}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(date => (
                          <option key={date} value={date.toString()}>Date {date}</option>
                        ))}
                      </select>
                      <p className="ml-1 text-[11px] leading-4 text-[#82939e]">Appears on this day, moves to the next working day when it falls on a weekend, and remains visible until completed. An earlier completion in the same cycle is recognised.</p>
                    </div>
                  )}
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
                  {dynamicCategories.map((cat) => (
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
                        className="bg-white p-6 rounded-[20px] shadow-[0_10px_32px_rgba(21,53,72,0.045)] border border-[#e3e9ed] hover:border-[#c9d8df] hover:shadow-[0_16px_38px_rgba(21,53,72,0.075)] transition-all duration-300 flex flex-col"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#167ca2]">
                                {task.category}
                              </span>
                              {task.frequency && (
                                <span className="border-l border-[#dce5e9] pl-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#82939e] flex items-center gap-1">
                                  {formatTaskSchedule(task)}
                                </span>
                              )}
                            </div>
                            <h5 className="text-[17px] font-semibold tracking-tight text-[#183348] leading-tight">{task.title}</h5>
                            <p className="text-[11px] text-[#8a9aa5] mt-1 font-medium">Added {format(new Date(task.createdAt), "d MMM yyyy")}</p>
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
                              const text = typeof st === 'string' ? st : st.text;
                              return (
                                <div key={idx} className="flex items-center gap-3">
                                  <div className="w-4 h-4 rounded-full border border-border-apple/60 flex items-center justify-center" />
                                  <span className="text-[13px] font-medium leading-tight text-text-secondary">
                                    {text}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        <div className="bg-[#f5f8f9] rounded-[14px] p-4 flex-grow">
                          <p className="text-[10px] font-semibold text-[#8495a0] uppercase tracking-[0.14em] mb-2">Guidance</p>
                          <p className="text-[13px] text-[#536b7a] leading-relaxed">
                            {task.description || "No additional guidance recorded."}
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
                  today={currentTime}
                  staffSettings={staffSettings}
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


            {activeTab === "Reference" && (
              <KnowledgeView
                initialSearch=""
                readResources={[]}
                onOpen={setSelectedResource}
                resources={references.resources}
                canEdit={user?.role === "Superadmin"}
                onUpdateResource={references.update}
                onCommit={references.saveNow}
                onSyncDrive={references.syncDrive}
                syncing={references.syncing}
              />
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
                      <h5 className="text-[16px] font-bold mb-6">{editingNote ? "Edit Note" : "Create Reminder"}</h5>
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
                          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Category</label>
                          <select 
                            value={newNoteCategory}
                            onChange={(e) => setNewNoteCategory(e.target.value)}
                            className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
                          >
                            {dynamicCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                          </select>
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
                            onClick={() => {
                              setIsAddingNote(false);
                              setEditingNote(null);
                              setNewNoteTitle("");
                              setNewNoteContent("");
                              setNewNoteDueDate("");
                            }}
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
                            ) : (editingNote ? "Update Note" : "Save Note")}
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
                                    onClick={() => updateNoteStatus(note.id, !note.completed)}
                                    className={cn(
                                      "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                      note.completed 
                                        ? "bg-green-50 text-green-600 hover:bg-green-100" 
                                        : "bg-[#F8F9FA] text-text-secondary hover:bg-green-50 hover:text-green-600"
                                    )}
                                    title={note.completed ? "Mark as Pending" : "Mark as Done"}
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => openNoteEdit(note)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F8F9FA] text-text-secondary hover:bg-blue-50 hover:text-accent-blue transition-all"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
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

      {selectedResource && (
        <ResourceModal resource={selectedResource} isRead={false} onClose={() => setSelectedResource(null)} onMarkRead={() => {}} />
      )}

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
                          onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value as Category })}
                          className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                        >
                          {dynamicCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Frequency</label>
                      <select 
                        value={editingTask.frequency}
                        onChange={(e) => setEditingTask({ ...editingTask, frequency: e.target.value })}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Twice Weekly">Twice Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="2-Monthly">2-Monthly</option>
                        <option value="3-Monthly">3-Monthly</option>
                        <option value="When Needed">When Needed</option>
                        <option value="Upon Suggestion">Upon Suggestion</option>
                      </select>
                    </div>
                  </div>

                  {/* Conditional frequency sub-options */}
                  {editingTask.frequency === "Weekly" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Select Day</label>
                      <select 
                        value={editingTask.frequencyDetail || "Monday"}
                        onChange={(e) => setEditingTask({ ...editingTask, frequencyDetail: e.target.value })}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {["Monthly", "2-Monthly", "3-Monthly"].includes(editingTask.frequency || "") && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Due Day Each Cycle</label>
                      <select 
                        value={editingTask.frequencyDetail || "1"}
                        onChange={(e) => setEditingTask({ ...editingTask, frequencyDetail: e.target.value })}
                        className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all appearance-none"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(date => (
                          <option key={date} value={date.toString()}>Date {date}</option>
                        ))}
                      </select>
                      <p className="ml-1 text-[11px] leading-4 text-[#82939e]">Appears on this day, moves to the next working day when it falls on a weekend, and remains visible until completed. An earlier completion in the same cycle is recognised.</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Subtasks (one per line)</label>
                    <textarea 
                      value={editSubtasksText}
                      onChange={(e) => setEditSubtasksText(e.target.value)}
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

                  {/* List of existing custom categories to allow deletion */}
                  <div className="mt-8 pt-6 border-t border-border-apple/50">
                    <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 ml-1">Existing Categories</h4>
                    <div className="max-h-[200px] overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar">
                      {taskCategories.filter(cat => cat.name !== "General").map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between p-3 rounded-xl bg-[#F8F9FA] group transition-all border border-transparent hover:border-border-apple/30">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-3 h-3 rounded-full", cat.color.split(' ')[0])} />
                            <span className="text-[13px] font-medium">{cat.name}</span>
                          </div>
                          <button 
                            onClick={() => deleteCategory(cat.name)}
                            className="p-1.5 rounded-lg text-text-secondary hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {taskCategories.filter(cat => cat.name !== "General").length === 0 && (
                        <p className="text-[11px] text-text-secondary italic text-center py-4 bg-[#F8F9FA] rounded-xl border border-dashed border-border-apple/50">
                          No custom categories yet.
                        </p>
                      )}
                    </div>
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

const OFFICE_ACCESS_OPTIONS = [
  { id: 'ceo', label: 'CEO' }, { id: 'coo', label: 'COO' }, { id: 'procurement', label: 'Procurement' },
  { id: 'finance', label: 'Finance' }, { id: 'hr', label: 'Human Resources' }, { id: 'quality', label: 'Quality & Corporate' },
  { id: 'clinical', label: 'Clinical Administration' }, { id: 'ca', label: 'Clinical Assistants' },
];

type UserUpdate = { fullName?: string; newEmail?: string; password?: string; officeAccess?: string[]; homeOffice?: string };
// The account's own team, used to greet it when it visits another office. Defaults to the first office in its access.
const resolveHomeOffice = (home: string | undefined, access: string[]) => home && access.includes(home) ? home : access[0] || "";
function HomeOfficeSelect({ access, value, onChange }: { access: string[]; value: string; onChange: (office: string) => void }) {
  if (access.length < 2) return null;
  return <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Home office</label><select value={resolveHomeOffice(value, access)} onChange={(e) => onChange(e.target.value)} className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue">{OFFICE_ACCESS_OPTIONS.filter(office => access.includes(office.id)).map(office => <option key={office.id} value={office.id}>{office.label}</option>)}</select><p className="ml-1 text-xs text-slate-500">Their own team. In other offices they are welcomed as a visitor from this office.</p></div>;
}

export function UserManagement({ allUsers, onAddUser, onDeleteUser, onUpdateUser, isLoading }: {
  allUsers: UserData[], 
  onAddUser: (user: any) => void, 
  onDeleteUser: (email: string) => void,
  onUpdateUser: (email: string, changes: UserUpdate) => Promise<string>,
  isLoading: boolean
}) {
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editDraft, setEditDraft] = useState({ fullName: "", email: "", password: "", officeAccess: [] as string[], homeOffice: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const openEdit = (u: UserData) => {
    setEditingUser(u);
    setEditDraft({ fullName: u.fullName || "", email: u.email, password: "", officeAccess: u.officeAccess || [], homeOffice: u.homeOffice || "" });
    setEditError("");
  };
  const saveEdit = async () => {
    if (!editingUser) return;
    const changes: UserUpdate = {};
    if (editDraft.fullName.trim() !== (editingUser.fullName || "")) changes.fullName = editDraft.fullName;
    if (editDraft.email.trim().toLowerCase() !== editingUser.email.toLowerCase()) changes.newEmail = editDraft.email;
    if (editDraft.password) {
      if (editDraft.password.length < 12) { setEditError("New password must be at least 12 characters."); return; }
      changes.password = editDraft.password;
    }
    const currentAccess = [...(editingUser.officeAccess || [])].sort().join(",");
    if (editingUser.role !== "Superadmin" && [...editDraft.officeAccess].sort().join(",") !== currentAccess) changes.officeAccess = editDraft.officeAccess;
    const nextHome = resolveHomeOffice(editDraft.homeOffice, editDraft.officeAccess);
    if (editingUser.role !== "Superadmin" && nextHome && nextHome !== (editingUser.homeOffice || "")) changes.homeOffice = nextHome;
    if (!Object.keys(changes).length) { setEditingUser(null); return; }
    setSavingEdit(true); setEditError("");
    const error = await onUpdateUser(editingUser.email, changes);
    setSavingEdit(false);
    if (error) setEditError(error); else setEditingUser(null);
  };
  const [newUser, setNewUser] = useState({ email: "", fullName: "", role: "Staff", password: "", officeAccess: [] as string[], homeOffice: "" });
  const toggleOffice = (officeId: string, current: string[], update: (next: string[]) => void) => update(current.includes(officeId) ? current.filter(id => id !== officeId) : [...current, officeId]);

  if (isLoading) {
    return (
      <div className="bg-white p-12 rounded-[24px] shadow-apple border border-border-apple/50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin mb-4" />
        <p className="text-text-secondary font-medium">Loading accounts...</p>
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
              <th className="py-4 px-4 text-[11px] font-bold text-text-secondary uppercase tracking-widest">Office access</th>
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
                <td className="py-4 px-4">
                  {u.role === 'Superadmin' ? <span className="text-xs font-semibold text-[#0b587b]">All offices</span> : <button onClick={() => openEdit(u)} className="text-left text-xs font-semibold text-[#0b587b] hover:underline">{(u.officeAccess || []).map(id => OFFICE_ACCESS_OPTIONS.find(option => option.id === id)?.label).filter(Boolean).join(', ') || 'Set access'}</button>}
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
                      onClick={() => openEdit(u)}
                      title="Edit user"
                      aria-label={`Edit ${u.fullName}`}
                      className="p-2 hover:bg-blue-50 rounded-lg text-text-secondary hover:text-accent-blue transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
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
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="At least 12 characters"
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
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Office access</label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F8F9FA] p-3">
                    {OFFICE_ACCESS_OPTIONS.map(office => <label key={office.id} className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={newUser.officeAccess.includes(office.id)} onChange={() => toggleOffice(office.id, newUser.officeAccess, officeAccess => setNewUser({ ...newUser, officeAccess }))} />{office.label}</label>)}
                  </div>
                </div>
                {newUser.role !== "Superadmin" && <HomeOfficeSelect access={newUser.officeAccess} value={newUser.homeOffice} onChange={homeOffice => setNewUser({ ...newUser, homeOffice })} />}
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
                      setNewUser({ email: "", fullName: "", role: "Staff", password: "", officeAccess: [], homeOffice: "" });
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
      <AnimatePresence>
        {editingUser && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !savingEdit && setEditingUser(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" /><motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-7 shadow-2xl">
          <h3 className="text-xl font-bold tracking-tight">Edit user</h3>
          <p className="mt-1 text-sm text-text-secondary">Update {editingUser.fullName}'s sign-in details and office access.</p>
          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Full Name</label><input type="text" value={editDraft.fullName} onChange={(e) => setEditDraft({ ...editDraft, fullName: e.target.value })} className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all" /></div>
            <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Email Address</label><input type="email" value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all" />{editDraft.email.trim().toLowerCase() !== editingUser.email.toLowerCase() && <p className="ml-1 text-xs text-amber-700">They will sign in with the new email from now on.</p>}</div>
            <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">New Password</label><input type="password" autoComplete="new-password" value={editDraft.password} onChange={(e) => setEditDraft({ ...editDraft, password: e.target.value })} placeholder="Leave blank to keep the current password" className="bg-[#F8F9FA] border border-border-apple rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue transition-all" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Office access</label>{editingUser.role === "Superadmin" ? <p className="rounded-xl bg-[#F8F9FA] p-3 text-xs font-semibold text-[#0b587b]">System Admin has access to all offices.</p> : <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F8F9FA] p-3">{OFFICE_ACCESS_OPTIONS.map(office => <label key={office.id} className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={editDraft.officeAccess.includes(office.id)} onChange={() => toggleOffice(office.id, editDraft.officeAccess, officeAccess => setEditDraft({ ...editDraft, officeAccess }))} />{office.label}</label>)}</div>}</div>
            {editingUser.role !== "Superadmin" && <HomeOfficeSelect access={editDraft.officeAccess} value={editDraft.homeOffice} onChange={homeOffice => setEditDraft({ ...editDraft, homeOffice })} />}
            {editError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{editError}</p>}
          </div>
          <div className="mt-6 flex gap-3"><button onClick={() => setEditingUser(null)} disabled={savingEdit} className="flex-1 rounded-xl border border-border-apple px-4 py-3 text-sm font-bold disabled:opacity-50">Cancel</button><button onClick={() => void saveEdit()} disabled={savingEdit || !editDraft.fullName.trim() || !editDraft.email.trim()} className="flex-1 rounded-xl bg-accent-blue px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{savingEdit ? "Saving…" : "Save changes"}</button></div>
        </motion.div></div>}
      </AnimatePresence>
    </div>
  );
}

function HistoryCalendar({ history, onUpdateRemark, onUndo, today, staffSettings = [] }: { 
  history: HistoryEntry[], 
  onUpdateRemark: (taskId: string, date: string, remark: string) => void,
  onUndo: (taskId: string, date: string) => void,
  today: Date,
  staffSettings?: StaffSettings[]
}) {
  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);
  const [jumpDate, setJumpDate] = useState(format(today, "yyyy-MM-dd"));
  
  const start = startOfWeek(startOfMonth(currentMonth));
  const end = endOfWeek(endOfMonth(currentMonth));
  const days = eachDayOfInterval({ start, end });
  
  const isStaffOff = (email: string, date: Date) => {
    const staff = staffSettings.find(s => s.email?.toLowerCase() === email?.toLowerCase());
    if (!staff) return false;
    const dayName = format(date, "EEEE");
    if (staff.offdays && Array.isArray(staff.offdays) && staff.offdays.includes(dayName)) return true;
    
    if (staff.leaveperiods && Array.isArray(staff.leaveperiods)) {
      try {
        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return staff.leaveperiods.some(period => {
          if (!period.start || !period.end) return false;
          const start = new Date(period.start);
          const end = new Date(period.end);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
          
          const sDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          const eDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          return checkDate >= sDate && checkDate <= eDate;
        });
      } catch (e) {}
    }
    return false;
  };

  const staffOnLeaveOnSelectedDate = selectedDate 
    ? staffSettings.filter(s => isStaffOff(s.email, selectedDate))
    : [];

  const nextMonth = () => setCurrentMonth(month => addMonths(month, 1));
  const prevMonth = () => setCurrentMonth(month => subMonths(month, 1));
  const jumpToDate = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    if (isNaN(date.getTime())) return;
    setCurrentMonth(date);
    setSelectedDate(date);
    setJumpDate(value);
  };

  const completionsForDate = selectedDate 
    ? [
        ...history.filter(h => {
          try {
            const d = new Date(h.dateCompleted);
            if (isNaN(d.getTime())) return false;
            return isSameDay(d, selectedDate);
          } catch (e) {
            return false;
          }
        }),
        ...staffOnLeaveOnSelectedDate.map(staff => ({
          taskId: `leave-${staff.email}`,
          title: `${staff.name} is on Leave`,
          dateCompleted: format(selectedDate, "yyyy-MM-dd"),
          remarks: "Scheduled Leave Period",
          isLeave: true
        }))
      ]
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-10">
      <div className="bg-[#F8F9FA] p-8 rounded-[24px] border border-border-apple/60">
        <div className="flex justify-between items-center mb-8 gap-4">
          <div>
            <h5 className="text-[18px] font-bold tracking-tight">{format(currentMonth, "MMMM yyyy")}</h5>
            <label className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#81929e]">
              Jump to date
              <input
                type="date"
                value={jumpDate}
                onChange={(event) => setJumpDate(event.target.value)}
                className="rounded-lg border border-[#dce5e9] bg-white px-2 py-1 text-[11px] font-medium tracking-normal text-[#29465a] outline-none focus:border-[#0b587b]"
              />
              <button
                type="button"
                onClick={() => jumpToDate(jumpDate)}
                className="rounded-lg bg-[#0b587b] px-2.5 py-1.5 text-[10px] font-bold normal-case tracking-normal text-white transition-colors hover:bg-[#084866]"
              >
                Go
              </button>
            </label>
          </div>
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
            const isTodayDay = isSameDay(day, today);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            
            const hasCompletions = history.some(h => {
              try {
                const d = new Date(h.dateCompleted);
                return !isNaN(d.getTime()) && isSameDay(d, day);
              } catch { return false; }
            });
            
            return (
              <button
                key={i}
                onClick={() => {
                  setSelectedDate(day);
                  setJumpDate(format(day, "yyyy-MM-dd"));
                }}
                className={cn(
                  "aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border group",
                  isSelected 
                    ? "bg-accent-blue text-white border-accent-blue shadow-lg shadow-accent-blue/20" 
                    : "bg-white hover:bg-gray-50 border-border-apple/40 hover:border-border-apple",
                  !isSameMonth(day, currentMonth) && "opacity-20",
                  !isSelected && staffSettings.some(s => isStaffOff(s.email, day)) && "bg-slate-50/50"
                )}
              >
                <div className="flex flex-col items-center">
                  <span className={cn("text-[15px] font-bold", isTodayDay && !isSelected && "text-accent-blue")}>
                    {format(day, "d")}
                  </span>
                  {staffSettings.some(s => isStaffOff(s.email, day)) && (
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-widest mt-0.5",
                      isSelected ? "text-white/80" : "text-slate-500"
                    )}>
                      Off
                    </span>
                  )}
                </div>
                <div className="flex gap-1 mt-1">
                  {hasCompletions && (
                    <div className={cn(
                      "w-1 h-1 rounded-full",
                      isSelected ? "bg-white" : "bg-accent-green"
                    )} />
                  )}
                </div>
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
          {staffOnLeaveOnSelectedDate.length > 0 && (
            <div className="bg-slate-50 p-5 rounded-[20px] border border-slate-200 mb-2 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-slate-500" />
                </div>
                <h6 className="text-[15px] font-bold text-slate-700">Staff on Leave</h6>
              </div>
              <div className="space-y-2">
                {staffOnLeaveOnSelectedDate.map(staff => (
                  <div key={staff.email} className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-xl">
                    <span className="text-[13px] font-bold text-slate-600">{staff.name}</span>
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-lg">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Out of Office</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {completionsForDate.length > 0 ? (
            completionsForDate.map((entry: any, i) => {
              let isTodayEntry = false;
              if (!entry.isLeave) {
                try {
                  const d = new Date(entry.dateCompleted);
                  if (!isNaN(d.getTime())) {
                    isTodayEntry = isSameDay(d, new Date());
                  }
                } catch (e) {}
              }
              return (
                <div key={i} className={cn(
                  "p-5 rounded-[20px] border shadow-sm",
                  entry.isLeave ? "bg-slate-50 border-slate-200" : "bg-white border-border-apple/50"
                )}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        entry.isLeave ? "bg-slate-100" : "bg-accent-green/10"
                      )}>
                        {entry.isLeave ? (
                          <Calendar className="w-4 h-4 text-slate-500" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-accent-green" />
                        )}
                      </div>
                      <h6 className={cn(
                        "text-[15px] font-bold",
                        entry.isLeave ? "text-slate-700" : "text-text-primary"
                      )}>{entry.title}</h6>
                    </div>
                    {isTodayEntry && !entry.isLeave && !entry.readOnly && (
                      <button 
                        onClick={() => onUndo(entry.taskId, entry.dateCompleted)}
                        className="text-[10px] font-bold text-accent-blue uppercase tracking-widest hover:underline"
                      >
                        Untick
                      </button>
                    )}
                  </div>
                  {!entry.isLeave && (entry.category || entry.source === "tracker") && (
                    <div className="mb-3 flex items-center gap-2">
                      {entry.category && <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#197da4]">{entry.category}</span>}
                      {entry.source === "tracker" && <span className="rounded-full bg-[#eef4f6] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#728792]">Daily tracker</span>}
                    </div>
                  )}
                  {!entry.isLeave && entry.subtasks && entry.subtasks.length > 0 && (
                    <div className="mb-3 flex flex-col gap-1.5">
                      {entry.subtasks.map((stText: string, si: number) => (
                        <div key={si} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-accent-green/15 flex items-center justify-center">
                            <CheckCircle2 className="w-3 h-3 text-accent-green" />
                          </div>
                          <span className="text-[12px] font-medium text-text-secondary">{stText}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={cn(
                    "border rounded-xl p-3",
                    entry.isLeave ? "bg-white border-slate-200" : "bg-[#F8F9FA] border-border-apple/60"
                  )}>
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-widest mb-1",
                      entry.isLeave ? "text-slate-500" : "text-text-secondary"
                    )}>Details</p>
                    {isTodayEntry && !entry.isLeave && !entry.readOnly ? (
                      <textarea 
                        value={entry.remarks || ""}
                        onChange={(e) => onUpdateRemark(entry.taskId, entry.dateCompleted, e.target.value)}
                        placeholder="Edit remarks for today..."
                        className="w-full bg-transparent text-[13px] text-text-primary/80 leading-relaxed italic border-none focus:ring-0 p-0 resize-none min-h-[40px]"
                      />
                    ) : (
                      <p className={cn(
                        "text-[13px] leading-relaxed italic",
                        entry.isLeave ? "text-slate-600" : "text-text-primary/80"
                      )}>
                        {entry.remarks || "No remarks recorded."}
                      </p>
                    )}
                  </div>
                  {(!isTodayEntry || entry.readOnly) && !entry.isLeave && (
                    <div className="mt-3 flex items-center gap-1.5 text-text-secondary">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{entry.source === "tracker" ? "Recorded in daily tracker" : "Locked"}</span>
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

function normalizedTaskFrequency(task: Task) {
  return (task.frequency || "").toLowerCase().replace(/_/g, ' ').trim();
}

function formatTaskSchedule(task: Task) {
  const frequency = normalizedTaskFrequency(task);
  const detail = task.frequencyDetail?.trim();
  if (frequency === "monthly" || frequency === "2-monthly" || frequency === "2 monthly" || frequency === "3-monthly" || frequency === "3 monthly") {
    const label = frequency.startsWith("2") ? "Every 2 months" : frequency.startsWith("3") ? "Every 3 months" : "Monthly";
    return `${label} · Day ${detail || "1"}`;
  }
  if (frequency === "weekly" && detail) return `Weekly · ${detail}`;
  return (task.frequency || "Daily").replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function taskCycleKey(task: Task, day: Date) {
  const frequency = normalizedTaskFrequency(task);
  const year = day.getFullYear();
  const month = day.getMonth();

  if (frequency.startsWith("2-monthly") || frequency.startsWith("2 monthly")) {
    return `two-month:${year}:${Math.floor(month / 2)}`;
  }
  if (frequency.startsWith("3-monthly") || frequency.startsWith("3 monthly")) {
    return `three-month:${year}:${Math.floor(month / 3)}`;
  }
  if (frequency === "monthly 3rd 4th fri") return `day:${format(day, "yyyy-MM-dd")}`;
  if (frequency.startsWith("monthly")) return `month:${format(day, "yyyy-MM")}`;
  if (frequency.startsWith("weekly")) return `week:${format(startOfWeek(day), "yyyy-MM-dd")}`;
  return `day:${format(day, "yyyy-MM-dd")}`;
}

function isTaskCompletedForCycle(task: Task, history: HistoryEntry[], day: Date) {
  const cycle = taskCycleKey(task, day);
  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  return history.some(entry => {
    if (entry.taskId !== task.id) return false;
    const completedDate = new Date(entry.dateCompleted);
    if (isNaN(completedDate.getTime()) || completedDate > endOfDay) return false;
    return taskCycleKey(task, completedDate) === cycle;
  });
}

function scheduledDayOfMonth(day: Date, requestedDay: string | undefined) {
  const parsedDay = Number.parseInt(requestedDay || "1", 10);
  const lastDay = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Math.max(Number.isFinite(parsedDay) ? parsedDay : 1, 1), lastDay);
  const scheduled = new Date(day.getFullYear(), day.getMonth(), safeDay, 12);

  // Recurring office work should not first become due on a weekend.
  if (scheduled.getDay() === 6) scheduled.setDate(scheduled.getDate() + 2);
  if (scheduled.getDay() === 0) scheduled.setDate(scheduled.getDate() + 1);
  return scheduled;
}

function isOnOrAfterScheduledDay(day: Date, scheduled: Date) {
  const check = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  return check >= scheduled;
}

function isTaskOnDay(task: Task, day: Date) {
  if (task.deadline) {
    try {
      const d = new Date(task.deadline);
      if (!isNaN(d.getTime()) && isSameDay(d, day)) return true;
    } catch (e) {
      // Ignore invalid deadline
    }
  }
  
  const freq = normalizedTaskFrequency(task);
  const dayName = format(day, "EEEE"); // e.g. "Friday"
  const month = day.getMonth(); // 0-11
  
  if (freq === "daily" || freq === "") return true;

  if (freq === "when needed" || freq === "upon suggestion" || freq === "when necessary" || freq === "when required") {
    return false;
  }

  if (freq.startsWith("weekly")) {
    if (freq === "weekly") {
      if (!task.frequencyDetail) return false;
      return task.frequencyDetail.trim().toLowerCase() === dayName.toLowerCase();
    }
    const target = freq.replace("weekly", "").replace(/[-_]/g, "").trim().toLowerCase();
    return dayName.toLowerCase() === target;
  }

  if (freq === "weekly_friday" || freq === "weekly friday") return dayName === "Friday";
  
  if (freq === "twice weekly" || freq === "twice_weekly") {
    return dayName === "Tuesday" || dayName === "Thursday";
  }

  if (freq === "monthly 2nd fri") {
     if (dayName !== "Friday") return false;
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

  if (freq === "monthly 3rd 4th fri") {
     if (dayName !== "Friday") return false;
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

  if (freq.startsWith("monthly")) {
    if (freq === "monthly") {
      return isOnOrAfterScheduledDay(day, scheduledDayOfMonth(day, task.frequencyDetail));
    }
    const target = freq.replace("monthly", "").replace(/[-_]/g, "").trim();
    return isOnOrAfterScheduledDay(day, scheduledDayOfMonth(day, target));
  }

  if (freq.startsWith("2-monthly") || freq.startsWith("2 monthly") || freq.startsWith("2_monthly")) {
    let target = task.frequencyDetail || "1";
    const suffix = freq.replace(/2[-_ ]monthly/g, "").replace(/[-_]/g, "").trim();
    if (suffix) target = suffix;
    return month % 2 === 1 && isOnOrAfterScheduledDay(day, scheduledDayOfMonth(day, target));
  }

  if (freq.startsWith("3-monthly") || freq.startsWith("3 monthly") || freq.startsWith("3_monthly")) {
    let target = task.frequencyDetail || "1";
    const suffix = freq.replace(/3[-_ ]monthly/g, "").replace(/[-_]/g, "").trim();
    if (suffix) target = suffix;
    return (month + 1) % 3 === 0 && isOnOrAfterScheduledDay(day, scheduledDayOfMonth(day, target));
  }

  return false;
};

function CalendarView({ mini, events = [], categories = [], staffSettings = [], allUsers = [] }: { 
  mini?: boolean, 
  events?: any[], 
  categories?: CategoryData[],
  staffSettings?: StaffSettings[],
  allUsers?: UserData[]
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const isStaffOff = (email: string, date: Date) => {
    const staff = staffSettings.find(s => s.email?.toLowerCase() === email?.toLowerCase());
    if (!staff) return false;
    const dayName = format(date, "EEEE");
    if (staff.offdays && Array.isArray(staff.offdays) && staff.offdays.includes(dayName)) return true;
    
    if (staff.leaveperiods && Array.isArray(staff.leaveperiods)) {
      try {
        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return staff.leaveperiods.some(period => {
          if (!period.start || !period.end) return false;
          const start = new Date(period.start);
          const end = new Date(period.end);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
          
          const sDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          const eDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          return checkDate >= sDate && checkDate <= eDate;
        });
      } catch (e) {}
    }
    return false;
  };

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
          const staffOnLeave = staffSettings.filter(s => isStaffOff(s.email, day));
          const isTodayDay = isToday(day);
          
          return (
            <div 
              key={day.toString()} 
              className={cn(
                "aspect-square flex flex-col items-center justify-center rounded-lg relative transition-all group",
                isTodayDay ? "bg-accent-blue text-white" : "hover:bg-gray-50",
                staffOnLeave.length > 0 && !isTodayDay && "bg-slate-50/50"
              )}
            >
              <div className="flex flex-col items-center z-10">
                <span className={cn("text-[13px] font-bold")}>{format(day, "d")}</span>
                {staffOnLeave.length > 0 && (
                  <span className={cn(
                    "text-[7px] font-black uppercase tracking-tighter",
                    isTodayDay ? "text-white/90" : "text-slate-500"
                  )}>
                    Off
                  </span>
                )}
              </div>
              
              <div className="flex gap-0.5 mt-0.5">
                {staffOnLeave.length === 0 && dayTasks.slice(0, 3).map((t, idx) => (
                  <div 
                    key={`t-${idx}`} 
                    className={cn("w-1 h-1 rounded-full", isTodayDay ? "bg-white" : getTaskColor(t.category))} 
                  />
                ))}
                {staffOnLeave.length > 0 && dayTasks.slice(0, 1).map((t, idx) => (
                   <div 
                     key={`t-${idx}`} 
                     className={cn("w-1 h-1 rounded-full opacity-40", isTodayDay ? "bg-white" : getTaskColor(t.category))} 
                   />
                ))}
              </div>

              {/* Tooltip on hover */}
              {!mini && (dayTasks.length > 0 || dayNotes.length > 0 || dayHistory.length > 0 || staffOnLeave.length > 0) && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white rounded-xl shadow-2xl border border-border-apple p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50">
                  {staffOnLeave.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">On Leave</p>
                      {staffOnLeave.map(s => (
                        <div key={s.email} className="flex items-center gap-1.5 mb-1 last:mb-0">
                          <div className="w-1 h-1 rounded-full bg-slate-400" />
                          <span className="text-[11px] font-bold text-slate-600">OFF - {s.name.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(dayTasks.length > 0 || dayNotes.length > 0 || dayHistory.length > 0) && (
                    <>
                      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 border-t border-gray-100 pt-2">Schedule</p>
                      <div className="space-y-2">
                        {dayTasks.map(t => (
                          <div key={`tt-${t.id}`} className="flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", getTaskColor(t.category))} />
                            <span className="text-[11px] font-medium text-text-primary truncate">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
