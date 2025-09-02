import React, { useState } from 'react';

function LeadCaptureForm({ onAdd }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    notes: '',
    tags: '',
  });

  const handleChange = e => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = e => {
    e.preventDefault();
    const newLead = {
      ...formData,
      tags: formData.tags.split(',').map(tag => tag.trim()),
      lastContacted: new Date().toISOString(),
    };
    onAdd(newLead);
    setFormData({ name: '', email: '', notes: '', tags: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white text-black p-6 rounded-lg shadow-md max-w-md mb-8">
      <h2 className="text-lg font-bold mb-4">📥 Add New Lead</h2>
      <input
        type="text"
        name="name"
        placeholder="Full Name"
        value={formData.name}
        onChange={handleChange}
        required
        className="w-full p-2 border border-gray-300 mb-3 rounded"
      />
      <input
        type="email"
        name="email"
        placeholder="Email"
        value={formData.email}
        onChange={handleChange}
        required
        className="w-full p-2 border border-gray-300 mb-3 rounded"
      />
      <textarea
        name="notes"
        placeholder="Notes"
        value={formData.notes}
        onChange={handleChange}
        className="w-full p-2 border border-gray-300 mb-3 rounded"
      />
      <input
        type="text"
        name="tags"
        placeholder="Tags (comma-separated)"
        value={formData.tags}
        onChange={handleChange}
        className="w-full p-2 border border-gray-300 mb-4 rounded"
      />
      <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
        Save Lead
      </button>
    </form>
  );
}

export default LeadCaptureForm;
