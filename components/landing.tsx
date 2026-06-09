"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, AnimatePresence } from "motion/react";

/* ════════════════════════════════════════════════════════════
   Voltaic — cinematic landing (meeting-AI story)
   Warm-dark, scroll-driven. Story beats:
   Connect (in → Voltaic → out) → Listen → Draft → Verify → Ask.
   Rendered by app/page.tsx (server wrapper handles metadata + auth).
   ════════════════════════════════════════════════════════════ */

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Landing() {
  return (
    <div className="landing relative min-h-screen font-sans">
      <ScrollProgress />
      <BackgroundFX />
      <div className="relative z-10">
        <Nav />
        <Hero />
        <Proof />
        <Connect />
        <Watch />
        <WhyUs />
        <ClosingCTA />
        <Footer />
      </div>
    </div>
  );
}

/* ── Scroll progress bar ─────────────────────────────────── */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div style={{ scaleX: scrollYProgress }} className="fixed left-0 top-0 z-50 h-[2px] w-full origin-left">
      <div className="h-full w-full bg-gradient-to-r from-[#e58a63] via-[#e2af5d] to-[#e58a63]" />
    </motion.div>
  );
}

/* ── Site-wide ambient background (auroras + particles + cursor glow) ── */
function BackgroundFX() {
  const spot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = spot.current;
        if (!el) return;
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const dots = [
    { l: "12%", t: "22%", d: "0s", c: "#e58a63" },
    { l: "82%", t: "16%", d: "-2s", c: "#84b596" },
    { l: "67%", t: "60%", d: "-4s", c: "#e2af5d" },
    { l: "24%", t: "72%", d: "-1.5s", c: "#e58a63" },
    { l: "46%", t: "38%", d: "-3s", c: "#9b86bd" },
    { l: "90%", t: "82%", d: "-2.5s", c: "#84b596" },
  ];

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="aurora" style={{ width: 620, height: 620, background: "#e58a63", opacity: 0.09, top: "-12%", left: "-6%" }} />
      <div className="aurora" style={{ width: 540, height: 540, background: "#6e5a8a", opacity: 0.09, top: "38%", right: "-8%", animationDelay: "-8s" }} />
      <div className="aurora" style={{ width: 500, height: 500, background: "#e2af5d", opacity: 0.07, bottom: "-12%", left: "34%", animationDelay: "-14s" }} />
      {dots.map((p, i) => (
        <span key={i} className="float-y absolute h-1 w-1 rounded-full" style={{ left: p.l, top: p.t, background: p.c, opacity: 0.4, animationDelay: p.d }} />
      ))}
      <div ref={spot} className="spotlight absolute inset-0" />
    </div>
  );
}

/* ── Nav ─────────────────────────────────────────────────── */
function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="glass mx-auto mt-3 flex max-w-6xl items-center rounded-full px-5 py-2.5">
        <Wordmark />
        <div className="flex-1" />
        <nav className="flex items-center gap-1">
          <a href="#connect" className="hidden rounded-full px-3.5 py-2 text-[13px] text-[var(--muted-text)] transition-colors hover:text-[var(--cream-text)] sm:block">
            How it works
          </a>
          <Link href="/today" className="rounded-full px-3.5 py-2 text-[13px] text-[var(--muted-text)] transition-colors hover:text-[var(--cream-text)]">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-full bg-[#e58a63] px-4 py-2 text-[13px] font-medium text-[#1a130f] transition-all hover:bg-[#eb9a76] hover:shadow-[0_0_24px_rgba(229,138,99,0.5)]">
            Become a partner
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e58a63] shadow-[0_0_18px_rgba(229,138,99,0.6)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-[15px] w-[15px] text-[#1a130f]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <span className="text-[15px] font-medium tracking-tight text-[var(--cream-text)]">Voltaic</span>
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────── */
function Hero() {
  const lines = ["Your calls now", "do the paperwork."];
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="aurora" style={{ width: 540, height: 540, background: "#e58a63", opacity: 0.22, top: "-12%", left: "8%" }} />
      <div className="aurora" style={{ width: 460, height: 460, background: "#e2af5d", opacity: 0.14, top: "16%", right: "4%", animationDelay: "-7s" }} />
      <div className="blueprint animate absolute inset-0" />

      <motion.span
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative z-10 mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--edge)] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted-text)]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#e58a63] glow-pulse" />
        Working memory for construction
      </motion.span>

      <h1 className="relative z-10 max-w-4xl text-[44px] font-medium leading-[1.02] tracking-tight text-[var(--cream-text)] md:text-[76px]">
        {lines.map((line, i) => (
          <motion.span key={line} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15 + i * 0.15, ease: EASE }} className="block">
            {i === 1 ? (
              <span className="bg-gradient-to-r from-[#e58a63] via-[#eaa379] to-[#e2af5d] bg-clip-text text-transparent">{line}</span>
            ) : (
              line
            )}
          </motion.span>
        ))}
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
        className="relative z-10 mt-7 max-w-xl text-[16px] leading-relaxed text-[var(--muted-text)] md:text-[18px]"
      >
        Voltaic joins your construction meetings, drafts the work, and catches anything said that contradicts the contract.
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.65, ease: EASE }} className="relative z-10 mt-9 flex items-center gap-3">
        <Link href="/sign-up" className="rounded-full bg-[#e58a63] px-6 py-3 text-[15px] font-medium text-[#1a130f] transition-all hover:bg-[#eb9a76] hover:shadow-[0_0_36px_rgba(229,138,99,0.6)]">
          Become a design partner
        </Link>
        <a href="#watch" className="rounded-full border border-[var(--edge-strong)] px-6 py-3 text-[15px] font-medium text-[var(--cream-text)] transition-colors hover:bg-white/[0.04]">
          Watch it work
        </a>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.85, ease: EASE }}
        className="relative z-10 mt-4 font-mono text-[12px] text-[var(--faint-text)]"
      >
        Onboarding our first 5 design-partner contractors — no Procore required.
      </motion.p>

      <div className="scroll-cue absolute bottom-10 left-1/2 -translate-x-1/2 text-[var(--faint-text)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
        </svg>
      </div>
    </section>
  );
}

