const express = require('express');
const app = express();
app.use(express.json());

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const defaultDonation = {
    id:        "START",
    donator:   "System",
    amount:    0,
    message:   "Ready",
    timestamp: 0
};

async function setLatest(data) {
    if (!REDIS_URL) return;
    await fetch(`${REDIS_URL}/set/latestDonation`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REDIS_TOKEN}`,
            'Content-Type':  'application/json'
        },
        body: JSON.stringify({ value: JSON.stringify(data) })
    });
}

async function getLatest() {
    if (!REDIS_URL) return defaultDonation;
    try {
        const res  = await fetch(`${REDIS_URL}/get/latestDonation`, {
            headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
        });
        const json = await res.json();
        return json.result ? JSON.parse(json.result) : defaultDonation;
    } catch {
        return defaultDonation;
    }
}

app.get('/', (req, res) => res.send("SERVER JJ STUDIO AKTIF - ANTI ANONYMOUS MODE"));

app.get('/api/donations/latest', async (req, res) => {
    try {
        const data = await getLatest();
        res.json(data);
    } catch {
        res.json(defaultDonation);
    }
});

app.post('/api/webhook/sociabuzz', async (req, res) => {
    console.log("📦 BODY RAW:", JSON.stringify(req.body));

    try {
        const d = req.body.data || req.body;

        // ── Nama donatur ──────────────────────────────────────────
        // Field "supporter" confirmed dari log Sociabuzz
        const rawName = (
            d.supporter      ||
            d.supporter_name ||
            d.donator_name   ||
            d.sender_name    ||
            d.name           ||
            d.donator        ||
            ""
        ).toString().trim();

        console.log("👤 Nama:", rawName);

        if (!rawName || rawName.toLowerCase() === "anonymous") {
            console.warn("⚠️ Skip: nama kosong atau anonymous");
            return res.status(200).send("SKIP_ANONYMOUS");
        }

        // ── Amount ────────────────────────────────────────────────
        const rawAmount = d.amount_raw || d.amount || d.net_amount || 0;
        const amount = parseInt(String(rawAmount).replace(/\D/g, "")) || 0;

        console.log("💰 Amount:", amount);

        if (amount <= 0) {
            console.warn("⚠️ Skip: amount <= 0");
            return res.status(200).send("SKIP_ZERO");
        }

        // ── ID dari Sociabuzz ─────────────────────────────────────
        const donationId = (
            d.id             ||
            d.order_id       ||
            d.transaction_id ||
            d.invoice_id     ||
            `${rawName.toLowerCase()}_${amount}_${Date.now()}`
        ).toString();

        // ── TIMESTAMP — selalu pakai waktu SEKARANG saat webhook diterima ──
        // KUNCI UTAMA: Roblox deteksi donasi baru via timestamp bukan ID
        // Jangan pakai d.created_at dari Sociabuzz karena bisa sama/lama
        const nowTimestamp = Math.floor(Date.now() / 1000);

        const donation = {
            id:        donationId,
            donator:   rawName,
            amount:    amount,
            message:   (d.message || d.note || "").toString().trim(),
            timestamp: nowTimestamp,
        };

        console.log("✅ DONATION TERSIMPAN:", JSON.stringify(donation));
        await setLatest(donation);
        res.status(200).send("OK");

    } catch (err) {
        console.error("❌ Error:", err.message);
        res.status(500).send("ERROR");
    }
});

module.exports = app;
