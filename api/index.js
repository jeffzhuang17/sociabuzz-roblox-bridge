const express = require('express');
const app = express();
app.use(express.json());

let donations    = [];
let donationMap  = {};
let latestDonation = {
    id:        "START",
    donator:   "System",
    amount:    0,
    message:   "Ready",
    timestamp: 0
};

app.get('/', (req, res) => res.send("SERVER AKTIF"));

app.get('/api/donations/latest', (req, res) => {
    res.json(latestDonation);
});

app.get('/api/donations/top', (req, res) => {
    const topList = Object.entries(donationMap)
        .map(([name, total]) => ({ name: name, total: total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 100);
    res.json(topList);
});

app.get('/api/donations/history', (req, res) => {
    res.json(donations.slice(-50));
});

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

    latestDonation = donation;

    donations.push(donation);
    if (donations.length > 500) {
        donations = donations.slice(-500);
    }

    if (donationMap[donatorName]) {
        donationMap[donatorName] += amount;
    } else {
        donationMap[donatorName] = amount;
    }

    console.log(`[DONASI] ${donatorName} - Rp${amount}`);
    res.status(200).send("OK");
});

module.exports = app;
