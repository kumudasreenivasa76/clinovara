/** Work that has to happen without anyone clicking: approved per-visit messages and scheduled campaigns that have come due. */
import { dispatchQueue, dispatchScheduledCampaigns, queueBirthdays } from './domain/marketing.js';
import { useTimezone } from './lib.js';
import { runIntakeAutomation } from './domain/intake.js';

export function runScheduledJobs(registry) {
  for (const t of registry.platform.db.tenants) {
    const store = registry.tenantStore(t.id); if (!store) continue;
    useTimezone(store.db.settings?.locale?.timezone);
    const sent = queueBirthdays(store.db) + dispatchQueue(store.db) + dispatchScheduledCampaigns(store.db)
      + runIntakeAutomation(store.db, { frontendBase: process.env.CLINOVARA_FRONTEND_URL || 'http://localhost:5190/' });
    if (sent) store.save();
  }
}
