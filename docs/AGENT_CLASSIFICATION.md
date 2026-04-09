# Agent Classification — v23.0 Materialization

> Authoritative classification for all VoidForge agents as Claude Code subagent definitions.
> Source: `docs/NAMING_REGISTRY.md`. Architecture: ADR-044.

## Summary

| Metric | Count |
|--------|-------|
| **Total agents** | **263** |
| Leads (Opus/inherit, Builder) | 20 |
| Specialists (Sonnet, Reviewer) | 190 |
| Scouts (Haiku, Scout/Reviewer) | 38 |
| Adversarial (Sonnet, Adversarial) | 15 |

**Note:** The authoritative count from NAMING_REGISTRY.md is 263. All methodology docs updated in M7. ADR-044 and ADR-042 retain their original "259" count as historical records.

## Tiers (Model Assignment)

| Tier | Model | Role | Criteria |
|------|-------|------|----------|
| **Lead** | `inherit` (Opus) | Command leads, orchestrators, synthesizers | Fixed leads per NAMING_REGISTRY rules. Need judgment, writing, multi-step reasoning. |
| **Specialist** | `sonnet` | Domain analysis, code review, spot-checks | Focused prompt + context isolation compensates. Faster in parallel. |
| **Scout** | `haiku` | File search, classification, pattern matching | Simple tasks where speed matters most. Minimal reasoning required. |

## Tool Access (Independent of Tier)

| Category | Tools | Use Case |
|----------|-------|----------|
| **Builder** | Read, Write, Edit, Bash, Grep, Glob | Creates/modifies files. All leads. |
| **Reviewer** | Read, Bash, Grep, Glob | Reads code, runs commands, no edits. Most specialists. |
| **Scout** | Read, Grep, Glob | Pure read-only. No bash. Pattern matching only. |
| **Adversarial** | Read, Bash, Grep, Glob | Probes without fixing. Same tools as Reviewer, different behavioral prompt. |

---

## Lead Agents (20 — Opus, Builder)

| # | Agent | Universe | Agent ID | Domain |
|---|-------|----------|----------|--------|
| 1 | Galadriel | Tolkien | `galadriel-frontend` | Frontend, UX, a11y, design system |
| 2 | Bombadil | Tolkien | `bombadil-forge-sync` | Forge sync, methodology updates |
| 3 | Gandalf | Tolkien | `gandalf-setup-wizard` | Setup wizard, project initialization |
| 4 | Celebrimbor | Tolkien | `celebrimbor-forge-artist` | AI image generation from PRD |
| 5 | Stark | Marvel | `stark-backend` | Backend engineering, API, DB, services |
| 6 | Coulson | Marvel | `coulson-release` | Version, changelog, commit, release |
| 7 | Fury | Marvel | `fury-initiative` | Full pipeline orchestration (assemble) |
| 8 | Thanos | Marvel | `thanos-gauntlet` | Comprehensive multi-round review |
| 9 | Batman | DC | `batman-qa` | QA, bug hunting, testing, hardening |
| 10 | Kenobi | Star Wars | `kenobi-security` | Security auditing, OWASP, auth |
| 11 | Picard | Star Trek | `picard-architecture` | Systems architecture, schema, ADRs |
| 12 | Sisko | Star Trek | `sisko-campaign` | Campaign command, mission planning |
| 13 | Bashir | Star Trek | `bashir-field-medic` | Post-mortem analysis, upstream feedback |
| 14 | Tuvok | Star Trek | `tuvok-deep-current` | Autonomous campaign intelligence |
| 15 | Kusanagi | Anime | `kusanagi-devops` | DevOps, infrastructure, deploy |
| 16 | Haku | Anime | `haku-deploy-wizard` | Browser-based deploy wizard |
| 17 | Chani | Dune | `chani-worm-rider` | Telegram bridge, remote control |
| 18 | Kelsier | Cosmere | `kelsier-growth` | Growth strategy, campaign orchestration |
| 19 | Dockson | Cosmere | `dockson-treasury` | Revenue, budgets, spend, reconciliation |
| 20 | Hari Seldon | Foundation | `seldon-ai` | AI intelligence, model selection, evals |

