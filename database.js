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
      cancel_token     TEXT    UNIQUE NOT NULL,
      status           TEXT    DEFAULT 'active',
      created_at       TEXT    DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_slot
      ON appointments (appointment_date, appointment_time)
      WHERE status = 'active';
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

function insertAppointment({ name, phone, service, duration, date, time, comment, cancelToken }) {
  const stmt = getDb().prepare(`
    INSERT INTO appointments (name, phone, service, duration, appointment_date, appointment_time, comment, cancel_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(name, phone, service, duration, date, time, comment || null, cancelToken);
}

function cancelAppointment(token) {
  const stmt = getDb().prepare(
    `UPDATE appointments SET status = 'cancelled' WHERE cancel_token = ? AND status = 'active'`
  );
  return stmt.run(token);
}

function getAppointmentByToken(token) {
  return getDb().prepare(
    `SELECT * FROM appointments WHERE cancel_token = ?`
  ).get(token);
}

module.exports = {
  getDb,
  getBookedSlots,
  isSlotTaken,
  insertAppointment,
  cancelAppointment,
  getAppointmentByToken,
};
