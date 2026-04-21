require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const FIXED_SLOTS = ['08:00','09:30','11:00','12:30','14:00','15:30','17:00','18:30','19:30'];
const AVAILABLE_DAYS = [3, 5]; // Wednesday, Friday (JS getDay(): 0=Sun)

// ─── Helpers ────────────────────────────────────────────────

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function isAvailableDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return AVAILABLE_DAYS.includes(d.getDay());
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
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

app.get('/api/slots', (req, res) => {
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

  if (date === today) {
    const current = nowMinutes();
    slots = slots.filter(s => {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m > current;
    });
  }

  const booked = db.getBookedSlots(date);

  res.json({ slots, booked });
});

app.post('/api/book', (req, res) => {
  const { name, phone, date, time, comment } = req.body;
  const service = 'Therapeutic Massage Session';
  const duration = 60;

  if (!name || !phone || !date || !time) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, error: 'Invalid date format.' });
  }
  if (date < todayISO()) {
    return res.status(400).json({ success: false, error: 'Cannot book in the past.' });
  }
  if (!isAvailableDay(date)) {
    return res.status(400).json({ success: false, error: 'Sessions are available on Wednesdays and Fridays only.' });
  }

  if (!FIXED_SLOTS.includes(time)) {
    return res.status(400).json({ success: false, error: 'Invalid time slot.' });
  }

  if (db.isSlotTaken(date, time)) {
    return res.status(409).json({ success: false, error: 'This slot was just taken. Please choose another time.' });
  }

  const cancelToken = crypto.randomBytes(32).toString('hex');

  try {
    db.insertAppointment({ name, phone, service, duration, date, time, comment, cancelToken });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, error: 'This slot was just taken. Please choose another time.' });
    }
    throw err;
  }

  const tgMessage =
    `📋 <b>New Booking!</b>\n` +
    `👤 Name: ${name}\n` +
    `📞 Phone: ${phone}\n` +
    `💆 Service: ${service} (${duration} min)\n` +
    `📅 Date: ${date}\n` +
    `🕐 Time: ${time}\n` +
    `💬 Comment: ${comment || '—'}`;
  sendTelegram(tgMessage);

  res.json({ success: true, token: cancelToken, message: "You're booked!" });
});

app.post('/api/cancel', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token is required.' });
  }

  const appointment = db.getAppointmentByToken(token);
  const result = db.cancelAppointment(token);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: 'Booking not found or already cancelled.' });
  }

  if (appointment) {
    const tgMessage =
      `❌ <b>Booking Cancelled</b>\n` +
      `👤 Name: ${appointment.name}\n` +
      `📅 ${appointment.appointment_date} at ${appointment.appointment_time}\n` +
      `💆 Service: ${appointment.service}`;
    sendTelegram(tgMessage);
  }

  res.json({ success: true, message: 'Your booking has been cancelled.' });
});

// ─── Review Routes ──────────────────────────────────────────

app.post('/api/reviews/submit', (req, res) => {
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

  const appointmentCount = db.countAppointmentsByPhone(phone);
  if (appointmentCount === 0) {
    return res.json({ success: false, error: 'Only clients who have booked a session can leave a review.' });
  }

  const reviewCount = db.countReviewsByPhone(phone);
  if (reviewCount > 0) {
    return res.json({ success: false, error: 'You have already submitted a review.' });
  }

  db.insertReview({ name, phone, text, rating: r });

  res.json({ success: true, message: 'Thank you! Your review will appear after approval.' });
});

app.get('/api/reviews', (_req, res) => {
  const reviews = db.getApprovedReviews();
  res.json({ reviews });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
