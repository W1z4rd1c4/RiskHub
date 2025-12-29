import base64
import os
import glob

# Paths
SCREENSHOTS_DIR = ".planning/phases/100-marketing"
GENERATED_DIR = "/Users/stefanlesnak/.gemini/antigravity/brain/abd7c3af-113a-4fca-bdee-fcec132b4328"

# Images mapping
IMAGES = {
    "hero": os.path.join(SCREENSHOTS_DIR, "hero_shield.png"),
    "arch": os.path.join(SCREENSHOTS_DIR, "architecture_viz.png"),
}

SCREENSHOTS_ORDER = [
    ("dashboard_operational_insight.png", "Manažerský Přehled (Operational Insight)", 
     "Centrální mozek aplikace RiskHub. Poskytuje okamžitý vhled do celkového stavu rizikového profilu organizace. "
     "Klíčové metriky zahrnují počet aktivních kontrol, kritická rizika a průměrné skóre rizikovosti. "
     "Grafická část zobrazuje distribuci kontrol podle stavu (aktivní/neaktivní), formy (manuální/automatické) a frekvence provádění."),
    
    ("risk_register.png", "Centrální Registr Rizik", 
     "Kompletní evidence všech identifikovaných rizik v organizaci. Systém podporuje kategorizaci dle procesů a oblastí. "
     "Každé riziko je ohodnoceno pomocí Gross (hrubého) a Net (čistého) skóre, což umožňuje sledovat efektivitu zmírňujících opatření. "
     "Umožňuje přehledné filtrování a vyhledávání v celém rizikovém portfoliu."),

    ("risk_assessment_details.png", "Detailní Posouzení Rizika", 
     "Interaktivní modul pro kvantifikaci a vizualizaci rizik. Obsahuje heatmapu rizikovosti, kde lze přehledně sledovat posun mezi "
     "inherentním a reziduálním rizikem. Umožňuje přesné nastavení pravděpodobnosti a dopadu pro objektivní scoring."),

    ("control_definition.png", "Definice Kontrolního Mechanismu", 
     "Tento 5-krokový průvodce (Wizard) zajišťuje standardizaci při zavádění nových kontrol. "
     "Uživatel definuje identitu kontroly, vlastníka, způsob exekuce, vazbu na rizika a metodu ověřování. "
     "Tato struktura zaručuje, že žádná kontrola nebude zavedena bez jasného účelu a odpovědnosti."),

    ("control_details_execution.png", "Detail a Exekuce Kontroly", 
     "Komplexní pohled na konkrétní kontrolu včetně její historie a frekvence. "
     "Zahrnuje přehled zmírňovaných rizik a auditní stopu posledních exekucí se stavem (Passed/Failed). "
     "Umožňuje přímé logování výkonu kontroly pro potřeby auditu."),

    ("risk_appetite_kri.png", "Klíčové Indikátory Rizik (KRI)", 
     "Systém včasného varování. Pro každé riziko lze definovat metriky (KRI), které v reálném čase sledují vývoj kritických parametrů. "
     "Vizuální indikátory okamžitě upozorní na překročení definovaných limitů (Tolerance vs. Breach)."),

    ("risk_appetite_list.png", "Seznam a Monitoring Indikátorů", 
     "Přehled všech KRI v rámci organizace s aktuálními hodnotami a stavy. "
     "Umožňuje rychlou filtraci a identifikaci oblastí, které vyžadují pozornost managementu z důvodu porušení rizikového apetitu."),

    ("risk_appetite_details.png", "Detail Rizikového Apetitu", 
     "Propojení strategických cílů s operativní realitou. Zde se definují limity pro jednotlivé metriky "
     "a zobrazují se všechny mitigující kontroly, které mají za úkol udržet riziko v požadovaných mezích."),

    ("governance_oversight.png", "Governance Oversight - Osiřelé Položky", 
     "Modul pro správu kontinuity. Automaticky detekuje rizika, kontroly a KRI, které ztratily svého vlastníka "
     "(např. po odchodu zaměstnance). Zajišťuje, že v systému nezůstávají nekontrolované oblasti."),

    ("governance_uncategorised.png", "Governance - Správa Nekategorizovaných Dat", 
     "Udržuje integritu datového modelu. Identifikuje položky bez jasného zařazení do organizační struktury "
     "nebo procesního modelu a vynucuje jejich správu administrativním zásahem."),

    ("workflow_pending_queue.png", "Schvalovací Workflow", 
     "Zajišťuje integritu kritických operací. Smazání nebo významná změna rizika/kontroly vyžaduje schválení nadřízeným "
     "nebo oddělením Risk Managementu. Všechny požadavky jsou transparentně evidovány ve frontě."),

    ("audit_trail.png", "Globální Auditní Stopa", 
     "Nezpochybnitelný záznam o všech událostech v systému. Sleduje kdo, kdy a co provedl. "
     "Nezbytný nástroj pro interní audit a externí regulátory pro prokázání souladu se zákonnými požadavky."),

    ("user_management.png", "Správa Uživatelů a Rolí (RBAC)", 
     "Pokročilé řízení přístupů. Role-Based Access Control zajišťuje, že uživatelé vidí a spravují pouze "
     "data relevantní pro jejich roli a oddělení. Plně integrované s Active Directory."),

    ("departments_overview.png", "Přehled Organizační Struktury", 
     "Analytický pohled na rizikovost po jednotlivých odděleních. Umožňuje srovnání výkonnosti control-landscape "
     "napříč společností a identifikaci slabých míst v organizaci."),
]

