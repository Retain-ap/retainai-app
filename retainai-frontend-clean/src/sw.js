export function sendNotification(email, message = '⏰ Time to follow up with a lead!') {
  fetch('http://localhost:5000/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, message }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      console.log('Notification sent:', data);
    })
    .catch((err) => {
      console.error('Notification error:', err);
    });
}
