export type Role = 'rep' | 'admin' | 'superadmin';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
  color: string;
  createdAt: string;
  passwordSet: boolean;
  authProvider?: string;
}

export interface Salon {
  id: string;
  salonName: string;
  ownerName: string;
  contactNumber: string;
  email: string;
  address: string;
  notes?: string;
  meetingAt?: string;
  capturedById: string;
  capturedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalonInput {
  salonName: string;
  ownerName: string;
  contactNumber: string;
  email: string;
  address: string;
  notes?: string;
  meetingAt?: string;
}

export interface Stats {
  total: number;
  mine: number;
  thisWeek: number;
  contactable: number;
  meetings: number;
  lastCaptureAt: string | null;
}

export interface SecretsStatus {
  smtp: boolean;
  resend: boolean;
}

export interface FirebaseStatus {
  configured: boolean;
  projectId: string | null;
  clientEmail?: string | null;
  credentialSource?: string | null;
  lastOkAt?: string | null;
  lastError: string | null;
  reads: number;
  writes: number;
}

export interface StoreStatus {
  mode: string;
  ready: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingWrites: number;
  dataDir: string;
  counts: Record<string, number>;
  firebase: FirebaseStatus;
  secrets: SecretsStatus;
}

export interface AuthStatus {
  bootstrapped: boolean;
  firstRun: boolean;
  firstRunCredentials: { email: string; password: string } | null;
  mode: string;
  google?: GoogleStatus;
}

export interface GoogleStatus {
  enabled: boolean;
  provider: string;
  projectId: string | null;
  note?: string;
}

export interface BootstrapPayload {
  user: PublicUser;
  salons: Salon[];
  stats: Stats;
  users: PublicUser[];
  secrets: SecretsStatus;
  store: StoreStatus;
}

export interface HealthPayload {
  ok: boolean;
  service: string;
  version: string;
  counts: { salons: number; users: number };
  secrets: SecretsStatus;
  store: StoreStatus;
}
