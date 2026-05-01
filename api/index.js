// ============================================================
// DONATION BRIDGE — Vercel API
// api/index.js — FINAL v8 (Queue Support, anti double donate)
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

// QUEUE: array of donations, bukan single item
let memoryQueue = [];

const defaultDonation = {
  id:        "START",
  donator:   "System",
  amount:    0,
  message:   "Ready",
  timestamp: 0
};

// ── Redis queue helpers ───────────────────────────────────────
// Pakai Redis List (RPUSH = push ke kanan, LPOP = ambil dari kiri = FIFO)
// Key: "donationQueue"

async function pushDonation(data) {
  try {
    if (redis) {
      await redis.rpush("donationQueue", JSON.stringify(data));
      console.log("✅ Redis RPUSH sukses:", JSON.stringify(data));
    } else {
      memoryQueue.push(data);
      console.log("✅ Memory PUSH sukses:", JSON.stringify(data));
    }
  } catch (err) {
    console.error("❌ pushDonation error:", err.message);
    memoryQueue.push(data); // fallback
  }
}

// Ambil SEMUA item dari queue (tanpa hapus), return array
async function peekQueue() {
  try {
    if (redis) {
      // LRANGE 0 -1 = ambil semua tanpa hapus
      const items = await redis.lrange("donationQueue", 0, -1);
      console.log("📦 Redis LRANGE raw count:", items ? items.length : 0);
      if (!items || items.length === 0) return [];
      return items.map(raw => {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return {
          id:        String(parsed.id        || "START"),
          donator:   String(parsed.donator   || "System"),
          amount:    Number(parsed.amount    || 0),
          message:   String(parsed.message   || ""),
          timestamp: Number(parsed.timestamp || 0)
        };
      });
    } else {
      return [...memoryQueue];
    }
  } catch (err) {
    console.error("❌ peekQueue error:", err.message);
    return [...memoryQueue];
  }
}

// Hapus semua item dari queue yang timestamp-nya <= lastTimestamp
// Roblox kirim lastTimestamp setelah dia proses semua
async function ackDonations(lastTimestamp) {
  try {
    if (redis) {
      // Ambil semua, filter yang belum diproses, simpan kembali
      const items = await redis.lrange("donationQueue", 0, -1);
      if (!items || items.length === 0) return;

      const remaining = items.filter(raw => {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Number(parsed.timestamp || 0) > lastTimestamp;
      });

      // Hapus semua lalu push kembali yang belum diproses
      await redis.del("donationQueue");
      if (remaining.length > 0) {
        // RPUSH bisa menerima multiple args
        for (const item of remaining) {
          await redis.rpush("donationQueue", typeof item === "string" ? item : JSON.stringify(item));
        }
      }
      console.log(`✅ ACK done. Sisa queue: ${remaining.length}`);
    } else {
      memoryQueue = memoryQueue.filter(d => Number(d.timestamp || 0) > lastTimestamp);
    }
  } catch (err) {
    console.error("❌ ackDonations error:", err.message);
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
  res.send("DONATION BRIDGE AKTIF v8 - Redis Queue");
});

// Roblox poll: ambil semua donasi baru sejak lastTimestamp
// GET /api/donations/queue?since=<lastTimestamp>
app.get('/api/donations/queue', async (req, res) => {
  try {
    const since = Number(req.query.since || 0);
    const all   = await peekQueue();
    // Filter hanya yang lebih baru dari lastTimestamp
    const newOnes = all.filter(d => d.timestamp > since);
    console.log(`📤 GET /queue since=${since} → ${newOnes.length} item baru`);
    res.status(200).json({ donations: newOnes });
  } catch (err) {
    console.error("❌ GET queue error:", err.message);
    res.status(200).json({ donations: [] });
  }
});

// Roblox ACK: kasih tahu server sudah proses sampai timestamp berapa
// POST /api/donations/ack  body: { lastTimestamp: <number> }
app.post('/api/donations/ack', async (req, res) => {
  try {
    const lastTimestamp = Number(req.body.lastTimestamp || 0);
    console.log("📨 ACK lastTimestamp:", lastTimestamp);
    await ackDonations(lastTimestamp);
    res.status(200).json({ status: "OK" });
  } catch (err) {
    console.error("❌ ACK error:", err.message);
    res.status(200).json({ status: "ERROR", message: err.message });
  }
});

// Legacy endpoint — tetap ada agar tidak breaking
app.get('/api/donations/latest', async (req, res) => {
  try {
    const all = await peekQueue();
    // Kembalikan item dengan timestamp terbesar (donasi paling baru)
    if (all.length === 0) {
      return res.status(200).json(defaultDonation);
    }
    const latest = all.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
    console.log("📤 GET /latest (legacy):", JSON.stringify(latest));
    res.status(200).json(latest);
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

    console.log("✅ DONATION PUSH KE QUEUE:", JSON.stringify(donation));
    await pushDonation(donation);
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
    await pushDonation(donation);
    res.status(200).json({ status: "OK", donation });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

module.exports = app;
