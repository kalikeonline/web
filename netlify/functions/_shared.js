const crypto = require("crypto");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

function razorpayKeys() {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) return null;
  return { id, secret, mode: id.indexOf("rzp_test") === 0 ? "test" : "live" };
}

function razorpayAuthHeader(k) {
  return "Basic " + Buffer.from(k.id + ":" + k.secret).toString("base64");
}

let adminApp = null;
function getAdmin() {
  const admin = require("firebase-admin");
  if (!adminApp) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    adminApp = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin;
}

// Returns the Firebase user id of the logged-in visitor, or null.
async function userFromRequest(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const m = /^Bearer (.+)$/.exec(auth);
  if (!m) return null;
  try {
    const decoded = await getAdmin().auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch (_) { return null; }
}

function validSignature(orderId, paymentId, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(orderId + "|" + paymentId).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ALLOWED_ORIGINS = ["https://kalikeonline.github.io", "https://kalike.netlify.app"]
  .concat((process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean));

// Lets the website (GitHub Pages or Netlify) call these functions from the browser.
function withCors(fn) {
  return async (event) => {
    event = event || {};
    const h = event.headers || {};
    const origin = h.origin || h.Origin || "";
    const cors = ALLOWED_ORIGINS.includes(origin) ? {
      "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    } : {};
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
    const res = await fn(event);
    res.headers = Object.assign({}, res.headers, cors);
    return res;
  };
}

module.exports = { withCors, json, razorpayKeys, razorpayAuthHeader, getAdmin, userFromRequest, validSignature };
