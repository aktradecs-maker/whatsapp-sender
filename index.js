const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const pino = require('pino');

const PORT = process.env.PORT || 3000;
console.log('Starting on port', PORT);

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
      console.log('Connection closed, reason:', reason);
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startWhatsApp, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

app.get('/', (req, res) => res.send('OK'));

app.get('/qr', (req, res) => {
  if (isReady) {
    res.send('<h2>&#x2705; WhatsApp sudah connected!</h2>');
  } else if (qrImageUrl) {
    res.send(`<h2>Scan QR:</h2><img src="${qrImageUrl}" style="width:300px"/>`);
  } else {
    res.send('<h2>Loading QR... refresh dalam 10 saat</h2>');
  }
});

app.get('/status', (req, res) => {
  res.json({ connected: isReady });
});

// List all groups — use this to find group IDs for each client
app.get('/groups', async (req, res) => {
  if (!isReady || !sock) return res.status(503).json({ error: 'WhatsApp not connected' });
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({
      id: g.id,
      name: g.subject,
      participants: g.participants.length
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send to group or personal number
app.post('/send', async (req, res) => {
  const { groupId, phone, message } = req.body;

  if (!isReady || !sock) return res.status(503).json({ error: 'WhatsApp not connected' });
  if (!message) return res.status(400).json({ error: 'message required' });

  // groupId takes priority; fallback to phone number
  const jid = groupId || (phone.replace(/\D/g, '') + '@s.whatsapp.net');

  try {
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true, sentTo: jid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});
server.on('error', (err) => console.error('Server error:', err.message));

startWhatsApp().catch(console.error);
