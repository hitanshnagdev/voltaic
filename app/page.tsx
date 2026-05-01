import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Voltaic — The MEP compliance layer for construction",
  description:
    "Install-readiness decision layer for electrical, mechanical and plumbing contractors. Drop in your drawings, specs, and submittals — get a structured compliance grid, traceable citations, and an agent that emails you the moment a flag blocks install.",
};

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/today");

  return (
    <div className="bg-[var(--color-cream)] text-[var(--color-ink)]">
      <Nav />
      <Hero />
      <PartnerMarquee />
      <Problem />
      <ProductCompare />
      <Agents />
      <TodayEmail />
      <Integrations />
      <Vision />
      <CTA />
      <Footer />
    </div>
  );
}

/* ───────────── NAV ───────────── */
function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 w-full border-b border-[var(--color-line-soft)]"
      style={{ background: "rgba(250, 249, 245, 0.85)", backdropFilter: "blur(10px)" }}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6" style={{ height: 60 }}>
        <a href="#top" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px]" style={{ background: "var(--color-ink)" }}>
            <span className="landing-display text-[15px] font-medium text-[var(--color-cream)]">V</span>
          </div>
          <span className="landing-display text-[19px] text-[var(--color-ink)]" style={{ letterSpacing: "-0.025em" }}>
            Voltaic
          </span>
        </a>

        <div className="hidden md:flex items-center gap-7 text-[13px] text-[var(--color-muted)]">
          <a href="#product" className="hover:text-[var(--color-ink)]">Product</a>
          <a href="#integrations" className="hover:text-[var(--color-ink)]">Integrations</a>
          <a href="#vision" className="hover:text-[var(--color-ink)]">Vision</a>
          <a href="#trust" className="hover:text-[var(--color-ink)]">Trust</a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
            style={{ background: "var(--color-ink)" }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ───────────── HERO ───────────── */
function Hero() {
  return (
    <section id="top" className="relative">
      <div className="absolute inset-0 landing-gridbg opacity-40 pointer-events-none" />
      <div className="relative mx-auto max-w-[1280px] px-6 pt-20 pb-16">
        <div className="mb-7 flex items-center gap-2">
          <span className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-coral-dark)]">
            VOLTAIC · v1
          </span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span className="landing-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
            MEP COMPLIANCE FOR CONSTRUCTION
          </span>
        </div>

        <h1 className="landing-display text-[var(--color-ink)]" style={{ fontSize: "clamp(54px, 7.6vw, 108px)" }}>
          Stop reading <span style={{ fontStyle: "italic", color: "var(--color-coral-dark)" }}>submittals</span>
          <br />
          one page at a time.
        </h1>

        <p
          className="mt-7 max-w-[680px] text-[19px] leading-[1.55] text-[var(--color-ink-soft)]"
          style={{ textWrap: "pretty" }}
        >
          Voltaic is the install-readiness decision layer for electrical, mechanical and plumbing contractors. Drop in
          your drawings, specs, and submittals — get a structured compliance grid, traceable citations back to the
          source page, and an agent that emails you the moment a flag blocks install.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-[7px] px-5 py-3 text-[14px] font-medium text-white transition hover:opacity-90"
            style={{ background: "var(--color-ink)" }}
          >
            Get early access
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
          <a
            href="#product"
            className="inline-flex items-center gap-2 rounded-[7px] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-5 py-3 text-[14px] text-[var(--color-ink-soft)] hover:bg-[var(--color-cream-deep)]"
          >
            See it on a real project
          </a>
          <span className="landing-mono text-[11px] text-[var(--color-muted)]">
            No CC · 14-day pilot · install in &lt; 1 hr
          </span>
        </div>
      </div>
    </section>
  );
}

/* ───────────── PARTNER MARQUEE ───────────── */
function MarqueeItem({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="landing-display whitespace-nowrap text-[26px] text-[var(--color-ink-soft)]"
      style={{ letterSpacing: "-0.02em" }}
    >
      {children}
    </span>
  );
}

function MarqueeSep() {
  return <span className="text-[var(--color-line-strong)]">✦</span>;
}

function MarqueeSet() {
  return (
    <>
      <MarqueeItem>
        UC Berkeley · <span style={{ color: "#003262", fontWeight: 500 }}>Haas School of Business</span>
      </MarqueeItem>
      <MarqueeSep />
      <MarqueeItem>
        <span style={{ color: "#8C1515", fontWeight: 500 }}>Stanford</span> University
      </MarqueeItem>
      <MarqueeSep />
      <MarqueeItem>
        Fordham · <span style={{ color: "#900028", fontWeight: 500 }}>Gabelli School of Business</span>
      </MarqueeItem>
      <MarqueeSep />
      <span className="whitespace-nowrap text-[22px] font-bold tracking-tight" style={{ color: "#F47E42" }}>
        Procore
      </span>
      <MarqueeSep />
      <span className="whitespace-nowrap text-[22px] font-semibold tracking-tight text-[var(--color-ink)]">
        Datagrid AI
      </span>
      <MarqueeSep />
    </>
  );
}

