# 🌿 Sharing is Caring — Hyperlocal Food Sharing App

A full-stack web app where users list surplus food and nearby people can claim it.

## Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | React 18 + Vite               |
| Backend  | Node.js + Express             |
| Database | SQLite via better-sqlite3     |
| Cron     | node-cron (daily expiry sweep)|

---

## 🚀 Deploy to Render (one-time, ~5 minutes)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/sharing-is-caring.git
git push -u origin main
```

### Step 2 — Create Render Web Service
1. Go to https://render.com and sign up / log in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account and select the `sharing-is-caring` repo
4. Render will auto-detect the `render.yaml` — click **"Apply"**

That's it. Render will:
- Install dependencies
- Build the React frontend
- Start the Express server
- Mount a 1 GB persistent disk for SQLite at `/var/data`
- Auto-deploy on every `git push`

### Step 3 — Your app is live
Render gives you a URL like: `https://sharing-is-caring.onrender.com`

---

## 🔧 Local Development

```bash
# Install all dependencies
npm run install:all

# Terminal 1 — start backend (port 3001)
npm run dev:server

# Terminal 2 — start frontend (port 5173, proxies /api → 3001)
npm run dev:client
```

---

## 📁 Project Structure

```
sharing-is-caring/
├── server/
│   └── index.js          # Express API + SQLite + cron job
├── client/
│   ├── src/
│   │   ├── main.jsx
│   │   └── App.jsx       # Full React UI
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── render.yaml            # Render deployment config
├── package.json           # Root — scripts + server deps
└── .gitignore
```

---

## API Endpoints

| Method | Path               | Description                        |
|--------|--------------------|------------------------------------|
| GET    | /api/listings      | Get all non-expired listings       |
| POST   | /api/listings      | Create a new listing               |
| DELETE | /api/listings/:id  | Delete a listing by ID             |

---

## ⚠️ Render Free Tier Notes

- The service **spins down after 15 min of inactivity** — first request after sleep takes ~30s
- The **1 GB disk** (`/var/data`) keeps your SQLite DB persistent across deploys/restarts
- To avoid cold starts, upgrade to Render's $7/month Starter plan

## 🌏 Change Region

Edit `render.yaml` → `region:` to one of:
`ohio` | `oregon` | `frankfurt` | `singapore`
