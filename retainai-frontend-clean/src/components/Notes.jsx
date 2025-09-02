import React from 'react';

function Notes({ leads }) {
  const allNotes = leads
    .flatMap((lead) =>
      (lead.notes || []).map((note) => ({
        leadName: lead.name,
        text: note.text,
        date: note.date,
      }))
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="tags-section">
      <h2>✍️ All Notes</h2>
      {allNotes.length === 0 ? (
        <p>No notes yet.</p>
      ) : (
        <ul>
          {allNotes.map((note, i) => (
            <li key={i} style={{ marginBottom: '10px' }}>
              <strong>{note.leadName}</strong> <small>({note.date})</small>
              <div>{note.text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Notes;
