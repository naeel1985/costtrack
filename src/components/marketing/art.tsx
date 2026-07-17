/*
 * Marketing illustrations — hand-built, inline SVG.
 *
 * These ship self-contained (no external image host) so they never trip the
 * app's Content-Security-Policy (`img-src 'self' data: blob:`), render crisp at
 * any size, and follow the theme through CSS variables / Tailwind `fill-*`
 * utilities. They stand in for photography: abstract, product-flavoured scenes
 * about seeing your money before it moves.
 */

/** The hero "app preview": a rising balance projection with in/out chips. */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 460"
      role="img"
      aria-label="A cash-flow projection chart rising into the future, with income and cost markers"
      className={className}
      fill="none"
    >
      <defs>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id="hero-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.18 }} />
          <stop offset="100%" style={{ stopColor: "var(--positive)", stopOpacity: 0.12 }} />
        </linearGradient>
      </defs>

      {/* Ambient glow behind the card */}
      <rect x="20" y="30" width="560" height="380" rx="28" fill="url(#hero-glow)" />

      {/* Card */}
      <rect
        x="48"
        y="52"
        width="504"
        height="356"
        rx="20"
        className="fill-card stroke-border"
        strokeWidth="1.5"
      />

      {/* Card header */}
      <text x="76" y="96" className="fill-muted-foreground" fontSize="13" fontWeight={500}>
        Projected balance · next 90 days
      </text>
      <text x="76" y="130" className="fill-foreground" fontSize="30" fontWeight={700}>
        AED 48,250
      </text>
      <g transform="translate(430,78)">
        <rect width="94" height="26" rx="13" className="fill-positive" opacity={0.14} />
        <circle cx="18" cy="13" r="4" className="fill-positive" />
        <text x="30" y="17" className="fill-positive" fontSize="12" fontWeight={600}>
          +12.4%
        </text>
      </g>

      {/* Gridlines */}
      {[168, 214, 260, 306].map((y) => (
        <line
          key={y}
          x1="76"
          y1={y}
          x2="524"
          y2={y}
          className="stroke-border"
          strokeWidth="1"
          strokeDasharray="2 6"
          opacity={0.7}
        />
      ))}

      {/* Actual (solid) + projected (dashed) area line */}
      <path
        d="M76 300 L146 286 L216 296 L286 250 L300 244"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M300 244 L356 226 L426 182 L496 150"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="7 7"
        opacity={0.85}
      />
      <path
        d="M76 300 L146 286 L216 296 L286 250 L356 226 L426 182 L496 150 L496 342 L76 342 Z"
        fill="url(#hero-area)"
      />

      {/* "Today" divider */}
      <line
        x1="300"
        y1="150"
        x2="300"
        y2="342"
        className="stroke-muted-foreground"
        strokeWidth="1"
        strokeDasharray="3 4"
        opacity={0.6}
      />
      <text x="300" y="360" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
        Today
      </text>

      {/* Data point */}
      <circle cx="496" cy="150" r="6" className="fill-primary" />
      <circle cx="496" cy="150" r="11" className="stroke-primary" strokeWidth="2" opacity={0.4} />

      {/* Floating "money in" chip */}
      <g transform="translate(70,150)">
        <rect width="150" height="52" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <rect x="14" y="14" width="24" height="24" rx="8" className="fill-positive" opacity={0.16} />
        <path
          d="M22 30 l4 -6 l4 3 l4 -8"
          className="stroke-positive"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <text x="50" y="26" className="fill-muted-foreground" fontSize="10">
          Salary in
        </text>
        <text x="50" y="41" className="fill-foreground" fontSize="13" fontWeight={700}>
          + AED 18,000
        </text>
      </g>

      {/* Floating "money out" chip */}
      <g transform="translate(372,256)">
        <rect width="150" height="52" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <rect x="14" y="14" width="24" height="24" rx="8" className="fill-negative" opacity={0.16} />
        <path
          d="M22 22 l4 6 l4 -3 l4 8"
          className="stroke-negative"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <text x="50" y="26" className="fill-muted-foreground" fontSize="10">
          Rent cheque due
        </text>
        <text x="50" y="41" className="fill-foreground" fontSize="13" fontWeight={700}>
          − AED 6,500
        </text>
      </g>
    </svg>
  );
}

/** A compact bars-and-coins motif used as a section accent. */
export function InsightArt({ className }: { className?: string }) {
  const bars = [
    { x: 0, h: 44 },
    { x: 34, h: 72 },
    { x: 68, h: 58 },
    { x: 102, h: 96 },
    { x: 136, h: 120 },
  ];
  return (
    <svg viewBox="0 0 190 150" role="presentation" className={className} fill="none">
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={130 - b.h}
          width="22"
          height={b.h}
          rx="6"
          className="fill-primary"
          opacity={0.25 + i * 0.18}
        />
      ))}
    </svg>
  );
}
