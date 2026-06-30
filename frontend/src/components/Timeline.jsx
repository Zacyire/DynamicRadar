/**
 * Playback timeline / time-scrub slider.
 *
 * Drives the simulated lifecycle minute (0–120) that the backend uses to evolve
 * each storm. Play/Pause/Loop, a speed multiplier, a digital simulated clock,
 * and a scrub slider with 5-minute frame ticks.
 */

const SPEEDS = [1, 2, 5];
const START_HOUR = 16; // simulated clock starts at 4:00 PM

/** Format a lifecycle minute as a 12-hour clock string, e.g. "04:15 PM". */
export function formatClock(minute) {
  const total = START_HOUR * 60 + minute;
  let h = Math.floor(total / 60) % 24;
  const m = Math.floor(total % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function Timeline({
  minute,
  maxMinute = 120,
  step = 5,
  playing,
  speed,
  loop,
  onScrub,
  onPlayPause,
  onSpeed,
  onToggleLoop,
}) {
  const frames = [];
  for (let m = 0; m <= maxMinute; m += step) frames.push(m);

  return (
    <div className="timeline">
      <div className="tl-controls">
        <button className="tl-btn primary" onClick={onPlayPause} title={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '►'}
        </button>
        <button
          className={`tl-btn ${loop ? 'active' : ''}`}
          onClick={onToggleLoop}
          title="Loop"
        >
          ↻
        </button>
        <div className="tl-speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`tl-btn small ${speed === s ? 'active' : ''}`}
              onClick={() => onSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="tl-scrub">
        <input
          type="range"
          min={0}
          max={maxMinute}
          step={1}
          value={minute}
          onChange={(e) => onScrub(parseFloat(e.target.value))}
        />
        <div className="tl-ticks">
          {frames.map((m) => (
            <span key={m} className="tl-tick" style={{ left: `${(m / maxMinute) * 100}%` }} />
          ))}
        </div>
      </div>

      <div className="tl-clock">
        <span className="tl-time">{formatClock(minute)}</span>
        <span className="tl-elapsed">T+{String(Math.round(minute)).padStart(3, '0')} min</span>
      </div>
    </div>
  );
}