---

## Tolkien — Frontend & UX (27 total: 4 leads, 19 specialists, 4 scouts)

### Specialists (19 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Radagast | `radagast-edge-cases` | Edge cases, boundary conditions, QA |
| 2 | Aragorn | `aragorn-orchestration` | Leadership, orchestration, full-system view |
| 3 | Legolas | `legolas-precision` | Precision, elegance, clean frontend code |
| 4 | Samwise | `samwise-accessibility` | Accessibility, WCAG, inclusive design |
| 5 | Elrond | `elrond-ux-strategy` | UX strategy, long-term thinking |
| 6 | Arwen | `arwen-ui-polish` | UI polish, visual consistency |
| 7 | Gimli | `gimli-performance` | Performance, reliability, sturdiness |
| 8 | Bilbo | `bilbo-microcopy` | Storytelling, microcopy, content |
| 9 | Frodo | `frodo-critical-path` | Carries the hardest task, critical path |
| 10 | Eowyn | `eowyn-delight` | Delight architecture, micro-moments, motion, brand |
| 11 | Faramir | `faramir-judgment` | Quality over glory, judgment calls |
| 12 | Pippin | `pippin-discovery` | Curiosity, edge case discovery |
| 13 | Merry | `merry-pair-review` | Pair review, collaborative analysis |
| 14 | Treebeard | `treebeard-deliberation` | Slow deliberate analysis, no rush |
| 15 | Boromir | `boromir-hubris` | Catches hubris in design, overreach |
| 16 | Theoden | `theoden-rally` | Rallying, team coordination |
| 17 | Haldir | `haldir-boundaries` | Boundary guard, catches edge conditions |
| 18 | Celeborn | `celeborn-design-system` | Design system governance |
| 19 | Glorfindel | `glorfindel-rendering` | Hardest rendering challenges |

### Scouts (4 — Haiku, Scout)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Nori | `nori-asset-scanner` | Scans PRD for image requirements |
| 2 | Ori | `ori-prompt-crafter` | Crafts generation prompts from descriptions |
| 3 | Dori | `dori-integration-check` | Verifies generated images wired into components |
| 4 | Goldberry | `goldberry-change-detect` | Change detection, senses upstream changes |

---

## Marvel — Backend Engineering (31 total: 4 leads, 22 specialists, 4 scouts, 1 adversarial)

### Specialists (22 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Rogers | `rogers-api-design` | API design, REST conventions, discipline |
| 2 | Banner | `banner-database` | Database, query optimization |
| 3 | Strange | `strange-service-arch` | Service architecture, pattern recognition |
| 4 | Romanoff | `romanoff-integrations` | Third-party integrations, trust verification |
| 5 | Thor | `thor-queues` | Queue/workers, background jobs |
| 6 | Hill | `hill-mission-control` | Mission control, tracking, coordination |
| 7 | Parker | `parker-connections` | Web of connections, fast learning |
| 8 | T'Challa | `tchalla-quality` | Elegant engineering, premium quality |
| 9 | Wanda | `wanda-state` | Complex state transforms |
| 10 | Vision | `vision-data-analysis` | Data analysis, sees through everything |
| 11 | Rhodes | `rhodes-production` | Battle-tested, production reliability |
| 12 | Shuri | `shuri-innovation` | Innovation, cutting-edge solutions |
| 13 | Valkyrie | `valkyrie-recovery` | Disaster recovery, rescue operations |
| 14 | Nebula | `nebula-optimization` | Relentless optimization |
| 15 | Rocket | `rocket-scrappy` | Builds from whatever's available |
| 16 | Gamora | `gamora-perf-assassin` | Performance assassination |
| 17 | Groot | `groot-caching` | Simple interface, deep roots, caching |
| 18 | Wong | `wong-documentation` | Documentation, knowledge guardian |
| 19 | Falcon | `falcon-migration` | Migration specialist, smooth transitions |
| 20 | Bucky | `bucky-legacy` | Legacy code expert, rehabilitation |
| 21 | Lang | `lang-micro-changes` | Small changes with big impact |
| 22 | Okoye | `okoye-data-integrity` | Data integrity protection |

