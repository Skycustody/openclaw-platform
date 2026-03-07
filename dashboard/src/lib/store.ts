import { create } from 'zustand';

interface UserData {
  id: string;
  email: string;
  plan: string;
  status: string;
  subdomain: string | null;
  isAdmin?: boolean;
}

interface StoreState {
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useStore = create<StoreState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));
