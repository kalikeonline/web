const { withCors, json, razorpayKeys } = require("./_shared");

// Lets the website know if payments are in test or live mode (so test notes show only in test mode).
exports.handler = withCors(async () => {
  const k = razorpayKeys();
  return json(200, { mode: k ? k.mode : "off" });
});
