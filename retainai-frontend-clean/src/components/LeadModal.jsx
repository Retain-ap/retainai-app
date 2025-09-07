// src/components/LeadModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Tags from "./Tags";
import { QRCodeSVG } from "qrcode.react";

/**
 * LeadModal
 * - Create / edit a lead
 * - Timeline updates (notes + voice notes)
 * - Phone helpers: tel: link, WhatsApp link, QR to call
 * - Esc to close, backdrop click, body-scroll lock, a11y labels
 * - Defensive validation + duplicate-tag prevention
 */

/* ----------------------- utils ----------------------- */
function migrateNotesToUpdates(lead) {
  if (lead?.updates && Array.isArray(lead.updates)) return lead.updates;
  if (lead?.notes) {
    return [
      {
        type: "note",
        text: lead.notes,
        date: lead.createdAt || new Date().toISOString(),
        author: "user",
      },
    ];
  }
  return [];
}

function uniqTags(arr = []) {
  const out = [];
  const seen = new Set();
  arr.forEach((t) => {
    const k = String(t || "").trim();
    if (k && !seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase());
      out.push(k);
    }
  });
  return out;
}

function emailLooksOk(email) {
  if (!email) return false;
  // not overly strict; just prevent obvious typos
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

function normalizeE164ish(phone = "") {
  // keep "+" if present, strip formatting
  const s = String(phone).trim();
  if (!s) return "";
  return s[0] === "+"
    ? s.replace(/[^\d+]/g, "")
    : s.replace(/[^\d]/g, "");
}

function waLinkFromPhone(phone = "") {
  const n = normalizeE164ish(phone);
  return n ? `https://wa.me/${n.replace("+", "")}` : "";
}

/* -------------------- Voice Recorder -------------------- */
function VoiceRecorder({ onSave, onError, disabled }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      // cleanup tracks if unmounted while recording
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      try {
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {}
    };
  }, []);

  const start = async () => {
    if (disabled) return;
    setTranscript("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone is not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new window.MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e?.data) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          // Placeholder transcript – integrate your STT backend if available
          const fakeTranscript = "Voice note transcribed (demo).";
          setTranscript(fakeTranscript);
          onSave?.(blob, url, fakeTranscript);
        } finally {
          chunksRef.current = [];
          // always stop tracks
          try {
            streamRef.current?.getTracks?.().forEach((t) => t.stop());
          } catch {}
          streamRef.current = null;
        }
      };

      mr.start();
      setRecording(true);
    } catch (e) {
      onError?.(e?.message || "Could not access microphone.");
    }
  };

  const stop = () => {
    try {
      mediaRecorderRef.current?.stop();
    } finally {
      setRecording(false);
    }
  };

  return (
    <div style={{ margin: "12px 0" }}>
      {!recording ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          style={btnSecondary}
        >
          🎤 Start Recording
        </button>
      ) : (
        <button type="button" onClick={stop} style={btnDanger}>
          ⏹ Stop Recording
        </button>
      )}

      {audioUrl && (
        <audio controls src={audioUrl} style={{ display: "block", marginTop: 9, width: "100%" }} />
      )}
      {transcript && (
        <div style={pillNote}>Transcript: {transcript}</div>
      )}
    </div>
  );
}

