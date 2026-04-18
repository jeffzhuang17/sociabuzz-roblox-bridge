const express = require('express');
const app = express();
app.use(express.json());

// Inisialisasi data awal
let latestDonation = { id: "START", donator: "System", amount: 0, message: "Ready", timestamp: 0 };

app.get('/', (req, res) => res.send("SERVER JJ STUDIO AKTIF - ANTI ANONYMOUS MODE"));
app.get('/api/donations/latest', (req, res) => res.json(latestDonation));

app.post('/api/webhook/sociabuzz', (req, res) => {
    // Sociabuzz sering membungkus data dalam properti 'data'
    const d = req.body.data || req.body; 
    
    // PENCARIAN NAMA AGRESIF: Mencek semua kemungkinan field dari Sociabuzz
    const name = d.donator_name || d.sender_name || d.name || d.supporter_name || "Anonymous";
    
    // PEMBERSIHAN NOMINAL: Menghapus karakter non-angka agar tidak jadi 0
    let rawAmount = d.amount_raw || d.amount || 0;
    let cleanAmount = String(rawAmount).replace(/\D/g, ""); 
    const amount = parseInt(cleanAmount) || 0;

    // HANYA PROSES JIKA ADA NAMA ASLI DAN NOMINAL VALID
    if (amount > 0 && name !== "Anonymous" && name !== "") {
        latestDonation = {
            id: d.order_id || d.transaction_id || Date.now().toString(),
            donator: name,
            amount: amount,
            message: d.message || "",
            timestamp: Math.floor(Date.now() / 1000)
        };
        console.log("✅ Donasi Diterima dari:", name, "Sebesar:", amount);
    } else {
        console.log("⚠️ Donasi diabaikan karena nama Anonymous atau nominal 0");
    }
    res.status(200).send("OK");
});

module.exports = app;