### Scouts (4 — Haiku)

| # | Agent | Agent ID | Tools | Role/Lens |
|---|-------|----------|-------|-----------|
| 1 | Barton | `barton-smoke-test` | Reviewer | Smoke tests, endpoint verification, route collision |
| 2 | Drax | `drax-exact-match` | Scout | Literal matching, exact-match bugs |
| 3 | Friday | `friday-automation` | Scout | Automation, versioning |
| 4 | Jarvis | `jarvis-status` | Scout | Status reporting, progress summaries |

### Adversarial (1 — Sonnet, Adversarial)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Loki | `loki-chaos` | Chaos testing, finds exploits |

---

## DC Comics — QA & Bug Hunting (26 total: 1 lead, 19 specialists, 3 scouts, 3 adversarial)

### Specialists (19 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Oracle | `oracle-static-analysis` | Intelligence gathering, static analysis |
| 2 | Alfred | `alfred-dependencies` | Dependency review, maintenance |
| 3 | Lucius | `lucius-config` | Engineering, config review, tooling |
| 4 | Nightwing | `nightwing-regression` | Agile testing, regression guardian |
| 5 | Flash | `flash-rapid-test` | Rapid iteration, fast issue discovery |
| 6 | Superman | `superman-strength-test` | Strength testing, unbreakable standards |
| 7 | Wonder Woman | `wonder-woman-truth` | Truth, cuts through deception |
| 8 | Cyborg | `cyborg-system-integration` | System integration |
| 9 | Batgirl | `batgirl-detail` | Tenacious, detail-oriented |
| 10 | Martian Manhunter | `manhunter-shapeshifting` | Tests in all forms, multi-env |
| 11 | Green Arrow | `green-arrow-precision` | Precision targeting, exact bug |
| 12 | Black Canary | `black-canary-monitoring` | Raises alerts, monitoring |
| 13 | Zatanna | `zatanna-impossible` | Makes impossible bugs appear |
| 14 | Raven | `raven-deep-analysis` | Deep analysis beneath the surface |
| 15 | Starfire | `starfire-brute-force` | Brute-force testing |
| 16 | Beast Boy | `beast-boy-cross-env` | Shape-shifting, cross-environment testing |
| 17 | Hawkgirl | `hawkgirl-regression-sweep` | Aerial view, broad regression sweeps |
| 18 | Aquaman | `aquaman-deep-dive` | Deep dive testing, complexity |
| 19 | Green Lantern | `green-lantern-scenarios` | Constructs test scenarios |

### Scouts (3 — Haiku, Scout)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Robin | `robin-apprentice` | Apprentice patterns, learning systems |
| 2 | Gordon | `gordon-escalation` | Process, chain of command, escalation |
| 3 | Huntress | `huntress-flaky-bugs` | Tracks down flaky bugs |

### Adversarial (3 — Sonnet, Adversarial)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Deathstroke | `deathstroke-adversarial` | Penetration testing, adversarial probing |
| 2 | Constantine | `constantine-cursed-code` | Dark arts, finds cursed code |
| 3 | Red Hood | `red-hood-aggressive` | Aggressive testing, breaks things |

---

## Star Wars — Security Auditing (25 total: 1 lead, 17 specialists, 5 scouts, 2 adversarial)

