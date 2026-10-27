/**
 * firebase-config.js – إعدادات Firebase النهائية
 */

const firebaseConfig = {
  apiKey: "AIzaSyDVaRJ_t56faR0iMoMwco9hLJgVSpiMq8M",
  authDomain: "product-analysis-fbcb7.firebaseapp.com",
  projectId: "product-analysis-fbcb7",
  storageBucket: "product-analysis-fbcb7.firebasestorage.app",
  messagingSenderId: "295714829331",
  appId: "1:295714829331:web:8839a16033d92cac533be6"
};

// تهيئة Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized');
}

// تهيئة Firestore
let db;
try {
  db = firebase.firestore();
  db.settings({ merge: true, ignoreUndefinedProperties: true });
  console.log('✅ Firestore initialized');
} catch (e) {
  console.error('❌ Firestore init error:', e);
}

window.db = db;
window.firebaseDb = db;
