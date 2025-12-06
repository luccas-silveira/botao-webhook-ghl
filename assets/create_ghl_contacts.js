#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const INPUT_FILE = path.join(__dirname, 'WA-EXTRACTOR-Zoi_1764941470382.json');
const OUTPUT_FILE = path.join(__dirname, 'created_contacts-test.json');
const REQUEST_DELAY_MS = 300;
const API_URL = 'https://services.leadconnectorhq.com/contacts/';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const [key, ...rest] = line.split('=');
    if (!key) continue;
    const value = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
    if (value && !process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}

function cleanPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

function extractContactId(body) {
  if (!body || typeof body !== 'object') return undefined;
  return (
    body.contactId ||
    (body.contact && (body.contact.id || body.contact.contactId)) ||
    body.id ||
    (body.data && (body.data.id || body.data.contactId))
  );
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...headers,
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          let parsed = {};
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch (error) {
              return reject(new Error(`Invalid JSON response (${response.statusCode}): ${raw}`));
            }
          }

          const contactId = extractContactId(parsed);
          if (response.statusCode >= 200 && response.statusCode < 300) {
            return resolve({ body: parsed, contactId });
          }

          const error = new Error(parsed.message || parsed.error || `HTTP ${response.statusCode}`);
          error.status = response.statusCode;
          error.body = parsed;
          error.contactId = contactId;
          return reject(error);
        });
      }
    );

    request.on('error', reject);
    request.end();
  });
}

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'application/json',
          ...headers,
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          let parsed = {};
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch (error) {
              return reject(new Error(`Invalid JSON response (${response.statusCode}): ${raw}`));
            }
          }

          const contactId = extractContactId(parsed);
          if (response.statusCode >= 200 && response.statusCode < 300) {
            return resolve({ body: parsed, contactId });
          }

          const error = new Error(parsed.message || parsed.error || `HTTP ${response.statusCode}`);
          error.status = response.statusCode;
          error.body = parsed;
          error.contactId = contactId;
          return reject(error);
        });
      }
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function buildPayload(contact, locationId) {
  const name = (contact.saved_name || contact.public_name || '').trim();
  const [firstName, ...rest] = name ? name.split(/\s+/) : [];
  const phone = cleanPhone(
    contact.phone_number || contact.phone || contact.phoneNumber || contact.formatted_phone
  );

  return {
    locationId,
    phone,
    firstName: firstName || contact.public_name || 'Contato',
    lastName: rest.join(' ') || undefined,
    source: 'WA import',
  };
}

async function lookupContactByPhone(phone, locationId, token) {
  const lookupUrl = `${API_URL}?locationId=${encodeURIComponent(
    locationId
  )}&query=${encodeURIComponent(phone)}&limit=1`;
  const { body, contactId } = await getJson(lookupUrl, {
    Authorization: `Bearer ${token}`,
    Version: '2021-07-28',
    'User-Agent': 'ghl-contact-importer/1.0',
  });
  const fromList = body && Array.isArray(body.contacts) && body.contacts[0];
  return { body, contactId: contactId || (fromList && fromList.id) || null };
}

async function main() {
  loadEnv();

  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error('GHL_TOKEN or GHL_LOCATION_ID is missing in .env or environment');
  }

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  const contacts = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const results = [];

  for (const contact of contacts) {
    const payload = buildPayload(contact, locationId);
    const phone = payload.phone;
    const savedName = contact.saved_name || contact.public_name || null;

    if (!phone) {
      results.push({ phone: null, savedName, status: 'skipped', reason: 'missing phone' });
      continue;
    }

    let existingId = null;
    try {
      const lookup = await lookupContactByPhone(phone, locationId, token);
      existingId = lookup.contactId || null;
    } catch (lookupError) {
      // Ignore lookup errors before create; we'll retry lookup after create failure if needed.
    }

    if (existingId) {
      results.push({ phone, savedName, contactId: existingId, status: 'exists' });
      console.log(`Already exists ${phone} -> ${existingId}`);
      await wait(REQUEST_DELAY_MS);
      continue;
    }

    try {
      const { contactId } = await postJson(API_URL, payload, {
        Authorization: `Bearer ${token}`,
        Version: '2021-07-28',
        'User-Agent': 'ghl-contact-importer/1.0',
      });

      results.push({
        phone,
        savedName,
        contactId: contactId || null,
        status: 'created',
      });
      console.log(`Created contact ${phone}${contactId ? ` -> ${contactId}` : ''}`);
    } catch (error) {
      let contactId = error.contactId || null;
      let status = contactId ? 'exists' : 'error';
      let message = error.message;

      if (!contactId) {
        try {
          const lookup = await lookupContactByPhone(phone, locationId, token);
          contactId = lookup.contactId || contactId;
          if (contactId) status = 'exists';
        } catch (lookupError) {
          message += ` | lookup failed: ${lookupError.message}`;
        }
      }

      results.push({
        phone,
        savedName,
        contactId: contactId || null,
        status,
        error: message,
      });
      console.warn(
        `Failed for ${phone}: ${message}${contactId ? ` (id: ${contactId}, status: ${status})` : ''}`
      );
    }

    await wait(REQUEST_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Finished. Results saved to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
