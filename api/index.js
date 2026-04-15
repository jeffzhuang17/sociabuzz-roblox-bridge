const express = require('express');
const app = express();
app.use(express.json());

let latestDonation = { id: "START", donator: "System", amount: 0, message: "Ready", timestamp: 0 };

app.get('/', (req, res) => res.send("SERVER AKTIF"));
app.get('/api/donations/latest', (req, res) => res.json(latestDonation));
app.post('/api/webhook/sociabuzz', (req, res) => {
    const d = req.body;
    latestDonation = {
        id: d.order_id || Date.now().toString(),
        donator: d.donator_name || "Anonymous",
        amount: parseInt(d.amount_raw || 0),
        message: d.message || "",
        timestamp: Math.floor(Date.now() / 1000)
    };
    res.status(200).send("OK");
});

module.exports = app;