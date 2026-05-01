// ============================================================
// DONATION BRIDGE — Vercel API
// api/index.js — FINAL v5 (millisecond timestamp)
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

async function setLatest(data) {
	if (!REDIS_URL) { console.warn("⚠️ REDIS_URL tidak ada"); return; }
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
		console.log("✅ Redis SET:", JSON.stringify(json));
	} catch (err) {
		console.error("❌ Redis SET error:", err.message);
	}
}

async function getLatest() {
	if (!REDIS_URL) { return defaultDonation; }
	try {
		const res  = await fetch(`${REDIS_URL}/get/latestDonation`, {
			headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
		});
		const json = await res.json();
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

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin",  "*");
	res.header("Access-Control-Allow-Headers", "*");
	res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	if (req.method === "OPTIONS") return res.status(200).end();
	next();
});

app.get('/', (req, res) => {
	res.send("DONATION BRIDGE AKTIF v5");
});

app.get('/api/donations/latest', async (req, res) => {
	try {
		const data = await getLatest();
		console.log("📤 GET /latest:", JSON.stringify(data));
		res.status(200).json(data);
	} catch (err) {
		res.status(200).json(defaultDonation);
	}
});

app.post('/api/webhook/sociabuzz', async (req, res) => {
	console.log("════════════════════════════════════");
	console.log("📦 WEBHOOK MASUK");
	console.log("Body:", JSON.stringify(req.body));
	console.log("════════════════════════════════════");

	try {
		const d = req.body.data || req.body;

		const rawName = (
			d.supporter      ||
			d.supporter_name ||
			d.donator_name   ||
			d.sender_name    ||
			d.name           ||
			d.donator        ||
			d.from           ||
			d.user_name      ||
			d.username       ||
			d.nickname       ||
			""
		).toString().trim();

		console.log("👤 Nama:", rawName);

		if (!rawName || rawName.toLowerCase() === "anonymous") {
			console.warn("⚠️ Skip: anonymous");
			return res.status(200).json({ status: "SKIP_ANONYMOUS" });
		}

		const rawAmount = d.amount_raw || d.amount || d.net_amount || d.total || d.price || d.value || 0;
		const amount    = parseInt(String(rawAmount).replace(/\D/g, "")) || 0;

		console.log("💰 Amount:", amount);

		if (amount <= 0) {
			console.warn("⚠️ Skip: amount 0");
			return res.status(200).json({ status: "SKIP_ZERO" });
		}

		const donationId = (
			d.id             ||
			d.order_id       ||
			d.transaction_id ||
			d.invoice_id     ||
			d.ref_id         ||
			`${rawName.toLowerCase().replace(/\s/g,"_")}_${amount}_${Date.now()}`
		).toString();

		// PENTING: pakai milidetik (Date.now()) bukan detik
		// Supaya donate berkali-kali dalam 1 detik tetap punya timestamp berbeda
		const nowTimestamp = Date.now();

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
		console.error("❌ Error:", err.message);
		res.status(200).json({ status: "ERROR", message: err.message });
	}
});

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
			timestamp: Date.now(), // milidetik
		};
		console.log("🧪 TEST INJECT:", JSON.stringify(donation));
		await setLatest(donation);
		res.status(200).json({ status: "OK", donation });
	} catch (err) {
		res.status(500).json({ status: "ERROR", message: err.message });
	}
});

module.exports = app;
