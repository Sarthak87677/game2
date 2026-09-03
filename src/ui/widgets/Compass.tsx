export function Compass({ headingDeg, onClick }: { headingDeg: number; onClick?: () => void }) {
  return (
    <button className="terra-compass" onClick={onClick} title="Reset heading to north" aria-label={`Compass, heading ${Math.round(headingDeg)} degrees`}>
      <svg viewBox="0 0 100 100" width="64" height="64">
        <circle cx="50" cy="50" r="46" fill="rgba(10,14,22,0.75)" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <g transform={`rotate(${-headingDeg} 50 50)`}>
          <polygon points="50,8 58,50 50,44 42,50" fill="#ff5a4e" />
          <polygon points="50,92 58,50 50,56 42,50" fill="#d7dee8" />
          <text x="50" y="22" textAnchor="middle" fontSize="13" fill="#fff" fontWeight="700">N</text>
          <text x="50" y="86" textAnchor="middle" fontSize="10" fill="#aab">S</text>
          <text x="84" y="54" textAnchor="middle" fontSize="10" fill="#aab">E</text>
          <text x="16" y="54" textAnchor="middle" fontSize="10" fill="#aab">W</text>
        </g>
      </svg>
    </button>
  );
}
