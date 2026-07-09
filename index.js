const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');

const app = express();
app.use(express.json());

let qrImageUrl = '';
let isReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ]
  }
});

client.on('qr', async (qr) => {
  qrcode.generate(qr, { small: true });
  qrImageUrl = await QRCode.toDataURL(qr);
  console.log('QR Code ready — bukak /qr untuk scan');
});

client.on('ready', () => {
  isReady = true;
  console.log('WhatsApp connected!');
});

client.on('disconnected', () => {
  isReady = false;
  console.log('WhatsApp disconnected');
});

app.get('/qr', (req, res) => {
  if (isReady) {
    res.send('<h2>✅ WhatsApp sudah connected!</h2>');
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

app.post('/send', (req, res) => {
  const { phone, message } = req.body;

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp not connected' });
  }

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message required' });
  }

  const chatId = phone.replace(/\D/g, '') + '@c.us';

  client.sendMessage(chatId, message)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));

client.initialize();
