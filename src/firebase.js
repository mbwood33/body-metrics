// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDxbjiBIQZ6GBbUsaverVoMsKcrgWxSWW0",
  authDomain: "body-metrics-app.firebaseapp.com",
  projectId: "body-metrics-app",
  storageBucket: "body-metrics-app.firebasestorage.app",
  messagingSenderId: "250851031419",
  appId: "1:250851031419:web:c1f202ae377349af06e5de",
  measurementId: "G-81GCLVMQ3T"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);