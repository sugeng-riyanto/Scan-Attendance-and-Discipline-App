import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppPage =
  | 'dashboard'
  | 'attendance'
  | 'attendance-scanner'
  | 'attendance-records'
  | 'permissions'
  | 'violations'
  | 'good-deeds'
  | 'student-profile'
  | 'statistics'
  | 'export'
  | 'settings'
  | 'classes'
  | 'users'
  | 'categories'
  | 'academic-years'
  | 'alerts'
  | 'guru-jaga-monitor'
  | 'discipline-pattern'
  | 'id-card'
  | 'face-capture'
  | 'discipline-scan'
  | 'school-documents';

interface Notification {
  id: string;
  type: 'alert' | 'info' | 'success' | 'warning';
  message: string;
  timestamp: number;
  isRead: boolean;
}

interface AppStore {
  activePage: AppPage;
  setActivePage: (page: AppPage) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string | null) => void;
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  unreadCount: () => number;
  // Filters
  dateFilter: string; // ISO date string or 'today', 'week', 'month'
  setDateFilter: (filter: string) => void;
  classFilter: string;
  setClassFilter: (filter: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      activePage: 'dashboard',
      setActivePage: (page: AppPage) => set({ activePage: page }),
      sidebarOpen: false,
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      selectedStudentId: null,
      setSelectedStudentId: (id: string | null) => set({ selectedStudentId: id }),
      notifications: [],
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: Math.random().toString(36).substr(2, 9),
              timestamp: Date.now(),
              isRead: false,
            },
            ...state.notifications,
          ].slice(0, 50), // keep max 50
        })),
      markNotificationRead: (id: string) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        })),
      clearNotifications: () => set({ notifications: [] }),
      unreadCount: () => get().notifications.filter((n) => !n.isRead).length,
      dateFilter: 'today',
      setDateFilter: (filter: string) => set({ dateFilter: filter }),
      classFilter: 'all',
      setClassFilter: (filter: string) => set({ classFilter: filter }),
      statusFilter: 'all',
      setStatusFilter: (filter: string) => set({ statusFilter: filter }),
    }),
    {
      name: 'school-app-storage',
      partialize: (state) => ({
        activePage: state.activePage,
        dateFilter: state.dateFilter,
        classFilter: state.classFilter,
        statusFilter: state.statusFilter,
      }),
    }
  )
);
