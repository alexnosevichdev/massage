# Massage Therapist — Booking Website

One-page website with online appointment booking, SQLite database, and Telegram notifications.

## Local Development

1. Clone and install dependencies:

```bash
npm install
```

2. Create a `.env` file from the template:

```bash
cp .env.example .env
```

3. Fill in your Telegram bot credentials in `.env`:
   - `TG_TOKEN` — token from [@BotFather](https://t.me/BotFather)
   - `TG_CHAT_ID` — your chat ID (use [@userinfobot](https://t.me/userinfobot))

4. Start the server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Deploy to Render

1. Push the repo to GitHub.

2. On [render.com](https://render.com), create a new **Web Service**:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node

3. Add environment variables in the Render dashboard:
   - `TG_TOKEN`
   - `TG_CHAT_ID`
   - `WORK_START`, `WORK_END`, `SLOT_DURATION`, `WORK_DAYS` (optional — defaults apply)

4. Deploy. Render provides free HTTPS automatically.

## Environment Variables

| Variable        | Default       | Description                                |
|-----------------|---------------|--------------------------------------------|
| `PORT`          | `3000`        | Server port                                |
| `TG_TOKEN`      | —             | Telegram Bot API token                     |
| `TG_CHAT_ID`    | —             | Telegram chat ID for notifications         |
| `WORK_START`    | `10:00`       | Start of working day (HH:MM)              |
| `WORK_END`      | `20:00`       | End of working day (HH:MM)                |
| `SLOT_DURATION` | `60`          | Appointment slot length in minutes         |
| `WORK_DAYS`     | `1,2,3,4,5`  | Working days (1=Mon … 7=Sun)              |

## API

| Method | Endpoint              | Description                    |
|--------|-----------------------|--------------------------------|
| GET    | `/api/slots?date=...` | Available slots for a date     |
| POST   | `/api/book`           | Create a new appointment       |
| POST   | `/api/cancel`         | Cancel by token                |
| GET    | `/api/health`         | Health check                   |
