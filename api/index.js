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
    // LOG SEMUA — untuk debug format payload Sociabuzz
    console.log("📨 HEADERS:", JSON.stringify(req.headers));
    console.log("📦 BODY:", JSON.stringify(req.body));
    console.log("📋 BODY KEYS:", Object.keys(req.body || {}).join(", "));

    // Cek apakah ada nested data
    const d = req.body.data || req.body;
    console.log("📋 D KEYS:", Object.keys(d || {}).join(", "));
    console.log("📋 D VALUES:", JSON.stringify(d));

    // Terima semua untuk sekarang, simpan apapun yang masuk
    try {
        const donation = {
            id:        d.order_id || d.transaction_id || Date.now().toString(),
            donator:   d.donator_name || d.sender_name || d.name || d.supporter_name || d.donator || "UNKNOWN",
            amount:    parseInt(String(d.amount_raw || d.amount || 0).replace(/\D/g, "")) || 0,
            message:   d.message || "",
            timestamp: Math.floor(Date.now() / 1000),
            raw:       JSON.stringify(d) // simpan raw untuk debug
        };
        console.log("✅ PARSED:", JSON.stringify(donation));
        await setLatest(donation);
        res.status(200).send("OK");
    } catch (err) {
        console.error("❌ Error:", err.message);
        res.status(500).send("ERROR");
    }
});

module.exports = app;
