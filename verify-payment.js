const { withCors, json, razorpayKeys, razorpayAuthHeader, getAdmin, userFromRequest, validSignature } = require("./_shared");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const keys = razorpayKeys();
  if (!keys) return json(500, { error: "Payments are not set up on the server yet." });

  const uid = await userFromRequest(event);
  if (!uid) return json(401, { error: "Please log in again." });

  let b;
  try { b = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { error: "Bad request." }); }
  const orderId = b.razorpay_order_id, paymentId = b.razorpay_payment_id, signature = b.razorpay_signature;
  if (!orderId || !paymentId || !signature) return json(400, { error: "Missing payment details." });

  // 1. The signature proves Razorpay really confirmed this payment.
  if (!validSignature(orderId, paymentId, signature, keys.secret)) {
    return json(400, { error: "Payment could not be verified." });          // never marked as paid
  }

  // 2. The order must belong to the logged-in user (stops someone claiming another person's payment).
  let order;
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders/" + encodeURIComponent(orderId), {
      headers: { Authorization: razorpayAuthHeader(keys) }
    });
    if (!res.ok) return json(500, { error: "Could not check the order with Razorpay." });
    order = await res.json();
  } catch (err) {
    console.error(err);
    return json(500, { error: "Could not check the order with Razorpay." });
  }
  const notes = order.notes || {};
  if (notes.uid !== uid) return json(403, { error: "This payment belongs to a different account." });

  // 3. Save the purchase (only this server can write it).
  try {
    const admin = getAdmin();
    await admin.firestore().doc("users/" + uid + "/purchases/" + paymentId).set({
      id: paymentId, orderId, name: notes.item, price: order.amount / 100, mode: keys.mode,
      ts: Date.now(), createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Could not save purchase", err);
    return json(500, { error: "Payment verified but could not be saved. Please contact us with your Payment ID." });
  }
  return json(200, { ok: true, item: notes.item, payment_id: paymentId });
});
