import { createApp } from './app.js';
import { createRegistry, DEMO } from './registry.js';
import { DATA_DIR } from './store.js';
import { aiMode } from './domain/frontDesk.js';
import { runScheduledJobs } from './jobs.js';

const port = Number(process.env.PORT || 4200);
const registry = createRegistry();
const app = createApp({ registry });

setInterval(() => { try { runScheduledJobs(registry); } catch (err) { console.error('[jobs]', err.message); } }, 60000).unref();

app.listen(port, () => {
  console.log(`Clinovara backend  → http://localhost:${port}`);
  console.log(`Data directory     → ${DATA_DIR} (platform.json + tenants/*.json)`);
  console.log(`Clinics registered → ${registry.platform.db.tenants.length}`);
  console.log(`Demo login         → ${DEMO.email} / ${DEMO.password} (clinic "${DEMO.slug}")`);
  console.log(`AI front desk      → ${aiMode() === 'claude' ? 'Claude (claude-opus-5)' : 'built-in rule engine (set ANTHROPIC_API_KEY to use Claude)'}`);
});