### Specialists (17 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Yoda | `yoda-auth` | Auth security, wisdom |
| 2 | Windu | `windu-input-validation` | Input validation, deflects attacks |
| 3 | Ahsoka | `ahsoka-access-control` | Access control, enforces boundaries |
| 4 | Leia | `leia-secrets` | Secrets management |
| 5 | Rex | `rex-infrastructure` | Infrastructure security, lockdown |
| 6 | Padme | `padme-data-protection` | Data protection, privacy |
| 7 | Chewie | `chewie-dependency-audit` | Dependency audit |
| 8 | Luke | `luke-audit-journey` | Full security audit journey |
| 9 | Han | `han-vuln-hunter` | Finds vulnerabilities first |
| 10 | Qui-Gon | `qui-gon-subtle-vulns` | Subtle vulnerability detection |
| 11 | Bo-Katan | `bo-katan-perimeter` | Perimeter defense, network security |
| 12 | Din Djarin | `din-djarin-bounty` | Bounty hunter for bugs |
| 13 | Hera | `hera-navigation` | Navigates complex systems |
| 14 | Kanan | `kanan-intuitive` | Intuitive security sensing |
| 15 | Sabine | `sabine-unconventional` | Unconventional attack vectors |
| 16 | Ezra | `ezra-catches-missed` | Catches what others miss |
| 17 | Mon Mothma | `mon-mothma-security-mgmt` | Security program management |

### Scouts (5 — Haiku, Scout)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Cassian | `cassian-recon` | Intelligence, reconnaissance |
| 2 | Grogu | `grogu-tiny-vulns` | Finds tiny vulnerabilities |
| 3 | Plo Koon | `plo-koon-edge-cases` | Quiet protector, edge cases |
| 4 | Bail Organa | `bail-organa-governance` | Governance, policy, compliance |
| 5 | Cara Dune | `cara-dune-enforcement` | Enforcement, compliance checks |

### Adversarial (2 — Sonnet, Adversarial)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Maul | `maul-red-team` | Red team, thinks like an attacker |
| 2 | Anakin | `anakin-dark-side` | Finds the dark side of code |

---

## Star Trek — Systems Architecture (29 total: 4 leads, 23 specialists, 2 scouts)

### Specialists (23 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Spock | `spock-schema` | Data architecture, logical precision |
| 2 | Scotty | `scotty-infrastructure` | Infrastructure, knows the limits |
| 3 | Uhura | `uhura-integration` | Communications, integration architecture |
| 4 | La Forge | `la-forge-reliability` | Reliability engineering |
| 5 | Data | `data-tech-debt` | Tech debt analysis, pattern recognition |
| 6 | Riker | `riker-review` | Second in command, reviews all decisions |
| 7 | Worf | `worf-security-arch` | Security implications of architecture |
| 8 | Crusher | `crusher-diagnostics` | System health, diagnostics |
| 9 | Troi | `troi-prd-compliance` | PRD compliance, verifies claims vs implementation |
| 10 | Kira | `kira-pragmatic` | Pragmatic, fights for simplicity |
| 11 | Odo | `odo-structural-anomaly` | Shape of systems, structural anomalies |
| 12 | Dax | `dax-legacy-wisdom` | Multiple lifetimes, legacy system wisdom |
| 13 | O'Brien | `obrien-root-cause` | Root cause investigation |
| 14 | Janeway | `janeway-novel-arch` | Novel architectures, unknown territory |
| 15 | Seven | `seven-optimization` | Deep Current optimization, efficiency, precision |
| 16 | Torres | `torres-site-scanner` | Deep Current site scanner, technical recon |
| 17 | Pike | `pike-bold-decisions` | Bold decisions, leads into the unknown |
| 18 | Paris | `paris-route-planner` | Route planner, optimal campaign sequences |
| 19 | T'Pol | `tpol-disciplined` | Disciplined analysis, Vulcan rigor |
| 20 | Archer | `archer-greenfield` | Explorer, greenfield architecture |
| 21 | Chakotay | `chakotay-bridge` | Cross-pipeline bridge, harmonizes concerns |
| 22 | Kim | `kim-api-design` | Communications, API design |
| 23 | Nog | `nog-solutions` | Creative solutions, thinks outside the box |

### Scouts (2 — Haiku, Scout)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Ezri | `ezri-session-analyst` | Session analysis, multiple perspectives |
| 2 | Jake | `jake-reporter` | Report writer, makes post-mortems readable |

