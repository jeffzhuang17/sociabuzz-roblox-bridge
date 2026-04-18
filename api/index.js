const express = require('express');
const app = express();
app.use(express.json());

let latestDonation = { id: "START", donator: "System", amount: 0, message: "Ready", timestamp: 0 };

app.get('/', (req, res) => res.send("JJ STUDIO API IS RUNNING"));
app.get('/api/donations/latest', (req, res) => res.json(latestDonation));

app.post('/api/webhook/sociabuzz', (req, res) => {
    const d = req.body;
    
    // FIX NAMA: Mencari nama di semua kemungkinan variabel Sociabuzz
    const name = d.donator_name || d.sender_name || d.supporter_name || d.name || "Anonymous";
    
    // FIX ANGKA: Membersihkan format Rp atau titik agar tidak jadi 0
    let rawAmount = d.amount_raw || d.amount || 0;
    let cleanAmount = String(rawAmount).replace(/\D/g, ""); 
    const amount = parseInt(cleanAmount) || 0;

    if (amount > 0) {
        latestDonation = {
            id: d.order_id || d.transaction_id || Date.now().toString(),
            donator: name,
            amount: amount,
            message: d.message || "",
            timestamp: Math.floor(Date.now() / 1000)
        };
    }
    res.status(200).send("OK");
});

module.exports = app;
