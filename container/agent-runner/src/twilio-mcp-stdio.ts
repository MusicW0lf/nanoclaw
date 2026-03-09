/**
 * Twilio MCP Server for NanoClaw
 * Provides a call_phone tool that makes an outbound phone call via Twilio.
 * Speaks the given message aloud using text-to-speech.
 * No public URL needed — TwiML is passed inline.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const TWILIO_TO_NUMBER = process.env.TWILIO_TO_NUMBER || '';

function log(msg: string): void {
  console.error(`[TWILIO] ${msg}`);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const server = new McpServer({
  name: 'twilio',
  version: '1.0.0',
});

server.tool(
  'call_phone',
  `Make a phone call to the user and speak a message aloud. Use this for urgent reminders that need immediate attention — the phone will ring and the message will be read out loud. The message is repeated twice so the user can catch it.

Only use this when the user has explicitly asked for a phone call reminder, or when something is truly urgent.`,
  {
    message: z.string().describe('The message to speak during the call. Keep it concise and clear.'),
  },
  async (args) => {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !TWILIO_TO_NUMBER) {
      return {
        content: [{
          type: 'text' as const,
          text: 'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and TWILIO_TO_NUMBER in your .env file.',
        }],
        isError: true,
      };
    }

    const safeMessage = escapeXml(args.message);
    const twiml = `<Response><Say voice="alice">${safeMessage}</Say><Pause length="1"/><Say voice="alice">${safeMessage}</Say></Response>`;

    log(`Initiating call to ${TWILIO_TO_NUMBER} from ${TWILIO_FROM_NUMBER}`);

    try {
      const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const body = new URLSearchParams({
        To: TWILIO_TO_NUMBER,
        From: TWILIO_FROM_NUMBER,
        Twiml: twiml,
      });

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        }
      );

      const data = await response.json() as { sid?: string; status?: string; message?: string; code?: number };

      if (!response.ok) {
        log(`Call failed: ${JSON.stringify(data)}`);
        return {
          content: [{
            type: 'text' as const,
            text: `Call failed (${response.status}): ${data.message || JSON.stringify(data)}`,
          }],
          isError: true,
        };
      }

      log(`Call initiated: sid=${data.sid} status=${data.status}`);
      return {
        content: [{
          type: 'text' as const,
          text: `Call initiated successfully (SID: ${data.sid}). The phone will ring shortly.`,
        }],
      };
    } catch (err) {
      log(`Call error: ${err instanceof Error ? err.message : String(err)}`);
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to initiate call: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
