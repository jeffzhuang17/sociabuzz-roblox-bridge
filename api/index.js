const express = require('express');
const app = express();
app.use(express.json());

// Upstash Redis (gratis di upstash.com)
// Set environment variable: UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Opsional: secret token untuk keamanan webhook
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;

const defaultDonation = { 
    id: "START", 
    donator: "System", 
    amount: 0, 
    message: "Ready", 
    timestamp: 0 
};

// Helper: simpan ke Redis
async function setLatest(data) {
    if (!REDIS_URL) return; // fallback jika Redis belum dikonfigurasi
    await fetch(`${REDIS_URL}/set/latestDonation`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REDIS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: JSON.stringify(data) })
    });
}

// Helper: ambil dari Redis
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
    const data = await getLatest();
    res.json(data);
});

app.post('/api/webhook/sociabuzz', async (req, res) => {
    // Cek secret jika dikonfigurasi
    if (WEBHOOK_SECRET) {
        const token = req.headers['x-webhook-secret'] || req.query.secret;
        if (token !== WEBHOOK_SECRET) {
            console.log("⛔ Webhook ditolak: secret tidak cocok");
            return res.status(403).send("Forbidden");
        }
    }

    const d = req.body.data || req.body;

    // Pencarian nama agresif
    const name = d.donator_name 
               || d.sender_name 
               || d.name 
               || d.supporter_name 
               || "Anonymous";

    // Pembersihan nominal
    let rawAmount  = d.amount_raw || d.amount || 0;
    let cleanAmt   = String(rawAmount).replace(/\D/g, "");
    const amount   = parseInt(cleanAmt) || 0;

    if (amount > 0 && name !== "Anonymous" && name.trim() !== "") {
        const donation = {
            id:        d.order_id || d.transaction_id || Date.now().toString(),
            donator:   name.trim(),
            amount:    amount,
            message:   d.message || "",
            timestamp: Math.floor(Date.now() / 1000)
        };

        await setLatest(donation);
        console.log("✅ Donasi Diterima dari:", name, "Sebesar:", amount);
        res.status(200).send("OK");
    } else {
        console.log("⚠️ Diabaikan: Anonymous atau nominal 0");
        res.status(200).send("IGNORED");
    }
});

module.exports = app;
