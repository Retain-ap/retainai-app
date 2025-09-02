import React, { useMemo } from "react";
import {
  FunnelChart, Funnel, LabelList,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area
} from "recharts";
import { FaStar, FaFire, FaLightbulb, FaCheckCircle, FaBell, FaCalendarAlt } from "react-icons/fa";

/* ===== THEME (RetainAI: black / white / gold) ===== */
const BG      = "#181a1b";
const CARD    = "#232323";
const BORDER  = "#2b2f33";
const TEXT    = "#f3f4f5";
const SUBTEXT = "#9aa3ab";
const GOLD    = "#f7cb53";

/* neutrals for secondary series (no rainbow colors) */
const N1 = "#cfd5db"; // light
const N2 = "#8b949e"; // mid
const N3 = "#495056"; // dark

/* ===== DATA HELPERS ===== */
function getConversionStats(leads = []) {
  const total = leads.length;
  const contacted = leads.filter(l => !!l.last_contacted || !!l.lastContacted).length;
  const appointment = leads.filter(l => (l.appointments || []).length > 0).length;
  const closed = leads.filter(l => (l.tags || []).some(t => ["Closed", "Won", "Completed"].includes(t))).length;
  return [
    { stage: "Total Leads", value: total },
    { stage: "Contacted", value: contacted },
    { stage: "Appointment Set", value: appointment },
    { stage: "Closed", value: closed }
  ];
}
function getFunnelRates(stats) {
  let out = [];
  for (let i = 1; i < stats.length; ++i) {
    const prev = stats[i - 1].value;
    const curr = stats[i].value;
    out.push(prev === 0 ? 0 : Math.round((curr / prev) * 100));
  }
  return out;
}
function getSentimentByMonth(leads = []) {
  let map = {};
  leads.forEach(l => {
    const m = (l.last_contacted || l.lastContacted || l.createdAt || "").slice(0, 7);
    const tag = (l.tags || []).find(t => ["Happy", "Upset", "Neutral"].includes(t)) || "Neutral";
    if (!map[m]) map[m] = { month: m, Happy: 0, Upset: 0, Neutral: 0 };
    map[m][tag]++;
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}
function getSourceBreakdown(leads = []) {
  let counts = {};
  const PALETTE = [GOLD, N1, N2, N3, "#343a40", "#5a626a"]; // gold + grays
  leads.forEach(l => {
    const src = l.source || "Other";
    counts[src] = (counts[src] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value], i) => ({
    name, value, color: PALETTE[i % PALETTE.length]
  }));
}
function getVipLeads(leads = []) {
  return leads.filter(l => (l.tags || []).includes("VIP"));
}
function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}
function getColdLeads(leads = [], days = 14) {
  const now = Date.now();
  return leads.filter(l => {
    const dt = new Date(l.last_contacted || l.lastContacted || l.createdAt || Date.now());
    return (now - dt.getTime()) > days * 86400000;
  });
}
function getAITip(leads = []) {
  const coldVIPs = leads.filter(l =>
    (l.tags || []).includes("VIP") &&
    (!l.last_contacted || Date.now() - new Date(l.last_contacted).getTime() > 10 * 86400000)
  );
  if (coldVIPs.length)
    return `You have ${coldVIPs.length} VIP${coldVIPs.length > 1 ? "s" : ""} who need follow-up this week!`;
  return "All VIPs are up-to-date. Keep it up!";
}
function getNextAction(leads = []) {
  const cold = getColdLeads(leads);
  if (cold.length) return `Reach out to ${cold[0].name} – it's been a while!`;
  return "No leads are at risk. Well managed!";
}
function getRemindersDue(leads = [], days = 7) {
  const now = new Date();
  const inDays = new Date(now.getTime() + days * 86400000);
  let count = 0;
  leads.forEach(lead => {
    (lead.reminders || []).forEach(r => {
      if (r.date) {
        const d = new Date(r.date);
        if (d >= now && d <= inDays) count++;
      }
    });
  });
  return count;
}
function getAppointmentsThisMonth(leads = []) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let count = 0;
  leads.forEach(lead => {
    (lead.appointments || []).forEach(a => {
      if (a.date) {
        const d = new Date(a.date);
        if (d.getFullYear() === year && d.getMonth() === month) count++;
      }
    });
  });
  return count;
}
function getLeaderboard(leads = []) {
  let arr = leads.map(l => ({
    name: l.name,
    count: (l.appointments || []).length
  }));
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, 5);
}

