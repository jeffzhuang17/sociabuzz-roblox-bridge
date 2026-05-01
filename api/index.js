// ============================================================
// DONATION BRIDGE — Vercel API
// api/index.js — FINAL v7 (Upstash Redis SDK)
// ============================================================

const express = require('express');
const { Redis } = require('@upstash/redis');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Redis client ──────────────────────────────────────────────

let redis = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log("✅ Redis Upstash terhubung");
} else {
  console.warn("⚠️ Redis tidak dikonfigurasi, pakai in-memory");
}

// ── In-memory fallback ────────────────────────────────────────

let memoryDonation = null;

const defaultDonation = {
  id:        "START",
  donator:   "System",
  amount:    0,
  message:   "Ready",
  timestamp: 0
};

// ── Redis helpers ─────────────────────────────────────────────

async function setLatest(data) {
  try {
    if (redis) {
      await redis.set("latestDonation", JSON.stringify(data));
      console.log("✅ Redis SET sukses:", JSON.stringify(data));
    } else {
      memoryDonation = data;
      console.log("✅ Memory SET sukses:", JSON.stringify(data));
    }
  } catch (err) {
    console.error("❌ setLatest error:", err.message);
    memoryDonation = data; // fallback ke memory kalau Redis error
  }
}

async function getLatest() {
  try {
    if (redis) {
      const raw = await redis.get("latestDonation");
      console.log("📦 Redis GET raw:", JSON.stringify(raw));

      if (!raw) return defaultDonation;

      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

      return {
        id:        String(parsed.id        || "START"),
        donator:   String(parsed.donator   || "System"),
        amount:    Number(parsed.amount    || 0),
        message:   String(parsed.message   || ""),
        timestamp: Number(parsed.timestamp || 0)
      };
    } else {
      return memoryDonation || defaultDonation;
    }
  } catch (err) {
    console.error("❌ getLatest error:", err.message);
    return memoryDonation || defaultDonation;
  }
}

// ── Middleware ────────────────────────────────────────────────

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin",  "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// ── Routes ────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send("DONATION BRIDGE AKTIF v7 - Redis Upstash");
});

app.get('/api/donations/latest', async (req, res) => {
  try {
    const data = await getLatest();
    console.log("📤 GET /latest response:", JSON.stringify(data));
    res.status(200).json(data);
  } catch (err) {
    console.error("❌ GET latest error:", err.message);
    res.status(200).json(defaultDonation);
  }
});

// ── Webhook Sociabuzz ─────────────────────────────────────────

app.post('/api/webhook/sociabuzz', async (req, res) => {
  console.log("════════════════════════════════════");
  console.log("📦 WEBHOOK MASUK");
  console.log("Body:", JSON.stringify(req.body));
  console.log("════════════════════════════════════");

  try {
    const d = req.body.data || req.body;

    const rawName = (
      d.supporter      ||
      d.supporter_name ||
      d.donator_name   ||
      d.sender_name    ||
      d.name           ||
      d.donator        ||
      d.from           ||
      d.user_name      ||
      d.username       ||
      d.nickname       ||
      ""
    ).toString().trim();

    console.log("👤 Nama:", rawName);

    if (!rawName || rawName.toLowerCase() === "anonymous") {
      return res.status(200).json({ status: "SKIP_ANONYMOUS" });
    }

    const rawAmount = d.amount_raw || d.amount || d.net_amount || d.total || d.price || d.value || 0;
    const amount    = parseInt(String(rawAmount).replace(/\D/g, "")) || 0;

    console.log("💰 Amount:", amount);

    if (amount <= 0) {
      return res.status(200).json({ status: "SKIP_ZERO" });
    }

    const donationId = (
      d.id             ||
      d.order_id       ||
      d.transaction_id ||
      d.invoice_id     ||
      d.ref_id         ||
      `${rawName.toLowerCase().replace(/\s/g,"_")}_${amount}_${Date.now()}`
    ).toString();

    const donation = {
      id:        donationId,
      donator:   rawName,
      amount:    amount,
      message:   (d.message || d.note || d.description || "").toString().trim(),
      timestamp: Date.now(),
    };

    console.log("✅ DONATION DISIMPAN:", JSON.stringify(donation));
    await setLatest(donation);
    res.status(200).json({ status: "OK", donation });

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(200).json({ status: "ERROR", message: err.message });
  }
});

// ── Test Inject ───────────────────────────────────────────────

app.post('/api/test/inject', async (req, res) => {
  try {
    const { name, amount, message } = req.body;
    if (!name || !amount) {
      return res.status(400).json({ status: "ERROR", message: "name dan amount wajib" });
    }
    const donation = {
      id:        `test_${name.toLowerCase().replace(/\s/g,"_")}_${Date.now()}`,
      donator:   name.toString().trim(),
      amount:    parseInt(String(amount).replace(/\D/g, "")) || 0,
      message:   (message || "TEST").toString(),
      timestamp: Date.now(),
    };
    console.log("🧪 TEST INJECT:", JSON.stringify(donation));
    await setLatest(donation);
    res.status(200).json({ status: "OK", donation });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

module.exports = app;
