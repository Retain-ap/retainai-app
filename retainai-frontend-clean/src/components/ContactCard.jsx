import React from 'react';

const ContactCard = ({ client, onFollowUp }) => {
  const { name, email, lastContacted, tags, mood } = client;

  const daysSinceContact = Math.floor(
    (Date.now() - new Date(lastContacted)) / (1000 * 60 * 60 * 24)
  );

  const getWarmth = () => {
    if (daysSinceContact < 5) return '🟢 Fresh';
    if (daysSinceContact < 10) return '🟡 Warming Up';
    return '🔴 Cold';
  };

  return (
    <div className="bg-white dark:bg-[#111] border border-gray-300 dark:border-gray-700 p-4 rounded-xl shadow-md max-w-md">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white">{name}</h3>
        <span className="text-sm text-gray-400">{getWarmth()}</span>
      </div>
      <p className="text-sm text-gray-400">{email}</p>
      <p className="mt-1 text-sm text-gray-300">Mood: {mood || 'Unknown'}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags?.map((tag, i) => (
          <span key={i} className="bg-gold-500 text-black text-xs font-semibold px-2 py-1 rounded-full">
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Last contacted: {new Date(lastContacted).toLocaleDateString()}
      </p>
      <button
        onClick={() => onFollowUp(client)}
        className="mt-4 w-full bg-gold-600 hover:bg-gold-700 text-black font-bold py-2 px-4 rounded-xl"
      >
        ✉️ Suggest Follow-Up
      </button>
    </div>
  );
};

export default ContactCard;
