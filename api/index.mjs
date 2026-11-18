/**
 * Vercel serverless entry point.
 *
 * `vercel.json` rewrites every /api/* request here, and the shared handler in
 * server/index.mjs keeps the full URL path, so routing behaves exactly like the
 * local server. Static files are served by Vercel from dist/.
 */
import { handler } from '../server/index.mjs';

export default handler;
