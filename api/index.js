// ============================================================
// DONATION BRIDGE — Vercel API
// api/index.js — FIXED v4 (full field coverage + debug log)
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const defaultDonation = {
    id:        "START",
    donator:   "System",
    amount:    0,
    message:   "Ready",
    timestamp: 0
};

// ── Redis helpers ─────────────────────────────────────────────

async function setLatest(data) {
    if (!REDIS_URL) {
        console.warn("⚠️ REDIS_URL tidak ada — skip set");
        return;
    }
    try {
        const res = await fetch(`${REDIS_URL}/set/latestDonation`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${REDIS_TOKEN}`,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({ value: JSON.stringify(data) })
        });
        const json = await res.json();
        console.log("✅ Redis SET result:", JSON.stringify(json));
    } catch (err) {
        console.error("❌ Redis SET error:", err.message);
    }
}

async function getLatest() {
    if (!REDIS_URL) {
        console.warn("⚠️ REDIS_URL tidak ada — return default");
        return defaultDonation;
    }
    try {
        const res  = await fetch(`${REDIS_URL}/get/latestDonation`, {
            headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
        });
        const json = await res.json();
        console.log("📦 Redis GET raw:", JSON.stringify(json));

        if (json.result) {
            const parsed = JSON.parse(json.result);
            return {
                id:        String(parsed.id        || "START"),
                donator:   String(parsed.donator   || "System"),
                amount:    Number(parsed.amount    || 0),
                message:   String(parsed.message   || ""),
                timestamp: Number(parsed.timestamp || 0)
            };
        }
        return defaultDonation;
    } catch (err) {
        console.error("❌ getLatest error:", err.message);
        return defaultDonation;
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
    res.setHeader('Content-Type', 'text/plain');
    res.send("DONATION BRIDGE AKTIF v4");
});

app.get('/api/donations/latest', async (req, res) => {
    try {
        const data = await getLatest();
        console.log("📤 GET /latest response:", JSON.stringify(data));
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(data);
    } catch (err) {
        console.error("❌ GET latest error:", err.message);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(defaultDonation);
    }
});

// ── Webhook Sociabuzz ─────────────────────────────────────────
// Sociabuzz mengirim struktur berbeda-beda tergantung versi.
// Kita coba semua kemungkinan field.

app.post('/api/webhook/sociabuzz', async (req, res) => {
    console.log("============================================");
    console.log("📦 WEBHOOK MASUK");
    console.log("Headers:", JSON.stringify(req.headers));
    console.log("Body RAW:", JSON.stringify(req.body));
    console.log("============================================");

    try {
        // Sociabuzz kadang wrap di .data, kadang langsung root
        const d = req.body.data || req.body;

        console.log("📋 Parsed d:", JSON.stringify(d));

        // ── Ambil nama donatur (cek semua field yang mungkin) ─
        const rawName = (
            d.supporter          ||
            d.supporter_name     ||
            d.donator_name       ||
            d.sender_name        ||
            d.name               ||
            d.donator            ||
            d.from               ||
            d.user_name          ||
            d.username           ||
            d.nickname           ||
            ""
        ).toString().trim();

        console.log("👤 Nama ditemukan:", rawName);

        if (!rawName || rawName.toLowerCase() === "anonymous") {
            console.warn("⚠️ Skip: nama kosong atau anonymous");
            return res.status(200).json({ status: "SKIP_ANONYMOUS" });
        }

        // ── Ambil amount (cek semua field yang mungkin) ───────
        const rawAmount =
            d.amount_raw     ||
            d.amount         ||
            d.net_amount     ||
            d.total          ||
            d.price          ||
            d.value          ||
            0;

        const amount = parseInt(String(rawAmount).replace(/\D/g, "")) || 0;

        console.log("💰 Amount ditemukan:", amount);

        if (amount <= 0) {
            console.warn("⚠️ Skip: amount <= 0");
            return res.status(200).json({ status: "SKIP_ZERO" });
        }

        // ── ID unik donasi ────────────────────────────────────
        const donationId = (
            d.id             ||
            d.order_id       ||
            d.transaction_id ||
            d.invoice_id     ||
            d.ref_id         ||
            `${rawName.toLowerCase().replace(/\s/g,"_")}_${amount}_${Date.now()}`
        ).toString();

        // Timestamp = waktu sekarang (server terima webhook)
        const nowTimestamp = Math.floor(Date.now() / 1000);

        const donation = {
            id:        donationId,
            donator:   rawName,
            amount:    amount,
            message:   (d.message || d.note || d.description || "").toString().trim(),
            timestamp: nowTimestamp,
        };

        console.log("✅ DONATION DISIMPAN:", JSON.stringify(donation));
        await setLatest(donation);

        res.status(200).json({ status: "OK", donation });

    } catch (err) {
        console.error("❌ Webhook error:", err.message);
        // Tetap 200 agar Sociabuzz tidak retry terus
        res.status(200).json({ status: "ERROR", message: err.message });
    }
});

// ── Manual inject (untuk testing dari Roblox Studio / Postman) ─

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
            timestamp: Math.floor(Date.now() / 1000),
        };
        console.log("🧪 TEST INJECT:", JSON.stringify(donation));
        await setLatest(donation);
        res.status(200).json({ status: "OK", donation });
    } catch (err) {
        res.status(500).json({ status: "ERROR", message: err.message });
    }
});

module.exports = app;
