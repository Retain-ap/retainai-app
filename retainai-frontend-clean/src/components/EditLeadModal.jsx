// src/components/EditLeadModal.jsx
import React, { useState, useEffect } from 'react';

function EditLeadModal({ lead, onClose, onSave }) {
  const [formData, setFormData] = useState(lead);

  useEffect(() => {
    setFormData(lead); // Sync form with selected lead
  }, [lead]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!lead) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white text-black p-6 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Edit Lead</h2>
        <form onSubmit={handleSubmit}>
          <input name="name" value={formData.name} onChange={handleChange} placeholder="Name" className="w-full mb-2 p-2 border rounded" />
          <input name="email" value={formData.email} onChange={handleChange} placeholder="Email" className="w-full mb-2 p-2 border rounded" />
          <input name="lastContacted" value={formData.lastContacted} onChange={handleChange} placeholder="Last Contacted" className="w-full mb-2 p-2 border rounded" />
          <input name="notes" value={formData.notes} onChange={handleChange} placeholder="Notes" className="w-full mb-2 p-2 border rounded" />
          <input name="tags" value={formData.tags.join(', ')} onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(',').map(tag => tag.trim()) })} placeholder="Tags (comma-separated)" className="w-full mb-4 p-2 border rounded" />
          <div className="flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditLeadModal;
