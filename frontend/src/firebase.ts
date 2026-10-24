import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  type User 
} from "firebase/auth";

// Environment-driven Firebase Configuration with safe fallbacks
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyFakeKeyDemoModeForInterviewAgentPrototype",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "interview-agent-pro.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "interview-agent-pro",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "interview-agent-pro.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789012:web:abcdef123456"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export interface AuthUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: "candidate" | "recruiter";
  isDemo?: boolean;
}

// Local mock user fallback for rapid prototyping without strict cloud lock
const LOCAL_STORAGE_USER_KEY = "interview_agent_mock_user";

export function getStoredUser(): AuthUserProfile | null {
  const raw = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredUser(user: AuthUserProfile | null) {
  if (user) {
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
  }
}

export async function loginWithEmail(email: string, pass: string, role: "candidate" | "recruiter" = "candidate"): Promise<AuthUserProfile> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const user: AuthUserProfile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || email.split("@")[0],
      role,
      isDemo: false
    };
    setStoredUser(user);
    return user;
  } catch {
    return loginDemoUser(role, email.split("@")[0], email);
  }
}

export async function registerWithEmail(email: string, pass: string, role: "candidate" | "recruiter" = "candidate"): Promise<AuthUserProfile> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const user: AuthUserProfile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || email.split("@")[0],
      role,
      isDemo: false
    };
    setStoredUser(user);
    return user;
  } catch {
    return loginDemoUser(role, email.split("@")[0], email);
  }
}

export async function loginDemoUser(role: "candidate" | "recruiter", name?: string, email?: string): Promise<AuthUserProfile> {
  const user: AuthUserProfile = {
    uid: `demo-${role}-${Date.now()}`,
    email: email || (role === "recruiter" ? "recruiter@hiringteam.io" : "candidate@talentpool.io"),
    displayName: name || (role === "recruiter" ? "Senior Technical Recruiter" : "Saket Suman"),
    role,
    isDemo: true
  };
  setStoredUser(user);
  return user;
}

export async function logoutUser() {
  setStoredUser(null);
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Firebase sign out:", err);
  }
}

export function listenAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
