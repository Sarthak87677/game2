import type { TimeTrialCourse } from './logic';

export const TIME_TRIAL_NOTE = 'Fictional closed-course markers placed at APPROXIMATE positions along the Lonavala–Aamby Valley hill road (public reference coordinates, ±300 m). Not an organised event; traffic is suppressed on the course while a lap runs.';

/**
 * Closed-course hill time trial near Lonavala (Pune district). The lap follows the public road from the Bhushi Dam
 * approach up past the Lion's Point viewpoint towards the Aamby Valley gate and back. Coordinates are approximate.
 */
export const LONAVALA_HILL_TRIAL: TimeTrialCourse = {
  id: 'lonavala-hill',
  name: 'Lonavala hill road time trial',
  radiusM: 18,
  note: TIME_TRIAL_NOTE,
  checkpoints: [
    { lat: 18.7318, lon: 73.3974, name: 'Start/finish — Bhushi Dam road' },
    { lat: 18.7225, lon: 73.3947, name: 'CP1 — Kurvande bend' },
    { lat: 18.7128, lon: 73.3948, name: 'CP2 — plateau straight' },
    { lat: 18.7052, lon: 73.3925, name: 'CP3 — Lion\'s Point' },
    { lat: 18.6960, lon: 73.3902, name: 'CP4 — Aamby Valley approach' },
    { lat: 18.7052, lon: 73.3925, name: 'CP5 — Lion\'s Point (return)' },
    { lat: 18.7225, lon: 73.3947, name: 'CP6 — Kurvande bend (return)' },
  ],
};

export const TIME_TRIAL_COURSES: TimeTrialCourse[] = [LONAVALA_HILL_TRIAL];
