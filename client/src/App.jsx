import { useState, useEffect, useCallback } from "react";

const CUISINES = ["Any","Indian","Chinese","Italian","Mexican","Mediterranean","Thai","Japanese","American","Middle Eastern","Other"];
const FOOD_TYPES = ["Cooked Meal","Raw Ingredients","Bakery/Snacks","Fruits & Vegetables","Dairy","Beverages","Packaged Food","Other"];

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseMapsLink(link) {
  const patterns = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /q=(-?\d+\.\d+),(-?\d+\.\d+)/, /\/(-?\d+\.\d+),(-?\d+\.\d+)/];
  for (const p of patterns) {
    const m = link.match(p);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}

function formatExpiry(dateStr) {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (dateStr === today) return { label: "Today", color: "#ef4444" };
  if (dateStr === tomorrow) return { label: "Tomorrow", color: "#f59e0b" };
  return { label: new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), color: "#6b7280" };
}

const defaultExpiry = () => new Date(Date.now() + 172800000).toISOString().split("T")[0];

const emptyForm = () => ({
  name: "", quantity: 1, type: "Cooked Meal", serves: 2, weight: "",
  isVeg: true, cuisine: "Other", expiry: defaultExpiry(), mobile: "", mapsLink: "",
  lat: null, lng: null,
});

