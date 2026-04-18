const express = require('express');
const app = express();
app.use(express.json());

// Simpan semua donasi di memory (tidak hilang selama server hidup)
// Untuk production sebaiknya pakai database, tapi ini sudah jauh lebih baik
let donations = [];
let donationMap = {}; // key: donator name, value: total amount

// Donasi awal supaya /latest tidak kosong
let latestDonation = {
    id: "START",
    donator: "System",
    amount: 0,
    message: "Ready",
    timestamp: 0
};

app.get('/', (req, res) => res.send("SERVER AKTIF"));

// Endpoint yang sudah ada - tidak berubah
app.get('/api/donations/latest', (req, res) => {
    res.json(latestDonation);
});

// Endpoint baru - top donators
app.get('/api/donations/top', (req, res) => {
    // Konversi donationMap ke array, sort by total descending
    const topList = Object.entries(donationMap)
        .map(([name, total]) => ({ name: name, total: total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 100);
    res.json(topList);
});

// Endpoint baru - semua history donasi
app.get('/api/donations/history', (req, res) => {
    res.json(donations.slice(-50)); // 50 donasi terakhir
});

// Webhook dari Sociabuzz - tidak berubah strukturnya
app.post('/api/webhook/sociabuzz', (req, res) => {
    const d = req.body;

    const donatorName = d.donator_name || "Anonymous";
    const amount      = parseInt(d.amount_raw || 0);

    const donation = {
        id:        d.order_id || Date.now().toString(),
        donator:   donatorName,
        amount:    amount,
        message:   d.message || "",
        timestamp: Math.floor(Date.now() / 1000)
    };

    // Update latest
    latestDonation = donation;

    // Simpan ke history
    donations.push(donation);
    if (donations.length > 500) {
        donations = donations.slice(-500); // Jaga max 500 entry
    }

    // Akumulasi total per donator
    if (donationMap[donatorName]) {
        donationMap[donatorName] += amount;
    } else {
        donationMap[donatorName] = amount;
    }

    console.log(`[DONASI] ${donatorName} - Rp${amount}`);
    res.status(200).send("OK");
});

module.exports = app;
