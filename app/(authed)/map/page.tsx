export default function MapPage() {
  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-6 px-8 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
              System Map
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Electrical distribution topology · 87 items across service,
              switchgear, distribution, panels, end loads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost text-xs">Topology view</button>
            <button className="btn-ghost text-xs">Floor plan view</button>
          </div>
        </div>

        <div className="paper p-6">
          <svg viewBox="0 0 900 520" className="w-full" style={{ maxHeight: 560 }}>
            {/* Tier labels */}
            <text
              x="12"
              y="40"
              fill="var(--color-muted-soft)"
              fontSize="10"
              letterSpacing="0.1em"
              fontWeight="600"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              SERVICE
            </text>
            <text
              x="12"
              y="150"
              fill="var(--color-muted-soft)"
              fontSize="10"
              letterSpacing="0.1em"
              fontWeight="600"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              SWITCHGEAR
            </text>
            <text
              x="12"
              y="260"
              fill="var(--color-muted-soft)"
              fontSize="10"
              letterSpacing="0.1em"
              fontWeight="600"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              DISTRIBUTION
            </text>
            <text
              x="12"
              y="380"
              fill="var(--color-muted-soft)"
              fontSize="10"
              letterSpacing="0.1em"
              fontWeight="600"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              PANELS
            </text>

            {/* Service */}
            <g className="entity-node">
              <rect
                className="entity-box clean"
                x="400"
                y="20"
                width="120"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="460" y="45" textAnchor="middle">
                UTIL-XFMR
              </text>
              <text
                className="entity-sub-label"
                x="460"
                y="60"
                textAnchor="middle"
              >
                2500 kVA · 480V
              </text>
            </g>

            {/* Feeder to SWB */}
            <line className="entity-feeder" x1="460" y1="70" x2="460" y2="130" />

            {/* Switchgear */}
            <g className="entity-node">
              <rect
                className="entity-box issue"
                x="340"
                y="130"
                width="100"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="390" y="155" textAnchor="middle">
                SWB-1
              </text>
              <text
                className="entity-sub-label"
                x="390"
                y="170"
                textAnchor="middle"
              >
                3000A MLO
              </text>
              <circle cx="432" cy="138" r="6" fill="var(--color-clay)" />
              <text
                x="432"
                y="141"
                fontSize="8"
                fill="white"
                textAnchor="middle"
                fontWeight="700"
              >
                !
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box watch"
                x="480"
                y="130"
                width="100"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="530" y="155" textAnchor="middle">
                SWB-2
              </text>
              <text
                className="entity-sub-label"
                x="530"
                y="170"
                textAnchor="middle"
              >
                2000A MLO
              </text>
              <circle cx="572" cy="138" r="6" fill="var(--color-gold)" />
              <text
                x="572"
                y="141"
                fontSize="8"
                fill="white"
                textAnchor="middle"
                fontWeight="700"
              >
                Δ
              </text>
            </g>

            {/* Feeders down */}
            <line
              className="entity-feeder issue"
              x1="390"
              y1="180"
              x2="390"
              y2="230"
            />
            <line
              className="entity-feeder watch"
              x1="530"
              y1="180"
              x2="530"
              y2="230"
            />

            {/* Distribution */}
            <g className="entity-node">
              <rect
                className="entity-box ok"
                x="200"
                y="240"
                width="100"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="250" y="265" textAnchor="middle">
                DP-A
              </text>
              <text
                className="entity-sub-label"
                x="250"
                y="280"
                textAnchor="middle"
              >
                800A · L1
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box issue"
                x="340"
                y="240"
                width="100"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="390" y="265" textAnchor="middle">
                DP-B
              </text>
              <text
                className="entity-sub-label"
                x="390"
                y="280"
                textAnchor="middle"
              >
                800A · L1
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box ok"
                x="480"
                y="240"
                width="100"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="530" y="265" textAnchor="middle">
                DP-C
              </text>
              <text
                className="entity-sub-label"
                x="530"
                y="280"
                textAnchor="middle"
              >
                600A · L2
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box watch"
                x="620"
                y="240"
                width="100"
                height="50"
                rx="6"
              />
              <text className="entity-label" x="670" y="265" textAnchor="middle">
                UPS-ICU
              </text>
              <text
                className="entity-sub-label"
                x="670"
                y="280"
                textAnchor="middle"
              >
                80 kVA · N
              </text>
              <circle cx="712" cy="248" r="6" fill="var(--color-gold)" />
              <text
                x="712"
                y="251"
                fontSize="8"
                fill="white"
                textAnchor="middle"
                fontWeight="700"
              >
                ⏳
              </text>
            </g>

            {/* Panels tier feeders */}
            <line className="entity-feeder" x1="250" y1="290" x2="250" y2="350" />
            <line
              className="entity-feeder issue"
              x1="390"
              y1="290"
              x2="390"
              y2="350"
            />
            <line className="entity-feeder" x1="530" y1="290" x2="530" y2="350" />
            <line
              className="entity-feeder watch"
              x1="670"
              y1="290"
              x2="670"
              y2="350"
            />

            {/* Panels */}
            <g className="entity-node">
              <rect
                className="entity-box ok"
                x="140"
                y="360"
                width="80"
                height="40"
                rx="6"
              />
              <text className="entity-label" x="180" y="380" textAnchor="middle">
                PB-L1-A
              </text>
              <text
                className="entity-sub-label"
                x="180"
                y="393"
                textAnchor="middle"
              >
                225A
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box issue"
                x="230"
                y="360"
                width="80"
                height="40"
                rx="6"
              />
              <text className="entity-label" x="270" y="380" textAnchor="middle">
                PB-L1-B
              </text>
              <text
                className="entity-sub-label"
                x="270"
                y="393"
                textAnchor="middle"
              >
                225A
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box issue"
                x="340"
                y="360"
                width="80"
                height="40"
                rx="6"
              />
              <text className="entity-label" x="380" y="380" textAnchor="middle">
                PB-L2-A
              </text>
              <text
                className="entity-sub-label"
                x="380"
                y="393"
                textAnchor="middle"
              >
                400A
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box ok"
                x="460"
                y="360"
                width="80"
                height="40"
                rx="6"
              />
              <text className="entity-label" x="500" y="380" textAnchor="middle">
                PB-L2-B
              </text>
              <text
                className="entity-sub-label"
                x="500"
                y="393"
                textAnchor="middle"
              >
                400A
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box ok"
                x="560"
                y="360"
                width="80"
                height="40"
                rx="6"
              />
              <text className="entity-label" x="600" y="380" textAnchor="middle">
                PB-L3-A
              </text>
              <text
                className="entity-sub-label"
                x="600"
                y="393"
                textAnchor="middle"
              >
                225A
              </text>
            </g>
            <g className="entity-node">
              <rect
                className="entity-box ok"
                x="650"
                y="360"
                width="80"
                height="40"
                rx="6"
              />
              <text className="entity-label" x="690" y="380" textAnchor="middle">
                PB-ICU-A
              </text>
              <text
                className="entity-sub-label"
                x="690"
                y="393"
                textAnchor="middle"
              >
                225A
              </text>
            </g>

            {/* Legend */}
            <g transform="translate(720, 40)">
              <rect
                x="0"
                y="0"
                width="12"
                height="12"
                rx="2"
                className="entity-box issue"
              />
              <text x="18" y="10" fontSize="10" fill="var(--color-ink-soft)">
                Open issue
              </text>
              <rect
                x="0"
                y="20"
                width="12"
                height="12"
                rx="2"
                className="entity-box watch"
              />
              <text x="18" y="30" fontSize="10" fill="var(--color-ink-soft)">
                Needs attention
              </text>
              <rect
                x="0"
                y="40"
                width="12"
                height="12"
                rx="2"
                className="entity-box ok"
              />
              <text x="18" y="50" fontSize="10" fill="var(--color-ink-soft)">
                Ready
              </text>
            </g>
          </svg>
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="paper p-4">
            <div className="text-2xl font-semibold text-[var(--color-ink)]">
              87
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              Equipment items
            </div>
          </div>
          <div className="paper p-4">
            <div
              className="text-2xl font-semibold"
              style={{ color: "var(--color-sage)" }}
            >
              62
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              Ready to install
            </div>
          </div>
          <div className="paper p-4">
            <div
              className="text-2xl font-semibold"
              style={{ color: "var(--color-clay)" }}
            >
              16
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              Open issues
            </div>
          </div>
          <div className="paper p-4">
            <div
              className="text-2xl font-semibold"
              style={{ color: "var(--color-gold)" }}
            >
              9
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              Waiting upstream
            </div>
          </div>
        </div>

        <p className="text-center text-[12px] italic text-[var(--color-muted)]">
          Isometric / floor plan view coming later. This is the tier-based
          topology carried forward from v5.
        </p>
      </div>
    </section>
  );
}
