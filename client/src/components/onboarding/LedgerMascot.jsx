import "./LedgerMascot.css";

const MOODS = new Set(["happy", "very-happy", "celebrate", "sad", "concerned", "angry", "curious", "thinking"]);

export default function LedgerMascot({ mood = "idle", className = "" }) {
  const expression = MOODS.has(mood) ? mood : "idle";
  const smiling = ["happy", "very-happy", "celebrate"].includes(expression);
  const worried = ["sad", "concerned"].includes(expression);
  const angry = expression === "angry";
  const curious = ["curious", "thinking"].includes(expression);

  const mouth = smiling
    ? "M104 104 Q120 121 136 104"
    : worried
      ? "M105 111 Q120 96 135 111"
      : angry
        ? "M106 111 L120 105 L134 111"
        : curious
          ? "M113 108 Q120 103 127 108"
          : "M108 108 Q120 112 132 108";

  return (
    <div className={`ledger-mascot ledger-mascot--${expression} ${className}`.trim()} aria-hidden="true">
      <svg className="ledger-mascot__art" viewBox="0 0 240 220" role="presentation" focusable="false">
        <defs>
          <linearGradient id="ledger-mascot-head" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF9E9" />
            <stop offset="1" stopColor="#E8F2E8" />
          </linearGradient>
          <linearGradient id="ledger-mascot-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3C9A84" />
            <stop offset=".55" stopColor="#237666" />
            <stop offset="1" stopColor="#185749" />
          </linearGradient>
          <linearGradient id="ledger-mascot-arm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#69B7A0" />
            <stop offset="1" stopColor="#2E806E" />
          </linearGradient>
          <radialGradient id="ledger-mascot-aura">
            <stop offset="0" stopColor="#E6B84F" stopOpacity=".28" />
            <stop offset="1" stopColor="#E6B84F" stopOpacity="0" />
          </radialGradient>
          <filter id="ledger-mascot-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#0D3028" floodOpacity=".2" />
          </filter>
        </defs>

        <ellipse cx="120" cy="112" rx="105" ry="102" fill="url(#ledger-mascot-aura)" />
        <circle className="ledger-mascot__sparkle ledger-mascot__sparkle--one" cx="37" cy="82" r="4" fill="#E9BA50" />
        <path className="ledger-mascot__sparkle ledger-mascot__sparkle--two" d="M199 67v12m-6-6h12" stroke="#E9BA50" strokeWidth="3" strokeLinecap="round" />

        <path d="M120 37V23" stroke="#B88725" strokeWidth="5" strokeLinecap="round" />
        <circle cx="120" cy="17" r="8" fill="#E9B94D" stroke="#FFF2C9" strokeWidth="3" />
        <rect x="55" y="69" width="13" height="34" rx="6.5" fill="#3B9B85" />
        <rect x="172" y="69" width="13" height="34" rx="6.5" fill="#3B9B85" />

        <g filter="url(#ledger-mascot-shadow)">
          <rect x="63" y="35" width="114" height="91" rx="32" fill="url(#ledger-mascot-head)" stroke="#D3E3D4" strokeWidth="3" />
          <path d="M79 50 Q120 31 161 50" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path d="M88 69 Q98 64 108 69" fill="none" stroke={angry ? "#A94E3A" : "#507767"} strokeWidth="4" strokeLinecap="round" />
          <path d="M132 69 Q142 64 152 69" fill="none" stroke={angry ? "#A94E3A" : "#507767"} strokeWidth="4" strokeLinecap="round" />

          {smiling ? (
            <>
              <path d="M91 83 Q100 92 109 83" fill="none" stroke="#24584B" strokeWidth="5" strokeLinecap="round" />
              <path d="M131 83 Q140 92 149 83" fill="none" stroke="#24584B" strokeWidth="5" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="101" cy="83" rx="6.5" ry={worried ? "5" : "7"} fill="#244D44" />
              <ellipse cx="139" cy="83" rx="6.5" ry={worried ? "5" : "7"} fill="#244D44" />
              <circle cx="103" cy="80" r="2.1" fill="#FFFFFF" />
              <circle cx="141" cy="80" r="2.1" fill="#FFFFFF" />
            </>
          )}

          <ellipse cx="82" cy="99" rx="8" ry="4.5" fill="#F2A68D" opacity={smiling ? ".85" : ".55"} />
          <ellipse cx="158" cy="99" rx="8" ry="4.5" fill="#F2A68D" opacity={smiling ? ".85" : ".55"} />
          <path d={mouth} fill="none" stroke={angry ? "#A94E3A" : "#24584B"} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <g filter="url(#ledger-mascot-shadow)">
          <path d="M104 121 L104 133 Q120 142 136 133 L136 121" fill="#DDE9D9" stroke="#C9DCCB" strokeWidth="2" />
          <rect x="76" y="132" width="88" height="63" rx="24" fill="url(#ledger-mascot-body)" stroke="#6CB7A0" strokeWidth="3" />
          <path d="M91 143 Q120 132 149 143" fill="none" stroke="#9AD1B9" strokeWidth="4" strokeLinecap="round" opacity=".7" />
          <circle cx="120" cy="163" r="16" fill="#F1C65D" stroke="#FFE7A2" strokeWidth="3" />
          <path d="M115 154h10M115 154v18h11M115 163h9" fill="none" stroke="#315C4D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="57" y="142" width="19" height="43" rx="9.5" fill="url(#ledger-mascot-arm)" stroke="#72BCA5" strokeWidth="2" />
          <rect x="164" y="142" width="19" height="43" rx="9.5" fill="url(#ledger-mascot-arm)" stroke="#72BCA5" strokeWidth="2" />
          <circle cx="66.5" cy="188" r="8" fill="#F3D6B4" stroke="#D7B995" strokeWidth="2" />
          <circle cx="173.5" cy="188" r="8" fill="#F3D6B4" stroke="#D7B995" strokeWidth="2" />
          <path d="M94 194v10m52-10v10" stroke="#155548" strokeWidth="12" strokeLinecap="round" />
          <path d="M87 205h14m38 0h14" stroke="#E7C36E" strokeWidth="4" strokeLinecap="round" />
        </g>
        <ellipse cx="120" cy="211" rx="48" ry="5" fill="#163E34" opacity=".13" />
      </svg>
    </div>
  );
}
