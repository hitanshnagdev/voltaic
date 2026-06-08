"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useScroll } from "motion/react";

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
        <Listen />
        <Draft />
        <Verify />
        <WhyUs />
        <Ask />
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
        <a href="#connect" className="rounded-full border border-[var(--edge-strong)] px-6 py-3 text-[15px] font-medium text-[var(--cream-text)] transition-colors hover:bg-white/[0.04]">
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
  const inputs = [
    { name: "Teams", y: 70 },
    { name: "Outlook", y: 170 },
    { name: "Meet", y: 270 },
    { name: "Zoom", y: 370 },
  ];
  const outputs = [
    { name: "RFIs", y: 70 },
    { name: "Change orders", y: 170 },
    { name: "Compliance reports", y: 270 },
    { name: "Submittal logs", y: 370 },
  ];
  const cx = 530;
  const cy = 220;
  const r = 44;
  const inEdge = 222;
  const outEdge = 838;

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
              <rect x={42} y={t.y - 22} width={180} height={44} rx={12} fill="rgba(255,255,255,0.05)" stroke="rgba(245,241,232,0.16)" />
              <circle cx={68} cy={t.y} r={4} fill="#84b596" />
              <text x={84} y={t.y + 5} fill="#f5f1e8" fontSize={14} fontWeight={500} fontFamily="Inter, sans-serif">{t.name}</text>
            </motion.g>
          ))}

          {outputs.map((t, i) => (
            <motion.g key={t.name} initial={{ opacity: 0, x: 14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.7 + i * 0.08, ease: EASE }}>
              <rect x={outEdge} y={t.y - 22} width={188} height={44} rx={12} fill="rgba(132,181,150,0.08)" stroke="rgba(132,181,150,0.28)" />
              <circle cx={outEdge + 24} cy={t.y} r={4} fill="#e58a63" />
              <text x={outEdge + 40} y={t.y + 5} fill="#f5f1e8" fontSize={14} fontWeight={500} fontFamily="Inter, sans-serif">{t.name}</text>
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

/* ── 02 · Listen ─────────────────────────────────────────── */
function Listen() {
  const bars = [0.4, 0.7, 0.35, 0.9, 0.55, 0.8, 0.3, 0.65, 0.95, 0.45, 0.75, 0.5, 0.85, 0.4, 0.6, 0.9, 0.5, 0.7, 0.3, 0.8, 0.55, 0.95, 0.42, 0.68, 0.88, 0.5, 0.72, 0.6];
  const words = "So let's value-engineer the main panel down to 42 kAIC to hit budget.".split(" ");
  return (
    <Scene id="listen" n="02" kicker="Listen" title="It sits in every call.">
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between border-b border-[var(--edge)] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-[#e0694d]/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#e0694d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e0694d] blink" /> REC
            </span>
            <span className="text-[13px] text-[var(--muted-text)]">OAC Coordination · Live</span>
          </div>
          <div className="flex -space-x-2">
            {["JM", "AR", "TK", "SP"].map((a, i) => (
              <div key={a} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--bg)] text-[10px] font-semibold text-[#1a130f]" style={{ background: ["#e58a63", "#84b596", "#e2af5d", "#9b86bd"][i] }}>
                {a}
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-20 items-center justify-center gap-[3px] py-4">
          {bars.map((h, i) => (
            <div key={i} className="wave-bar" style={{ height: `${14 + h * 44}px`, animationDelay: `${i * 0.05}s`, animationDuration: `${0.8 + (i % 4) * 0.12}s` }} />
          ))}
        </div>
        <div className="rounded-xl bg-white/[0.03] p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--faint-text)]">Transcribing</div>
          <motion.p className="text-[15px] leading-relaxed text-[var(--cream-text)]" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.6 }} transition={{ staggerChildren: 0.07, delayChildren: 0.3 }}>
            {words.map((w, i) => (
              <motion.span key={i} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} className={w.includes("42") ? "font-semibold text-[#e58a63]" : ""}>
                {w}{" "}
              </motion.span>
            ))}
            <span className="blink text-[#e58a63]">|</span>
          </motion.p>
        </div>
      </div>
    </Scene>
  );
}

/* ── 03 · Draft (compliance report auto-fill) ────────────── */
function Draft() {
  const tabs = ["RFI", "Change order", "Compliance report", "Submittal review"];
  const rows = [
    { eq: "MDP-2", req: "65 kAIC", sub: "42 kAIC", status: "fail", label: "Non-compliant" },
    { eq: "SWBD-1", req: "65 kAIC", sub: "65 kAIC", status: "pass", label: "Pass" },
    { eq: "PP-1A", req: "22 kAIC", sub: "22 kAIC", status: "pass", label: "Pass" },
    { eq: "ATS-1", req: "30 kAIC", sub: "—", status: "missing", label: "Missing data" },
  ];
  const pill = {
    pass: "bg-[#84b596]/15 text-[#84b596]",
    fail: "bg-[#e0694d]/15 text-[#e0694d]",
    missing: "bg-[#e2af5d]/15 text-[#e2af5d]",
  } as const;

  return (
    <Scene id="draft" n="03" kicker="Draft" title="Your templates, auto-filled.">
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t, i) => (
          <span key={t} className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium ${i === 2 ? "bg-[#e58a63] text-[#1a130f]" : "border border-[var(--edge)] text-[var(--muted-text)]"}`}>
            {t}
          </span>
        ))}
      </div>

      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#84b596]/15 text-[#84b596]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-medium text-[var(--cream-text)]">AIC Compliance Report · Draft</span>
          </div>
          <span className="hidden rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] text-[var(--muted-text)] sm:block">auto-filled from 3 calls + 12 submittals</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--edge)]">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1.3fr] gap-4 bg-white/[0.03] px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--faint-text)]">
            <div>Equipment</div>
            <div>Required</div>
            <div>Submitted</div>
            <div>Status</div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.4 }} transition={{ staggerChildren: 0.3, delayChildren: 0.2 }}>
            {rows.map((rw) => (
              <motion.div key={rw.eq} variants={{ hidden: { opacity: 0, x: -14 }, visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } } }} className="grid grid-cols-[1.4fr_1fr_1fr_1.3fr] items-center gap-4 border-t border-[var(--edge)] bg-white/[0.02] px-4 py-3.5">
                <div className="font-mono text-[13px] text-[var(--cream-text)]">{rw.eq}</div>
                <div className="text-[13px] text-[var(--muted-text)]">{rw.req}</div>
                <div className={`text-[13px] ${rw.status === "fail" ? "font-semibold text-[#e0694d]" : "text-[var(--cream-text)]"}`}>{rw.sub}</div>
                <div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${pill[rw.status as keyof typeof pill]}`}>{rw.label}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </Scene>
  );
}

/* ── 04 · Verify (climax) ────────────────────────────────── */
function Verify() {
  return (
    <Scene id="verify" n="04" kicker="Verify" title="Checked against the contract.">
      <div className="relative">
        <div className="grid gap-4 md:grid-cols-2">
          <CompareCard tag="Said on the call" value="42 kAIC" tone="neutral" />
          <CompareCard tag="Approved submittal · MDP-2" value="65 kAIC required" tone="doc" />
        </div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="scan-beam absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-[#e58a63]/30 to-transparent" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 18 }}
          whileInView={{ opacity: 1, scale: 1, y: 0, boxShadow: ["0 0 0px rgba(224,105,77,0)", "0 0 60px rgba(224,105,77,0.6)", "0 0 28px rgba(224,105,77,0.35)"] }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.7, delay: 1, ease: EASE }}
          className="mt-4 flex items-center gap-4 rounded-2xl border border-[#e0694d]/40 bg-[#e0694d]/10 p-5 md:p-6"
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#e0694d] text-[20px] font-bold text-[#1a130f]">!</div>
          <div>
            <div className="text-[17px] font-semibold text-[#e0694d]">Contradiction caught</div>
            <div className="mt-1 text-[14px] text-[var(--muted-text)]">Said 42 kAIC. Spec requires 65 kAIC. Flagged before the order goes out.</div>
          </div>
        </motion.div>
      </div>
    </Scene>
  );
}

