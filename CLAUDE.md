# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js web application that serves a simple HTML frontend with a button that triggers GoHighLevel (GHL) workflow automation scripts. The project imports WhatsApp contacts into GHL and adds them to workflows.

## Running the Project

Start the development server:
```bash
node server.js
```

The server will start on port 3000 (or next available port) and serve the application at `http://localhost:3000`.

## Architecture

### Frontend-Backend Flow

1. **Frontend** (`index.html` + `src/main.js`): Displays a button that triggers a POST request to `/run-workflow`
2. **Server** (`server.js`): HTTP server that serves static files and spawns child processes for workflow scripts
3. **Workflow Scripts** (`assets/*.js`): Standalone Node.js scripts that interact with the GHL API

### Workflow Scripts

The application uses two main scripts in the `assets/` directory:

1. **`create_ghl_contacts.js`**: Imports WhatsApp contacts into GHL
   - Reads from: `assets/WA-EXTRACTOR-Zoi_1764941470382.json`
   - Writes to: `assets/created_contacts-test.json`
   - Performs phone lookup to avoid duplicates before creating contacts
   - Rate limited: 300ms between requests

2. **`add_contacts_to_workflow.js`**: Adds contacts to a GHL workflow
   - Reads from: `assets/created_contacts-test.json`
   - Writes to: `assets/add_to_workflow_results.json`
   - Supports `--dry-run` flag for testing
   - Rate limited: 300ms between requests

### Server Endpoint Behavior

- **`POST /run-workflow`**: Spawns `add_contacts_to_workflow.js` as a child process
  - Returns 409 if process is already running
  - Returns script stdout/stderr and exit code
  - The script runs in the `assets/` directory with inherited environment variables

### Environment Configuration

Both workflow scripts read from `assets/.env` and require:
- `GHL_TOKEN`: GoHighLevel API token
- `GHL_LOCATION_ID`: GHL location identifier
- `GHL_WORKFLOW_ID`: GHL workflow identifier (for `add_contacts_to_workflow.js`)

Environment variables are loaded using a custom parser that handles quoted values and comments.

### GHL API Integration

All scripts use the native `https` module (no external dependencies) to interact with:
- Base URL: `https://services.leadconnectorhq.com/contacts`
- Required headers:
  - `Authorization: Bearer ${token}`
  - `Version: 2021-07-28`
  - `User-Agent: ghl-*-importer/1.0`

Contact ID extraction is flexible and handles multiple response formats from the GHL API.

### Error Handling Patterns

- Both workflow scripts categorize API errors (e.g., "already_in_workflow" vs "error")
- Failed requests don't stop execution; results are logged with error details
- Duplicate contactIds are skipped within a single run
- Missing required fields (phone, contactId) result in "skipped" status

## Key Implementation Details

### Server Port Handling
The server automatically retries on the next available port (up to 10 attempts) if the default port is in use.

### Security
- Path traversal protection in static file serving
- CORS enabled for all endpoints
- No external dependencies (uses only Node.js built-ins)

### File Structure
```
├── index.html              # Main HTML page
├── server.js               # HTTP server with /run-workflow endpoint
├── src/
│   ├── main.js            # Frontend logic (button click handler)
│   └── styles.css         # Global styles
└── assets/
    ├── .env               # Environment variables (GHL credentials)
    ├── create_ghl_contacts.js        # Contact import script
    ├── add_contacts_to_workflow.js   # Workflow addition script
    ├── WA-EXTRACTOR-*.json           # WhatsApp export data
    ├── created_contacts-test.json    # Intermediate results
    └── add_to_workflow_results.json  # Final results
```

## Working with Workflow Scripts

When modifying workflow scripts:
- They are designed to run standalone with `#!/usr/bin/env node`
- They can be tested directly: `node assets/add_contacts_to_workflow.js --dry-run`
- Always maintain the 300ms delay between API requests to respect rate limits
- Preserve the flexible contact ID extraction logic that handles various GHL API response formats
