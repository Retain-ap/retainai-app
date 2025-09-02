// src/components/LeadModal.jsx

import React, { useState, useRef } from "react";
import Tags from "./Tags";
import { QRCodeSVG } from "qrcode.react";

function migrateNotesToUpdates(lead) {
  if (lead?.updates && Array.isArray(lead.updates)) return lead.updates;
  if (lead?.notes) {
    return [{
      type: "note",
      text: lead.notes,
      date: lead.createdAt || new Date().toISOString(),
      author: "user",
    }];
  }
  return [];
}

function VoiceRecorder({ onSave }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const chunks = useRef([]);

  const handleStart = async () => {
    setTranscript("");
    if (!navigator.mediaDevices) {
      alert("Mic not supported in this browser.");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new window.MediaRecorder(stream);
    mr.ondataavailable = e => chunks.current.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setTranscript("Voice note transcribed (demo).");
      onSave(blob, url, "Voice note transcribed (demo).");
      chunks.current = [];
    };
    setMediaRecorder(mr);
    mr.start();
    setRecording(true);
  };

  const handleStop = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  return (
    <div style={{ margin: "12px 0" }}>
      <div>
        {!recording && (
          <button
            type="button"
            style={{
              background: "#232323",
              color: "#fff",
              border: "1.2px solid #313336",
              borderRadius: 7,
              padding: "9px 23px",
              fontWeight: 700,
              marginRight: 14,
              cursor: "pointer",
            }}
            onClick={handleStart}
          >
            🎤 Start Recording
          </button>
        )}
        {recording && (
          <button
            type="button"
            style={{
              background: "#e66565",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              padding: "9px 23px",
              fontWeight: 700,
              marginRight: 14,
              cursor: "pointer",
            }}
            onClick={handleStop}
          >
            ⏹ Stop Recording
          </button>
        )}
        {audioUrl && (
          <audio controls src={audioUrl} style={{ display: "block", marginTop: 9 }} />
        )}
        {transcript && (
          <div style={{
            color: "#bbb", background: "#232323", borderRadius: 7,
            padding: "7px 10px", marginTop: 6
          }}>
            Transcript: {transcript}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadModal({ lead, tags, onClose, onSave }) {
  const [name, setName] = useState(lead?.name || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [birthday, setBirthday] = useState(lead?.birthday ? lead.birthday.slice(0, 10) : "");
  const [leadTags, setLeadTags] = useState(lead?.tags || []);
  const [updates, setUpdates] = useState(migrateNotesToUpdates(lead));
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [newUpdateText, setNewUpdateText] = useState("");
  const [addingVoice, setAddingVoice] = useState(false);
  const [voiceData, setVoiceData] = useState({ blob: null, url: null, transcript: "" });

  function handleSave() {
    onSave({
      ...(lead || {}),
      name,
      email,
      phone,
      birthday: birthday || undefined,
      tags: leadTags,
      createdAt: lead?.createdAt || new Date().toISOString(),
      updates,
      notes: updates.length > 0 ? updates[updates.length - 1].text : "",
    });
  }

  function handleAddUpdate(type = "note") {
    if (type === "voice") {
      setAddingVoice(true);
      setShowUpdateModal(true);
      return;
    }
    setAddingVoice(false);
    setShowUpdateModal(true);
  }

  function handleSaveUpdate() {
    let update;
    if (addingVoice && voiceData.url) {
      update = {
        type: "voice",
        date: new Date().toISOString(),
        author: "user",
        audioUrl: voiceData.url,
        transcript: voiceData.transcript,
      };
    } else {
      if (!newUpdateText.trim()) return;
      update = {
        type: "note",
        text: newUpdateText.trim(),
        date: new Date().toISOString(),
        author: "user",
      };
    }
    setUpdates(prev => [...prev, update]);
    setShowUpdateModal(false);
    setNewUpdateText("");
    setVoiceData({ blob: null, url: null, transcript: "" });
    setAddingVoice(false);
  }

  // --- KEY: Responsive, scrollable modal ---
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 70,
        width: "100vw",
        height: "100vh",
        background: "#191b1eb9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
      onClick={onClose}
    >
      {/* Add Update Modal */}
      {showUpdateModal && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: 71,
            width: "100vw",
            height: "100vh",
            background: "#232324cc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => { setShowUpdateModal(false); setNewUpdateText(""); setAddingVoice(false); setVoiceData({}); }}
        >
          <div
            style={{
              background: "#232324",
              borderRadius: 13,
              minWidth: 320,
              maxWidth: 410,
              boxShadow: "0 2px 16px #000c",
              padding: "28px 33px",
              display: "flex",
              flexDirection: "column",
              gap: 13,
              width: "100%",
              position: "relative",
              color: "#eee"
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px 0", fontWeight: 700 }}>
              {addingVoice ? "Add Voice Note" : "Add Update"}
            </h3>
            {addingVoice ? (
              <VoiceRecorder
                onSave={(blob, url, transcript) => {
                  setVoiceData({ blob, url, transcript });
                }}
              />
            ) : (
              <textarea
                placeholder="Write an update…"
                value={newUpdateText}
                onChange={e => setNewUpdateText(e.target.value)}
                style={{
                  padding: "10px",
                  fontSize: "1.07em",
                  minHeight: 55,
                  border: "1.2px solid #303236",
                  borderRadius: 7,
                  background: "#202124",
                  color: "#fff",
                  resize: "vertical",
                }}
              />
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                style={{
                  background: "#353638",
                  color: "#fff",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 7,
                  padding: "10px 22px",
                  cursor: "pointer",
                  fontSize: "1em",
                }}
                onClick={handleSaveUpdate}
              >
                Save Update
              </button>
              <button
                type="button"
                style={{
                  background: "#29292c",
                  color: "#aaa",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 7,
                  padding: "10px 22px",
                  cursor: "pointer",
                  fontSize: "1em",
                }}
                onClick={() => { setShowUpdateModal(false); setNewUpdateText(""); setAddingVoice(false); setVoiceData({}); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Lead Modal - key: maxHeight, scrollable, always centered */}
      <form
        style={{
          background: "#232324",
          borderRadius: 14,
          minWidth: 320,
          maxWidth: 410,
          boxShadow: "0 8px 40px #000b",
          margin: "40px 0",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          color: "#eee",
          border: "1.5px solid #292929",
          position: "relative",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
        onSubmit={e => {
          e.preventDefault();
          handleSave();
        }}
      >
        {/* Close "X" */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            right: 18,
            top: 16,
            background: "none",
            border: "none",
            fontSize: 23,
            color: "#aaa",
            cursor: "pointer",
            zIndex: 2,
            fontWeight: 800
          }}
          aria-label="Close"
        >×</button>
        <div style={{ padding: "20px 28px 10px 28px" }}>
          <h2 style={{
            margin: "0 0 15px 0",
            fontWeight: 700,
            color: "#fff",
            fontSize: 22,
            letterSpacing: 0.01,
            lineHeight: 1.22
          }}>
            {lead ? "Edit Lead" : "Add Lead"}
          </h2>
          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              required
              value={name}
              placeholder="Full Name"
              style={{
                padding: "10px",
                fontSize: "1.02em",
                border: "1.2px solid #313336",
                borderRadius: 7,
                background: "#242529",
                color: "#eee",
              }}
              onChange={e => setName(e.target.value)}
            />
            <input
              required
              type="email"
              value={email}
              placeholder="Email"
              style={{
                padding: "10px",
                fontSize: "1.02em",
                border: "1.2px solid #313336",
                borderRadius: 7,
                background: "#242529",
                color: "#eee",
              }}
              onChange={e => setEmail(e.target.value)}
            />
            <input
              type="tel"
              value={phone}
              placeholder="Phone Number"
              style={{
                padding: "10px",
                fontSize: "1.02em",
                border: "1.2px solid #313336",
                borderRadius: 7,
                background: "#242529",
                color: "#eee",
              }}
              onChange={e => setPhone(e.target.value)}
            />
            <input
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              style={{
                padding: "10px",
                fontSize: "1.02em",
                border: "1.2px solid #313336",
                borderRadius: 7,
                background: "#242529",
                color: "#eee",
              }}
              placeholder="Birthday"
            />
            {/* Tags */}
            <Tags
              tags={tags}
              selected={leadTags}
              onChange={setLeadTags}
              placeholder="Tags..."
            />
          </div>
          {/* Timeline */}
          <div style={{
            margin: "16px 0 0 0",
            background: "#29292c",
            borderRadius: 8,
            padding: "11px 13px",
            minHeight: 48,
            maxHeight: 170,
            overflowY: "auto",
          }}>
            <div style={{
              color: "#bbb",
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 4
            }}>Timeline</div>
            {updates.length === 0 && <div style={{ color: "#888", fontStyle: "italic" }}>No updates yet.</div>}
            {updates.map((u, i) => (
              <div key={i} style={{
                marginBottom: 10,
                paddingBottom: 7,
                borderBottom: i !== updates.length - 1 ? "1px solid #232323" : "none"
              }}>
                <div style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>
                  {u.type === "note" && "Note"}
                  {u.type === "voice" && "Voice Note"}
                  {u.type === "ai" && "AI"}
                  <span style={{ color: "#aaa", fontWeight: 400, marginLeft: 6 }}>
                    {u.date ? new Date(u.date).toLocaleString() : ""}
                  </span>
                </div>
                {u.type === "note" && <div style={{ color: "#eee" }}>{u.text}</div>}
                {u.type === "voice" && (
                  <div>
                    <audio controls src={u.audioUrl} style={{ margin: "7px 0" }} />
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
            <button
              type="button"
              style={{
                background: "#353638",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                borderRadius: 7,
                padding: "8px 17px",
                cursor: "pointer",
                fontSize: "1em",
              }}
              onClick={() => handleAddUpdate("note")}
            >
              + Add Update
            </button>
            <button
              type="button"
              style={{
                background: "#353638",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                borderRadius: 7,
                padding: "8px 17px",
                cursor: "pointer",
                fontSize: "1em",
              }}
              onClick={() => handleAddUpdate("voice")}
            >
              + Voice Note
            </button>
          </div>
          {/* Call QR code if phone provided */}
          {phone && (
            <div style={{ textAlign: "center", marginTop: 25 }}>
              <div style={{ fontWeight: 600, color: "#bbb", marginBottom: 9 }}>Scan to call on your phone:</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <QRCodeSVG value={`tel:${phone}`} size={110} fgColor="#1bc982" />
              </div>
              <div style={{ color: "#888", fontSize: 12 }}>Or use your computer with calling software (like Skype or Teams) or just dial {phone}</div>
            </div>
          )}
        </div>
        {/* Save/Cancel buttons */}
        <div style={{
          display: "flex",
          gap: 12,
          marginTop: 15,
          justifyContent: "flex-end",
          padding: "0 26px"
        }}>
          <button
            type="submit"
            style={{
              background: "#1bc982",
              color: "#232323",
              fontWeight: 600,
              border: "none",
              borderRadius: 7,
              padding: "10px 22px",
              cursor: "pointer",
              fontSize: "1em",
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#353638",
              color: "#fff",
              fontWeight: 600,
              border: "none",
              borderRadius: 7,
              padding: "10px 22px",
              cursor: "pointer",
              fontSize: "1em",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
