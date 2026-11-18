/**
 * Firebase web app config for sales-e3bda (created via the Management API with
 * the service account). The web apiKey is PUBLIC by design - it identifies the
 * Firebase project to client code; it is not a credential. Override with
 * FIREBASE_WEB_CONFIG_JSON if the web app is ever replaced.
 */

const fetched = {
  projectId: 'sales-e3bda',
  appId: '1:372895373959:web:fbb92b20cd42bc80b57622',
  apiKey: 'AIzaSyAKtCPP_E70Fz2bkcjeQ2KFlgKC0E85XPE',
  authDomain: 'sales-e3bda.firebaseapp.com',
  storageBucket: 'sales-e3bda.firebasestorage.app',
  messagingSenderId: '372895373959',
  projectNumber: '372895373959',
};

export const firebaseWebConfig = (() => {
  try {
    if (process.env.FIREBASE_WEB_CONFIG_JSON) {
      const parsed = JSON.parse(process.env.FIREBASE_WEB_CONFIG_JSON);
      if (parsed.apiKey && parsed.projectId && parsed.appId) return parsed;
    }
  } catch {
    /* fall through to the fetched defaults */
  }
  return fetched;
})();

/** Verify a Firebase idToken via the Identity Toolkit accounts:lookup endpoint. */
export const lookupIdToken = async (idToken) => {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `accounts:lookup ${res.status}`;
    const error = new Error(message);
    error.code = message.split(':')[0].trim();
    throw error;
  }
  const user = json?.users?.[0];
  if (!user?.email) throw new Error('GOOGLE_ACCOUNT_WITHOUT_EMAIL');
  return {
    localId: String(user.localId || ''),
    email: String(user.email).trim().toLowerCase(),
    name: String(user.displayName || user.email.split('@')[0]).trim(),
    photoUrl: user.photoUrl || null,
    emailVerified: user.emailVerified === true,
  };
};
