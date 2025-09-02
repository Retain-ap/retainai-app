import React, { useState } from 'react';

const AddClientForm = ({ onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    last_contacted: '',
    notes: '',
    tags: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newClient = {
      name: formData.name,
      email: formData.email,
      last_contacted: formData.last_contacted,
      notes: formData.notes,
      tags: formData.tags.split(',').map(t => t.trim())
    };
    onAdd(newClient);
    setFormData({ name: '', email: '', last_contacted: '', notes: '', tags: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
      <input name="name" value={formData.name} onChange={handleChange} placeholder="Name" className="w-full p-2 rounded bg-zinc-800 text-white" />
      <input name="email" value={formData.email} onChange={handleChange} placeholder="Email" className="w-full p-2 rounded bg-zinc-800 text-white" />
      <input name="last_contacted" type="date" value={formData.last_contacted} onChange={handleChange} className="w-full p-2 rounded bg-zinc-800 text-white" />
      <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Notes" className="w-full p-2 rounded bg-zinc-800 text-white" />
      <input name="tags" value={formData.tags} onChange={handleChange} placeholder="Tags (comma-separated)" className="w-full p-2 rounded bg-zinc-800 text-white" />
      <button type="submit" className="bg-gold text-black px-4 py-2 rounded">Save Lead</button>
    </form>
  );
};

export default AddClientForm;