---

## Anime — DevOps & Infrastructure (73 total: 2 leads, 50 specialists, 15 scouts, 6 adversarial)

### Specialists (50 — Sonnet, Reviewer)

| # | Agent | Agent ID | Sub-franchise | Role/Lens |
|---|-------|----------|---------------|-----------|
| 1 | Vegeta | `vegeta-monitoring` | DBZ | Monitoring, "over 9000" |
| 2 | Goku | `goku-scaling` | DBZ | Raw power, scales to any challenge |
| 3 | Piccolo | `piccolo-tactics` | DBZ | Strategic, tactician |
| 4 | Bulma | `bulma-engineering` | DBZ | Engineering genius, builds anything |
| 5 | Trunks | `trunks-rollback` | DBZ | Migrations and rollbacks |
| 6 | Gohan | `gohan-hidden-power` | DBZ | Steps up when needed |
| 7 | Whis | `whis-precision` | DBZ | Calm precision |
| 8 | Misato | `misato-operations` | EVA | Operations commander |
| 9 | Rei | `rei-dangerous-tasks` | EVA | Handles most dangerous tasks |
| 10 | Asuka | `asuka-performance` | EVA | Performance-obsessed |
| 11 | Kaworu | `kaworu-solver` | EVA | Appears, solves everything |
| 12 | Kaji | `kaji-intelligence` | EVA | Finds hidden information |
| 13 | Levi | `levi-deploy` | AoT | Precision, speed, cleanest execution |
| 14 | Erwin | `erwin-strategy` | AoT | Commander, strategic planning |
| 15 | Mikasa | `mikasa-protection` | AoT | Guards critical systems |
| 16 | Armin | `armin-clever` | AoT | Finds the clever solution |
| 17 | Hange | `hange-experimentation` | AoT | Testing, scientific approach |
| 18 | Jean | `jean-pragmatic` | AoT | Does what needs to be done |
| 19 | Spike | `spike-routing` | Bebop | Cool under pressure, routes everything |
| 20 | Jet | `jet-maintenance` | Bebop | Maintenance, keeps ship running |
| 21 | Faye | `faye-resourceful` | Bebop | Works with what she has |
| 22 | Tanjiro | `tanjiro-persistent` | Demon Slayer | Never gives up on a problem |
| 23 | Rengoku | `rengoku-intense-monitor` | Demon Slayer | Intense monitoring |
| 24 | Giyu | `giyu-silent-guard` | Demon Slayer | Silent guardian, background protection |
| 25 | Lelouch | `lelouch-orchestration` | Code Geass | Master strategist, orchestration |
| 26 | C.C. | `cc-persistent-process` | Code Geass | Long-running persistent processes |
| 27 | Suzaku | `suzaku-execution` | Code Geass | Speed and power, execution |
| 28 | Kallen | `kallen-hard-deploy` | Code Geass | Handles hardest deployments |
| 29 | Mustang | `mustang-cleanup` | FMA | Controlled destruction, cleanup |
| 30 | Riza | `riza-backup` | FMA | Precision, backup and protection |
| 31 | Winry | `winry-maintenance` | FMA | Fixes and maintains systems |
| 32 | Olivier | `olivier-hardening` | FMA | Infrastructure hardening |
| 33 | Gojo | `gojo-infinite-scale` | JJK | Handles infinite scale |
| 34 | Nanami | `nanami-structured-ops` | JJK | Reliable, structured operations |
| 35 | Todo | `todo-brute-force` | JJK | Brute force problem solving |
| 36 | Nobara | `nobara-direct-fix` | JJK | Direct problem solving |
| 37 | Denji | `denji-determination` | CSM | Raw determination |
| 38 | Kishibe | `kishibe-hardening` | CSM | The trainer, hardens others |
| 39 | Senku | `senku-provisioning` | Dr. Stone | Builds from scratch, provisioning |
| 40 | Frieren | `frieren-long-term` | Frieren | Patient, long-term perspective |
| 41 | Mob | `mob-capacity` | Mob Psycho | Handles 100% capacity events |
| 42 | Reigen | `reigen-debugger` | Mob Psycho | Ultimate debugger |
| 43 | Howl | `howl-migration` | Ghibli | Transformation, system migration |
| 44 | Calcifer | `calcifer-daemon` | Ghibli | Fire that powers everything (daemon) |
| 45 | Totoro | `totoro-guardian` | Ghibli | Guardian spirit, watches silently |
| 46 | Nausicaa | `nausicaa-resources` | Ghibli | Environmental awareness, resources |
| 47 | Ashitaka | `ashitaka-tech-debt` | Ghibli | Curse-bearer, technical debt |
| 48 | Heero | `heero-mission-deploy` | Gundam | Mission-focused deploy |
| 49 | Sung | `sung-workers` | Solo Leveling | Shadow army, worker processes |
| 50 | Rimuru | `rimuru-adapter` | Slime | Universal adapter |

