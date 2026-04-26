let pool;

function setPool(createdPool) {
  pool = createdPool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool is not initialised. Call setPool() before use.');
  }
  return pool;
}

/** Map DB row to the shape the client / Telegram code expect */
function mapAppointmentRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    appointment_date: r.date,
    appointment_time: r.time,
    service: `${r.duration} min session — $${r.price}`,
    duration: r.duration,
    price: r.price,
    notes: r.notes,
    status: r.status,
  };
}

async function init() {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "time" TEXT NOT NULL,
      duration INTEGER NOT NULL,
      price INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      reviewer_name TEXT NOT NULL,
      reviewer_phone TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      review_text TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_active_slot
      ON appointments ("date", "time")
      WHERE status = 'active';
  `);
}

async function getBookedSlots(date) {
  const { rows } = await getPool().query(
    `SELECT "time" AS appointment_time
     FROM appointments
     WHERE "date" = $1 AND status = 'active'`,
    [date]
  );
  return rows.map((r) => r.appointment_time);
}

async function isSlotTaken(date, time) {
  const { rows } = await getPool().query(
    `SELECT id FROM appointments
     WHERE "date" = $1 AND "time" = $2 AND status = 'active'`,
    [date, time]
  );
  return rows.length > 0;
}

async function insertAppointment({ name, phone, date, time, duration, price, comment }) {
  const notes = comment || '';
  await getPool().query(
    `INSERT INTO appointments
      (name, phone, "date", "time", duration, price, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [name, phone, date, time, duration, price, notes]
  );
}

async function getActiveAppointmentsByPhone(phone, todayISO) {
  const { rows } = await getPool().query(
    `SELECT id, name, phone, "date", "time", duration, price, notes, status
     FROM appointments
     WHERE phone = $1 AND status = 'active' AND "date" >= $2
     ORDER BY "date", "time"`,
    [phone, todayISO]
  );
  return rows.map(mapAppointmentRow);
}

async function cancelAppointmentById(id, phone) {
  const result = await getPool().query(
    `UPDATE appointments
     SET status = 'cancelled'
     WHERE id = $1 AND phone = $2 AND status = 'active'`,
    [id, phone]
  );
  return { changes: result.rowCount };
}

async function getAppointmentById(id) {
  const { rows } = await getPool().query(
    `SELECT id, name, phone, "date", "time", duration, price, notes, status
     FROM appointments WHERE id = $1`,
    [id]
  );
  return mapAppointmentRow(rows[0]);
}

async function countAppointmentsByPhone(phone) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS cnt
     FROM appointments
     WHERE phone = $1 AND (status = 'active' OR status = 'cancelled')`,
    [phone]
  );
  return rows[0].cnt;
}

async function countReviewsByPhone(phone) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS cnt FROM reviews WHERE reviewer_phone = $1`,
    [phone]
  );
  return rows[0].cnt;
}

async function insertReview({ name, phone, text, rating }) {
  await getPool().query(
    `INSERT INTO reviews (reviewer_name, reviewer_phone, review_text, rating)
     VALUES ($1, $2, $3, $4)`,
    [name, phone, text, rating]
  );
}

async function getApprovedReviews() {
  const { rows } = await getPool().query(
    `SELECT * FROM reviews WHERE status = 'approved' ORDER BY created_at DESC`
  );
  return rows;
}

module.exports = {
  setPool,
  init,
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
