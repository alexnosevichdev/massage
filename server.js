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
const WORK_START = process.env.WORK_START || '10:00';
const WORK_END = process.env.WORK_END || '20:00';
const SLOT_DURATION = parseInt(process.env.SLOT_DURATION, 10) || 60;
const WORK_DAYS = (process.env.WORK_DAYS || '1,2,3,4,5').split(',').map(Number);

// ─── Helpers ────────────────────────────────────────────────

function generateSlots(startStr, endStr, durationMin) {
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const slots = [];
  for (let m = startMinutes; m + durationMin <= endMinutes; m += durationMin) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function isWorkDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jsDay = d.getDay(); // 0=Sun
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return WORK_DAYS.includes(isoDay);
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

  if (!isWorkDay(date)) {
    return res.json({ slots: [], booked: [], dayOff: true });
  }

  let slots = generateSlots(WORK_START, WORK_END, SLOT_DURATION);

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
  const { name, phone, service, duration, date, time, comment } = req.body;

  if (!name || !phone || !service || !duration || !date || !time) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, error: 'Invalid date format.' });
  }
  if (date < todayISO()) {
    return res.status(400).json({ success: false, error: 'Cannot book in the past.' });
  }
  if (!isWorkDay(date)) {
    return res.status(400).json({ success: false, error: 'Selected date is a day off.' });
  }

  const allSlots = generateSlots(WORK_START, WORK_END, SLOT_DURATION);
  if (!allSlots.includes(time)) {
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

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
