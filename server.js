require('dotenv').config();
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const db = require('./database');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

db.setPool(pool);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const FIXED_SLOTS = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '19:30'];
const LATE_SLOTS = ['18:30', '19:30'];
const AVAILABLE_DAYS = [3, 5];

// ─── Helpers ────────────────────────────────────────────────

function getNowInSanDiego() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function isAvailableDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return AVAILABLE_DAYS.includes(d.getDay());
}

function todayISO() {
  const nowSD = getNowInSanDiego();
  return nowSD.getFullYear() + '-' +
    String(nowSD.getMonth() + 1).padStart(2, '0') + '-' +
    String(nowSD.getDate()).padStart(2, '0');
}

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('Telegram send failed:', err.message);
  }
}

// ─── Routes ─────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !isValidDate(date)) {
      return res.status(400).json({ error: 'Invalid or missing date (YYYY-MM-DD).' });
    }

    const today = todayISO();
    if (date < today) {
      return res.status(400).json({ error: 'Cannot view past dates.' });
    }

    if (!isAvailableDay(date)) {
      return res.json({ slots: [], booked: [], unavailable: true });
    }

    let slots = [...FIXED_SLOTS];

    const nowSD = getNowInSanDiego();
    if (date === today) {
      const current = nowSD.getHours() * 60 + nowSD.getMinutes();
      slots = slots.filter((s) => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m > current;
      });
    }

    const booked = await db.getBookedSlots(date);

    res.json({ slots, booked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/book', async (req, res) => {
  try {
    const { name, phone, date, time, comment } = req.body;
    const clientDuration = parseInt(req.body.duration, 10);
    const duration = clientDuration === 90 ? 90 : 60;
    const price = duration === 90 ? 200 : 140;
    const service = `${duration} min session — $${price}`;

    if (!name || !phone || !date || !time) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({ success: false, error: 'Invalid date format.' });
    }
    const today = todayISO();
    if (date < today) {
      return res.status(400).json({ success: false, error: 'Cannot book in the past.' });
    }
    if (date === today) {
      const [h, m] = time.split(':').map(Number);
      const slotMin = h * 60 + m;
      const nowSD = getNowInSanDiego();
      const nowMin = nowSD.getHours() * 60 + nowSD.getMinutes();
      if (slotMin <= nowMin) {
        return res.status(400).json({ success: false, error: 'This time has already passed.' });
      }
    }
    if (!isAvailableDay(date)) {
      return res.status(400).json({ success: false, error: 'Sessions are available on Wednesdays and Fridays only.' });
    }
    if (!FIXED_SLOTS.includes(time)) {
      return res.status(400).json({ success: false, error: 'Invalid time slot.' });
    }
    if (duration === 90 && LATE_SLOTS.includes(time)) {
      return res.status(400).json({ success: false, error: '90-min sessions cannot be booked at 18:30 or 19:30.' });
    }
    if (await db.isSlotTaken(date, time)) {
      return res.status(409).json({ success: false, error: 'This slot was just taken. Please choose another time.' });
    }

    try {
      await db.insertAppointment({ name, phone, date, time, duration, price, comment });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'This slot was just taken. Please choose another time.' });
      }
      throw err;
    }

    const tgMessage =
      `📋 <b>New Booking!</b>\n` +
      `👤 Name: ${name}\n` +
      `📞 Phone: ${phone}\n` +
      `💆 Session: ${service}\n` +
      `📅 Date: ${date}\n` +
      `🕐 Time: ${time}\n` +
      `💬 Comment: ${comment || '—'}`;
    await sendTelegram(tgMessage);

    res.json({ success: true, message: "You're booked!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── Cancel Routes (phone-based) ────────────────────────────

app.post('/api/cancel/lookup', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }

    const today = todayISO();
    const appointments = await db.getActiveAppointmentsByPhone(phone, today);

    res.json({ success: true, appointments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

app.post('/api/cancel/confirm', async (req, res) => {
  try {
    const { id, phone } = req.body;
    if (!id || !phone) {
      return res.status(400).json({ success: false, error: 'Appointment ID and phone are required.' });
    }

    const appointment = await db.getAppointmentById(id);
    const result = await db.cancelAppointmentById(id, phone);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found or already cancelled.' });
    }

    if (appointment) {
      const tgMessage =
        `❌ <b>Booking Cancelled</b>\n` +
        `👤 Name: ${appointment.name}\n` +
        `📅 ${appointment.appointment_date} at ${appointment.appointment_time}\n` +
        `💆 ${appointment.service}\n` +
        `❗ Cancelled by client via website`;
      await sendTelegram(tgMessage);
    }

    res.json({ success: true, message: 'Your appointment has been cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── Review Routes ──────────────────────────────────────────

app.post('/api/reviews/submit', async (req, res) => {
  try {
    const { name, phone, text, rating } = req.body;

    if (!name || !text) {
      return res.status(400).json({ success: false, error: 'Name and review text are required.' });
    }

    const r = parseInt(rating, 10);
    if (!r || r < 1 || r > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5.' });
    }

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }

    const appointmentCount = await db.countAppointmentsByPhone(phone);
    if (appointmentCount === 0) {
      return res.json({ success: false, error: 'Only clients who have booked a session can leave a review.' });
    }

    const reviewCount = await db.countReviewsByPhone(phone);
    if (reviewCount > 0) {
      return res.json({ success: false, error: 'You have already submitted a review.' });
    }

    await db.insertReview({ name, phone, text, rating: r });

    res.json({ success: true, message: 'Thank you! Your review will appear after approval.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

app.get('/api/reviews', async (_req, res) => {
  try {
    const reviews = await db.getApprovedReviews();
    res.json({ reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reviews: [], error: 'Server error.' });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in environment. Set it in .env (see .env.example).');
    process.exit(1);
  }
  try {
    await db.init();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