function PartnerMarquee() {
  return (
    <section
      id="trust"
      className="border-y border-[var(--color-line-soft)] py-7"
      style={{ background: "var(--color-cream-deep)" }}
    >
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="mb-4 flex items-baseline">
          <span className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Advised and made by builders from
          </span>
        </div>
      </div>
      <div className="overflow-hidden">
        <div className="marquee-track flex w-max items-center gap-14 px-6" style={{ willChange: "transform" }}>
          <MarqueeSet />
          <MarqueeSet />
          <MarqueeSet />
        </div>
      </div>
    </section>
  );
}

/* ───────────── PROBLEM ───────────── */
function Problem() {
  return (
    <section className="border-b border-[var(--color-line-soft)] py-24">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6">
        <div className="col-span-12 md:col-span-4">
          <div className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            THE PROBLEM
          </div>
          <h2 className="landing-display mt-4 text-[42px] text-[var(--color-ink)]">
            Submittal review is where construction profit gets eaten.
          </h2>
        </div>
        <div className="col-span-12 md:col-span-7 md:col-start-6">
          <p className="text-[18px] leading-[1.6] text-[var(--color-ink-soft)]" style={{ textWrap: "pretty" }}>
            On a typical mid-size project, an MEP project engineer spends large stretches of every week reading PDFs,
            looking up spec clauses, and chasing vendors for missing data. Most submittals come back to be re-issued
            multiple times. When something slips, it&apos;s rarely because nobody noticed — it&apos;s because the noticing
            happened too late, in the wrong format, with no audit trail back to the page that mattered.
          </p>
          <p className="mt-5 text-[18px] leading-[1.6] text-[var(--color-ink-soft)]" style={{ textWrap: "pretty" }}>
            A missed AIC or SCCR discrepancy doesn&apos;t show up in a spreadsheet — it shows up when the switchgear
            arrives on site and the install crew can&apos;t energize it. Voltaic moves that catch from the field back to
            review, where it&apos;s still cheap to fix.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────────── PRODUCT — Compare grid mock ───────────── */
function ProductCompare() {
  return (
    <section id="product" className="relative py-24" style={{ background: "var(--color-cream-deep)" }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-5">
            <div className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-coral-dark)]">
              01 · COMPARE
            </div>
            <h2 className="landing-display mt-4 text-[52px] text-[var(--color-ink)]">
              Every spec line.
              <br />
              Every submitted value.
              <br />
              <span style={{ fontStyle: "italic" }}>Side by side.</span>
            </h2>
            <p
              className="mt-6 text-[16px] leading-[1.6] text-[var(--color-ink-soft)]"
              style={{ textWrap: "pretty" }}
            >
              Voltaic ingests your spec section and the vendor&apos;s submittal, then renders the comparison as a
              structured grid — like Airtable, but typed for MEP review. Each cell is a verifiable claim with a
              citation back to the source page.
            </p>
            <ul className="mt-7 space-y-3 text-[13.5px] text-[var(--color-ink-soft)]">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-coral)]" />
                <span>
                  <b className="text-[var(--color-ink)]">Typed columns</b> — Required, Submitted, Status, Category, Page
                  cite, AI confidence.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-gold)]" />
                <span>
                  <b className="text-[var(--color-ink)]">Stamp inline</b> — engineer ✓ / ▲ / ✕ on each row; the stamp is
                  the audit trail.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-sage)]" />
                <span>
                  <b className="text-[var(--color-ink)]">Compile RFIs</b> — bundle all flagged rows into a draft RFI in
                  one click.
                </span>
              </li>
            </ul>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <CompareGridMock />
              </div>
            </div>
            <div className="mt-3 landing-mono text-[10.5px] text-[var(--color-muted)]">
              Compare view · Riverside Medical · Phase 2 · MDP-2 Schneider QED-2
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompareGridMock() {
  const gridCols = "32px 36px 1.2fr 1fr 1.4fr 130px 80px";
  return (
    <div className="screen-shadow overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--color-paper)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-cream)] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: "#e2ddd0" }} />
          <span className="h-3 w-3 rounded-full" style={{ background: "#e2ddd0" }} />
          <span className="h-3 w-3 rounded-full" style={{ background: "#e2ddd0" }} />
        </div>
        <div className="flex flex-1 items-center justify-center landing-mono text-[10.5px] text-[var(--color-muted)]">
          voltaic.app/compare/26-24-16
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-cream)] px-4 py-2">
        <span className="landing-display text-[15px]">Compare</span>
        <span className="text-[var(--color-muted-soft)]">/</span>
        <span className="landing-mono text-[10.5px] text-[var(--color-coral-dark)]">26 24 16</span>
        <span className="text-[12px] text-[var(--color-ink-soft)]">Panelboards</span>
        <span className="text-[var(--color-muted-soft)]">·</span>
        <span className="landing-mono text-[11px] text-[var(--color-ink-soft)]">submittal-mdp-2-schneider.pdf</span>
        <div className="ml-auto flex items-baseline gap-1.5">
          <span className="landing-display text-[18px]" style={{ color: "var(--color-clay)" }}>
            54%
          </span>
          <span className="landing-mono text-[10px] text-[var(--color-muted)]">
            match · <b style={{ color: "var(--color-clay)" }}>8</b> flagged
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 border-b border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-1.5">
        <span
          className="rounded-[4px] bg-[var(--color-paper)] px-2 py-1 text-[11.5px] font-medium"
          style={{ boxShadow: "0 1px 0 var(--color-coral)" }}
        >
          All <span className="landing-mono text-[10px] text-[var(--color-muted-soft)]">17</span>
        </span>
        <span className="px-2 py-1 text-[11.5px] text-[var(--color-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full mr-1" style={{ background: "#7a9a7c" }} />
          Compliant <span className="landing-mono text-[10px]">5</span>
        </span>
        <span className="px-2 py-1 text-[11.5px] text-[var(--color-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full mr-1" style={{ background: "#c5624f" }} />
          Not compliant <span className="landing-mono text-[10px]">5</span>
        </span>
        <span className="px-2 py-1 text-[11.5px] text-[var(--color-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full mr-1" style={{ background: "#c99346" }} />
          Verify <span className="landing-mono text-[10px]">4</span>
        </span>
        <span className="px-2 py-1 text-[11.5px] text-[var(--color-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full mr-1" style={{ background: "#a39988" }} />
          Missing <span className="landing-mono text-[10px]">3</span>
        </span>
      </div>
      <div
        className="grid landing-mono text-[9.5px] uppercase tracking-wider text-[var(--color-muted)]"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="border-b border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 text-center">#</div>
        <div className="border-b border-l border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 text-center">●</div>
        <div className="border-b border-l border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 px-3">Attribute ▾</div>
        <div className="border-b border-l border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 px-3">Required</div>
        <div className="border-b border-l border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 px-3">Submitted</div>
        <div className="border-b border-l border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 px-3">Category</div>
        <div className="border-b border-l border-[var(--color-line-strong)] bg-[var(--color-cream-deep)] py-1.5 px-3">Verify</div>
      </div>
      {/* Row 1 — Not compliant */}
      <div className="grid items-center border-b border-[var(--color-line-soft)]" style={{ gridTemplateColumns: gridCols }}>
        <div className="landing-mono py-3 text-center text-[10px] text-[var(--color-muted)]">6</div>
        <div className="border-l border-[var(--color-line-soft)] py-3 text-center">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full landing-mono text-[10px] font-bold"
            style={{ background: "#f4d9d2", color: "#b04428" }}
          >
            ✕
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <div className="text-[12px] font-medium text-[var(--color-ink)]">Short-circuit AIC</div>
          <div className="mt-0.5 text-[10.5px] italic text-[var(--color-muted)]">
            Series-rated combination — explicitly disallowed.
          </div>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-ink-soft)]">
          ≥ 65 kA RMS @ 480Y/277V
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5" style={{ background: "rgba(197,98,79,0.04)" }}>
          <span className="text-[11.5px] font-semibold" style={{ color: "var(--color-clay)" }}>
            42 kA (series-rated)
          </span>
          <span className="landing-mono ml-1.5 text-[9.5px] text-[var(--color-muted-soft)]">p.3</span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <span className="inline-flex rounded-full landing-mono text-[10.5px] px-2 py-[2px]" style={{ background: "#e8d8c4", color: "#7a4f1c" }}>
            Ratings
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <span
            className="landing-mono inline-flex items-center rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold tracking-wider"
            style={{ background: "var(--color-clay)", color: "white" }}
          >
            FLAG
          </span>
        </div>
      </div>
      {/* Row 2 — Verify */}
      <div className="grid items-center border-b border-[var(--color-line-soft)]" style={{ gridTemplateColumns: gridCols }}>
        <div className="landing-mono py-3 text-center text-[10px] text-[var(--color-muted)]">11</div>
        <div className="border-l border-[var(--color-line-soft)] py-3 text-center">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full landing-mono text-[10px] font-bold"
            style={{ background: "#efe2c7", color: "#87602b" }}
          >
            ▲
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <div className="text-[12px] font-medium text-[var(--color-ink)]">Bus Bracing</div>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-ink-soft)]">
          ≥ 65 kA stated
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-ink-soft)]">
          (not stated on data sheet){" "}
          <span className="landing-mono ml-1 text-[9.5px] text-[var(--color-muted-soft)]">p.3</span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <span className="inline-flex rounded-full landing-mono text-[10.5px] px-2 py-[2px]" style={{ background: "#e8d8c4", color: "#7a4f1c" }}>
            Ratings
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <span
            className="landing-mono inline-flex items-center rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold tracking-wider"
            style={{ background: "var(--color-gold-tint)", color: "#87602b" }}
          >
            VERIFY
          </span>
        </div>
      </div>
      {/* Row 3 — Compliant */}
      <div className="grid items-center border-b border-[var(--color-line-soft)]" style={{ gridTemplateColumns: gridCols }}>
        <div className="landing-mono py-3 text-center text-[10px] text-[var(--color-muted)]">9</div>
        <div className="border-l border-[var(--color-line-soft)] py-3 text-center">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full landing-mono text-[10px] font-bold"
            style={{ background: "#dde6d6", color: "#3d6b40" }}
          >
            ✓
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <div className="text-[12px] font-medium text-[var(--color-ink)]">Main</div>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-ink-soft)]">
          2000A MLO
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-ink-soft)]">
          2000A · MLO <span className="landing-mono ml-1 text-[9.5px] text-[var(--color-muted-soft)]">p.2</span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <span className="inline-flex rounded-full landing-mono text-[10.5px] px-2 py-[2px]" style={{ background: "#e8d8c4", color: "#7a4f1c" }}>
            Ratings
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5" />
      </div>
      {/* Row 4 — Missing */}
      <div className="grid items-center" style={{ gridTemplateColumns: gridCols }}>
        <div className="landing-mono py-3 text-center text-[10px] text-[var(--color-muted)]">15</div>
        <div className="border-l border-[var(--color-line-soft)] py-3 text-center">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full landing-mono text-[10px] font-bold"
            style={{ background: "#e8e3d6", color: "#7e7568" }}
          >
            ○
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <div className="text-[12px] font-medium text-[var(--color-ink)]">Ground Bus Sizing</div>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-ink-soft)]">
          1/2 of phase
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5 text-[11.5px] text-[var(--color-muted-soft)]">
          —
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5">
          <span className="inline-flex rounded-full landing-mono text-[10.5px] px-2 py-[2px]" style={{ background: "#e8d8c4", color: "#7a4f1c" }}>
            Ratings
          </span>
        </div>
        <div className="border-l border-[var(--color-line-soft)] px-3 py-2.5" />
      </div>
    </div>
  );
}

