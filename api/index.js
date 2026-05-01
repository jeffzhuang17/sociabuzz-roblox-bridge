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
        // Sociabuzz kirim field: "supporter" (confirmed dari log)
        const rawName = (
            d.supporter      ||  // ✅ field utama Sociabuzz
            d.supporter_name ||
            d.donator_name   ||
            d.sender_name    ||
            d.name           ||
            d.donator        ||
            ""
        ).toString().trim();

        console.log("👤 Nama donatur:", rawName);

        if (!rawName || rawName.toLowerCase() === "anonymous") {
            console.warn("⚠️ Skip: nama kosong atau anonymous");
            return res.status(200).send("SKIP_ANONYMOUS");
        }

        // ── Amount ────────────────────────────────────────────────
        // Sociabuzz kirim field: "amount" (confirmed dari log)
        const rawAmount = d.amount_raw || d.amount || d.net_amount || 0;
        const amount = parseInt(String(rawAmount).replace(/\D/g, "")) || 0;

        console.log("💰 Amount:", amount);

        if (amount <= 0) {
            console.warn("⚠️ Skip: amount <= 0");
            return res.status(200).send("SKIP_ZERO");
        }

        // ── ID unik & stabil ──────────────────────────────────────
        // Sociabuzz kirim field: "id" (confirmed dari log)
        const stableId = (
            d.id               ||
            d.order_id         ||
            d.transaction_id   ||
            d.invoice_id       ||
            `${rawName.toLowerCase()}_${amount}_${Math.floor(Date.now() / 60000)}`
        ).toString();

        console.log("🆔 Donation ID:", stableId);

        const donation = {
            id:        stableId,
            donator:   rawName,
            amount:    amount,
            message:   (d.message || d.note || "").toString().trim(),
            timestamp: Math.floor(Date.now() / 1000),
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