/* ── Reusable scene shell ────────────────────────────────── */
function Scene({ id, n, kicker, title, wide, children }: { id: string; n: string; kicker: string; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`relative mx-auto ${wide ? "max-w-6xl" : "max-w-5xl"} scroll-mt-24 px-6 py-24 md:py-32`}>
      <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.7, ease: EASE }} className="mb-12 flex items-baseline gap-4">
        <span className="font-mono text-[14px] font-semibold text-[#e58a63]">{n}</span>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--faint-text)]">{kicker}</div>
          <h2 className="mt-2 text-[30px] font-medium tracking-tight text-[var(--cream-text)] md:text-[42px]">{title}</h2>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
        {children}
      </motion.div>
    </section>
  );
}

/* ── 01 · Connect (horizontal: inputs → Voltaic → outputs) ── */
function Connect() {
  // Input brand badges (color + glyph kind) — kept as our own simple geometric
  // marks for nominative reference, not reproductions of vendor artwork.
  const inputs = [
    { name: "Teams",   y: 70,  color: "#5059C9", glyph: "T" },
    { name: "Outlook", y: 170, color: "#0078D4", glyph: "O" },
    { name: "Meet",    y: 270, color: "#00897B", glyph: "cam" },
    { name: "Zoom",    y: 370, color: "#2D8CFF", glyph: "cam" },
  ];
  const outputs = [
    { name: "RFIs",               y: 70,  glyph: "rfi"   },
    { name: "Change orders",      y: 170, glyph: "edit"  },
    { name: "Compliance reports", y: 270, glyph: "check" },
    { name: "Submittal logs",     y: 370, glyph: "log"   },
  ];
  const cx = 530;
  const cy = 220;
  const r = 44;
  const inEdge = 232;
  const outEdge = 826;
  const pillW = 196;

  return (
    <Scene id="connect" n="01" kicker="Connect" title="Your stack in. Finished work out." wide>
      <div className="glass overflow-hidden rounded-2xl p-4 md:p-6">
        <svg viewBox="0 0 1060 440" className="w-full">
          <text x={42} y={28} fill="#726a5e" fontSize={11} letterSpacing={3} fontFamily="JetBrains Mono, monospace">INPUTS</text>
          <text x={1018} y={28} textAnchor="end" fill="#726a5e" fontSize={11} letterSpacing={3} fontFamily="JetBrains Mono, monospace">OUTPUTS</text>

          {inputs.map((t, i) => {
            const d = `M ${inEdge} ${t.y} C ${inEdge + 120} ${t.y}, ${cx - 120} ${cy}, ${cx - r - 4} ${cy}`;
            return (
              <g key={t.name}>
                <motion.path d={d} fill="none" stroke="#e58a63" strokeWidth={1.4} strokeOpacity={0.5} initial={{ pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2 + i * 0.12, ease: EASE }} />
                <motion.circle r={3.4} fill="#f5f1e8" initial={{ cx: inEdge, cy: t.y, opacity: 0 }} whileInView={{ cx: [inEdge, cx - r - 4], cy: [t.y, cy], opacity: [0, 1, 1, 0] }} viewport={{ once: true }} transition={{ duration: 1.3, delay: 1 + i * 0.14, repeat: Infinity, repeatDelay: 1, ease: "easeIn" }} />
              </g>
            );
          })}

          {outputs.map((t, i) => {
            const d = `M ${cx + r + 4} ${cy} C ${cx + 120} ${cy}, ${outEdge - 120} ${t.y}, ${outEdge} ${t.y}`;
            return (
              <g key={t.name}>
                <motion.path d={d} fill="none" stroke="#84b596" strokeWidth={1.4} strokeOpacity={0.45} initial={{ pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.7 + i * 0.12, ease: EASE }} />
                <motion.circle r={3.4} fill="#addcc0" initial={{ cx: cx + r + 4, cy: cy, opacity: 0 }} whileInView={{ cx: [cx + r + 4, outEdge], cy: [cy, t.y], opacity: [0, 1, 1, 0] }} viewport={{ once: true }} transition={{ duration: 1.3, delay: 1.7 + i * 0.14, repeat: Infinity, repeatDelay: 1, ease: "easeOut" }} />
              </g>
            );
          })}

          {inputs.map((t, i) => (
            <motion.g key={t.name} initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}>
              <rect x={36} y={t.y - 22} width={pillW} height={44} rx={12} fill="rgba(255,255,255,0.05)" stroke="rgba(245,241,232,0.16)" />
              <BrandBadge x={48} y={t.y - 14} color={t.color} glyph={t.glyph} />
              <text x={94} y={t.y + 5} fill="#f5f1e8" fontSize={14} fontWeight={500} fontFamily="Inter, sans-serif">{t.name}</text>
            </motion.g>
          ))}

          {outputs.map((t, i) => (
            <motion.g key={t.name} initial={{ opacity: 0, x: 14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.7 + i * 0.08, ease: EASE }}>
              <rect x={outEdge} y={t.y - 22} width={pillW} height={44} rx={12} fill="rgba(132,181,150,0.08)" stroke="rgba(132,181,150,0.28)" />
              <OutputBadge x={outEdge + 12} y={t.y - 14} glyph={t.glyph} />
              <text x={outEdge + 58} y={t.y + 5} fill="#f5f1e8" fontSize={14} fontWeight={500} fontFamily="Inter, sans-serif">{t.name}</text>
            </motion.g>
          ))}

          <motion.circle cx={cx} cy={cy} fill="none" stroke="#e58a63" strokeWidth={1.5} initial={{ r: r, opacity: 0.5 }} animate={{ r: [r, r + 26, r], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeOut" }} />
          <circle cx={cx} cy={cy} r={r} fill="#e58a63" opacity={0.18} />
          <circle cx={cx} cy={cy} r={r - 12} fill="#e58a63" />
          <path transform={`translate(${cx - 11}, ${cy - 12})`} d="M13 10V3L4 14h7v7l9-11h-7z" fill="none" stroke="#1a130f" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <text x={cx} y={cy + r + 26} textAnchor="middle" fill="#aaa294" fontSize={12} letterSpacing={2} fontFamily="JetBrains Mono, monospace">VOLTAIC</text>
        </svg>
        <p className="mt-2 text-center font-mono text-[12px] text-[var(--faint-text)]">
          Meetings, specs &amp; submittals flow in — RFIs, change orders &amp; compliance reports come out.
        </p>
      </div>
    </Scene>
  );
}

// Simple brand-color badge with a glyph — our own marks, not vendor artwork.
function BrandBadge({ x, y, color, glyph }: { x: number; y: number; color: string; glyph: string }) {
  const size = 28;
  const cx = x + size / 2;
  const cy = y + size / 2;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={6} fill={color} />
      {glyph === "T" || glyph === "O" ? (
        <text x={cx} y={cy + 6} fill="#fff" fontSize={17} fontWeight={700} fontFamily="Inter, sans-serif" textAnchor="middle">
          {glyph}
        </text>
      ) : (
        // camera glyph — body + lens triangle
        <g fill="#fff">
          <rect x={x + 5} y={y + 10} width={12} height={8} rx={1.5} />
          <path d={`M ${x + 17} ${y + 12} L ${x + 23} ${y + 9} L ${x + 23} ${y + 19} L ${x + 17} ${y + 16} Z`} />
        </g>
      )}
    </g>
  );
}

