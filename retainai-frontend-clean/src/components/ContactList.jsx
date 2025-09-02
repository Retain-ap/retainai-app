import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ContactList() {
  const [leads, setLeads] = useState([]);
  const [newLead, setNewLead] = useState({ lead_username: '', email: '' });

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:5000/leads?username=demo');
      setLeads(response.data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
    }
  };

  const handleChange = (e) => {
    setNewLead({ ...newLead, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newLead.lead_username || !newLead.email) return;

    try {
      await axios.post('http://127.0.0.1:5000/submit-lead', {
        username: 'demo',
        ...newLead
      });
      setNewLead({ lead_username: '', email: '' });
      fetchLeads(); // Refresh list
    } catch (error) {
      console.error('Error submitting lead:', error);
    }
  };

  return (
    <div className="p-4 text-white">
      <h2 className="text-2xl font-bold mb-4">📋 Lead Dashboard</h2>

      {leads.length === 0 ? (
        <p className="text-gray-400">No leads captured yet.</p>
      ) : (
        <ul className="space-y-4">
          {leads.map((lead, index) => (
            <li key={index} className="border border-gray-700 p-4 rounded-md">
              <p className="font-semibold">{lead.username}</p>
              <p className="text-sm text-gray-300">{lead.email}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Add Lead Form */}
      <form onSubmit={handleSubmit} className="mt-6 border-t border-gray-700 pt-4">
        <h3 className="text-lg font-semibold mb-2">➕ Add New Lead</h3>
        <input
          type="text"
          name="lead_username"
          placeholder="Username"
          value={newLead.lead_username}
          onChange={handleChange}
          className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={newLead.email}
          onChange={handleChange}
          className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
        />
        <button
          type="submit"
          className="bg-gold-500 hover:bg-gold-600 text-black font-semibold py-2 px-4 rounded"
        >
          Save Lead
        </button>
      </form>
    </div>
  );
}

export default ContactList;
