import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Polyline, CircleMarker, Tooltip, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { motion } from "framer-motion";
import { Check, Map as MapIcon, Share2, Trash2, Download, Upload, Plus, ListFilter, Route } from "lucide-react";

// ----------
// Minimal shadcn-like components (fallbacks if shadcn/ui isn't available)
// You can replace these with imports from shadcn/ui if your environment supports it directly.
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const Button = ({ className = "", ...props }) => (
  <button
    className={`px-3 py-2 rounded-2xl shadow text-sm font-medium hover:shadow-md transition bg-white border border-gray-200 ${className}`}
    {...props}
  />
);
const Card = ({ className = "", ...props }) => (
  <div className={`rounded-2xl border border-gray-200 shadow-sm bg-white ${className}`} {...props} />
);
const CardHeader = ({ children }) => (
  <div className="p-4 border-b border-gray-100">{children}</div>
);
const CardTitle = ({ children }) => (
  <h3 className="text-lg font-semibold">{children}</h3>
);
const CardContent = ({ children }) => (
  <div className="p-4">{children}</div>
);

// ----------
// Simple, schematic map setup using Leaflet's world CRS with neutral tiles
const DEFAULT_CENTER = [20, 0]; // arbitrary center
const DEFAULT_ZOOM = 2;

// ----------
// Sample data (replace/extend with your real list). Coordinates here are schematic lat/lng
// approximations just to draw routes on a neutral world map. You can edit these easily.
// Zones/Hubs (approx schematic positions)
const HUBS = {
  // Eastern Kingdoms
  "Stormwind": { lat: 12, lng: -30 },
  "Ironforge": { lat: 21, lng: -38 },
  "Light's Hope Chapel": { lat: 35, lng: -15 },
  "Booty Bay": { lat: -2, lng: -35 },
  // Kalimdor
  "Orgrimmar": { lat: 18, lng: 30 },
  "Thunder Bluff": { lat: 10, lng: 15 },
  "Cenarion Hold": { lat: -5, lng: 20 },
  "Everlook": { lat: 30, lng: 40 },
};

// Quest entries focus on TURN-IN location for the route planner (not quest start).
// Add as many as you like. XP values are placeholders—tune to your plan.
const QUESTS = [
  { id: 1, name: "A Donation of Runecloth", zone: "Stormwind", xp: 8250, faction: "Alliance", category: "Turn-in", coord: HUBS["Stormwind"], notes: "Runecloth x60." },
  { id: 2, name: "A Donation of Runecloth", zone: "Orgrimmar", xp: 8250, faction: "Horde", category: "Turn-in", coord: HUBS["Orgrimmar"], notes: "Runecloth x60." },
  { id: 3, name: "A Donation of Mageweave", zone: "Ironforge", xp: 5100, faction: "Alliance", category: "Turn-in", coord: HUBS["Ironforge"], notes: "Mageweave x60." },
  { id: 4, name: "The Battle for Andorhal", zone: "Light's Hope Chapel", xp: 10000, faction: "Both", category: "Quest", coord: HUBS["Light's Hope Chapel"], notes: "Turn in at LHC." },
  { id: 5, name: "The Calling", zone: "Cenarion Hold", xp: 9000, faction: "Both", category: "Quest", coord: HUBS["Cenarion Hold"], notes: "Silithus questline turn-in." },
  { id: 6, name: "Ahn'Qiraj War Effort Turn-ins", zone: "Cenarion Hold", xp: 8000, faction: "Both", category: "Turn-in", coord: HUBS["Cenarion Hold"], notes: "Assorted supply turn-ins." },
  { id: 7, name: "Frostsaber Provisions", zone: "Everlook", xp: 7750, faction: "Both", category: "Quest", coord: HUBS["Everlook"], notes: "Everlook turn-in." },
  { id: 8, name: "Zandalar Coin Turn-ins", zone: "Booty Bay", xp: 7000, faction: "Both", category: "Turn-in", coord: HUBS["Booty Bay"], notes: "ZG coins/tribal." },
];

