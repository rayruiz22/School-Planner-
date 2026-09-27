import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAYEqPQIOIO6Lbpol1BGcM36MzkNszOYqX0A",
  authDomain: "school-planner-cf152.firebaseapp.com",
  projectId: "school-planner-cf152",
  storageBucket: "school-planner-cf152.firebasestorage.app",
  messagingSenderId: "670552095167",
  appId: "1:670552095167:web:4b7cd81c058796e6b9490a",
  measurementId: "G-R27LWPSRP0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Internal state to avoid synchronization loops
let currentUser = null;
let unsubscribeSnapshot = null;
let isUpdatingFromRemote = false;

// UI Elements
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");
const userName = document.getElementById("userName");
const userAvatar = document.getElementById("userAvatar");

// Event Listeners for Auth Buttons
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Sign-In Error:", error);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign-Out Error:", error);
    }
  });
}

// Auth State Change Handler
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }

  if (user) {
    // Render user profile UI
    if (loginBtn) loginBtn.style.display = "none";
    if (userInfo) userInfo.style.display = "flex";
    if (userName) userName.textContent = user.displayName || user.email;
    if (userAvatar) {
      userAvatar.src = user.photoURL || "https://via.placeholder.com/28";
      userAvatar.alt = user.displayName || "User";
    }

    // Set up Realtime Firestore Listener
    const docRef = doc(db, "users", user.uid, "planner", "main");
    unsubscribeSnapshot = onSnapshot(docRef, async (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) {
        // Skip processing local optimistic writes to prevent echo loops
        return;
      }

      if (snapshot.exists()) {
        const data = snapshot.data();
        isUpdatingFromRemote = true;
        if (window.plannerBridge) {
          window.plannerBridge.setState(data.items || [], data.settings || {});
        }
        isUpdatingFromRemote = false;
      } else {
        // First login on a new user: no cloud document exists, upload local planner data
        await uploadCurrentState();
      }
    }, (error) => {
      console.error("Firestore Listener Error:", error);
    });

  } else {
    // Render signed out UI
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (userInfo) userInfo.style.display = "none";
  }
});

// Helper function to write local state to Firestore
async function uploadCurrentState() {
  if (!currentUser) return;
  const docRef = doc(db, "users", currentUser.uid, "planner", "main");
  
  let state = { items: [], settings: {} };
  if (window.plannerBridge) {
    state = window.plannerBridge.getState();
  }

  await setDoc(docRef, {
    items: state.items,
    settings: state.settings,
    updatedAt: serverTimestamp()
  });
}

// Public API bound to window.firebasePlannerSync
window.firebasePlannerSync = {
  save: async () => {
    // If update was triggered by an incoming snapshot from Firestore, don't echo back
    if (isUpdatingFromRemote || !currentUser) return;

    try {
      await uploadCurrentState();
    } catch (error) {
      console.error("Error saving data to Firestore:", error);
    }
  },

  clearCloudData: async () => {
    if (!currentUser) return;
    const docRef = doc(db, "users", currentUser.uid, "planner", "main");
    try {
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error clearing cloud data from Firestore:", error);
    }
  }
};