/* Extra insights (bottom) */
function getLeadsByMonth(leads = []) {
  const map = {};
  leads.forEach(l => {
    const m = (l.createdAt || "").slice(0, 7) || new Date().toISOString().slice(0, 7);
    map[m] = (map[m] || 0) + 1;
  });
  return Object.keys(map).sort().map(month => ({ month, count: map[month] }));
}
function getAvgDaysSinceContact(leads = []) {
  const now = new Date();
  const diffs = leads.map(l => {
    const last = l.last_contacted || l.lastContacted || l.createdAt;
    return last ? daysBetween(now, new Date(last)) : daysBetween(now, new Date());
  }).filter(n => Number.isFinite(n));
  if (!diffs.length) return 0;
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}
/* NEW: Top tags (fills left-bottom gap) */
function getTopTags(leads = [], limit = 8) {
  const counts = {};
  leads.forEach(l => (l.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const arr = Object.entries(counts).map(([tag, value]) => ({ tag, value }));
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, limit);
}

/* ===== HEATMAP ===== */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
function getHeatmapMatrix(leads = []) {
  const matrix = Array(7).fill(0).map(() => Array(24).fill(0));
  leads.forEach(lead => {
    (lead.appointments || []).forEach(app => {
      if (app.date && app.time) {
        const d = new Date(`${app.date}T${app.time}`);
        const day = d.getDay();
        const hour = d.getHours();
        if (day >= 0 && day <= 6 && hour >= 0 && hour < 24) matrix[day][hour]++;
      }
    });
  });
  return matrix;
}
function AppointmentsHeatmap({ leads }) {
  const matrix = getHeatmapMatrix(leads);
  return (
    <div style={{ ...card, alignSelf: "start" }}>
      <div style={cardTitle}>
        Appointments Heatmap{" "}
        <span style={{ color: SUBTEXT, fontWeight: 700, fontSize: 12 }}>(by day & hour)</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              {HOURS.map(h => (
                <th key={h} style={{ color: SUBTEXT, fontWeight: 700, fontSize: 12, padding: "2px 6px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={DAYS[i]}>
                <td style={{ color: TEXT, fontWeight: 800, paddingRight: 8 }}>{DAYS[i]}</td>
                {row.map((count, h) => (
                  <td
                    key={h}
                    style={{
                      minWidth: 30,
                      minHeight: 26,
                      borderRadius: 8,
                      textAlign: "center",
                      fontWeight: 900,
                      color: count > 0 ? GOLD : TEXT,
                      background: count > 0 ? "#1e2326" : BG,
                      border: `1.4px solid ${count > 0 ? GOLD : BORDER}`
                    }}
                  >
                    {count > 0 ? count : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===== SHARED STYLES ===== */
const card = {
  background: CARD,
  borderRadius: 16,
  padding: 18,
  border: `1px solid ${BORDER}`,
  boxShadow: "0 2px 18px rgba(0,0,0,0.35)"
};
const cardTitle = { fontWeight: 900, color: TEXT, marginBottom: 10 };
const pill = {
  ...card,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px"
};
const goldChip = { background: GOLD, color: "#111", fontWeight: 800, borderRadius: 10, padding: "3px 10px" };

/* Pie labels — shorter callout */
const RAD = Math.PI / 180;
const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }) => {
  const r = outerRadius + 20;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text
      x={x}
      y={y}
      fill={TEXT}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      style={{ fontWeight: 800, fontSize: 12 }}
    >
      {`${name} (${Math.round(percent * 100)}%)`}
    </text>
  );
};

export default function Analytics({ leads = [] }) {
  const funnelStats = useMemo(() => getConversionStats(leads), [leads]);
  const funnelRates = getFunnelRates(funnelStats);
  const sentimentData = useMemo(() => getSentimentByMonth(leads), [leads]);
  const sourceData = useMemo(() => getSourceBreakdown(leads), [leads]);
  const vipLeads = getVipLeads(leads);
  const coldLeads = getColdLeads(leads);
  const remindersDue = useMemo(() => getRemindersDue(leads, 7), [leads]);
  const apptsThisMonth = useMemo(() => getAppointmentsThisMonth(leads), [leads]);
  const leadsByMonth = useMemo(() => getLeadsByMonth(leads), [leads]);
  const avgDaysSinceContact = useMemo(() => getAvgDaysSinceContact(leads), [leads]);
  const leaderboard = useMemo(() => getLeaderboard(leads), [leads]);
  const topTags = useMemo(() => getTopTags(leads), [leads]);

  return (
    <div style={{ padding: 28, background: BG, minHeight: "100vh", boxSizing: "border-box" }}>
      {/* Top bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 24, padding: "0 0 18px 0", borderBottom: `1px solid ${BORDER}` }}>
        <h2 style={{ color: TEXT, fontWeight: 900, margin: 0, fontSize: 28, letterSpacing: "-0.5px" }}>
          Analytics & Insights
        </h2>
        <div />
      </div>

      {/* Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 18, alignItems: "stretch", marginTop: 18 }}>
        {/* Funnel */}
        <div style={card}>
          <div style={cardTitle}>Lead Conversion Funnel</div>
          <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
            <FunnelChart width={340} height={220}>
              <Funnel dataKey="value" data={funnelStats} isAnimationActive fill={GOLD} stroke={BORDER}>
                <LabelList dataKey="stage" position="inside" style={{ fill: "#ffffff", fontWeight: 900 }} />
              </Funnel>
            </FunnelChart>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: SUBTEXT, fontWeight: 700 }}>
            {funnelRates.map((rate, idx) => (
              <span key={idx} style={{ color: GOLD }}>↓ {rate}%</span>
            ))}
          </div>
        </div>

        {/* Sentiment */}
        <div style={card}>
          <div style={cardTitle}>Client Sentiment Over Time</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sentimentData}>
              <XAxis dataKey="month" tick={{ fill: SUBTEXT, fontWeight: 600 }} stroke={BORDER} />
              <YAxis tick={{ fill: SUBTEXT, fontWeight: 600 }} stroke={BORDER} allowDecimals={false} />
              <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT }} />
              <Legend wrapperStyle={{ color: TEXT }} />
              <Bar dataKey="Happy"   stackId="a" fill={GOLD} />
              <Bar dataKey="Neutral" stackId="a" fill={N1} />
              <Bar dataKey="Upset"   stackId="a" fill={N3} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lead Source Breakdown */}
        <div style={card}>
          <div style={cardTitle}>Lead Source Breakdown</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={sourceData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="42%"
                outerRadius={72}
                label={renderPieLabel}
                labelLine
              >
                {sourceData.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT }} />
              <Legend
                verticalAlign="bottom"
                align="center"
                iconType="circle"
                iconSize={10}
                wrapperStyle={{
                  color: TEXT,
                  marginTop: 36,
                  lineHeight: "16px"
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Unified lower area: two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }}>
        {/* LEFT column: Heatmap + New Leads + Top Tags */}
        <div style={{ display: "grid", gap: 18, alignItems: "start" }}>
          <AppointmentsHeatmap leads={leads} />

          <div style={card}>
            <div style={cardTitle}>New Leads by Month</div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={leadsByMonth}>
                <defs>
                  <linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: SUBTEXT }} stroke={BORDER} />
                <YAxis tick={{ fill: SUBTEXT }} stroke={BORDER} allowDecimals={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT }} />
                <Area type="monotone" dataKey="count" stroke={GOLD} fill="url(#goldFade)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Top Tags */}
          <div style={card}>
            <div style={cardTitle}>Top Tags</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={topTags}>
                <XAxis dataKey="tag" tick={{ fill: SUBTEXT }} stroke={BORDER} />
                <YAxis tick={{ fill: SUBTEXT }} stroke={BORDER} allowDecimals={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT }} />
                <Bar dataKey="value" fill={GOLD} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT column: Top 5 + KPI pills + Pipeline Summary */}
        <div style={{ display: "grid", gap: 14, alignItems: "start" }}>
          <div style={card}>
            <div style={cardTitle}>Top 5 Engaged Leads</div>
            {leaderboard.length === 0 ? (
              <div style={{ color: SUBTEXT, fontWeight: 700 }}>No leads yet.</div>
            ) : (
              leaderboard.map((l, i) => (
                <div key={l.name} style={{ fontWeight: 900, color: TEXT, marginBottom: 10, display: "flex", alignItems: "center", lineHeight: 1.2 }}>
                  <span style={{ color: GOLD, marginRight: 10 }}>{i + 1}.</span>
                  <div style={{ flex: 1 }}>{l.name}</div>
                  {l.count > 0 && <span style={goldChip}>{l.count} appt</span>}
                </div>
              ))
            )}
          </div>

          <div style={pill}>
            <FaLightbulb style={{ color: GOLD }} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Tip of the Week</div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>{getAITip(leads)}</div>
            </div>
          </div>

          <div style={pill}>
            <FaStar style={{ color: GOLD }} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Top VIPs</div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>
                {vipLeads.length ? vipLeads.map(l => l.name).join(", ") : "No VIPs yet."}
              </div>
            </div>
          </div>

          <div style={pill}>
            <FaFire style={{ color: GOLD }} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Leads Going Cold</div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>
                {coldLeads.length ? coldLeads.map(l => l.name).join(", ") : "All leads active"}
              </div>
            </div>
          </div>

          <div style={pill}>
            <FaCheckCircle style={{ color: GOLD }} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Next Best Action</div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>{getNextAction(leads)}</div>
            </div>
          </div>

          <div style={pill}>
            <FaBell style={{ color: GOLD }} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Reminders Due</div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>
                {remindersDue > 0 ? `${remindersDue} due in 7 days` : "No reminders upcoming"}
              </div>
            </div>
          </div>

          <div style={pill}>
            <FaCalendarAlt style={{ color: GOLD }} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Appointments</div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>
                {apptsThisMonth > 0 ? `${apptsThisMonth} this month` : "No appointments"}
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={cardTitle}>Pipeline Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Metric label="Total" value={funnelStats[0].value} />
              <Metric label="Contacted" value={funnelStats[1].value} />
              <Metric label="Appt Set" value={funnelStats[2].value} />
              <Metric label="Closed" value={funnelStats[3].value} />
              <Metric label="Avg days since contact" value={avgDaysSinceContact} small />
              <Metric label="Cold (>14d)" value={coldLeads.length} small />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* small helper for big numbers */
function Metric({ label, value, small }) {
  return (
    <div style={{ background: "#1e2326", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ color: SUBTEXT, fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ color: TEXT, fontWeight: 900, fontSize: small ? 18 : 24 }}>{value}</div>
    </div>
  );
}