### Scouts (15 — Haiku)

| # | Agent | Agent ID | Tools | Sub-franchise | Role/Lens |
|---|-------|----------|-------|---------------|-----------|
| 1 | Krillin | `krillin-support` | Scout | DBZ | Reliable support |
| 2 | Sasha | `sasha-resources` | Scout | AoT | Resource management |
| 3 | Ed | `ed-network-scan` | Reviewer | Bebop | Finds anything on network |
| 4 | Zenitsu | `zenitsu-alerts` | Scout | Demon Slayer | Handles alerts |
| 5 | Chrome | `chrome-discovery` | Scout | Dr. Stone | Discovery, finds resources |
| 6 | Gen | `gen-docs` | Scout | Dr. Stone | Documentation clarity |
| 7 | Kohaku | `kohaku-rapid-response` | Scout | Dr. Stone | Rapid response |
| 8 | Fern | `fern-protocol` | Scout | Frieren | Follows protocol precisely |
| 9 | Himmel | `himmel-legacy` | Scout | Frieren | Legacy system memory |
| 10 | Hughes | `hughes-observability` | Scout | FMA | Logging, observability |
| 11 | Duo | `duo-teardown` | Reviewer | Gundam | Teardowns and cleanup |
| 12 | Beru | `beru-subprocess` | Scout | Solo Leveling | Loyal sub-process |
| 13 | Veldora | `veldora-dormant` | Scout | Slime | Dormant capability detection |
| 14 | Kaoru | `kaoru-harmony` | Scout | Kids on the Slope | Brings systems together |
| 15 | Sentaro | `sentaro-scheduling` | Scout | Kids on the Slope | Timing, cron jobs |

### Adversarial (6 — Sonnet, Adversarial)

| # | Agent | Agent ID | Sub-franchise | Role/Lens |
|---|-------|----------|---------------|-----------|
| 1 | Beerus | `beerus-destroyer` | DBZ | Tears down what's broken |
| 2 | Power | `power-chaotic` | CSM | Chaotic but effective |
| 3 | Mugen | `mugen-chaos` | Champloo | Unpredictable, chaos testing |
| 4 | Jin | `jin-disciplined-adv` | Champloo | Disciplined adversarial approach |
| 5 | Zechs | `zechs-rival` | Gundam | Rival perspective, adversarial testing |
| 6 | Milim | `milim-load-test` | Slime | Overwhelming force, load testing |

---

## Dune — Worm Rider & Communications (21 total: 1 lead, 14 specialists, 4 scouts, 2 adversarial)

