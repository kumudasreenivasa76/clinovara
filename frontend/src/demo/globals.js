/* Must be imported first: sets the globals the bundled backend expects. */
import { Buffer } from './node-shims.js';
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.process = globalThis.process || { env: { CLINOVARA_AI: 'rules', CLINOVARA_FRONTEND_URL: `${location.origin}${location.pathname}` } };