function OutputBadge({ x, y, glyph }: { x: number; y: number; glyph: string }) {
  const size = 28;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={6} fill="rgba(132,181,150,0.16)" stroke="rgba(132,181,150,0.45)" strokeWidth={1} />
      <g stroke="#addcc0" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${x + 6}, ${y + 6})`}>
        {glyph === "check" && (
          <path d="M4 9l3 3 7-7" />
        )}
        {glyph === "edit" && (
          <path d="M2 14l1-3 8-8 2 2-8 8-3 1z M9 4l2 2" />
        )}
        {glyph === "rfi" && (
          <>
            <rect x={2} y={2} width={12} height={13} rx={1} />
            <path d="M5 6h6M5 9h6M5 12h4" />
          </>
        )}
        {glyph === "log" && (
          <>
            <path d="M2 3h12v13H2z" />
            <path d="M5 6h8M5 9h8M5 12h5" />
          </>
        )}
      </g>
    </g>
  );
}

/* ── 02 · Watch — one window, four phases ─────────────────── */
//
// Replaces the old Listen / Draft / Verify / Ask scroll beats with a single
// looping in-window demo. Auto-advances through 4 phases (~24s total); hover
// pauses, clicking a phase tab jumps. Respects prefers-reduced-motion.
//
// Three-act story: inputs (every doc Voltaic eats) → outputs (templates
// auto-filled, contradictions flagged inline) → action (agentic chat).
const WATCH_PHASES = [
  { id: "ingest", label: "Ingesting", active: "docs",    sub: "Pulling in specs, meetings, drawings, submittals · 412 pages indexed" },
  { id: "draft",  label: "Drafting",  active: "compare", sub: "Auto-filling compliance reports — contradictions flagged inline" },
  { id: "ask",    label: "Answering", active: "agents",  sub: "Cited reply with reasoning, ready to copy into the RFI" },
] as const;

const WATCH_DURATIONS = [6500, 6500, 6500];

function Watch() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % WATCH_PHASES.length), WATCH_DURATIONS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const current = WATCH_PHASES[phase];

  return (
    <Scene id="watch" n="02" kicker="Watch · 20 seconds" title="Inputs in. Reports out. Agent on top." wide>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="app-window relative overflow-hidden rounded-2xl"
      >
        <WindowChrome />
        <div className="flex h-[540px]">
          <SideRail active={current.active} />
          <div className="relative h-full flex-1 overflow-hidden">
            {/* Overlapping crossfade — each phase wrapped absolute so the next
                fades in while the previous fades out, with no blank gap. */}
            <AnimatePresence initial={false}>
              {phase === 0 && <PhaseIngest key="ingest" />}
              {phase === 1 && <PhaseDraft key="draft" />}
              {phase === 2 && <PhaseAsk key="ask" />}
            </AnimatePresence>
            {/* Cinematic scene caption + counter — bottom-left of the pane */}
            <div className="pointer-events-none absolute bottom-3 left-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--faint-text)]">
              <span className="text-[#e58a63]">0{phase + 1}</span>
              <span className="text-[var(--faint-text)]">/ 03</span>
              <span className="text-[var(--muted-text)]">· {current.label}</span>
            </div>
          </div>
        </div>
      </motion.div>

      <p className="mt-3 text-center font-mono text-[11.5px] text-[var(--faint-text)]">
        {current.sub}
      </p>
    </Scene>
  );
}

function WindowChrome() {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--edge)] px-4 py-3">
      <div className="flex gap-1.5">
        <span className="h-3 w-3 rounded-full bg-[#e0694d]/60" />
        <span className="h-3 w-3 rounded-full bg-[#e2af5d]/60" />
        <span className="h-3 w-3 rounded-full bg-[#84b596]/60" />
      </div>
      <div className="ml-2 flex items-center gap-2 text-[12px] text-[var(--muted-text)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="#e58a63" strokeWidth={2.4} className="h-3.5 w-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Voltaic — Riverside Medical · Electrical
      </div>
      <div className="flex-1" />
      <span className="flex items-center gap-1.5 rounded-full bg-[#84b596]/15 px-2 py-0.5 font-mono text-[10px] text-[#84b596]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#84b596] glow-pulse" /> live
      </span>
    </div>
  );
}

const SIDE_NAV = [
  { id: "today",   d: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" },
  { id: "docs",    d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6" },
  { id: "compare", d: "M4 5h7v14H4zM13 5h7v14h-7z" },
  { id: "agents",  d: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" },
];

function SideRail({ active }: { active: string }) {
  return (
    <div className="hidden w-16 flex-col items-center gap-2 border-r border-[var(--edge)] py-5 sm:flex">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e58a63]">
        <svg viewBox="0 0 24 24" fill="none" stroke="#1a130f" strokeWidth={2.4} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {SIDE_NAV.map((ic) => {
          const isActive = ic.id === active;
          return (
            <motion.div
              key={ic.id}
              animate={{
                background: isActive ? "rgba(229,138,99,0.15)" : "rgba(229,138,99,0)",
                color: isActive ? "#e58a63" : "#726a5e",
              }}
              transition={{ duration: 0.3 }}
              className="flex h-9 w-9 items-center justify-center rounded-lg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d={ic.d} />
              </svg>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// PhaseIngest — the input act, told as TWO sources side by side:
//   meetings (live, top featured card with REC indicator) and uploads
//   (three doc cards below with an "uploaded" chip + a coral upload-sweep
//   bar that fills as each card lands). Makes the ingestion mechanic
//   visually unmistakable instead of leaving the viewer wondering where
//   the docs came from.
const INGEST_UPLOADS = [
  { key: "spec",      tag: "Spec 26 24 16 · Panelboards", meta: "24 pages",          color: "#9b86bd", icon: "doc"   },
  { key: "drawing",   tag: "Drawing E101 · One-line",     meta: "Sheet 4 of 12",     color: "#e2af5d", icon: "plan"  },
  { key: "submittal", tag: "Submittal MDP-2 · Schneider", meta: "8 pages · stamped", color: "#e58a63", icon: "stamp" },
] as const;

function PhaseIngest() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="absolute inset-0 flex flex-col gap-3.5 p-6 md:p-8"
    >
      {/* Header — names the two sources explicitly */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[14px] font-medium text-[var(--cream-text)]">
            Joining your meetings <span className="text-[var(--faint-text)]"> · </span>
            Indexing every upload
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-[var(--faint-text)]">Riverside Medical · Electrical</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--faint-text)]">two sources</span>
      </div>

      {/* Section label — meetings */}
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--faint-text)]">
        <span className="h-px flex-1 bg-[var(--edge)]" />
        <span>from meetings · live</span>
        <span className="h-px flex-1 bg-[var(--edge)]" />
      </div>

      {/* Meeting card — full-width, the "live" source */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.42, ease: EASE }}
        className="relative flex items-center gap-3 rounded-xl border border-[#84b596]/30 bg-[#84b596]/[0.08] p-3"
      >
        {/* Faint live waveform on the card edge */}
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(132,181,150,0.20)", color: "#84b596" }}>
          <IngestIcon kind="call" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium text-[var(--cream-text)]">OAC Coord · May 6</span>
            <span className="flex items-center gap-1 rounded-full bg-[#e0694d]/15 px-1.5 py-[1px] font-mono text-[9.5px] font-semibold text-[#e0694d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e0694d] blink" /> REC
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#84b596]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l5-3v10l-5-3M3 6h11a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z" />
              </svg>
              joined live via Teams
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-[var(--faint-text)]">47 min · 4 attendees · 1,840 words transcribed</div>
        </div>
        <motion.span
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.85, duration: 0.35, ease: EASE }}
          className="flex items-center gap-1 rounded-full bg-[#84b596]/15 px-2 py-[3px] font-mono text-[10px] font-medium text-[#84b596]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-2.5 w-2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          transcribing
        </motion.span>
      </motion.div>

      {/* Section label — uploads */}
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--faint-text)]">
        <span className="h-px flex-1 bg-[var(--edge)]" />
        <span>from your uploads · drag &amp; drop</span>
        <span className="h-px flex-1 bg-[var(--edge)]" />
      </div>

      {/* Doc cards — 3 columns, the "uploaded" source. Each card gets a coral
          sweep bar that fills as it appears, conveying "this just uploaded". */}
      <motion.div
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: 0.4, delayChildren: 0.65 }}
        className="grid grid-cols-1 gap-2.5 md:grid-cols-3"
      >
        {INGEST_UPLOADS.map((d, i) => (
          <motion.div
            key={d.key}
            variants={{
              hidden: { opacity: 0, y: 12, scale: 0.96 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: EASE } },
            }}
            className="relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-[var(--edge)] bg-white/[0.03] p-3"
          >
            {/* Upload-sweep progress bar across the top of each card */}
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.95 + i * 0.4, duration: 0.55, ease: "easeOut" }}
              style={{ transformOrigin: "left" }}
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#e58a63] via-[#eaa379] to-[#e58a63]"
            />
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md" style={{ background: `${d.color}26`, color: d.color }}>
                <IngestIcon kind={d.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-[var(--cream-text)]">{d.tag}</div>
                <div className="font-mono text-[10px] text-[var(--faint-text)]">{d.meta}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-mono text-[10px] text-[var(--muted-text)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-2.5 w-2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12L7 9m5-5l5 5M4 20h16" />
                </svg>
                uploaded · just now
              </span>
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.55 + i * 0.4, duration: 0.32, ease: EASE }}
                className="flex items-center gap-1 rounded-full bg-[#84b596]/15 px-1.5 py-[2px] font-mono text-[9.5px] font-medium text-[#84b596]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-2.5 w-2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                parsed
              </motion.span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Corpus stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.4, duration: 0.5, ease: EASE }}
        className="mt-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-[var(--edge)] bg-white/[0.02] px-4 py-2.5 font-mono text-[11px] text-[var(--muted-text)]"
      >
        <span className="text-[var(--faint-text)]">CORPUS</span>
        <span><span className="text-[#9b86bd]">3</span> specs</span>
        <span className="text-[var(--faint-text)]">·</span>
        <span><span className="text-[#84b596]">1</span> meeting</span>
        <span className="text-[var(--faint-text)]">·</span>
        <span><span className="text-[#e2af5d]">12</span> drawings</span>
        <span className="text-[var(--faint-text)]">·</span>
        <span><span className="text-[#e58a63]">8</span> submittals</span>
        <span className="text-[var(--faint-text)]">·</span>
        <span><span className="text-[var(--cream-text)]">412</span> pages indexed</span>
      </motion.div>
    </motion.div>
  );
}

function IngestIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    doc:   "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M8 13h8M8 17h8",
    call:  "M15 10l5-3v10l-5-3M3 6h11a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z",
    plan:  "M3 9h18M9 3v18M3 4h18v16H3z",
    stamp: "M9 12l2 2 4-4M12 2L4 7v6c0 5 4 9 8 9s8-4 8-9V7z",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[kind]} />
    </svg>
  );
}

function PhaseDraft() {
  const rows = [
    { eq: "MDP-2",  req: "65 kAIC", sub: "42 kAIC", status: "fail",    label: "Non-compliant" },
    { eq: "SWBD-1", req: "65 kAIC", sub: "65 kAIC", status: "pass",    label: "Pass" },
    { eq: "PP-1A",  req: "22 kAIC", sub: "22 kAIC", status: "pass",    label: "Pass" },
    { eq: "ATS-1",  req: "30 kAIC", sub: "—",       status: "missing", label: "Missing data" },
  ];
  const pill = {
    pass: "bg-[#84b596]/15 text-[#84b596]",
    fail: "bg-[#e0694d]/15 text-[#e0694d]",
    missing: "bg-[#e2af5d]/15 text-[#e2af5d]",
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="absolute inset-0 flex flex-col gap-3.5 p-6 md:p-8"
    >
      {/* Template tabs — Voltaic ships drafts for the work this PM actually does */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { name: "RFI", active: false },
          { name: "Change order", active: false },
          { name: "Compliance report", active: true },
          { name: "Submittal review", active: false },
        ].map((t) => (
          <span
            key={t.name}
            className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] ${t.active ? "bg-[#e58a63] text-[#1a130f]" : "border border-[var(--edge)] text-[var(--muted-text)]"}`}
          >
            {t.name}
          </span>
        ))}
        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--faint-text)]">templates</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#84b596]/15 text-[#84b596]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-medium text-[var(--cream-text)]">AIC Compliance Report · Draft</span>
        </div>
        <span className="hidden rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] text-[var(--muted-text)] md:block">auto-filled from 3 calls + 12 submittals</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--edge)]">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr] gap-4 bg-white/[0.03] px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--faint-text)]">
          <div>Equipment</div>
          <div>Required</div>
          <div>Submitted</div>
          <div>Status</div>
        </div>
        <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.22, delayChildren: 0.2 }}>
          {rows.map((rw) => {
            const isFail = rw.status === "fail";
            return (
              <motion.div
                key={rw.eq}
                variants={{
                  hidden: { opacity: 0, x: -14 },
                  visible: {
                    opacity: 1, x: 0,
                    boxShadow: isFail
                      ? ["inset 0 0 0 1px rgba(224,105,77,0)", "inset 0 0 0 1px rgba(224,105,77,0.5)", "inset 0 0 0 1px rgba(224,105,77,0.3)"]
                      : "inset 0 0 0 1px rgba(0,0,0,0)",
                    transition: { duration: 0.55, ease: EASE },
                  },
                }}
                className={`grid grid-cols-[1.2fr_1fr_1fr_1.2fr] items-center gap-4 border-t border-[var(--edge)] px-4 py-3 ${isFail ? "bg-[#e0694d]/[0.08]" : "bg-white/[0.02]"}`}
              >
                <div className="flex items-center gap-2 font-mono text-[13px] text-[var(--cream-text)]">
                  {isFail && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-md bg-[#e0694d] text-[10px] font-bold text-[#1a130f]">!</span>
                  )}
                  {rw.eq}
                </div>
                <div className="text-[13px] text-[var(--muted-text)]">{rw.req}</div>
                <div className={`text-[13px] ${isFail ? "font-semibold text-[#e0694d]" : "text-[var(--cream-text)]"}`}>{rw.sub}</div>
                <div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${pill[rw.status as keyof typeof pill]}`}>{rw.label}</span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Contradiction summary — the folded-in Verify beat. Lands after rows. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{
          opacity: 1, y: 0,
          boxShadow: ["0 0 0 rgba(224,105,77,0)", "0 0 36px rgba(224,105,77,0.45)", "0 0 14px rgba(224,105,77,0.22)"],
        }}
        transition={{ delay: 1.6, duration: 0.6, ease: EASE }}
        className="flex items-start gap-3 rounded-xl border border-[#e0694d]/45 bg-[#e0694d]/10 p-3.5"
      >
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#e0694d] text-[14px] font-bold text-[#1a130f]">!</div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[#e0694d]">Contradiction caught on MDP-2</div>
          <div className="mt-0.5 text-[12px] text-[var(--muted-text)]">
            Said <span className="font-semibold text-[#e58a63]">42 kAIC</span> on the call. Spec 26 24 16 §2.4.A requires <span className="font-semibold text-[var(--cream-text)]">≥ 65 kAIC</span>. Flagged before the order goes out.
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// PhaseAsk — built from the actual Compliance Reviewer empty-state UI.
// Beats: empty greeting → suggestion chip focus → text fills input → send
// pressed → chat opens → reasoning ticks in → contradiction → RFI toast.
const ASK_SUGGESTIONS = [
  "Does the latest submittal meet the spec's AIC requirement?",
  "Compare AIC and SCCR across all panels.",
  "Which spec items are flagged as non-compliant?",
];
const ASK_QUERY = ASK_SUGGESTIONS[0];
// Sub-beats inside the Ask phase: empty → chip focus → text fills →
// send armed → send pressed → chat opens → reasoning streams → RFI toast.
// Sum must stay under WATCH_DURATIONS[2] so all beats complete before loop.
const ASK_BEATS = [900, 450, 450, 400, 500, 1000, 700];

function PhaseAsk() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Reduced motion: jump straight to the final state. Deferred via a
      // timer so it isn't a synchronous setState in the effect body
      // (react-hooks/set-state-in-effect).
      timers.push(setTimeout(() => setStep(ASK_BEATS.length), 0));
      return () => timers.forEach(clearTimeout);
    }
    let acc = 0;
    ASK_BEATS.forEach((ms, i) => {
      acc += ms;
      timers.push(setTimeout(() => setStep(i + 1), acc));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const chatOpen = step >= 4;
  const chipFocused = step >= 1;
  const inputFilled = step >= 2;
  const sendArmed = step >= 2;
  const sendPressed = step === 3;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="absolute inset-0 flex flex-col"
    >
      {/* Compliance Reviewer header — matches the real product top bar */}
      <div className="flex items-center justify-between border-b border-[var(--edge)] px-5 py-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[14px] font-medium text-[var(--cream-text)]">New conversation</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="rounded-md bg-[#e58a63]/15 px-1.5 py-[1px] font-mono text-[10px] text-[#e58a63]">Compliance Reviewer</span>
              <span className="text-[10.5px] text-[var(--faint-text)]">· Project: Riverside Medical</span>
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--edge)] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-[var(--muted-text)]">
            <span className="text-[var(--faint-text)]">ASKING ABOUT</span>
            <span className="text-[var(--cream-text)]">All documents</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <button type="button" className="rounded-md border border-[var(--edge)] px-2.5 py-1 text-[11px] text-[var(--muted-text)]">Configure</button>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col">
        {/* Empty greeting state — fades out when the chat opens */}
        <AnimatePresence>
          {!chatOpen && (
            <motion.div
              key="greeting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute inset-0 flex flex-col items-center justify-center px-6"
            >
              <div className="text-center">
                <h3 className="font-serif text-[34px] tracking-tight text-[var(--cream-text)] md:text-[42px]">Hi Hitansh,</h3>
                <p className="mt-3 text-[14px] text-[var(--muted-text)]">
                  What do you need from <span className="font-medium text-[var(--cream-text)]">Compliance Reviewer</span> today?
                </p>
              </div>

              {/* Composer */}
              <div className="mt-7 w-full max-w-[560px] rounded-2xl border border-[var(--edge-strong)] bg-white/[0.04] p-3.5">
                <div className="min-h-[52px] px-1.5 pt-1.5 text-left text-[13.5px]">
                  {inputFilled ? (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="text-[var(--cream-text)]"
                    >
                      {ASK_QUERY}
                    </motion.span>
                  ) : (
                    <span className="text-[var(--faint-text)]">
                      Ask Compliance Reviewer…  e.g. &ldquo;Does the MDP-A submittal meet §2.2.B?&rdquo;
                    </span>
                  )}
                  <span className="blink ml-0.5 inline-block h-[16px] w-[2px] translate-y-[3px] bg-[#e58a63]" />
                </div>
                <div className="mt-2 flex justify-end">
                  <motion.button
                    type="button"
                    animate={{
                      backgroundColor: sendArmed ? "#e58a63" : "rgba(255,255,255,0.06)",
                      color: sendArmed ? "#1a130f" : "#726a5e",
                      scale: sendPressed ? 0.94 : 1,
                      boxShadow: sendPressed ? "0 0 28px rgba(229,138,99,0.7)" : "0 0 0 rgba(0,0,0,0)",
                    }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                  >
                    Send
                  </motion.button>
                </div>
              </div>

              {/* Suggestion chips */}
              <div className="mt-4 flex max-w-[600px] flex-wrap items-center justify-center gap-2">
                {ASK_SUGGESTIONS.map((s, i) => {
                  const isTarget = i === 0;
                  return (
                    <motion.div
                      key={s}
                      animate={{
                        borderColor: isTarget && chipFocused ? "rgba(229,138,99,0.5)" : "rgba(245,241,232,0.12)",
                        backgroundColor: isTarget && chipFocused ? "rgba(229,138,99,0.1)" : "rgba(255,255,255,0)",
                        color: isTarget && chipFocused ? "#f5f1e8" : "#aaa294",
                        scale: isTarget && step === 1 ? 1.04 : 1,
                      }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="rounded-full border px-3 py-1.5 text-[12px]"
                    >
                      {s}
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-5 font-mono text-[10px] text-[var(--faint-text)]">
                ↵ Send · ⇧↵ newline · Citations on · claude-sonnet-4-6 · temp 0.20 · AI-flagged — engineer verifies before action
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat state — fades in once the prompt is sent */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="absolute inset-0 flex flex-col gap-3 p-6 md:p-8"
            >
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#e58a63] px-4 py-2.5 text-[14px] text-[#1a130f]">{ASK_QUERY}</div>
              </div>
              {step >= 5 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--edge)] bg-white/[0.04] p-4"
                >
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-[var(--faint-text)]">Reasoning</div>
                  <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.18, delayChildren: 0.1 }} className="space-y-2">
                    {["Located spec 26 24 16 §2.4.A — requires 65 kAIC", "Matched approved submittal SUB-026-014 (MDP-2)", "Compared interrupting ratings"].map((s) => (
                      <motion.div key={s} variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }} className="flex items-center gap-2.5 text-[13px] text-[var(--muted-text)]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#84b596" strokeWidth={2.6} className="h-3.5 w-3.5 flex-shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {s}
                      </motion.div>
                    ))}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.4, ease: EASE }}
                    className="mt-4 flex items-start gap-3 rounded-xl border border-[#e0694d]/40 bg-[#e0694d]/10 p-3"
                  >
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#e0694d] text-[12px] font-bold text-[#1a130f]">!</div>
                    <div>
                      <div className="text-[13.5px] font-semibold text-[#e0694d]">Non-compliant — 42 kAIC submitted, 65 kAIC required</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Cite>spec 26 24 16 §2.4.A</Cite>
                        <Cite>SUB-026-014 · p.4</Cite>
                        <span className="font-mono text-[10px] text-[var(--faint-text)]">confidence 0.98</span>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
              {step >= 6 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex max-w-[92%] items-center gap-2 rounded-xl border border-[#84b596]/30 bg-[#84b596]/10 px-3.5 py-2.5 text-[13px] font-medium text-[#84b596]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Drafted RFI-076 to EOR · cited &amp; ready for review
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Cite({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--edge)] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-[var(--muted-text)]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h6l6 6v10a2 2 0 01-2 2z" />
      </svg>
      {children}
    </span>
  );
}

/* ── Proof: cited problem stats ──────────────────────────── */
function Proof() {
  const stats = [
    { n: "~10", a: "RFIs per $1M", b: "of construction value" },
    { n: "~10 days", a: "to answer one RFI", b: "average response time" },
    { n: "$1T+", a: "lost every year", b: "to coordination failures" },
  ];
  return (
    <section className="relative mx-auto max-w-5xl px-6 pb-4 pt-2">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="glass grid grid-cols-1 gap-6 rounded-2xl px-8 py-7 sm:grid-cols-3"
      >
        {stats.map((s) => (
          <div key={s.a} className="text-center">
            <div className="text-[34px] font-medium tracking-tight text-[#e58a63] md:text-[40px]">{s.n}</div>
            <div className="mt-1 text-[14px] font-medium text-[var(--cream-text)]">{s.a}</div>
            <div className="text-[12px] text-[var(--faint-text)]">{s.b}</div>
          </div>
        ))}
      </motion.div>
      <p className="mt-3 text-center font-mono text-[11px] text-[var(--faint-text)]">Industry figures — the gap Voltaic closes.</p>
    </section>
  );
}

/* ── Why us: the wedge + Procore preempt ─────────────────── */
function WhyUs() {
  return (
    <section className="relative mx-auto max-w-4xl px-6 py-20 text-center">
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="text-[26px] font-medium leading-snug tracking-tight text-[var(--cream-text)] md:text-[34px]"
      >
        The only construction AI that catches when a{" "}
        <span className="text-[#e58a63]">meeting contradicts the contract.</span>
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
        className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-[var(--muted-text)]"
      >
        Procore lives inside Procore. Voltaic lives in the meeting — where the decisions that cause the problems actually get made.
      </motion.p>
    </section>
  );
}

/* ── Closing CTA ─────────────────────────────────────────── */
function ClosingCTA() {
  return (
    <section className="relative overflow-hidden px-6 py-36 text-center">
      <div className="aurora" style={{ width: 520, height: 520, background: "#e58a63", opacity: 0.2, top: "-30%", left: "50%", transform: "translateX(-50%)" }} />
      <motion.h2 initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} className="relative z-10 mx-auto max-w-2xl text-[34px] font-medium leading-tight tracking-tight text-[var(--cream-text)] md:text-[52px]">
        Stop losing the project
        <br />
        <span className="bg-gradient-to-r from-[#e58a63] to-[#e2af5d] bg-clip-text text-transparent">in the meeting.</span>
      </motion.h2>
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2, ease: EASE }} className="relative z-10 mt-10">
        <Link href="/sign-up" className="glow-pulse inline-block rounded-full bg-[#e58a63] px-8 py-4 text-[16px] font-medium text-[#1a130f] transition-colors hover:bg-[#eb9a76]">
          Become a design partner
        </Link>
      </motion.div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="relative border-t border-[var(--edge)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <Wordmark />
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-[12px] text-[var(--muted-text)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="#84b596" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            AI-flagged · Engineer verifies before action.
          </p>
          <p className="text-[11px] text-[var(--faint-text)]">Consent-aware recording · Your documents and data stay yours.</p>
        </div>
        <span className="font-mono text-[11px] text-[var(--faint-text)]">© 2026 Voltaic</span>
      </div>
    </footer>
  );
}
