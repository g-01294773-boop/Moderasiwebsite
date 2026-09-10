import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0890403762",
  appId: "1:92560890356:web:5eb3b8654ccd0c40d941a1",
  apiKey: "AIzaSyDfMyKHHDT4TXmaFqiLhBM_glp-QQcnHpY",
  authDomain: "gen-lang-client-0890403762.firebaseapp.com",
  storageBucket: "gen-lang-client-0890403762.firebasestorage.app",
  messagingSenderId: "92560890356",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-a5f4d13a-8649-45d1-8591-a3d4bc739e8a");
