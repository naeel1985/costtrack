/**
 * The hero's argument, drawn rather than described: a 90-day balance projection
 * that dips below zero on the 14th — nine days BEFORE payday. That gap is the
 * whole product thesis, so the homepage shows it instead of claiming it.
 *
 * Deliberately a server component: pure SVG + CSS keyframes, no animation
 * runtime, no client JS. Geometry is computed once at module scope from a fixed
 * dataset, so server and client render byte-identical markup.
 */

interface Event {
  day: number;
  delta: number;
  label: string;
  kind: "in" | "out";
}

// A plausible month for a UAE salaried household, in whole AED.
const OPENING = 9_200;
const EVENTS: Event[] = [
  { day: 5, delta: -4_800, label: "Rent", kind: "out" },
  { day: 9, delta: -640, label: "Subscriptions", kind: "out" },
  { day: 14, delta: -5_200, label: "Cheque clears", kind: "out" },
  { day: 23, delta: 18_000, label: "Salary", kind: "in" },
  { day: 31, delta: -3_400, label: "Card statement", kind: "out" },
  { day: 45, delta: -5_200, label: "Cheque clears", kind: "out" },
  { day: 53, delta: -4_800, label: "Rent", kind: "out" },
  { day: 60, delta: 18_000, label: "Salary", kind: "in" },
  { day: 72, delta: -3_900, label: "Card statement", kind: "out" },
  { day: 83, delta: -4_800, label: "Rent", kind: "out" },
];

const DAYS = 90;
const W = 760;
const H = 340;
const PAD = { top: 28, right: 26, bottom: 34, left: 26 };

/** Step the balance day by day so the line is a true running total. */
function buildSeries(): { day: number; balance: number }[] {
  const out: { day: number; balance: number }[] = [];
  let balance = OPENING;
  for (let day = 0; day <= DAYS; day++) {
    for (const e of EVENTS) if (e.day === day) balance += e.delta;
    out.push({ day, balance });
  }
  return out;
}

const SERIES = buildSeries();
const MAX = Math.max(...SERIES.map((p) => p.balance));
const MIN = Math.min(...SERIES.map((p) => p.balance));
// Pad the domain so the curve never touches the frame, and always include 0.
const HI = Math.max(MAX, 0) * 1.12;
const LO = Math.min(MIN, 0) * 1.45;

const x = (day: number) => PAD.left + (day / DAYS) * (W - PAD.left - PAD.right);
const y = (v: number) =>
  PAD.top + ((HI - v) / (HI - LO)) * (H - PAD.top - PAD.bottom);

const ZERO_Y = y(0);
const LINE = SERIES.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
const AREA = `${LINE} L${x(DAYS).toFixed(1)},${ZERO_Y.toFixed(1)} L${x(0).toFixed(1)},${ZERO_Y.toFixed(1)} Z`;

/** Rough polyline length — drives the draw-in dash offset. */
const LENGTH = Math.round(
  SERIES.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const dx = x(p.day) - x(SERIES[i - 1].day);
    const dy = y(p.balance) - y(SERIES[i - 1].balance);
    return sum + Math.hypot(dx, dy);
  }, 0),
);

// The shortfall: the first stretch that sits below zero.
const firstNegative = SERIES.find((p) => p.balance < 0);
const lastNegative = [...SERIES].reverse().find((p) => p.balance < 0);
const trough = SERIES.reduce((lo, p) => (p.balance < lo.balance ? p : lo), SERIES[0]);

export function HeroProjection({ className }: { className?: string }) {
  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={
          "Ninety-day balance projection. The balance falls below zero around day 14 — before salary lands on day 23 — " +
          "then recovers. Cashflow surfaces that shortfall in advance."
        }
      >
        <defs>
          <linearGradient id="hp-pos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-income)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-income)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="hp-neg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-cost)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--chart-cost)" stopOpacity="0.3" />
          </linearGradient>
          {/* Split the fill at the zero line: surplus reads green, shortfall red. */}
          <clipPath id="hp-above">
            <rect x="0" y="0" width={W} height={ZERO_Y} />
          </clipPath>
          <clipPath id="hp-below">
            <rect x="0" y={ZERO_Y} width={W} height={H - ZERO_Y} />
          </clipPath>
        </defs>

        {/* Recessive month gridlines. */}
        {[0, 30, 60, 90].map((d) => (
          <line
            key={d}
            x1={x(d)}
            y1={PAD.top - 6}
            x2={x(d)}
            y2={H - PAD.bottom}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />
        ))}

        {/* The shortfall window, called out behind the curve. */}
        {firstNegative && lastNegative && (
          <rect
            x={x(firstNegative.day)}
            y={PAD.top - 6}
            width={x(lastNegative.day) - x(firstNegative.day)}
            height={H - PAD.bottom - PAD.top + 6}
            fill="var(--chart-cost)"
            opacity="0.07"
          />
        )}

        <path d={AREA} fill="url(#hp-pos)" clipPath="url(#hp-above)" />
        <path d={AREA} fill="url(#hp-neg)" clipPath="url(#hp-below)" />

        {/* Zero — the line that actually matters. */}
        <line
          x1={PAD.left}
          y1={ZERO_Y}
          x2={W - PAD.right}
          y2={ZERO_Y}
          stroke="var(--muted-foreground)"
          strokeWidth="1"
          strokeDasharray="5 5"
          opacity="0.65"
        />
        <text x={PAD.left} y={ZERO_Y - 7} className="fill-muted-foreground text-[11px]">
          0
        </text>

        <path
          d={LINE}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw-in"
          style={{ ["--draw-len" as string]: LENGTH }}
        />

        {/* Event markers. Income above the line, costs below — never colour alone. */}
        {EVENTS.map((e, i) => {
          const point = SERIES[e.day];
          const cy = y(point.balance);
          const isIn = e.kind === "in";
          return (
            <g
              key={`${e.label}-${e.day}`}
              className="animate-fade-rise"
              style={{ animationDelay: `${900 + i * 90}ms` }}
            >
              <circle
                cx={x(e.day)}
                cy={cy}
                r="4.5"
                fill="var(--card)"
                stroke={isIn ? "var(--chart-income)" : "var(--chart-cost)"}
                strokeWidth="2.5"
              />
              {(e.label === "Salary" || e.day === 14) && (
                <text
                  x={x(e.day)}
                  y={isIn ? cy - 14 : cy + 20}
                  textAnchor={e.day > DAYS - 18 ? "end" : "middle"}
                  className="fill-muted-foreground text-[11px] font-medium"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {/* The trough — the moment the app is built to catch. */}
        {firstNegative && (
          <g className="animate-fade-rise" style={{ animationDelay: "1.6s" }}>
            <circle
              cx={x(trough.day)}
              cy={y(trough.balance)}
              r="6"
              fill="var(--chart-cost)"
              className="animate-pulse-ring"
              style={{ transformOrigin: `${x(trough.day)}px ${y(trough.balance)}px` }}
            />
            <circle cx={x(trough.day)} cy={y(trough.balance)} r="5" fill="var(--chart-cost)" />
          </g>
        )}
      </svg>

      <figcaption className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--chart-income)]" /> Money in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--chart-cost)]" /> Money out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Projected balance
        </span>
      </figcaption>
    </figure>
  );
}