/* ───────────── AGENTS ───────────── */
function Agents() {
  return (
    <section className="border-b border-[var(--color-line-soft)] py-24">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-7 lg:order-1">
            <AgentChatMock />
            <div className="mt-3 landing-mono text-[10.5px] text-[var(--color-muted)]">
              Agents tab · Compliance Reviewer · with traceable citations
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 lg:order-2 lg:pl-4">
            <div className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-coral-dark)]">
              02 · AGENTS
            </div>
            <h2 className="landing-display mt-4 text-[52px] text-[var(--color-ink)]">
              An <span style={{ fontStyle: "italic" }}>engineer</span>
              <br />
              that reads the
              <br />
              whole project.
            </h2>
            <p
              className="mt-6 text-[16px] leading-[1.6] text-[var(--color-ink-soft)]"
              style={{ textWrap: "pretty" }}
            >
              Voltaic agents have the entire project corpus in working memory — every spec section, every submittal,
              every drawing, every RFI. Ask in plain English; get a cited answer.
            </p>
            <ul className="mt-7 space-y-3 text-[13.5px] text-[var(--color-ink-soft)]">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-coral)]" />
                <span>
                  <b className="text-[var(--color-ink)]">Compliance Reviewer</b> — verdict-first answers with §-level
                  citations.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-gold)]" />
                <span>
                  <b className="text-[var(--color-ink)]">RFI Drafter</b> — bundles flagged items into the RFI your PM
                  expects.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-sage)]" />
                <span>
                  <b className="text-[var(--color-ink)]">Field Assistant</b> — plain-English answers about installed
                  equipment and code.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--color-violet)" }}
                />
                <span>
                  <b className="text-[var(--color-ink)]">Scope Checker</b> — finds missing scope across drawings, specs,
                  and bid docs.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentChatMock() {
  return (
    <div className="screen-shadow overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--color-paper)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-3">
        <div>
          <div className="landing-display text-[15px] text-[var(--color-ink)]">Does Square D MDP-A meet 65kAIC?</div>
          <div className="mt-1 flex items-center gap-2 landing-mono text-[10px] text-[var(--color-muted)]">
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded landing-mono text-[7.5px] font-bold"
              style={{ background: "var(--color-coral-tint)", color: "var(--color-coral-dark)" }}
            >
              CR
            </span>
            <span className="text-[var(--color-ink-soft)]">Compliance Reviewer</span>
            <span className="text-[var(--color-muted-soft)]">·</span>
            <span>4 sources cited · 257 corpus docs</span>
          </div>
        </div>
        <span
          className="landing-mono inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--color-sage-tint)", color: "#3d6b40" }}
        >
          <span className="h-1.5 w-1.5 rounded-full live-dot" style={{ background: "var(--color-sage)" }} />
          live
        </span>
      </div>
      <div className="space-y-5 px-5 py-5" style={{ background: "var(--color-cream)" }}>
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] landing-mono text-[10px] font-semibold"
            style={{ background: "var(--color-cream-deep)", color: "var(--color-ink-soft)" }}
          >
            MD
          </div>
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-[var(--color-ink)]">M. Diaz · 9:14a</div>
            <div className="mt-1.5 text-[13px] leading-[1.6] text-[var(--color-ink-soft)]">
              Does the Square D MDP-A submittal (Rev A) meet the 65kAIC requirement in the spec?
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] landing-mono text-[10px] font-semibold"
            style={{ background: "var(--color-coral-tint)", color: "var(--color-coral-dark)" }}
          >
            CR
          </div>
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-[var(--color-ink)]">Compliance Reviewer · 9:14a</div>
            <div
              className="mt-1.5 text-[13px] leading-[1.65] text-[var(--color-ink-soft)]"
              style={{ textWrap: "pretty" }}
            >
              Short answer: <b className="text-[var(--color-ink)]">no</b> — the submittal does not meet the 65kAIC
              requirement.
              <br />
              <br />
              The spec requires <span className="cite spec">1 · §2.2.B</span> a short-circuit current rating of{" "}
              <b className="text-[var(--color-ink)]">at least 65,000 A RMS symmetrical at 480Y/277V</b>, and explicitly
              disallows series-rated combinations.
              <br />
              <br />
              The Square D submittal lists <span className="cite">2 · MDP-A Rev A · p.3</span>{" "}
              <b style={{ color: "var(--color-clay)" }}>42,000 A RMS @ 480V</b> series-rated with the upstream SWB-1
              65kAIC breaker — exactly what §2.2.B prohibits.
              <br />
              <br />
              To comply, you&apos;d need a fully-rated 65kAIC frame{" "}
              <span className="cite">3 · QED-2 Data Sheet · p.6</span>.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="landing-mono text-[9.5px] uppercase tracking-wider text-[var(--color-muted)]">
                SOURCES
              </span>
              <span className="landing-mono inline-flex items-center gap-1 rounded-[3px] border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-1 text-[10px]">
                <span className="font-semibold" style={{ color: "#87602b" }}>
                  1
                </span>
                <span className="text-[var(--color-ink-soft)]">Spec 26 24 13</span>
                <span className="text-[var(--color-muted)]">§2.2.B</span>
              </span>
              <span className="landing-mono inline-flex items-center gap-1 rounded-[3px] border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-1 text-[10px]">
                <span className="font-semibold" style={{ color: "var(--color-coral-dark)" }}>
                  2
                </span>
                <span className="text-[var(--color-ink-soft)]">MDP-A Submittal</span>
                <span className="text-[var(--color-muted)]">p.3</span>
              </span>
              <span className="landing-mono inline-flex items-center gap-1 rounded-[3px] border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-1 text-[10px]">
                <span className="font-semibold" style={{ color: "var(--color-coral-dark)" }}>
                  3
                </span>
                <span className="text-[var(--color-ink-soft)]">QED-2 Data Sheet</span>
                <span className="text-[var(--color-muted)]">p.6</span>
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 landing-mono text-[10px] text-[var(--color-muted)]">
              <span className="rounded-[3px] border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-0.5">
                ⚡ Convert to RFI
              </span>
              <span className="rounded-[3px] border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-0.5">
                📧 Email me when resolved
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── TODAY + EMAIL ───────────── */
function TodayEmail() {
  return (
    <section className="py-24" style={{ background: "var(--color-ink)", color: "var(--color-cream)" }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-5">
            <div
              className="landing-mono text-[10.5px] uppercase tracking-[0.18em]"
              style={{ color: "var(--color-gold)" }}
            >
              03 · TODAY
            </div>
            <h2 className="landing-display mt-4 text-[52px]" style={{ color: "var(--color-cream)" }}>
              <span style={{ fontStyle: "italic" }}>It</span> emails you
              <br />
              before the
              <br />
              schedule slips.
            </h2>
            <p
              className="mt-6 text-[16px] leading-[1.6]"
              style={{ color: "rgba(250,249,245,0.78)", textWrap: "pretty" }}
            >
              Voltaic watches your project in the background. When a new submittal arrives, when a spec revision lands,
              when a vendor&apos;s lead time changes — it re-runs the relevant compliance checks and emails you only
              if something changed that blocks install.
            </p>
            <div className="mt-7 space-y-3">
              <SeverityRow color="hot" label="HOT" copy="AIC undersized blocks MDP-2 install" />
              <SeverityRow color="warm" label="WARM" copy="Bus bracing not stated — vendor follow-up needed" />
              <SeverityRow color="cool" label="COOL" copy="SCCR exact match — clearable by stamp" />
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <EmailMock />
            <div className="mt-3 landing-mono text-[10.5px]" style={{ color: "rgba(250,249,245,0.55)" }}>
              Event-driven · Triggered by submittal upload, spec revision, or vendor lead-time change.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SeverityRow({ color, label, copy }: { color: "hot" | "warm" | "cool"; label: string; copy: string }) {
  const styles =
    color === "hot"
      ? { background: "rgba(197,98,79,0.25)", color: "#f0a08e" }
      : color === "warm"
        ? { background: "rgba(201,147,70,0.22)", color: "#e2bc77" }
        : { background: "rgba(92,138,110,0.25)", color: "#9bb89e" };
  return (
    <div className="flex items-center gap-3">
      <span
        className="landing-mono inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider"
        style={styles}
      >
        {label}
      </span>
      <span className="text-[14px]">{copy}</span>
    </div>
  );
}

function EmailMock() {
  return (
    <div
      className="overflow-hidden rounded-[10px] screen-shadow"
      style={{ background: "var(--color-cream)", color: "var(--color-ink)" }}
    >
      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-3">
        <div className="flex items-baseline justify-between landing-mono text-[10.5px] text-[var(--color-muted)]">
          <span>
            From: <b className="text-[var(--color-ink-soft)]">voltaic@notify.voltaic.app</b>
          </span>
          <span>Today, 6:42 AM</span>
        </div>
        <div className="mt-1 landing-mono text-[10.5px] text-[var(--color-muted)]">
          To: <b className="text-[var(--color-ink-soft)]">m.diaz@mjharris.com</b>
        </div>
        <div className="mt-2 landing-display text-[20px] text-[var(--color-ink)]">
          [Riverside Medical] 1 new HOT issue · review before today&apos;s PM stand-up
        </div>
      </div>
      <div className="p-5">
        <p className="text-[13.5px] leading-[1.6] text-[var(--color-ink-soft)]">Morning Maria,</p>
        <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--color-ink-soft)]">
          Schneider&apos;s revised MDP-2 submittal landed at 11:48 PM last night. I re-ran §26 24 16. The AIC is still
          undersized — short by 23 kA — and it&apos;s now blocking install (mid-June steel arrival).
        </p>
        <div
          className="mt-4 overflow-hidden rounded-[6px] border"
          style={{ borderColor: "rgba(197,98,79,0.3)", background: "rgba(197,98,79,0.04)" }}
        >
          <div
            className="flex items-center gap-2 border-b px-3 py-2"
            style={{ borderColor: "rgba(197,98,79,0.2)" }}
          >
            <span
              className="landing-mono inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider text-white"
              style={{ background: "var(--color-clay)" }}
            >
              HOT
            </span>
            <span className="landing-mono inline-flex items-center rounded-[3px] bg-[var(--color-cream-deep)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--color-ink-soft)]">
              rule:aic
            </span>
            <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">AIC undersized for MDP-2</span>
          </div>
          <div className="px-3 py-2.5 text-[12px] text-[var(--color-ink-soft)]">
            MDP-2 AIC <b style={{ color: "var(--color-clay)" }}>42 kA</b> &lt; required <b>65 kA</b>. Short by 23.0 kA.
            <div className="landing-mono mt-1 text-[10px] text-[var(--color-muted)]">
              MDP-2 · conf 95% · cited in submittal-mdp-2-schneider.pdf, page 2
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13.5px] leading-[1.6] text-[var(--color-ink-soft)]">
          Recommended next step: <b className="text-[var(--color-ink)]">draft an RFI</b> requesting the fully-rated
          QED-2-65 frame. I&apos;ve staged it.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span
            className="landing-mono rounded-[5px] px-3 py-1.5 text-[11.5px] font-medium text-white"
            style={{ background: "var(--color-ink)" }}
          >
            Open in Voltaic →
          </span>
          <span className="landing-mono rounded-[5px] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-[11.5px] text-[var(--color-ink-soft)]">
            Send draft RFI
          </span>
          <span className="landing-mono ml-auto text-[10px] text-[var(--color-muted-soft)]">
            Reply STOP to mute · &lt;voltaic.app/triggers&gt;
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────────── INTEGRATIONS ───────────── */
function Integrations() {
  return (
    <section id="integrations" className="border-b border-[var(--color-line-soft)] py-24">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="mb-12 grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-5">
            <div className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-coral-dark)]">
              04 · INTEGRATIONS
            </div>
            <h2 className="landing-display mt-4 text-[52px] text-[var(--color-ink)]">
              Plugs into the
              <br />
              tools your team
              <br />
              already lives in.
            </h2>
          </div>
          <div className="col-span-12 md:col-span-6 md:col-start-7">
            <p className="text-[16px] leading-[1.6] text-[var(--color-ink-soft)]" style={{ textWrap: "pretty" }}>
              Voltaic is designed to be the compliance layer above your project stack — not another silo. Drawings
              from Autodesk, schedule milestones from P6, and project email all in one place.
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-1 gap-px overflow-hidden rounded-[8px] md:grid-cols-3"
          style={{ background: "var(--color-line)" }}
        >
          <IntegrationCard
            iconBg="#e8f0ff"
            iconStroke="#0696D7"
            icon={<path d="M3 21l8-18 8 18M7 14h8" />}
            name="Autodesk Construction Cloud"
            kind="DRAWINGS · BIM"
            desc="Drawing sheets and revision sets. Voltaic correlates spec sections to plan locations."
          />
          <IntegrationCard
            iconBg="#fff0f0"
            iconStroke="#C5281C"
            icon={
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 4v16" />
              </>
            }
            name="Primavera P6"
            kind="SCHEDULE"
            desc="Activity dates and float. Voltaic ranks findings by time-to-impact, not just severity."
          />
          <IntegrationCard
            iconBg="var(--color-coral-tint)"
            iconStroke="var(--color-coral-dark)"
            icon={
              <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </>
            }
            name="Project Email"
            kind="GMAIL · O365"
            desc="Watches the project alias. Auto-files vendor responses, drafts replies for engineer review."
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-2">
          <span className="landing-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Also on roadmap
          </span>
          <span className="text-[13px] text-[var(--color-ink-soft)]">Bluebeam Studio</span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span className="text-[13px] text-[var(--color-ink-soft)]">Newforma</span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span className="text-[13px] text-[var(--color-ink-soft)]">SAP S/4HANA</span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span className="text-[13px] text-[var(--color-ink-soft)]">Microsoft Project</span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span className="text-[13px] text-[var(--color-ink-soft)]">Smartsheet</span>
        </div>
      </div>
    </section>
  );
}

