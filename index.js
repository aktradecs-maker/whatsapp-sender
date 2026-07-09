const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock = null;
let qrImageUrl = '';
let isReady = false;

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  console.log('Using WA version:', version.join('.'));

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Chrome (Linux)', 'Chrome', '122.0.0'],
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrImageUrl = await QRCode.toDataURL(qr);
      isReady = false;
      console.log('QR ready');
    }

    if (connection === 'open') {
      isReady = true;
      qrImageUrl = '';
      console.log('WhatsApp connected!');
    }

    if (connection === 'close') {
      isReady = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === statusCode) || statusCode;
      console.log('Connection closed, reason:', reason, 'reconnecting:', statusCode !== DisconnectReason.loggedOut);
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startWhatsApp, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

app.get('/qr', (req, res) => {
  if (isReady) {
    res.send('<h2>&#x2705; WhatsApp sudah connected!</h2>');
  } else if (qrImageUrl) {
    res.send(`
      <h2>Scan QR ni dengan WhatsApp kau:</h2>
      <img src="${qrImageUrl}" style="width:300px"/>
      <p>Refresh page ni selepas scan</p>
    `);
  } else {
    res.send('<h2>Loading QR... refresh dalam 10 saat</h2>');
  }
});

app.get('/status', (req, res) => {
  res.json({ connected: isReady });
});

app.post('/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!isReady || !sock) {
    return res.status(503).json({ error: 'WhatsApp not connected' });
  }

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message required' });
  }

  const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net';

  try {
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));

startWhatsApp();