export default function App() {
  const [view, setView] = useState("feed");
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [filters, setFilters] = useState({ veg: "all", cuisine: "Any", distance: "all", expiry: "all" });
  const [sort, setSort] = useState("smart");
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchListings = async () => {
    try {
      const res = await fetch("/api/listings");
      const data = await res.json();
      setListings(data);
    } catch (e) {
      showToast("Failed to load listings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
    navigator.geolocation?.getCurrentPosition(
      pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  const withDistance = useCallback(items =>
    items.map(l => ({
      ...l,
      distance: (userLoc && l.lat && l.lng)
        ? haversine(userLoc.lat, userLoc.lng, l.lat, l.lng)
        : null,
    })), [userLoc]);

  const filtered = withDistance(listings).filter(l => {
    if (filters.veg === "veg" && !l.isVeg) return false;
    if (filters.veg === "nonveg" && l.isVeg) return false;
    if (filters.cuisine !== "Any" && l.cuisine !== filters.cuisine && l.cuisine !== "Any") return false;
    if (filters.distance !== "all" && l.distance !== null) {
      if (l.distance > parseFloat(filters.distance)) return false;
    }
    if (filters.expiry === "today" && l.expiry !== new Date().toISOString().split("T")[0]) return false;
    if (filters.expiry === "tomorrow" && l.expiry !== new Date(Date.now()+86400000).toISOString().split("T")[0]) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "smart") {
      if (a.distance !== null && b.distance !== null) {
        const dd = a.distance - b.distance;
        if (Math.abs(dd) > 0.5) return dd;
      }
      return new Date(a.expiry) - new Date(b.expiry);
    }
    if (sort === "expiry") return new Date(a.expiry) - new Date(b.expiry);
    if (sort === "distance" && a.distance !== null) return a.distance - b.distance;
    if (sort === "newest") return b.createdAt - a.createdAt;
    return 0;
  });

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = "Required";
    if (!/^\d{10}$/.test(form.mobile)) errors.mobile = "Enter valid 10-digit number";
    if (!form.lat && !form.mapsLink.trim()) errors.location = "Provide location or Maps link";
    if (form.mapsLink && !form.lat && !parseMapsLink(form.mapsLink)) errors.location = "Couldn't parse coordinates from this link";
    return errors;
  };

  const handleSubmit = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length) { setFormError(errors); return; }

    let lat = form.lat, lng = form.lng;
    if (!lat && form.mapsLink) {
      const coords = parseMapsLink(form.mapsLink);
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lat, lng }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "Failed to create listing", "error");
        return;
      }
      showToast("🎉 Your listing is live! Thank you for sharing.");
      setForm(emptyForm());
      setFormError({});
      setView("feed");
      fetchListings();
    } catch (e) {
      showToast("Network error, please try again", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setForm(f => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude, mapsLink: "" }));
        setFormError(fe => ({ ...fe, location: "" }));
        showToast("📍 Location captured!", "info");
      },
      () => showToast("Location access denied. Paste a Maps link instead.", "error")
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#faf7f2", fontFamily: "'Fraunces', Georgia, serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,500;0,700;1,300;1,500&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .card{background:#fff;border-radius:16px;border:1.5px solid #e8e0d5;transition:all 0.2s}
        .card:hover{box-shadow:0 8px 32px rgba(0,0,0,0.08);transform:translateY(-2px)}
        .btn-primary{background:#2d6a4f;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;cursor:pointer;transition:all 0.15s}
        .btn-primary:hover{background:#1b4332;transform:translateY(-1px)}
        .btn-primary:disabled{background:#9ca3af;cursor:not-allowed;transform:none}
        .btn-secondary{background:transparent;color:#2d6a4f;border:1.5px solid #2d6a4f;border-radius:10px;padding:9px 18px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;cursor:pointer;transition:all 0.15s}
        .btn-secondary:hover{background:#f0faf5}
        .tag-veg{background:#d1fae5;color:#065f46;border-radius:6px;padding:2px 8px;font-size:11px;font-family:'DM Sans',sans-serif;font-weight:500}
        .tag-nonveg{background:#fee2e2;color:#991b1b;border-radius:6px;padding:2px 8px;font-size:11px;font-family:'DM Sans',sans-serif;font-weight:500}
        .input-field{width:100%;border:1.5px solid #e0d8cf;border-radius:10px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:14px;background:#faf7f2;color:#1a1a1a;outline:none;transition:border 0.15s}
        .input-field:focus{border-color:#2d6a4f;background:#fff}
        .input-error{border-color:#ef4444!important}
        .filter-chip{background:#fff;border:1.5px solid #e0d8cf;border-radius:20px;padding:5px 14px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;transition:all 0.15s;color:#4a4a4a}
        .filter-chip.active{background:#2d6a4f;color:#fff;border-color:#2d6a4f}
        .filter-chip:hover:not(.active){border-color:#2d6a4f;color:#2d6a4f}
        .toggle-track{width:44px;height:24px;border-radius:12px;cursor:pointer;transition:background 0.2s;position:relative;flex-shrink:0}
        .toggle-thumb{width:18px;height:18px;background:#fff;border-radius:50%;position:absolute;top:3px;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)}
        .wa-btn{background:#25D366;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all 0.15s;white-space:nowrap}
        .wa-btn:hover{background:#128C7E}
        .call-btn{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all 0.15s}
        .call-btn:hover{background:#2563eb}
        .maps-btn{background:#f97316;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all 0.15s}
        .maps-btn:hover{background:#ea580c}
        @keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .card-enter{animation:slideIn 0.3s ease forwards}
        .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:12px;font-family:'DM Sans',sans-serif;font-size:14px;z-index:9999;animation:slideIn 0.3s ease;box-shadow:0 8px 32px rgba(0,0,0,0.2);white-space:nowrap}
        select.input-field{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236b7280' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spinner{width:32px;height:32px;border:3px solid #e0d8cf;border-top-color:#2d6a4f;border-radius:50%;animation:spin 0.8s linear infinite;margin:60px auto}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#f1ece4}::-webkit-scrollbar-thumb{background:#c8bfb0;border-radius:3px}
        label{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#374151;display:block;margin-bottom:6px}
        .err-text{font-size:11px;color:#ef4444;font-family:'DM Sans',sans-serif;margin-top:3px;display:block}
      `}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e8e0d5", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>🌿</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>Sharing is Caring</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.5px" }}>HYPERLOCAL FOOD SHARING</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {!userLoc && view === "feed" && (
              <div style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: "#f59e0b" }}>⚠️ Enable location for distances</div>
            )}
            <button className="btn-primary" onClick={() => setView(view === "add" ? "feed" : "add")}>
              {view === "add" ? "← Back to Feed" : "+ Share Food"}
            </button>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast.msg}</div>}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── ADD FORM ── */}
        {view === "add" && (
          <div style={{ maxWidth: 600, margin: "0 auto" }} className="card-enter">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🍱</div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>Share Surplus Food</h1>
              <p style={{ fontFamily: "'DM Sans',sans-serif", color: "#6b7280", marginTop: 6 }}>Your extra food could make someone's day ✨</p>
            </div>
            <div className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label>Item Name *</label>
                  <input className={`input-field${formError.name?" input-error":""}`} placeholder="e.g. Dal Makhani" value={form.name} onChange={e => { setForm(f => ({...f, name: e.target.value})); setFormError(fe => ({...fe, name: ""})); }} />
                  {formError.name && <span className="err-text">{formError.name}</span>}
                </div>
                <div>
                  <label>Food Type</label>
                  <select className="input-field" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                    {FOOD_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <label>Quantity</label>
                  <input className="input-field" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value)||1}))} />
                </div>
                <div>
                  <label>Serves (people)</label>
                  <input className="input-field" type="number" min="1" value={form.serves} onChange={e => setForm(f => ({...f, serves: parseInt(e.target.value)||1}))} />
                </div>
                <div>
                  <label>Weight (grams)</label>
                  <input className="input-field" type="number" min="0" placeholder="Optional" value={form.weight} onChange={e => setForm(f => ({...f, weight: e.target.value}))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
                <div>
                  <label>Diet Type</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                    <div className="toggle-track" style={{ background: form.isVeg ? "#2d6a4f" : "#ef4444" }} onClick={() => setForm(f => ({...f, isVeg: !f.isVeg}))}>
                      <div className="toggle-thumb" style={{ left: form.isVeg ? 23 : 3 }} />
                    </div>
                    <span className={form.isVeg ? "tag-veg" : "tag-nonveg"} style={{ fontSize: 13, padding: "4px 12px" }}>
                      {form.isVeg ? "🟢 Vegetarian" : "🔴 Non-Veg"}
                    </span>
                  </div>
                </div>
                <div>
                  <label>Cuisine</label>
                  <select className="input-field" value={form.cuisine} onChange={e => setForm(f => ({...f, cuisine: e.target.value}))}>
                    {CUISINES.filter(c => c !== "Any").map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label>Expiry Date</label>
                  <input className="input-field" type="date" value={form.expiry} min={new Date().toISOString().split("T")[0]} onChange={e => setForm(f => ({...f, expiry: e.target.value}))} />
                  <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'DM Sans',sans-serif" }}>Defaults to today +2 days</span>
                </div>
                <div>
                  <label>Mobile Number *</label>
                  <input className={`input-field${formError.mobile?" input-error":""}`} placeholder="10-digit number" value={form.mobile} onChange={e => { setForm(f => ({...f, mobile: e.target.value.replace(/\D/g,"")})); setFormError(fe => ({...fe, mobile: ""})); }} maxLength={10} />
                  {formError.mobile && <span className="err-text">{formError.mobile}</span>}
                </div>
              </div>

              <div>
                <label>Location *</label>
                <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                  <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} onClick={useMyLocation}>
                    📍 Use My Location
                  </button>
                  {form.lat && <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#2d6a4f" }}>✅ GPS captured ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</span>}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>— or paste Google Maps link —</div>
                <input
                  className={`input-field${formError.location?" input-error":""}`}
                  placeholder="https://maps.google.com/..."
                  value={form.mapsLink}
                  onChange={e => { setForm(f => ({...f, mapsLink: e.target.value, lat: null, lng: null})); setFormError(fe => ({...fe, location: ""})); }}
                />
                {formError.location && <span className="err-text">{formError.location}</span>}
              </div>

              <button className="btn-primary" style={{ width: "100%", padding: "14px", fontSize: 16, borderRadius: 12 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Posting…" : "🌿 List My Food"}
              </button>
            </div>
          </div>
        )}

        {/* ── FEED ── */}
        {view === "feed" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 36, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.2 }}>
                Food Near You,<br /><span style={{ color: "#2d6a4f", fontStyle: "italic" }}>Ready to Share</span>
              </h1>
              <p style={{ fontFamily: "'DM Sans',sans-serif", color: "#6b7280", marginTop: 10, fontSize: 15 }}>
                {loading ? "Loading…" : `${filtered.length} listing${filtered.length !== 1 ? "s" : ""} available`}
                {userLoc ? " • Sorted by distance" : " • Enable location for distance sorting"}
              </p>
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#9ca3af" }}>Diet:</span>
                {[["all","All"],["veg","🟢 Veg"],["nonveg","🔴 Non-Veg"]].map(([v,l]) => (
                  <button key={v} className={`filter-chip${filters.veg===v?" active":""}`} onClick={() => setFilters(f => ({...f, veg: v}))}>{l}</button>
                ))}
                <div style={{ width: 1, height: 24, background: "#e0d8cf", margin: "0 4px" }} />
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#9ca3af" }}>Expiry:</span>
                {[["all","Any"],["today","Today"],["tomorrow","Tomorrow"]].map(([v,l]) => (
                  <button key={v} className={`filter-chip${filters.expiry===v?" active":""}`} onClick={() => setFilters(f => ({...f, expiry: v}))}>{l}</button>
                ))}
                <div style={{ width: 1, height: 24, background: "#e0d8cf", margin: "0 4px" }} />
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#9ca3af" }}>Distance:</span>
                {[["all","Any"],["2","<2 km"],["5","<5 km"],["10","<10 km"]].map(([v,l]) => (
                  <button key={v} className={`filter-chip${filters.distance===v?" active":""}`} onClick={() => setFilters(f => ({...f, distance: v}))}>{l}</button>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#9ca3af" }}>Sort:</span>
                  <select className="input-field" style={{ width: "auto", padding: "6px 28px 6px 10px", fontSize: 13 }} value={sort} onChange={e => setSort(e.target.value)}>
                    <option value="smart">🧠 Smartest</option>
                    <option value="distance">📍 Nearest</option>
                    <option value="expiry">⏳ Expiry</option>
                    <option value="newest">🆕 Newest</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#9ca3af" }}>Cuisine:</span>
                {CUISINES.map(c => (
                  <button key={c} className={`filter-chip${filters.cuisine===c?" active":""}`} style={{ fontSize: 12 }} onClick={() => setFilters(f => ({...f, cuisine: c}))}>{c}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="spinner" />
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🫙</div>
                <h3 style={{ color: "#6b7280", fontFamily: "'DM Sans',sans-serif" }}>No listings match your filters</h3>
                <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => setFilters({ veg: "all", cuisine: "Any", distance: "all", expiry: "all" })}>Clear Filters</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                {filtered.map((listing, i) => {
                  const exp = formatExpiry(listing.expiry);
                  const mapsUrl = listing.mapsLink || (listing.lat ? `https://www.google.com/maps?q=${listing.lat},${listing.lng}` : null);
                  return (
                    <div key={listing.id} className="card card-enter" style={{ padding: 20, animationDelay: `${i*0.04}s` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 }}>{listing.name}</h3>
                          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{listing.type}</div>
                        </div>
                        <span className={listing.isVeg ? "tag-veg" : "tag-nonveg"} style={{ marginLeft: 8, flexShrink: 0 }}>
                          {listing.isVeg ? "🟢 Veg" : "🔴 Non-Veg"}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                        {[
                          ["🍽️", `Serves ${listing.serves}`, "people"],
                          ["📦", listing.weight ? (listing.weight >= 1000 ? `${listing.weight/1000}kg` : `${listing.weight}g`) : `×${listing.quantity}`, "qty"],
                          ["🍜", listing.cuisine || "Various", "cuisine"],
                        ].map(([icon, val, lbl]) => (
                          <div key={lbl} style={{ background: "#faf7f2", borderRadius: 10, padding: "8px 10px" }}>
                            <div style={{ fontSize: 14 }}>{icon}</div>
                            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>{val}</div>
                            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "#9ca3af" }}>{lbl}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>Expires:</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: exp.color }}>{exp.label}</span>
                        </div>
                        {listing.distance !== null && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f0fdf4", borderRadius: 8, padding: "3px 10px" }}>
                            <span style={{ fontSize: 12 }}>📍</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#2d6a4f", fontFamily: "'DM Sans',sans-serif" }}>
                              {listing.distance < 1 ? `${Math.round(listing.distance*1000)}m` : `${listing.distance.toFixed(1)} km`}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="wa-btn" onClick={() => window.open(`https://wa.me/91${listing.mobile}?text=Hi! I saw your listing on Sharing is Caring — *${listing.name}*. Is it still available?`, "_blank")}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                          WhatsApp
                        </button>
                        <button className="call-btn" onClick={() => window.open(`tel:+91${listing.mobile}`)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.7A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                          Call
                        </button>
                        {mapsUrl && (
                          <button className="maps-btn" onClick={() => window.open(mapsUrl, "_blank")}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            Map
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 40, display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" }}>
              {[
                ["🌿", listings.length, "Active Listings"],
                ["🍽️", listings.reduce((a,l) => a+l.serves, 0), "People Can Be Fed"],
                ["🥗", listings.filter(l => l.isVeg).length, "Veg Listings"],
              ].map(([icon, val, lbl]) => (
                <div key={lbl} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#2d6a4f" }}>{val}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#9ca3af" }}>{lbl}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