function IntegrationCard({
  iconBg,
  iconStroke,
  icon,
  name,
  kind,
  desc,
}: {
  iconBg: string;
  iconStroke: string;
  icon: React.ReactNode;
  name: string;
  kind: string;
  desc: string;
}) {
  return (
    <div className="bg-[var(--color-paper)] p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-[6px]" style={{ background: iconBg }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2">
          {icon}
        </svg>
      </div>
      <div className="mt-4 text-[15px] font-semibold text-[var(--color-ink)]">{name}</div>
      <div className="landing-mono mt-1 text-[10.5px] uppercase tracking-wider text-[var(--color-muted)]">{kind}</div>
      <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--color-ink-soft)]">{desc}</p>
      <div className="landing-mono mt-3 text-[10px]" style={{ color: "var(--color-gold)" }}>
        ● Coming soon
      </div>
    </div>
  );
}

/* ───────────── VISION ───────────── */
function Vision() {
  return (
    <section id="vision" className="py-24" style={{ background: "var(--color-cream-deep)" }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="mb-14 max-w-[760px]">
          <div className="landing-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-coral-dark)]">
            VISION
          </div>
          <h2 className="landing-display mt-4 text-[64px] text-[var(--color-ink)]">
            An <span style={{ fontStyle: "italic" }}>end-to-end</span> compliance OS for MEP construction.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.6] text-[var(--color-ink-soft)]" style={{ textWrap: "pretty" }}>
            Submittal review is the wedge. Voltaic is being built to span every place compliance lives in an MEP
            project — from preconstruction estimating, through procurement, to closeout. One source of truth, every
            step cited.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-px overflow-hidden rounded-[8px]" style={{ background: "var(--color-line)" }}>
          <RoadmapCol
            cap="Q2 '26 · NOW"
            capColor="var(--color-sage)"
            title="Submittal review"
            blurb="Compare grids, agents, RFI drafting, event-driven email."
            bullets={["Spec ↔ submittal grids", "Agent conversations", "ACC / P6 / email sync"]}
          />
          <RoadmapCol
            cap="Q3 '26"
            capColor="var(--color-gold)"
            title="Procurement compliance"
            blurb="Buyout package generation. Vendor PO ↔ approved submittal cross-check."
            bullets={["PO line item validator", "Lead-time risk scoring", "Supplier scorecards"]}
          />
          <RoadmapCol
            cap="Q4 '26"
            capColor="var(--color-coral-dark)"
            title="Field readiness"
            blurb="Pre-install compliance reports for the foreman, plus QA/QC photo verification."
            bullets={["Install-ready cards", "Photo ↔ submittal match", "Punchlist generation"]}
          />
          <RoadmapCol
            cap="Q1 '27"
            capColor="var(--color-violet)"
            title="Closeout package"
            blurb="As-built reconciliation. O&M, warranty, and TAB compiled with full audit trail."
            bullets={["O&M completeness", "Warranty tracker", "TAB & commissioning"]}
          />
        </div>
      </div>
    </section>
  );
}

