/** Central store: session, captured cards, stats, profile and toasts. */
import { create } from 'zustand';
import { api } from '../api/client';
import type {
  BootstrapPayload,
  PublicUser,
  Salon,
  SalonInput,
  SecretsStatus,
  Stats,
  StoreStatus,
} from '../api/types';

export type View = 'cards' | 'profile';

export const DEFAULT_STATS: Stats = {
  total: 0,
  mine: 0,
  thisWeek: 0,
  contactable: 0,
  lastCaptureAt: null,
};

interface AppState {
  view: View;
  setView: (view: View) => void;

  user: PublicUser | null;
  authChecked: boolean;
  loginError: string | null;
  bootstrapped: boolean;
  firstRun: { email: string; password: string } | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;

  ready: boolean;
  initError: string | null;
  init: () => Promise<void>;
  reload: () => Promise<void>;

  salons: Salon[];
  stats: Stats;
  users: PublicUser[];
  secrets: SecretsStatus;
  store: StoreStatus | null;

  createSalon: (input: SalonInput) => Promise<Salon | null>;
  updateSalon: (id: string, input: SalonInput) => Promise<Salon | null>;
  deleteSalon: (id: string) => Promise<boolean>;
  updateProfile: (patch: Partial<Pick<PublicUser, 'name' | 'phone' | 'color'>>) => Promise<boolean>;

  toast: string | null;
  showToast: (message: string) => void;
}

const applyBootstrap = (data: BootstrapPayload) => ({
  user: data.user,
  salons: data.salons,
  stats: data.stats ?? DEFAULT_STATS,
  users: data.users ?? [],
  secrets: data.secrets ?? { smtp: false, resend: false },
  store: data.store ?? null,
});

export const useAppStore = create<AppState>((set, get) => ({
  view: 'cards',
  setView: (view) => set({ view }),

  user: null,
  authChecked: false,
  loginError: null,
  bootstrapped: true,
  firstRun: null,

  login: async (email, password) => {
    set({ loginError: null });
    try {
      const { user } = await api.login(email, password);
      set({ user });
      await get().init();
      return true;
    } catch (error) {
      set({ loginError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* sign out locally anyway */
    }
    set({
      user: null,
      ready: false,
      view: 'cards',
      salons: [],
      stats: DEFAULT_STATS,
      users: [],
      store: null,
      toast: null,
    });
  },

  ready: false,
  initError: null,
  init: async () => {
    try {
      const data = await api.bootstrap();
      set({ ready: true, initError: null, ...applyBootstrap(data) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ ready: false, initError: message });
    }
  },

  reload: async () => {
    try {
      const data = await api.bootstrap();
      set({ ...applyBootstrap(data), initError: null });
    } catch (error) {
      set({ initError: error instanceof Error ? error.message : String(error) });
    }
  },

  salons: [],
  stats: DEFAULT_STATS,
  users: [],
  secrets: { smtp: false, resend: false },
  store: null,

  createSalon: async (input) => {
    try {
      const { salon } = await api.createSalon(input);
      set({ salons: [salon, ...get().salons] });
      await get().reload();
      get().showToast(`${salon.salonName} captured and saved`);
      return salon;
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : String(error));
      return null;
    }
  },

  updateSalon: async (id, input) => {
    try {
      const { salon } = await api.updateSalon(id, input);
      set({ salons: get().salons.map((row) => (row.id === id ? salon : row)) });
      await get().reload();
      get().showToast('Card updated');
      return salon;
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : String(error));
      return null;
    }
  },

  deleteSalon: async (id) => {
    try {
      await api.deleteSalon(id);
      set({ salons: get().salons.filter((salon) => salon.id !== id) });
      await get().reload();
      get().showToast('Card deleted');
      return true;
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : String(error));
      return false;
    }
  },

  updateProfile: async (patch) => {
    try {
      const { user } = await api.updateProfile(patch);
      set({ user });
      await get().reload();
      get().showToast('Profile saved');
      return true;
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : String(error));
      return false;
    }
  },

  toast: null,
  showToast: (message) => {
    set({ toast: message });
    window.setTimeout(() => {
      if (get().toast === message) set({ toast: null });
    }, 4500);
  },
}));
