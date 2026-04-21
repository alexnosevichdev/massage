const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'appointments.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    init();
  }
  return db;
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      phone            TEXT    NOT NULL,
      service          TEXT    NOT NULL,
      duration         INTEGER NOT NULL,
      appointment_date TEXT    NOT NULL,
      appointment_time TEXT    NOT NULL,
      comment          TEXT,
      cancel_token     TEXT,
      status           TEXT    DEFAULT 'active',
      created_at       TEXT    DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_slot
      ON appointments (appointment_date, appointment_time)
      WHERE status = 'active';

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_name TEXT NOT NULL,
      reviewer_phone TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      review_text TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function getBookedSlots(date) {
  const rows = getDb().prepare(
    `SELECT appointment_time FROM appointments
     WHERE appointment_date = ? AND status = 'active'`
  ).all(date);
  return rows.map(r => r.appointment_time);
}

function isSlotTaken(date, time) {
  const row = getDb().prepare(
    `SELECT id FROM appointments
     WHERE appointment_date = ? AND appointment_time = ? AND status = 'active'`
  ).get(date, time);
  return !!row;
}

function insertAppointment({ name, phone, service, duration, date, time, comment }) {
  const stmt = getDb().prepare(`
    INSERT INTO appointments (name, phone, service, duration, appointment_date, appointment_time, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(name, phone, service, duration, date, time, comment || null);
}

function getActiveAppointmentsByPhone(phone, todayISO) {
  return getDb().prepare(
    `SELECT id, name, service, appointment_date, appointment_time
     FROM appointments
     WHERE phone = ? AND status = 'active' AND appointment_date >= ?
     ORDER BY appointment_date, appointment_time`
  ).all(phone, todayISO);
}

function cancelAppointmentById(id, phone) {
  const stmt = getDb().prepare(
    `UPDATE appointments SET status = 'cancelled' WHERE id = ? AND phone = ? AND status = 'active'`
  );
  return stmt.run(id, phone);
}

function getAppointmentById(id) {
  return getDb().prepare(
    `SELECT * FROM appointments WHERE id = ?`
  ).get(id);
}

function countAppointmentsByPhone(phone) {
  const row = getDb().prepare(
    `SELECT COUNT(*) AS cnt FROM appointments WHERE phone = ? AND (status = 'active' OR status = 'cancelled')`
  ).get(phone);
  return row.cnt;
}

function countReviewsByPhone(phone) {
  const row = getDb().prepare(
    `SELECT COUNT(*) AS cnt FROM reviews WHERE reviewer_phone = ?`
  ).get(phone);
  return row.cnt;
}

function insertReview({ name, phone, text, rating }) {
  const stmt = getDb().prepare(`
    INSERT INTO reviews (reviewer_name, reviewer_phone, review_text, rating)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(name, phone, text, rating);
}

function getApprovedReviews() {
  return getDb().prepare(
    `SELECT * FROM reviews WHERE status = 'approved' ORDER BY created_at DESC`
  ).all();
}

module.exports = {
  getDb,
  getBookedSlots,
  isSlotTaken,
  insertAppointment,
  getActiveAppointmentsByPhone,
  cancelAppointmentById,
  getAppointmentById,
  countAppointmentsByPhone,
  countReviewsByPhone,
  insertReview,
  getApprovedReviews,
};
