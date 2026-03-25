const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");
const cron = require("node-cron");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

// --- DB Setup ---
// On Render free tier, /tmp is writable. For persistence use a Render Disk or
// set DB_PATH env var to a mounted disk path like /var/data/listings.db
const DB_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, "../data");
const DB_FILE = process.env.DB_PATH || path.join(DB_DIR, "listings.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    type        TEXT,
    serves      INTEGER NOT NULL DEFAULT 1,
    weight      REAL,
    is_veg      INTEGER NOT NULL DEFAULT 1,
    cuisine     TEXT,
    expiry      TEXT    NOT NULL,
    mobile      TEXT    NOT NULL,
    lat         REAL,
    lng         REAL,
    maps_link   TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expiry ON listings(expiry);
`);

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Serve React build in production
const clientBuild = path.join(__dirname, "../client/dist");
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
}

// --- API Routes ---

// GET all active listings
app.get("/api/listings", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const rows = db.prepare(
    "SELECT * FROM listings WHERE expiry >= ? ORDER BY expiry ASC, created_at DESC"
  ).all(today);
  res.json(rows.map(row => ({
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    type: row.type,
    serves: row.serves,
    weight: row.weight,
    isVeg: row.is_veg === 1,
    cuisine: row.cuisine,
    expiry: row.expiry,
    mobile: row.mobile,
    lat: row.lat,
    lng: row.lng,
    mapsLink: row.maps_link,
    createdAt: row.created_at,
  })));
});

// POST create listing
app.post("/api/listings", (req, res) => {
  const { name, quantity, type, serves, weight, isVeg, cuisine, expiry, mobile, lat, lng, mapsLink } = req.body;

  if (!name || !mobile || !expiry) {
    return res.status(400).json({ error: "name, mobile, expiry are required" });
  }
  if (!/^\d{10}$/.test(mobile)) {
    return res.status(400).json({ error: "Mobile must be 10 digits" });
  }
  if (!lat && !mapsLink) {
    return res.status(400).json({ error: "Provide lat/lng or a Maps link" });
  }

  // Default expiry: +2 days if not provided
  const expiryDate = expiry || new Date(Date.now() + 172800000).toISOString().split("T")[0];

  const stmt = db.prepare(`
    INSERT INTO listings (name, quantity, type, serves, weight, is_veg, cuisine, expiry, mobile, lat, lng, maps_link, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    name, quantity || 1, type || "Other", serves || 1,
    weight || null, isVeg ? 1 : 0, cuisine || "Other",
    expiryDate, mobile, lat || null, lng || null,
    mapsLink || null, Date.now()
  );

  res.status(201).json({ id: result.lastInsertRowid, message: "Listing created" });
});

// DELETE a listing
app.delete("/api/listings/:id", (req, res) => {
  db.prepare("DELETE FROM listings WHERE id = ?").run(req.params.id);
  res.json({ message: "Deleted" });
});

// --- Cron: Daily expiry cleanup at midnight ---
cron.schedule("0 0 * * *", () => {
  const today = new Date().toISOString().split("T")[0];
  const result = db.prepare("DELETE FROM listings WHERE expiry < ?").run(today);
  console.log(`[CRON] Deleted ${result.changes} expired listing(s) at ${new Date().toISOString()}`);
});

// Fallback to React app for all non-API routes
app.get("*", (req, res) => {
  const index = path.join(clientBuild, "index.html");
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(404).send("Client not built. Run: cd client && npm run build");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