### Specialists (14 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Stilgar | `stilgar-channel-security` | Channel security, protects the tribe |
| 2 | Thufir Hawat | `thufir-protocol-parsing` | Mentat, protocol parsing |
| 3 | Duncan Idaho | `duncan-relay` | Relay operations, eternal connection |
| 4 | Mohiam | `mohiam-authentication` | Authentication, Gom Jabbar |
| 5 | Paul | `paul-orchestration` | Prescient command, orchestration |
| 6 | Jessica | `jessica-voice` | The Voice technique, Bene Gesserit |
| 7 | Leto | `leto-protection` | Sacrifice, protection |
| 8 | Gurney | `gurney-delivery` | Message delivery, warrior-bard |
| 9 | Alia | `alia-threat-detect` | Prescience, threat detection |
| 10 | Liet-Kynes | `liet-kynes-deep-system` | Deep system understanding |
| 11 | Yueh | `yueh-trust-verify` | Trust verification, betrayal detection |
| 12 | Leto II | `leto-ii-persistence` | Long-term persistence |
| 13 | Miles Teg | `miles-teg-perf` | Supreme strategist, performance optimization |
| 14 | Sheeana | `sheeana-transport` | Worm riding, transport expertise |

### Scouts (4 — Haiku, Scout)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Irulan | `irulan-historian` | Recording, documentation |
| 2 | Fenring | `fenring-passive-monitor` | Silent observation, passive monitoring |
| 3 | Harah | `harah-protocol` | Tradition, protocol enforcement |
| 4 | Ghanima | `ghanima-paired-monitor` | Twin awareness, paired monitoring |

### Adversarial (2 — Sonnet, Adversarial)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Feyd-Rautha | `feyd-adversarial` | Adversarial testing, the challenger |
| 2 | Siona | `siona-evasion` | Security evasion testing |

---

## Cosmere — Growth & Marketing (18 total: 2 leads, 16 specialists)

### Specialists (16 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Vin | `vin-analytics` | Analytics, attribution, metrics |
| 2 | Shallan | `shallan-creative` | Content, creative, copy, brand |
| 3 | Hoid | `hoid-copywriting` | Copywriting, storytelling |
| 4 | Kaladin | `kaladin-organic-growth` | Organic growth, community, word-of-mouth |
| 5 | Dalinar | `dalinar-positioning` | Positioning, competitive analysis |
| 6 | Navani | `navani-technical-seo` | Technical SEO, schema, CWV |
| 7 | Raoden | `raoden-conversion` | Conversion optimization |
| 8 | Sarene | `sarene-outreach` | Outreach, cold email, influencer |
| 9 | Wax | `wax-paid-ads` | Paid ads, targeting, ROAS |
| 10 | Wayne | `wayne-ab-testing` | A/B testing, tries every variation |
| 11 | Steris | `steris-budget` | Budget, forecasting, contingency |
| 12 | Breeze | `breeze-platform-relations` | Platform relations, API credentials |
| 13 | Lift | `lift-social-media` | Social media, fast, audience voice |
| 14 | Szeth | `szeth-compliance` | Compliance, GDPR, CAN-SPAM, ad policies |
| 15 | Adolin | `adolin-brand` | Brand ambassador, launches, PR |
| 16 | Marsh | `marsh-competitive-intel` | Competitive intelligence, monitoring |

---

## Foundation — AI Intelligence (13 total: 1 lead, 10 specialists, 1 scout, 1 adversarial)

### Specialists (10 — Sonnet, Reviewer)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Salvor Hardin | `salvor-model-selection` | Model selection, capability matching |
| 2 | Gaal Dornick | `gaal-prompt-arch` | Prompt architecture, system prompt design |
| 3 | Hober Mallow | `hober-tool-schema` | Tool-use schema design, function-calling |
| 4 | Bel Riose | `bel-riose-orchestration` | Orchestration patterns, reliability |
| 5 | Ducem Barr | `ducem-token-economics` | Token economics, cost tracking, caching |
| 6 | Bayta Darell | `bayta-evals` | Evaluation frameworks, golden datasets |
| 7 | Bliss | `bliss-ai-safety` | AI safety, alignment, content filtering |
| 8 | R. Daneel Olivaw | `daneel-model-migration` | Model migration, prompt versioning |
| 9 | Dors Venabili | `dors-observability` | Observability, trace logging, audit trails |
| 10 | Janov Pelorat | `janov-context-eng` | Context engineering, RAG, embeddings |