def get_b64(path):
    try:
        with open(path, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return "" # Return empty or placeholder

# Load Images
print("Loading images...")
hero_src = get_b64(IMAGES["hero"])
arch_src = get_b64(IMAGES["arch"])

screenshots_html = ""
for filename, title, desc in SCREENSHOTS_ORDER:
    path = os.path.join(SCREENSHOTS_DIR, filename)
    b64 = get_b64(path)
    screenshots_html += f"""
    <div class="page-break-inside-avoid mb-16 space-y-4">
        <div class="gallery-item-static shadow-2xl border border-white/10 rounded-2xl overflow-hidden bg-slate-900/50">
            <img src="{b64}" alt="{title}" class="w-full h-auto">
        </div>
        <div class="px-2">
            <h3 class="text-2xl font-display font-bold text-white mb-2">{title}</h3>
            <p class="text-slate-400 leading-relaxed text-sm md:text-base">{desc}</p>
        </div>
    </div>
    """

HTML_CONTENT = f"""<!DOCTYPE html>
<html lang="cs" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RiskHub - Slavia Pojišťovna Edition (PDF Export Ready)</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;700;900&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {{
            theme: {{
                extend: {{
                    colors: {{
                        slavia: {{
                            red: '#e11d2b',
                            dark: '#0f172a',
                            blue: '#1e3a8a',
                        }}
                    }},
                    fontFamily: {{
                        sans: ['Inter', 'sans-serif'],
                        display: ['Outfit', 'sans-serif'],
                    }}
                }}
            }}
        }}
    </script>
    <style>
        @media print {{
            .no-print {{ display: none !important; }}
            .page-break-before {{ page-break-before: always; }}
            .page-break-inside-avoid {{ page-break-inside: avoid; }}
            body {{ background-color: white !important; color: black !important; }}
            .glass {{ background: white !important; border: 1px solid #ddd !important; color: black !important; }}
            .text-slate-400 {{ color: #444 !important; }}
            .text-white {{ color: black !important; }}
            .mesh-bg {{ display: none !important; }}
            .bg-slavia-red {{ background-color: #e11d2b !important; print-color-adjust: exact; }}
            .text-slavia-red {{ color: #e11d2b !important; }}
            header {{ min-height: 0 !important; padding-top: 2rem !important; }}
            .hero-image-container {{ transform: none !important; }}
            .gallery-item-static {{ border: 1px solid #eee !important; }}
        }}
        body {{
            background-color: #020617;
            color: #f8fafc;
        }}
        .glass {{
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }}
        .text-gradient-red {{
            background: linear-gradient(to right, #fff, #e11d2b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .mesh-bg {{
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;
            background: 
                radial-gradient(circle at 15% 15%, rgba(225, 29, 43, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 85% 85%, rgba(30, 58, 138, 0.08) 0%, transparent 40%);
        }}
    </style>
</head>
<body class="antialiased selection:bg-slavia-red selection:text-white">
    <div class="mesh-bg"></div>

    <!-- Nav -->
    <nav class="fixed top-0 w-full z-50 glass px-8 py-4 flex justify-between items-center no-print">
        <div class="font-display font-bold text-2xl tracking-tight text-white flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-slavia-red"></div>
            RiskHub <span class="opacity-50 font-normal text-sm ml-2 font-sans tracking-normal">Board Presentation</span>
        </div>
        <div class="hidden md:flex gap-8 text-sm font-medium text-slate-400">
            <a href="#gallery" class="hover:text-white transition">Funkce</a>
            <a href="#arch" class="hover:text-white transition">Technologie</a>
            <a href="#history" class="hover:text-white transition">Vývoj</a>
        </div>
        <button onclick="window.print()" class="bg-slavia-red hover:bg-red-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition">
            Export do PDF
        </button>
    </nav>

    <!-- Hero -->
    <header class="min-h-screen flex items-center justify-center relative px-6 pt-24 pb-12 overflow-hidden">
        <div class="max-w-7xl w-full grid lg:grid-cols-2 gap-12 items-center">
            <div class="space-y-8 z-10">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-[10px] font-mono text-slavia-red uppercase tracking-widest">
                    <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Production Ready v1.0
                </div>
                <h1 class="text-5xl lg:text-7xl font-display font-bold leading-[1.1]">
                    Bezpečnost <br>
                    <span class="text-gradient-red">Bez Kompromisů.</span>
                </h1>
                <p class="text-lg text-slate-400 max-w-lg leading-relaxed">
                    Nová generace řízení rizik pro <strong>Slavia Pojišťovnu</strong>. Transparentní governance, 
                    integrovaná automatizace a profesionální nástroje pro risk management.
                </p>
                
                <!-- Author Badge -->
                <div class="pt-8 border-t border-slate-800/50 flex flex-wrap gap-8 items-center">
                    <div>
                        <p class="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Architekt</p>
                        <p class="font-display font-bold text-white text-lg">Stefan Lesnak</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Developer</p>
                        <p class="font-display font-bold text-slavia-red text-lg">Antigravity & Codex</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Metodika</p>
                        <p class="font-display font-bold text-white text-lg">Systematic Vibe Coding</p>
                    </div>
                </div>
            </div>
            
            <div class="hero-image-container relative">
                <img src="{hero_src}" alt="RiskHub Shield" 
                     class="w-full rounded-2xl shadow-2xl border border-slate-800">
            </div>
        </div>
    </header>

    <!-- Architecture Section -->
    <section id="arch" class="py-32 px-6 bg-slate-900/30 border-y border-white/5 page-break-before">
        <div class="max-w-7xl mx-auto space-y-16">
            <div class="grid lg:grid-cols-2 gap-16 items-center">
                <div class="space-y-8">
                    <div>
                        <span class="text-blue-500 font-mono text-sm tracking-widest uppercase">Under the Hood</span>
                        <h2 class="text-4xl font-display font-bold mt-2">Robustní Architektura</h2>
                    </div>
                    
                    <div class="space-y-6">
                        <div class="glass p-6 rounded-xl">
                            <h3 class="text-xl font-bold mb-3 flex items-center gap-2">
                                <span class="text-yellow-400">⚡</span> High-Performance Stack
                            </h3>
                            <p class="text-slate-400 text-sm leading-relaxed">
                                Systém je postaven na moderním asynchronním <strong>FastAPI (Python 3.13)</strong>, 
                                které zajišťuje bleskovou odezvu i při vysokém počtu paralelních požadavků. 
                                Datová vrstva využívá <strong>PostgreSQL</strong> pro maximální integritu a bezpečnost dat.
                            </p>
                        </div>

                        <div class="glass p-6 rounded-xl">
                            <h3 class="text-xl font-bold mb-3 flex items-center gap-2">
                                <span class="text-cyan-400">⚛️</span> Reactive Frontend
                            </h3>
                            <p class="text-slate-400 text-sm leading-relaxed">
                                Uživatelské rozhraní v <strong>React 19</strong> (TypeScript) přináší zážitek úrovně desktopové aplikace. 
                                Díky Vite je zajištěna nízká latence načítání a plynulé animace (Framer Motion).
                            </p>
                        </div>
                    </div>
                </div>
                <div class="relative">
                    <img src="{arch_src}" alt="Architecture Visual" class="rounded-2xl border border-white/10 shadow-2xl">
                </div>
            </div>

            <!-- AD Emulator Content -->
            <div class="glass p-8 md:p-12 rounded-3xl border-l-4 border-slavia-red">
                <h3 class="text-2xl font-display font-bold mb-6">Prozatímní Komponenta: AD Emulator</h3>
                <div class="grid md:grid-cols-2 gap-12 text-slate-300">
                    <div class="space-y-4">
                        <p>
                            Součástí implementace je <strong>AD Emulator</strong> – vyhrazená mikroslužba simulující prostředí 
                            Active Directory. Toto řešení slouží jako <strong>provizorní, ale plně funkční náhrada</strong> 
                            produkčního adresáře.
                        </p>
                    </div>
                    <div class="space-y-4">
                        <p>
                            Umožňuje nám to plně implementovat a verifikovat veškerou Governance logiku, 
                            automatickou synchronizaci uživatelů a přiřazování rolí bez závislosti na 
                            interní IT infrastruktuře ve fázi vývoje a pilotního provozu.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Timeline & Execution -->
    <section id="history" class="py-32 px-6 page-break-before">
        <div class="max-w-4xl mx-auto space-y-16">
            <div class="text-center space-y-4">
                <h2 class="text-4xl font-display font-bold">Vývojový Průběh</h2>
                <p class="text-slate-400">Projektové milníky a rychlost dodávky.</p>
            </div>

            <div class="glass p-10 rounded-3xl space-y-10">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-center py-4 border-b border-white/5">
                    <div>
                        <div class="text-4xl font-black text-white">15+</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Dokončených Fází</div>
                    </div>
                    <div>
                        <div class="text-4xl font-black text-slavia-red">3 Dny</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Čas Exekuce</div>
                    </div>
                    <div>
                        <div class="text-4xl font-black text-white">1</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Architekt</div>
                    </div>
                </div>
                
                <div class="space-y-12">
                    <div class="flex gap-6 group">
                        <div class="text-green-500 font-mono text-sm pt-1">23.12.</div>
                        <div class="flex-1 pb-8 border-l border-white/10 pl-8 relative">
                            <div class="absolute -left-[5px] top-2 w-[10px] h-[10px] rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                            <h4 class="font-bold text-white text-xl">Den 1: Architektura & Foundation</h4>
                            <p class="text-slate-400 text-sm mt-3 leading-relaxed">
                                Inicializace projektu, technologický stack, databázové modely.
                                Základy Risk Registru a Control Catalog.
                            </p>
                        </div>
                    </div>

                    <div class="flex gap-6 group">
                        <div class="text-green-500 font-mono text-sm pt-1">24.12.</div>
                        <div class="flex-1 pb-8 border-l border-white/10 pl-8 relative">
                            <div class="absolute -left-[5px] top-2 w-[10px] h-[10px] rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                            <h4 class="font-bold text-white text-xl">Den 2: Core Features & UI</h4>
                            <p class="text-slate-400 text-sm mt-3 leading-relaxed">
                                Dashboard, KRI monitoring, RBAC. Schvalovací workflow.
                                Premium frontend design s glassmorphism efekty.
                            </p>
                        </div>
                    </div>

                    <div class="flex gap-6 group">
                        <div class="text-slavia-red font-mono text-sm pt-1">25-26.12.</div>
                        <div class="flex-1 pb-4 border-l border-white/10 pl-8 relative">
                            <div class="absolute -left-[5px] top-2 w-[10px] h-[10px] rounded-full bg-slavia-red shadow-[0_0_10px_rgba(225,29,43,0.5)] animate-pulse"></div>
                            <h4 class="font-bold text-white text-xl">Den 3: Integrace & Polish</h4>
                            <p class="text-slate-400 text-sm mt-3 leading-relaxed">
                                AD Emulator, Governance modul, notifikace.
                                Finální testování a příprava prezentace.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Detailed Features Gallery -->
    <section id="gallery" class="py-24 px-6 md:px-12 bg-slate-900/10 page-break-before">
        <div class="max-w-7xl mx-auto space-y-24">
            <div class="text-center space-y-4 mb-20">
                <h2 class="text-4xl md:text-6xl font-display font-bold">Příloha: Screenshoty Aplikace</h2>
                <p class="text-slate-400 max-w-2xl mx-auto text-lg">
                    Vizuální průvodce jednotlivými moduly a funkcemi systému RiskHub.
                </p>
            </div>
            
            <div class="space-y-32">
                {screenshots_html}
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="py-20 text-center border-t border-white/5 bg-slate-900/40">
        <div class="max-w-4xl mx-auto space-y-12">
            <div class="font-display font-bold text-3xl tracking-tight text-white flex items-center justify-center gap-3">
                <div class="w-4 h-4 rounded-full bg-slavia-red"></div>
                RiskHub Enterprise
            </div>
            
            <div class="text-slate-500 text-sm space-y-2">
                <p>&copy; 2025 Slavia Pojišťovna | Autorský projekt</p>
                <p>Navrženo pro standardy Silicon Valley. Implementováno pomocí AI Agentů.</p>
            </div>
        </div>
    </footer>

    <!-- Interactive Layer (hidden in Print) -->
    <div id="imgModal" class="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 no-print opacity-0 pointer-events-none transition-opacity duration-300">
        <img id="modalImg" src="" class="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-white/10">
        <button onclick="closeModal()" class="absolute top-6 right-6 text-white/50 hover:text-white transition">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
    </div>

    <script>
        function openModal(src) {{
            document.getElementById('modalImg').src = src;
            document.getElementById('imgModal').classList.remove('opacity-0', 'pointer-events-none');
        }}
        function closeModal() {{
            document.getElementById('imgModal').classList.add('opacity-0', 'pointer-events-none');
        }}
    </script>
</body>
</html>
"""

# Write File
output_path = "presentation.html"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(HTML_CONTENT)

print(f"Refined PDF-friendly presentation generated at {output_path}")