// Item drop turn-ins (choose the NPC turn-in place for location)
const ITEM_TURNINS = [
  { id: "i1", item: "Qiraji Lord's Insignia", where: "Cenarion Hold", xp: 5000, notes: "From AQ bosses; turn in at CH.", coord: HUBS["Cenarion Hold"] },
  { id: "i2", item: "Zul'Gurub Coins (Any of 3)", where: "Booty Bay", xp: 3500, notes: "Various coin sets; turn in Zandalar rep previously.", coord: HUBS["Booty Bay"] },
  { id: "i3", item: "Darkmoon Deck Turn-in", where: "Stormwind", xp: 8000, notes: "When Faire in town; placeholder.", coord: HUBS["Stormwind"] },
  { id: "i4", item: "Runecloth (Rep)", where: "Orgrimmar", xp: 8250, notes: "Faction rep quest gives XP.", coord: HUBS["Orgrimmar"] },
];

// ----------
// Utilities: distance, route (nearest neighbor + simple 2-opt)
function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const s = Math.sin(dLat/2) ** 2 + Math.sin(dLng/2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestNeighbor(points, startIndex = 0) {
  const n = points.length;
  if (!n) return [];
  const visited = Array(n).fill(false);
  const route = [startIndex];
  visited[startIndex] = true;
  for (let i = 1; i < n; i++) {
    const last = route[route.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        const d = haversine(points[last], points[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
    visited[best] = true;
    route.push(best);
  }
  return route;
}

function twoOpt(route, points, maxIter = 100) {
  const n = route.length;
  if (n < 4) return route;
  function segLen(i, j) {
    const a = points[route[i]];
    const b = points[route[j]];
    return haversine(a, b);
  }
  let improved = true, iter = 0;
  while (improved && iter++ < maxIter) {
    improved = false;
    for (let i = 0; i < n - 3; i++) {
      for (let k = i + 2; k < n - 1; k++) {
        const d1 = segLen(i, i+1) + segLen(k, k+1);
        const d2 = segLen(i, k) + segLen(i+1, k+1);
        if (d2 + 1e-9 < d1) {
          const newRoute = route.slice(0, i+1).concat(route.slice(i+1, k+1).reverse(), route.slice(k+1));
          route = newRoute;
          improved = true;
        }
      }
    }
  }
  return route;
}

// Encode/decode selections into URL for shareable links
function encodeSelections(qIds, iIds) {
  const params = new URLSearchParams();
  if (qIds.length) params.set("q", qIds.join(","));
  if (iIds.length) params.set("items", iIds.join(","));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}
function decodeSelections() {
  const p = new URLSearchParams(window.location.search);
  const qCsv = p.get("q") || "";
  const iCsv = p.get("items") || "";
  const q = qCsv ? qCsv.split(",").map((n) => parseInt(n, 10)) : [];
  const i = iCsv ? iCsv.split(",") : [];
  return { q, i };
}

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : initial;
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(val)), [key, val]);
  return [val, setVal];
}

function TogglePill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}
    >
      {children}
    </button>
  );
}