/* ----------------------- main ----------------------- */
export default function LeadModal({ lead, tags, onClose, onSave }) {
  const [name, setName] = useState(lead?.name || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [birthday, setBirthday] = useState(lead?.birthday ? String(lead.birthday).slice(0, 10) : "");
  const [leadTags, setLeadTags] = useState(uniqTags(lead?.tags || []));
  const [updates, setUpdates] = useState(migrateNotesToUpdates(lead));
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [addingVoice, setAddingVoice] = useState(false);
  const [newUpdateText, setNewUpdateText] = useState("");
  const [voiceData, setVoiceData] = useState({ blob: null, url: null, transcript: "" });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // body-scroll lock + ESC-close
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // derived
  const waHref = useMemo(() => waLinkFromPhone(phone), [phone]);

  function openAddUpdate(kind = "note") {
    setAddingVoice(kind === "voice");
    setShowUpdateModal(true);
    setNewUpdateText("");
    setVoiceData({ blob: null, url: null, transcript: "" });
    setError("");
  }

  function commitUpdate() {
    let entry;
    if (addingVoice) {
      if (!voiceData?.url) {
        setError("Record a voice note first.");
        return;
      }
      entry = {
        type: "voice",
        date: new Date().toISOString(),
        author: "user",
        audioUrl: voiceData.url,
        transcript: voiceData.transcript,
      };
    } else {
      const text = (newUpdateText || "").trim();
      if (!text) {
        setError("Write something for your update.");
        return;
      }
      entry = {
        type: "note",
        text,
        date: new Date().toISOString(),
        author: "user",
      };
    }
    setUpdates((prev) => [...prev, entry]);
    setShowUpdateModal(false);
    setAddingVoice(false);
    setNewUpdateText("");
    setVoiceData({ blob: null, url: null, transcript: "" });
    setError("");
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError("");

    if (!name.trim()) return setError("Please enter a name.");
    if (!emailLooksOk(email)) return setError("Please enter a valid email address.");

    setSaving(true);
    try {
      const next = {
        ...(lead || {}),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        birthday: birthday || undefined,
        tags: uniqTags(leadTags),
        createdAt: lead?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updates,
        // keep legacy `notes` in sync with the latest note-like entry
        notes: (() => {
          const last = [...updates].reverse().find((u) => u.type === "note" && u.text);
          return last?.text || "";
        })(),
      };
      onSave?.(next);
      onClose?.();
    } catch (e2) {
      setError(e2?.message || "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lead ? "Edit lead" : "Add lead"}
      style={backdrop}
      onClick={onClose}
    >
      {/* Add Update Modal */}
      {showUpdateModal && (
        <div style={overlay} onClick={() => setShowUpdateModal(false)}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={sheetTitle}>{addingVoice ? "Add Voice Note" : "Add Update"}</h3>

            {error && <div style={errorBox}>{error}</div>}

            {addingVoice ? (
              <VoiceRecorder
                disabled={saving}
                onSave={(blob, url, transcript) => setVoiceData({ blob, url, transcript })}
                onError={(msg) => setError(msg)}
              />
            ) : (
              <textarea
                placeholder="Write an update…"
                value={newUpdateText}
                onChange={(e) => setNewUpdateText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitUpdate();
                  }
                }}
                style={textarea}
              />
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" style={btnPrimary} onClick={commitUpdate}>
                Save Update
              </button>
              <button
                type="button"
                style={btnGhost}
                onClick={() => {
                  setShowUpdateModal(false);
                  setAddingVoice(false);
                  setNewUpdateText("");
                  setVoiceData({ blob: null, url: null, transcript: "" });
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main modal */}
      <form
        style={modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <button type="button" onClick={onClose} aria-label="Close" style={closeX}>
          ×
        </button>

        <div style={{ padding: "20px 28px 10px 28px" }}>
          <h2 style={title}>{lead ? "Edit Lead" : "Add Lead"}</h2>

          {error && (
            <div style={errorBox} role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              required
              value={name}
              placeholder="Full Name"
              style={input}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              required
              type="email"
              value={email}
              placeholder="Email"
              style={input}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <input
                type="tel"
                value={phone}
                placeholder="Phone Number"
                style={input}
                onChange={(e) => setPhone(e.target.value)}
              />
              {!!phone && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <a href={`tel:${phone}`} style={miniBtnLink}>Call</a>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noreferrer" style={miniBtnLink}>
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              style={input}
              placeholder="Birthday"
            />

            <Tags tags={tags} selected={leadTags} onChange={(t) => setLeadTags(uniqTags(t))} placeholder="Tags..." />
          </div>

          {/* Timeline */}
          <div style={timelineBox}>
            <div style={timelineHeader}>Timeline</div>
            {updates.length === 0 && (
              <div style={{ color: "#888", fontStyle: "italic" }}>No updates yet.</div>
            )}
            {updates.map((u, i) => (
              <div
                key={`${u.type}-${u.date}-${i}`}
                style={{
                  marginBottom: 10,
                  paddingBottom: 7,
                  borderBottom: i !== updates.length - 1 ? "1px solid #232323" : "none",
                }}
              >
                <div style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>
                  {u.type === "note" && "Note"}
                  {u.type === "voice" && "Voice Note"}
                  {u.type === "ai" && "AI"}
                  <span style={{ color: "#aaa", fontWeight: 400, marginLeft: 6 }}>
                    {u.date ? new Date(u.date).toLocaleString() : ""}
                  </span>
                </div>
                {u.type === "note" && <div style={{ color: "#eee", whiteSpace: "pre-wrap" }}>{u.text}</div>}
                {u.type === "voice" && (
                  <div>
                    <audio controls src={u.audioUrl} style={{ margin: "7px 0", width: "100%" }} />
                    <div style={{ fontSize: 13, color: "#eee" }}>Transcript: {u.transcript}</div>
                  </div>
                )}
                {u.type === "ai" && (
                  <div style={{ color: "#1bc982" }}>
                    <strong>AI Suggestion:</strong> {u.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add update buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 7 }}>
            <button type="button" style={btnSecondary} onClick={() => openAddUpdate("note")}>
              + Add Update
            </button>
            <button type="button" style={btnSecondary} onClick={() => openAddUpdate("voice")}>
              + Voice Note
            </button>
          </div>

          {/* Call QR */}
          {!!phone && (
            <div style={{ textAlign: "center", marginTop: 22 }}>
              <div style={{ fontWeight: 600, color: "#bbb", marginBottom: 9 }}>
                Scan to call on your phone:
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <QRCodeSVG value={`tel:${phone}`} size={110} fgColor="#1bc982" />
              </div>
              <div style={{ color: "#888", fontSize: 12 }}>
                Or call via your computer app, or dial {phone}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={footer}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ----------------------- styles ----------------------- */
const backdrop = {
  position: "fixed",
  left: 0,
  top: 0,
  zIndex: 70,
  width: "100vw",
  height: "100vh",
  background: "#191b1eb9",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const overlay = {
  position: "fixed",
  left: 0,
  top: 0,
  zIndex: 71,
  width: "100vw",
  height: "100vh",
  background: "#232324cc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const sheet = {
  background: "#232324",
  borderRadius: 13,
  minWidth: 320,
  maxWidth: 480,
  width: "92vw",
  boxShadow: "0 2px 16px #000c",
  padding: "24px 26px",
  color: "#eee",
};

const sheetTitle = { margin: "0 0 12px 0", fontWeight: 800, fontSize: 18, color: "#fff" };

const modal = {
  background: "#232324",
  borderRadius: 14,
  minWidth: 320,
  maxWidth: 520,
  boxShadow: "0 8px 40px #000b",
  margin: "40px 0",
  width: "92vw",
  display: "flex",
  flexDirection: "column",
  color: "#eee",
  border: "1.5px solid #292929",
  position: "relative",
  maxHeight: "calc(100vh - 80px)",
  overflowY: "auto",
};

const title = {
  margin: "0 0 15px 0",
  fontWeight: 800,
  color: "#fff",
  fontSize: 22,
  letterSpacing: 0.01,
  lineHeight: 1.22,
};

const input = {
  padding: "10px",
  fontSize: "1.02em",
  border: "1.2px solid #313336",
  borderRadius: 7,
  background: "#242529",
  color: "#eee",
  width: "100%",
  boxSizing: "border-box",
};

const textarea = {
  padding: "10px",
  fontSize: "1.05em",
  minHeight: 70,
  border: "1.2px solid #303236",
  borderRadius: 7,
  background: "#202124",
  color: "#fff",
  resize: "vertical",
  width: "100%",
  boxSizing: "border-box",
};

const timelineBox = {
  margin: "16px 0 0 0",
  background: "#29292c",
  borderRadius: 8,
  padding: "11px 13px",
  minHeight: 48,
  maxHeight: 200,
  overflowY: "auto",
};

const timelineHeader = { color: "#bbb", fontWeight: 800, fontSize: 14, marginBottom: 6 };

const footer = {
  display: "flex",
  gap: 12,
  marginTop: 15,
  justifyContent: "flex-end",
  padding: "0 26px 20px",
};

const closeX = {
  position: "absolute",
  right: 18,
  top: 16,
  background: "none",
  border: "none",
  fontSize: 23,
  color: "#aaa",
  cursor: "pointer",
  zIndex: 2,
  fontWeight: 800,
  lineHeight: 1,
};

const errorBox = {
  background: "#3a1717",
  color: "#ffd1d1",
  border: "1px solid #5a1f1f",
  borderRadius: 8,
  padding: "8px 10px",
  marginBottom: 10,
  fontWeight: 700,
};

const pillNote = {
  color: "#bbb",
  background: "#232323",
  borderRadius: 7,
  padding: "7px 10px",
  marginTop: 6,
};

const btnPrimary = {
  background: "#1bc982",
  color: "#232323",
  fontWeight: 800,
  border: "none",
  borderRadius: 7,
  padding: "10px 22px",
  cursor: "pointer",
  fontSize: "1em",
};

const btnSecondary = {
  background: "#353638",
  color: "#fff",
  fontWeight: 700,
  border: "1.2px solid #313336",
  borderRadius: 7,
  padding: "9px 18px",
  cursor: "pointer",
  fontSize: "1em",
};

const btnDanger = {
  background: "#e66565",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  borderRadius: 7,
  padding: "9px 18px",
  cursor: "pointer",
  fontSize: "1em",
};

const btnGhost = {
  background: "#29292c",
  color: "#fff",
  fontWeight: 700,
  border: "1.2px solid #3a3a3a",
  borderRadius: 7,
  padding: "10px 22px",
  cursor: "pointer",
  fontSize: "1em",
};

const miniBtnLink = {
  background: "#232323",
  color: "#fff",
  border: "1px solid #3a3a3a",
  borderRadius: 6,
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 12,
  textDecoration: "none",
  display: "inline-block",
};
