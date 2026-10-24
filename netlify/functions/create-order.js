const prices = require("./_catalog");
const { withCors, json, razorpayKeys, razorpayAuthHeader, userFromRequest } = require("./_shared");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const keys = razorpayKeys();
  if (!keys) return json(500, { error: "Payments are not set up on the server yet." });

  const uid = await userFromRequest(event);
  if (!uid) return json(401, { error: "Please log in again, then try once more." });

  let item;
  try { item = JSON.parse(event.body || "{}").item; } catch (_) { return json(400, { error: "Bad request." }); }
  if (typeof item !== "string" || !Object.prototype.hasOwnProperty.call(prices, item)) {
    return json(400, { error: "Unknown item." });
  }

  const amount = prices[item] * 100;                 // paise
  if (!Number.isInteger(amount) || amount < 100) return json(400, { error: "Amount must be at least 100 paise." });

  let res, data;
  try {
    res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: razorpayAuthHeader(keys) },
      body: JSON.stringify({
        amount, currency: "INR",
        receipt: ("k_" + uid.slice(0, 8) + "_" + Date.now()).slice(0, 40),
        notes: { uid, item }
      })
    });
    data = await res.json();
  } catch (err) {
    console.error("Razorpay request failed", err);
    return json(500, { error: "Could not reach Razorpay. Please try again." });
  }
  if (res.status === 401) return json(401, { error: "Razorpay did not accept the server keys." });
  if (!res.ok) { console.error("Razorpay error", data); return json(500, { error: "Razorpay could not create the order." }); }

  return json(200, { order_id: data.id, amount: data.amount, currency: data.currency, key_id: keys.id, mode: keys.mode, item });
});
