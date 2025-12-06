#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const INPUT_FILE = path.join(__dirname, 'created_contacts.json');
const OUTPUT_FILE = path.join(__dirname, 'add_to_workflow_results.json');
const REQUEST_DELAY_MS = 300;
const API_BASE = 'https://services.leadconnectorhq.com/contacts';
const DRY_RUN = process.argv.includes('--dry-run');

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

function extractContactId(body) {
  if (!body || typeof body !== 'object') return undefined;
  return (
    body.contactId ||
    (body.contact && (body.contact.id || body.contact.contactId)) ||
    body.id ||
    (body.data && (body.data.id || body.data.contactId))
  );
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

function categorizeStatus(message, contactIdFromError) {
  const lower = (message || '').toLowerCase();
  if (contactIdFromError && lower.includes('already')) return 'already_in_workflow';
  if (lower.includes('already in workflow')) return 'already_in_workflow';
  return 'error';
}

async function addToWorkflow(contactId, workflowId, locationId, token) {
  const url = `${API_BASE}/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(
    workflowId
  )}?locationId=${encodeURIComponent(locationId)}`;

  if (DRY_RUN) {
    return { status: 'dry_run', body: { message: 'dry run, not sent' } };
  }

  return postJson(
    url,
    {}, // endpoint does not require a body
    {
      Authorization: `Bearer ${token}`,
      Version: '2021-07-28',
      'User-Agent': 'ghl-workflow-importer/1.0',
    }
  );
}

async function main() {
  loadEnv();

  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  const workflowId = process.env.GHL_WORKFLOW_ID;
  if (!token || !locationId || !workflowId) {
    throw new Error('GHL_TOKEN, GHL_LOCATION_ID or GHL_WORKFLOW_ID is missing in .env or environment');
  }

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  const contacts = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const results = [];
  const seen = new Set();

  for (const entry of contacts) {
    const contactId = entry.contactId;
    if (!contactId) {
      results.push({ contactId: null, phone: entry.phone || null, status: 'skipped', reason: 'missing contactId' });
      continue;
    }

    if (seen.has(contactId)) {
      results.push({ contactId, phone: entry.phone || null, status: 'skipped', reason: 'duplicate contactId' });
      continue;
    }
    seen.add(contactId);

    try {
      const { contactId: responseId } = await addToWorkflow(contactId, workflowId, locationId, token);
      results.push({
        contactId: responseId || contactId,
        phone: entry.phone || null,
        status: DRY_RUN ? 'dry_run' : 'added',
      });
      console.log(
        `${DRY_RUN ? '[dry-run] would add' : 'Added'} contact ${contactId} to workflow ${workflowId}`
      );
    } catch (error) {
      const status = categorizeStatus(error.message, error.contactId);
      results.push({
        contactId: error.contactId || contactId,
        phone: entry.phone || null,
        status,
        error: error.message,
      });
      console.warn(`Failed for ${contactId}: ${error.message}`);
    }

    await wait(REQUEST_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Finished. Results saved to ${OUTPUT_FILE}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
