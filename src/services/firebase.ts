import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

// Configuração via variáveis de ambiente (.env / .env.local).
// Enquanto o novo projeto Firebase não for criado, os uploads de imagem ficam indisponíveis.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export const isFirebaseConfigured = !!firebaseConfig.projectId && !!firebaseConfig.storageBucket;

const app = initializeApp(firebaseConfig);
export const storage = isFirebaseConfigured ? getStorage(app) : (null as any);