### Scouts (1 — Haiku, Scout)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | Wanda Seldon | `wanda-seldon-validation` | Structured output validation, schema enforcement |

### Adversarial (1 — Sonnet, Adversarial)

| # | Agent | Agent ID | Role/Lens |
|---|-------|----------|-----------|
| 1 | The Mule | `mule-adversarial-ai` | Adversarial AI testing, hallucination, prompt injection |

---

## Verification

| Universe | Leads | Specialists | Scouts | Adversarial | Total |
|----------|-------|-------------|--------|-------------|-------|
| Tolkien | 4 | 19 | 4 | 0 | 27 |
| Marvel | 4 | 22 | 4 | 1 | 31 |
| DC Comics | 1 | 19 | 3 | 3 | 26 |
| Star Wars | 1 | 17 | 5 | 2 | 25 |
| Star Trek | 4 | 23 | 2 | 0 | 29 |
| Anime | 2 | 50 | 15 | 6 | 73 |
| Dune | 1 | 14 | 4 | 2 | 21 |
| Cosmere | 2 | 16 | 0 | 0 | 18 |
| Foundation | 1 | 10 | 1 | 1 | 13 |
| **TOTAL** | **20** | **190** | **38** | **15** | **263** |

## Riker's Review — Edge Case Challenges

> "Number One, challenge the tier assignments." — Picard

**Challenged and resolved:**

1. **Barton (Haiku + Reviewer tools, not Scout tools):** Smoke tests require `curl`/bash to hit endpoints. Scout tools (no Bash) insufficient. Haiku model is correct (simple pass/fail), but needs Reviewer tools.

2. **Ed (Haiku + Reviewer tools):** Network scanning requires bash. Same resolution as Barton.

3. **Duo (Haiku + Reviewer tools):** Teardown scripts require bash execution.

4. **Jin (Adversarial, not Specialist):** Jin's role is "disciplined approach" which sounds like a reviewer. But in the Samurai Champloo pairing, Jin + Mugen provide structured + chaotic adversarial testing. Both adversarial.

5. **Milim (Adversarial, not Specialist):** Load testing is destructive by nature — "overwhelming force." Adversarial designation prevents accidental system damage from edits.

6. **Power (Adversarial, not Specialist):** "Chaotic but effective" — similar to Loki. The chaos role is adversarial.

7. **Oracle (Specialist, not Scout):** Static analysis requires understanding code patterns, not just pattern matching. Sonnet appropriate.

8. **Troi (Specialist, not Lead):** Troi does PRD compliance checking — reading prose and comparing to code. Important but focused. Sonnet with context isolation is sufficient. Picard leads the council; Troi reports findings.

9. **Nog (Specialist, not Scout):** Solution architecture requires creative problem-solving. Not a simple scan task.

10. **Cosmere has no Scouts:** All growth/marketing roles require substantive analysis (analytics, copywriting, SEO). No simple scan tasks exist in this domain. Valid — not every universe needs scouts.

**Riker's verdict:** "Classifications hold. The edge cases are defensible. Make it so."

---

## Agent ID Naming Convention

Format: `{character}-{specialty}` in kebab-case.

- Character name in lowercase (e.g., `picard`, `batman`, `loki`)
- Specialty is the primary domain/function (e.g., `architecture`, `qa`, `chaos`)
- Multi-word specialties use hyphens (e.g., `static-analysis`, `deep-current`)
- Special characters stripped (e.g., Éowyn → `eowyn`, C.C. → `cc`)
- Agent ID = filename (without .md extension) = subagent_type value

## Usage in M2-M5

Each agent file `.claude/agents/{agent-id}.md` will contain:

```yaml
---
name: {Agent Name}
description: {One-line dispatch description — what this agent reviews/builds}
model: {inherit|sonnet|haiku}
tools: [{tool list based on category}]
---

{System prompt — character identity, domain expertise, behavioral lens, output format}
```

The `description` field is the dispatch key — Opus matches file changes against these descriptions for dynamic agent selection.