function CompareCard({ tag, value, tone }: { tag: string; value: string; tone: "neutral" | "doc" }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--faint-text)]">{tag}</div>
      <div className={`mt-2 text-[26px] font-medium tracking-tight ${tone === "doc" ? "text-[var(--cream-text)]" : "text-[#e58a63]"}`}>{value}</div>
    </div>
  );
}

/* ── 05 · Ask — enlarged product sneak-peek ──────────────── */
function Ask() {
  const navIcons = [
    { d: "M4 6h16M4 12h16M4 18h10", label: "Today" },
    { d: "M3 12h4l3-8 4 16 3-8h4", label: "Map" },
    { d: "M4 5h7v14H4zM13 5h7v14h-7z", label: "Compare", active: true },
  ];
  return (
    <Scene id="ask" n="05" kicker="Ask · a peek inside the product" title="An agent that acts." wide>
      <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.8, ease: EASE }} className="app-window relative overflow-hidden rounded-2xl">
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

        <div className="flex min-h-[440px]">
          <div className="hidden w-16 flex-col items-center gap-2 border-r border-[var(--edge)] py-5 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e58a63]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1a130f" strokeWidth={2.4} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {navIcons.map((ic) => (
                <div key={ic.label} className={`flex h-9 w-9 items-center justify-center rounded-lg ${ic.active ? "bg-[#e58a63]/15 text-[#e58a63]" : "text-[var(--faint-text)]"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
                    <path strokeLinecap="round" strokeLinejoin="round" d={ic.d} />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-5 p-5 md:p-8">
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#e58a63] px-4 py-2.5 text-[14px] text-[#1a130f]">Does MDP-2 meet the AIC rating in the approved submittals?</div>
            </div>

            <div className="max-w-[92%] space-y-3">
              <div className="rounded-2xl rounded-bl-md border border-[var(--edge)] bg-white/[0.04] p-4">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-[var(--faint-text)]">Reasoning</div>
                <div className="space-y-2">
                  {["Located spec 26 24 16 §2.4.A — requires 65 kAIC", "Matched approved submittal SUB-026-014 (MDP-2)", "Compared interrupting ratings"].map((s) => (
                    <div key={s} className="flex items-center gap-2.5 text-[13px] text-[var(--muted-text)]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#84b596" strokeWidth={2.6} className="h-3.5 w-3.5 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {s}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#e0694d]/40 bg-[#e0694d]/10 p-3.5">
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#e0694d] text-[12px] font-bold text-[#1a130f]">!</div>
                  <div>
                    <div className="text-[14px] font-semibold text-[#e0694d]">Non-compliant — 42 kAIC submitted, 65 kAIC required</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Cite>spec 26 24 16 §2.4.A</Cite>
                      <Cite>SUB-026-014 · p.4</Cite>
                      <span className="font-mono text-[10px] text-[var(--faint-text)]">confidence 0.98</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-[#84b596]/30 bg-[#84b596]/10 px-3.5 py-2.5 text-[13px] font-medium text-[#84b596]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Generated “AIC Compliance Report” &amp; drafted an RFI to the EOR
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-[var(--edge)] bg-white/[0.03] px-4 py-2.5">
              <span className="text-[13px] text-[var(--faint-text)]">Ask about any equipment, spec, or decision…</span>
              <div className="flex-1" />
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e58a63] text-[#1a130f]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      <p className="mt-3 text-center font-mono text-[12px] text-[var(--faint-text)]">Live today — drop in a spec + submittal and get a cited compliance finding in ~60 seconds.</p>
    </Scene>
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
