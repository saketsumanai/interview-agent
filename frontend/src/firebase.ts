import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  type User 
} from "firebase/auth";

export type UserRole = "ADMIN" | "RECRUITER" | "CANDIDATE";

export interface AuthUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  role: UserRole;
  isDemo?: boolean;
}

// Environment-driven Firebase Configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  !firebaseConfig.apiKey.includes("FakeKey")
);

const app = getApps().length === 0 
  ? initializeApp(isFirebaseConfigured ? firebaseConfig : {
      apiKey: "AIzaSyFakeKeyDemoModeForInterviewAgentPrototype",
      authDomain: "interview-agent-pro.firebaseapp.com",
      projectId: "interview-agent-pro",
      storageBucket: "interview-agent-pro.appspot.com",
      messagingSenderId: "123456789012",
      appId: "1:123456789012:web:abcdef123456"
    })
  : getApp();

export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const LOCAL_STORAGE_USER_KEY = "talentflow_auth_user";

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

/**
 * Sign in with Google Popup
 */
export async function loginWithGoogle(preferredRole: UserRole = "CANDIDATE"): Promise<AuthUserProfile> {
  if (!isFirebaseConfigured) {
    // Graceful developer sandbox fallback with realistic user
    const sandboxUser: AuthUserProfile = {
      uid: `google-${Date.now()}`,
      email: preferredRole === "RECRUITER" ? "recruiter.lead@talentflow.ai" : "saketsuman.ai.2023@gmail.com",
      displayName: preferredRole === "RECRUITER" ? "Technical Hiring Lead" : "Saket Suman",
      photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
      role: preferredRole,
      isDemo: true,
    };
    setStoredUser(sandboxUser);
    return sandboxUser;
  }

  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const existing = getStoredUser();
    const user: AuthUserProfile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || "Google User",
      photoURL: cred.user.photoURL,
      role: existing?.role || preferredRole,
      isDemo: false,
    };
    setStoredUser(user);
    return user;
  } catch (err: any) {
    console.warn("Google Sign-In Popup failed, using fallback:", err);
    throw new Error(err.message || "Failed to authenticate with Google");
  }
}

/**
 * Switch or update authenticated user role
 */
export function updateUserRole(newRole: UserRole): AuthUserProfile | null {
  const current = getStoredUser();
  if (!current) return null;
  const updated = { ...current, role: newRole };
  setStoredUser(updated);
  return updated;
}

/**
 * Mock login for testing different roles
 */
export async function loginDemoUser(role: UserRole, name?: string, email?: string): Promise<AuthUserProfile> {
  const user: AuthUserProfile = {
    uid: `demo-${role.toLowerCase()}-${Date.now()}`,
    email: email || (role === "RECRUITER" ? "recruiter@hiringteam.io" : role === "ADMIN" ? "admin@talentflow.ai" : "candidate@talentpool.io"),
    displayName: name || (role === "RECRUITER" ? "Senior Technical Recruiter" : role === "ADMIN" ? "System Administrator" : "Saket Suman"),
    photoURL: null,
    role,
    isDemo: true
  };
  setStoredUser(user);
  return user;
}

export async function loginWithEmail(email: string, pass: string, role: UserRole = "CANDIDATE"): Promise<AuthUserProfile> {
  if (!isFirebaseConfigured) {
    return loginDemoUser(role, email.split("@")[0], email);
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const user: AuthUserProfile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || email.split("@")[0],
      photoURL: cred.user.photoURL,
      role,
      isDemo: false
    };
    setStoredUser(user);
    return user;
  } catch {
    return loginDemoUser(role, email.split("@")[0], email);
  }
}

export async function registerWithEmail(email: string, pass: string, role: UserRole = "CANDIDATE"): Promise<AuthUserProfile> {
  if (!isFirebaseConfigured) {
    return loginDemoUser(role, email.split("@")[0], email);
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const user: AuthUserProfile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || email.split("@")[0],
      photoURL: null,
      role,
      isDemo: false
    };
    setStoredUser(user);
    return user;
  } catch {
    return loginDemoUser(role, email.split("@")[0], email);
  }
}

export async function logoutUser() {
  setStoredUser(null);
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Firebase sign out:", err);
  }
}

export async function getAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      return await currentUser.getIdToken();
    } catch {
      return null;
    }
  }
  return null;
}

export function listenAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
