const admin = require('firebase-admin');

// Phone-number OTP is sent and verified entirely by Firebase on the
// frontend; all the backend does is verify the resulting ID token really
// came from Firebase and really is for the phone number it claims — this is
// that verifier. Needs three env vars (from a Firebase service account key,
// Project Settings → Service Accounts → Generate new private key):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// FIREBASE_PRIVATE_KEY is multi-line — when pasting into Render's env var
// UI (or a local .env), keep it as one line with literal \n sequences; the
// replace below turns those back into real newlines.
let firebaseApp = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Firebase OTP login is not configured — missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  return firebaseApp;
}

// Returns the verified phone number (E.164, e.g. "+919131295174") or throws.
async function verifyFirebaseIdToken(idToken) {
  const app = getFirebaseApp();
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  if (!decoded.phone_number) throw new Error('This sign-in token has no verified phone number attached');
  return decoded.phone_number;
}

module.exports = { verifyFirebaseIdToken };
