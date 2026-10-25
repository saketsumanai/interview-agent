import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider,
  signOut, 
  onAuthStateChanged,
  type User 
} from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

// Web app's Firebase configuration provided by user
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ai-video-agent-56bc9.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-video-agent-56bc9",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-video-agent-56bc9.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "750115910662",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:750115910662:web:6f0504007181b2ee137f87",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-KFVH0XB2LK",
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firebase Analytics safely (only in supported browser environments)
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    // Non-blocking fallback
  });
}

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
      isDemo: false,
    };
    setStoredUser(user);
    return user;
  } catch (err: any) {
    console.warn("Firebase Email Login fallback to demo:", err?.message || err);
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
      isDemo: false,
    };
    setStoredUser(user);
    return user;
  } catch (err: any) {
    console.warn("Firebase Email Registration fallback to demo:", err?.message || err);
    return loginDemoUser(role, email.split("@")[0], email);
  }
}

export async function loginWithGoogle(role: "candidate" | "recruiter" = "candidate"): Promise<AuthUserProfile> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user: AuthUserProfile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || (cred.user.email ? cred.user.email.split("@")[0] : "Google User"),
      role,
      isDemo: false,
    };
    setStoredUser(user);
    return user;
  } catch (err: any) {
    console.warn("Firebase Google Login fallback to demo:", err?.message || err);
    return loginDemoUser(role, "Saket Suman", "saket.suman@talentpool.io");
  }
}

export async function loginDemoUser(role: "candidate" | "recruiter", name?: string, email?: string): Promise<AuthUserProfile> {
  const user: AuthUserProfile = {
    uid: `demo-${role}-${Date.now()}`,
    email: email || (role === "recruiter" ? "recruiter@hiringteam.io" : "candidate@talentpool.io"),
    displayName: name || (role === "recruiter" ? "Senior Technical Recruiter" : "Saket Suman"),
    role,
    isDemo: true,
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