function SectionHeader({ icon, title, children }) {
  const Icon = icon;
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5" />
        <h4 className="font-semibold">{title}</h4>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export default function App() {
  // Filters & selections
  const [faction, setFaction] = useLocalStorage("qs_faction", "Both");
  const [minXP, setMinXP] = useLocalStorage("qs_min_xp", 0);
  const [category, setCategory] = useLocalStorage("qs_category", "All");
  const [selectedQuests, setSelectedQuests] = useLocalStorage("qs_selected_quests", []); // quest ids
  const [selectedItems, setSelectedItems] = useLocalStorage("qs_selected_items", []); // item ids
  const [activeTab, setActiveTab] = useLocalStorage("qs_tab", "picker");

  // Load from URL if present (once)
  useEffect(() => {
    const { q, i } = decodeSelections();
    if (q.length || i.length) {
      setSelectedQuests(q);
      setSelectedItems(i);
    }
    // eslint-disable-next-line
  }, []);

  const filteredQuests = useMemo(() => {
    return QUESTS.filter(q => (faction === "Both" ? true : q.faction === faction) && q.xp >= (Number(minXP) || 0) && (category === "All" ? true : q.category === category));
  }, [faction, minXP, category]);

  const selectedQuestObjs = useMemo(() => QUESTS.filter(q => selectedQuests.includes(q.id)), [selectedQuests]);
  const selectedItemObjs = useMemo(() => ITEM_TURNINS.filter(i => selectedItems.includes(i.id)), [selectedItems]);

  // Build route from all selected turn-in points (quests + items)
  const routePoints = useMemo(() => {
    const pts = [...selectedQuestObjs.map(q => ({ ...q.coord, label: q.name })) , ...selectedItemObjs.map(i => ({ ...i.coord, label: i.item }))];
    return pts;
  }, [selectedQuestObjs, selectedItemObjs]);

  const routeOrder = useMemo(() => {
    if (routePoints.length < 2) return [];
    const seed = nearestNeighbor(routePoints, 0);
    return twoOpt(seed, routePoints);
  }, [routePoints]);

  const totalXP = useMemo(() => selectedQuestObjs.reduce((a, b) => a + (b.xp || 0), 0) + selectedItemObjs.reduce((a, b) => a + (b.xp || 0), 0), [selectedQuestObjs, selectedItemObjs]);

  function toggleQuest(id) {
    setSelectedQuests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleItem(id) {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function clearAll() {
    setSelectedQuests([]); setSelectedItems([]);
  }
  function shareLink() {
    const url = encodeSelections(selectedQuests, selectedItems);
    navigator.clipboard.writeText(url).catch(() => {});
    alert("Share link copied to clipboard!\n\n" + url);
  }
  function exportJSON() {
    const data = { selectedQuests, selectedItems, faction, minXP, category };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tbc-quest-stack.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function importJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setSelectedQuests(data.selectedQuests || []);
        setSelectedItems(data.selectedItems || []);
        setFaction(data.faction || "Both");
        setMinXP(data.minXP || 0);
        setCategory(data.category || "All");
      } catch (err) {
        alert("Invalid file");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl md:text-3xl font-bold mb-2">
          TBC Quest Stacker & Turn-in Route Planner
        </motion.h1>
        <p className="text-sm text-gray-600 mb-6">Pick high-XP quests and item turn-ins to stack before Outland. Share your plan with a link, then optimize a turn-in route on the map.</p>

        {/* Controls Row */}
        <div className="flex flex-wrap gap-2 items-center mb-6">
          <TogglePill active={activeTab === "picker"} onClick={() => setActiveTab("picker")}>Quest Picker</TogglePill>
          <TogglePill active={activeTab === "items"} onClick={() => setActiveTab("items")}>Item Turn-ins</TogglePill>
          <TogglePill active={activeTab === "route"} onClick={() => setActiveTab("route")}>Route Planner</TogglePill>
          <div className="mx-2 w-px h-6 bg-gray-300" />
          <TogglePill active={faction === "Both"} onClick={() => setFaction("Both")}>Both</TogglePill>
          <TogglePill active={faction === "Alliance"} onClick={() => setFaction("Alliance")}>Alliance</TogglePill>
          <TogglePill active={faction === "Horde"} onClick={() => setFaction("Horde")}>Horde</TogglePill>
          <div className="flex items-center gap-2 ml-auto">
            <Button onClick={shareLink} className="flex items-center gap-2"><Share2 className="w-4 h-4"/>Share</Button>
            <Button onClick={exportJSON} className="flex items-center gap-2"><Download className="w-4 h-4"/>Export</Button>
            <label className="cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
              <span className="px-3 py-2 rounded-2xl shadow text-sm font-medium border border-gray-200 bg-white inline-flex items-center gap-2"><Upload className="w-4 h-4"/>Import</span>
            </label>
            <Button onClick={clearAll} className="flex items-center gap-2 text-red-600 border-red-200"><Trash2 className="w-4 h-4"/>Clear</Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Filters</CardTitle>
              <ListFilter className="w-5 h-5 text-gray-500"/>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500">Minimum XP</label>
                <input type="number" value={minXP} onChange={(e)=>setMinXP(+e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-xl" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Category</label>
                <select value={category} onChange={(e)=>setCategory(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-xl">
                  <option>All</option>
                  <option>Quest</option>
                  <option>Turn-in</option>
                </select>
              </div>
              <div className="flex items-end">
                <div className="text-xs text-gray-500">Total Selected XP<br/><span className="text-lg font-semibold text-gray-900">{totalXP.toLocaleString()}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Panels */}
        {activeTab === "picker" && (
          <Card>
            <CardHeader>
              <SectionHeader icon={Plus} title="Quest Picker">
                <span className="text-sm text-gray-500">{filteredQuests.length} available</span>
              </SectionHeader>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredQuests.map(q => {
                  const active = selectedQuests.includes(q.id);
                  return (
                    <motion.div key={q.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                      <div className={`p-3 rounded-2xl border ${active ? "border-black bg-gray-50" : "border-gray-200 bg-white"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">{q.name}</div>
                            <div className="text-xs text-gray-500">{q.zone} • {q.faction} • {q.category}</div>
                          </div>
                          <Button onClick={() => toggleQuest(q.id)} className={`flex items-center gap-2 ${active ? "bg-black text-white border-black" : ""}`}>
                            <Check className="w-4 h-4"/>{active ? "Selected" : "Select"}
                          </Button>
                        </div>
                        <div className="mt-2 text-sm">XP: <span className="font-semibold">{q.xp.toLocaleString()}</span></div>
                        {q.notes && <div className="mt-1 text-xs text-gray-600">{q.notes}</div>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "items" && (
          <Card>
            <CardHeader>
              <SectionHeader icon={Plus} title="Item Drop Turn-ins">
                <span className="text-sm text-gray-500">{ITEM_TURNINS.length} entries</span>
              </SectionHeader>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ITEM_TURNINS.map(it => {
                  const active = selectedItems.includes(it.id);
                  return (
                    <motion.div key={it.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                      <div className={`p-3 rounded-2xl border ${active ? "border-black bg-gray-50" : "border-gray-200 bg-white"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">{it.item}</div>
                            <div className="text-xs text-gray-500">Turn in: {it.where}</div>
                          </div>
                          <Button onClick={() => toggleItem(it.id)} className={`flex items-center gap-2 ${active ? "bg-black text-white border-black" : ""}`}>
                            <Check className="w-4 h-4"/>{active ? "Selected" : "Select"}
                          </Button>
                        </div>
                        <div className="mt-2 text-sm">XP: <span className="font-semibold">{it.xp.toLocaleString()}</span></div>
                        {it.notes && <div className="mt-1 text-xs text-gray-600">{it.notes}</div>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "route" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <SectionHeader icon={MapIcon} title="Route Planner (schematic map)">
                  <span className="text-sm text-gray-500">{routePoints.length} points</span>
                </SectionHeader>
              </CardHeader>
              <CardContent>
                <div className="h-[520px] rounded-xl overflow-hidden border">
                  <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }} zoomControl={true} scrollWheelZoom={true}>
                    <TileLayer
                      attribution='Map data © OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {routeOrder.length > 1 && (
                      <Polyline positions={routeOrder.map(idx => [routePoints[idx].lat, routePoints[idx].lng])} />
                    )}
                    {routePoints.map((p, i) => (
                      <CircleMarker key={`${p.label}-${i}`} center={[p.lat, p.lng]} radius={8} weight={2}>
                        <Tooltip>{p.label}</Tooltip>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <SectionHeader icon={Route} title="Optimized Turn-in Order" />
              </CardHeader>
              <CardContent>
                {!routeOrder.length && <div className="text-sm text-gray-500">Select quests/items to build a route.</div>}
                {routeOrder.length > 0 && (
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {routeOrder.map((idx, step) => (
                      <li key={idx}>
                        <span className="font-semibold">{routePoints[idx].label}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {routeOrder.length > 1 && (
                  <div className="text-xs text-gray-500 mt-4">Route uses a nearest-neighbor seed + 2‑opt pass. Add hub coordinates or refine XP values in code as you expand the dataset.</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* How to Extend */}
        <div className="mt-8 text-xs text-gray-500">
          <p className="mb-1 font-semibold">Notes:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Edit <code>QUESTS</code>, <code>ITEM_TURNINS</code>, and <code>HUBS</code> above to add real entries and accurate schematic coordinates (lat/lng) for turn-in points.</li>
            <li>Use the Share button to copy a URL encoding your selections (works with any static hosting like GitHub Pages or Netlify).</li>
            <li>Export/Import your plan as JSON to collaborate with others.</li>
            <li>Swap the neutral OSM tiles for a custom Azeroth image + <code>CRS.Simple</code> if you want an in-game style map background.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
