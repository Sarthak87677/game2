import { useCallback, useSyncExternalStore } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import { BOAT_COURSES, CINEMATIC_TOURS, COLLECTIBLE_LANDMARKS, JOURNEY_CHECKLISTS, PHOTO_CHALLENGES, REGIONS } from '@/data/maharashtra';
import type { ActivitiesSystem } from '@/gameplay/activities/ActivitiesSystem';
import type { CrowdSystem } from '@/world/crowds/CrowdSystem';
import type { MonsoonSystem } from '@/world/climate/MonsoonSystem';

/** "Activities" tab of the Play panel: progress, tours, photo subjects, landmarks, checklists, courses, toggles. */
export function ActivitiesTab() {
  const engine = useEngine();
  const player = useTerraStore((s) => s.gameplay.player);
  const activities = engine?.gameplay.systems.find((s) => s.id === 'activities') as ActivitiesSystem | undefined;
  const crowds = engine?.gameplay.systems.find((s) => s.id === 'crowds') as CrowdSystem | undefined;
  const monsoon = engine?.gameplay.systems.find((s) => s.id === 'monsoon') as MonsoonSystem | undefined;
  const subscribe = useCallback((fn: () => void) => activities?.subscribe(fn) ?? (() => undefined), [activities]);
  const snapshot = useCallback(() => (activities ? JSON.stringify(activities.getProgress()) : ''), [activities]);
  useSyncExternalStore(subscribe, snapshot);
  if (!engine || !activities) return <p className="terra-muted">Activities load with the engine.</p>;
  const pr = activities.getProgress();
  const place = crowds?.place();
  const region = place?.hotspot?.region ?? null;
  const photos = PHOTO_CHALLENGES.filter((p) => !region || p.region === region);
  const landmarks = COLLECTIBLE_LANDMARKS.filter((l) => !region || l.region === region);
  const species = activities.nearbySpecies();
  const course = activities.activeCourse();
  const preset = monsoon?.preset() ?? null;
  return (
    <div className="terra-activities">
      <p className="terra-muted">Peaceful activities across Maharashtra. Progress is saved in this browser only. Everything here is in-game: procedural crowds, stalls, exhibits, litter and the court are original content; coordinates are approximate.</p>
      <div className="terra-grid">
        <span>Points</span><span><b>{activities.points()}</b></span>
        <span>Photos</span><span>{Object.keys(pr.photos).length}/{PHOTO_CHALLENGES.length} · press <kbd>P</kbd> facing a subject</span>
        <span>Landmarks</span><span>{Object.keys(pr.landmarks).length}/{COLLECTIBLE_LANDMARKS.length} · walk up to them</span>
        <span>Species logged</span><span>{Object.keys(pr.observations).length}{species.length ? ` · nearby: ${species.map((s) => s.label).join(', ')}` : ''}</span>
        <span>Basketball</span><span>{pr.basketball.made}/{pr.basketball.attempts} made · best streak {pr.basketball.best} · campus court, press <kbd>E</kbd></span>
        <span>Place</span><span>{place ? `${place.kind}${place.hotspot ? ` — ${place.hotspot.name}` : ''}` : player.spawned ? 'reading…' : 'spawn to start'}</span>
        <span>Season</span><span>{preset ? `${preset.label}` : 'outside Maharashtra'}</span>
      </div>
      <div className="terra-row terra-wrap">
        <label><input type="checkbox" checked={crowds?.festivalLights ?? false} onChange={(e) => crowds?.setFestivalLights(e.target.checked)} /> Festival lights on stalls</label>
        <label><input type="checkbox" checked={monsoon?.isEnabled() ?? false} onChange={(e) => monsoon?.setEnabled(e.target.checked)} /> Monsoon / dry-season preset</label>
        <button className="terra-mini" onClick={() => activities.resetProgress()}>Reset progress</button>
      </div>

      <h3>Cinematic tours</h3>
      <ul className="terra-list">
        {CINEMATIC_TOURS.map((t) => (
          <li key={t.id}>
            <button className="terra-list-btn" onClick={() => void activities.startTour(t.id)}>
              <b>{t.name}</b> <span className="terra-muted">{t.kind} · {t.region} · {t.description}</span>
              <span className="terra-tiny">{pr.tours.includes(t.id) ? 'started before · ' : ''}{t.dataNote}</span>
            </button>
          </li>
        ))}
      </ul>
      {activities.currentTour() && <button className="terra-mini" onClick={() => activities.stopTour()}>Stop tour</button>}

      <h3>Photo subjects {region ? `— ${region}` : ''}</h3>
      <ul className="terra-list">
        {photos.map((p) => (
          <li key={p.id}><div className="terra-list-btn"><b>{pr.photos[p.id] ? '✓ ' : ''}{p.title}</b> <span className="terra-muted">{p.hint} · {p.points} pts{p.goldenHour ? ' · golden-hour bonus' : ''}{pr.photos[p.id] ? ` · best ${pr.photos[p.id].score}` : ''}</span></div></li>
        ))}
      </ul>

      <h3>Landmarks {region ? `— ${region}` : ''}</h3>
      <ul className="terra-list">
        {landmarks.map((l) => (
          <li key={l.id}><button className="terra-list-btn" onClick={() => activities.showAbout(l.id)}><b>{pr.landmarks[l.id] ? '✓ ' : '○ '}{l.name}</b> <span className="terra-muted">{l.region}</span></button></li>
        ))}
      </ul>

      <h3>Journey checklists</h3>
      <ul className="terra-list">
        {JOURNEY_CHECKLISTS.map((c) => {
          const done = new Set(pr.checklists[c.id] ?? []);
          return (
            <li key={c.id}><div className="terra-list-btn"><b>{c.name}</b> <span className="terra-muted">{done.size}/{c.items.length} · {c.description}</span>
              <span className="terra-tiny">{c.items.map((i) => `${done.has(i.id) ? '✓' : '○'} ${i.label}`).join(' · ')}</span></div></li>
          );
        })}
      </ul>

      <h3>Boat checkpoint courses</h3>
      <ul className="terra-list">
        {BOAT_COURSES.map((c) => (
          <li key={c.id}>
            <button className="terra-list-btn" onClick={() => (course?.course.id === c.id ? activities.stopCourse() : activities.startCourse(c.id))}>
              <b>{course?.course.id === c.id ? '■ Stop ' : '▶ '}{c.name}</b>
              <span className="terra-muted">{c.checkpoints.length} checkpoints{pr.courses[c.id] ? ` · completed ${pr.courses[c.id].completed}× · best ${((pr.courses[c.id].bestMs ?? 0) / 1000).toFixed(0)} s` : ''}</span>
              <span className="terra-tiny">{c.dataNote} Works in any mode (ferry, speedboat, or on foot along the shore).</span>
            </button>
          </li>
        ))}
      </ul>

      <h3>Park cleanup</h3>
      <ul className="terra-list">
        {activities.cleanupState().map(({ park, collected }) => (
          <li key={park.id}><div className="terra-list-btn"><b>{collected >= park.litterCount ? '✓ ' : ''}{park.name}</b> <span className="terra-muted">{collected}/{park.litterCount} collected · {park.region}</span></div></li>
        ))}
      </ul>
      <p className="terra-tiny">Regions: {REGIONS.join(', ')}.</p>
    </div>
  );
}