function RoadmapCol({
  cap,
  capColor,
  title,
  blurb,
  bullets,
}: {
  cap: string;
  capColor: string;
  title: string;
  blurb: string;
  bullets: string[];
}) {
  return (
    <div className="col-span-12 md:col-span-3 bg-[var(--color-paper)] p-6">
      <div className="landing-mono text-[10.5px] uppercase tracking-[0.16em]" style={{ color: capColor }}>
        {cap}
      </div>
      <div className="landing-display mt-2 text-[24px] text-[var(--color-ink)]">{title}</div>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-[var(--color-ink-soft)]">{blurb}</p>
      <ul className="mt-3 space-y-1 text-[11.5px] text-[var(--color-muted)]">
        {bullets.map((b) => (
          <li key={b}>· {b}</li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── CTA ───────────── */
function CTA() {
  return (
    <section className="border-t border-[var(--color-line-soft)] py-20" style={{ background: "var(--color-cream)" }}>
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-7">
            <h2 className="landing-display text-[64px] text-[var(--color-ink)]">
              See it on <span style={{ fontStyle: "italic", color: "var(--color-coral-dark)" }}>your</span> next
              submittal.
            </h2>
            <p className="mt-5 max-w-[520px] text-[16px] leading-[1.6] text-[var(--color-ink-soft)]">
              14-day pilot on one project. We&apos;ll ingest your spec and any open submittals — you&apos;ll see the
              Compare grid in under an hour.
            </p>
          </div>
          <div className="col-span-12 md:col-span-5 md:pt-3">
            <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-paper)] p-5 screen-shadow">
              <div className="landing-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
                Start a pilot
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                <input
                  className="rounded-[6px] border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-coral)]"
                  placeholder="Work email"
                />
                <input
                  className="rounded-[6px] border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-coral)]"
                  placeholder="Company"
                />
                <Link
                  href="/sign-up"
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-[6px] px-4 py-2.5 text-[13px] font-medium text-white"
                  style={{ background: "var(--color-ink)" }}
                >
                  Request access →
                </Link>
              </div>
              <div className="landing-mono mt-3 text-[10px] text-[var(--color-muted-soft)]">
                SOC2 Type II in flight · data segregated by project
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── FOOTER ───────────── */
function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)] py-10" style={{ background: "var(--color-cream-deep)" }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-4">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-[5px]"
                style={{ background: "var(--color-ink)" }}
              >
                <span className="landing-display text-[15px] font-medium text-[var(--color-cream)]">V</span>
              </div>
              <span className="landing-display text-[19px] text-[var(--color-ink)]">Voltaic</span>
            </div>
            <p className="mt-3 max-w-[280px] text-[12.5px] leading-[1.6] text-[var(--color-ink-soft)]">
              The MEP compliance layer for construction. Built in Berkeley, CA.
            </p>
          </div>
          <FooterCol
            heading="Product"
            links={[
              { label: "Compare", href: "#product" },
              { label: "Agents", href: "#" },
              { label: "Today", href: "#" },
              { label: "Integrations", href: "#integrations" },
            ]}
          />
          <FooterCol
            heading="Company"
            links={[
              { label: "About", href: "#" },
              { label: "Contact", href: "#" },
            ]}
          />
          <FooterCol
            heading="Trust"
            links={[
              { label: "Security", href: "#" },
              { label: "Privacy", href: "#" },
              { label: "Terms", href: "#" },
            ]}
          />
          <FooterCol
            heading="Resources"
            links={[
              { label: "Docs", href: "#" },
              { label: "Blog", href: "#" },
            ]}
          />
        </div>
        <div className="mt-10 flex items-center justify-between border-t border-[var(--color-line)] pt-4 landing-mono text-[10.5px] text-[var(--color-muted)]">
          <span>© 2026 Voltaic, Inc.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, links }: { heading: string; links: { label: string; href: string }[] }) {
  return (
    <div className="col-span-6 md:col-span-2">
      <div className="landing-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">{heading}</div>
      <div className="mt-3 space-y-1.5 text-[12.5px] text-[var(--color-ink-soft)]">
        {links.map((l) => (
          <a key={l.label} className="block hover:text-[var(--color-ink)]" href={l.href}>
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
