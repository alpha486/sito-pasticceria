// File: netlify/functions/tiktok-webhook.js

exports.handler = async (event) => {
  // Netlify Functions si aspetta richieste POST, quindi va bene.
  // Il 'event.body' contiene i dati inviati da TikTok.
  const body = JSON.parse(event.body);

  console.log('--- Notifica da TikTok (AMBIENTE DI TEST) Ricevuta! ---');
  console.log('Dati ricevuti:', body);

  // Qui andrà la logica per aggiungere l'ordine al database di TEST.

  // Rispondi a TikTok che hai ricevuto la notifica
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Notifica ricevuta con successo.' }),
  };
};