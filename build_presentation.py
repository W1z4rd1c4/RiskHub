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
    ("dashboard_operational_insight.png", "Manažerský Přehled", "KPI karty a control analytics v reálném čase."),
    ("workflow_pending_queue.png", "Schvalovací Workflow", "Fronta požadavků čekajících na schválení."),
    ("control_definition.png", "Definice Kontroly", "Průvodce vytvořením nové kontroly v 5 krocích."),
    ("risk_register.png", "Registr Rizik", "Heatmapy a scoring dle standardu OS 18."),
    ("risk_appetite_kri.png", "KRI Detail", "Indikátory s nastavenými limity."),
    ("governance_oversight.png", "Governance Oversight", "Detekce osiřelých položek."),
    ("audit_trail.png", "Auditní Stopa", "Kompletní historie změn a exekucí."),
    ("user_management.png", "Správa Uživatelů", "Role a organizační struktura."),
    ("control_details_execution.png", "Detail Kontroly", "Vazby na rizika a historie."),
    ("risk_assessment_details.png", "Posouzení Rizika", "Detailní scoring a dopady."),
    ("risk_appetite_details.png", "Rizikový Apetit", "Strategické nastavení apetitu."),
    ("governance_uncategorised.png", "Nekategorizované", "Items requiring classification."),
    ("risk_appetite_list.png", "Seznam KRI", "Přehled všech indikátorů."),
    ("departments_overview.png", "Oddělení", "Statistiky po divizích."),
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
    <div class="gallery-item" onclick="openModal('{b64}')">
        <img src="{b64}" alt="{title}" loading="lazy">
        <div class="gallery-caption">
            <h3>{title}</h3>
            <p>{desc}</p>
        </div>
    </div>
    """

HTML_CONTENT = f"""<!DOCTYPE html>
<html lang="cs" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RiskHub - Slavia Pojišťovna Edition</title>
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
                            red: '#e11d2b', // Approx Slavia red
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
        body {{
            background-color: #020617;
            color: #f8fafc;
        }}
        .glass {{
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }}
        .text-gradient {{
            background: linear-gradient(to right, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
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
        /* Gallery */
        .gallery-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
        }}
        .gallery-item {{
            position: relative;
            border-radius: 1rem;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.1);
            transition: transform 0.3s ease, border-color 0.3s ease;
            cursor: pointer;
            aspect-ratio: 16/10;
        }}
        .gallery-item:hover {{
            transform: translateY(-5px);
            border-color: #e11d2b;
            box-shadow: 0 10px 30px rgba(225, 29, 43, 0.2);
        }}
        .gallery-item img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.5s ease;
        }}
        .gallery-item:hover img {{
            transform: scale(1.05);
        }}
        .gallery-caption {{
            position: absolute;
            bottom: 0; left: 0; right: 0;
            padding: 1.5rem 1rem 1rem;
            background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
            transform: translateY(100%);
            transition: transform 0.3s ease;
        }}
        .gallery-item:hover .gallery-caption {{
            transform: translateY(0);
        }}
        /* Timeline */
        .timeline-item {{
            position: relative;
            padding-left: 2.5rem;
            padding-bottom: 2rem;
            border-left: 2px solid rgba(255,255,255,0.1);
        }}
        .timeline-item:last-child {{ border-left: none; }}
        .timeline-dot {{
            position: absolute;
            left: -0.6rem;
            top: 0;
            width: 1.2rem;
            height: 1.2rem;
            border-radius: 50%;
            background: #020617;
            border: 2px solid #22c55e; /* Green for done */
        }}
        .timeline-dot.future {{ border-color: #64748b; }}
        
        /* Modal */
        #imgModal {{
            opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }}
        #imgModal.open {{
            opacity: 1; pointer-events: auto;
        }}
    </style>
</head>
<body class="antialiased selection:bg-slavia-red selection:text-white">
    <div class="mesh-bg"></div>

    <!-- Nav -->
    <nav class="fixed top-0 w-full z-50 glass px-8 py-4 flex justify-between items-center">
        <div class="font-display font-bold text-2xl tracking-tight text-white flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-slavia-red"></div>
            RiskHub <span class="opacity-50 font-normal text-sm ml-2">Enterprise</span>
        </div>
        <div class="hidden md:flex gap-8 text-sm font-medium text-slate-400">
            <a href="#gallery" class="hover:text-white transition">Ukázka</a>
            <a href="#arch" class="hover:text-white transition">Architektura</a>
            <a href="#roadmap" class="hover:text-white transition">Roadmapa</a>
            <a href="#author" class="hover:text-white transition">Autor</a>
        </div>
        <a href="#contact" class="bg-slavia-red hover:bg-red-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition shadow-[0_0_20px_rgba(225,29,43,0.3)]">
            Implementovat
        </a>
    </nav>

    <!-- Hero -->
    <header class="min-h-screen flex items-center justify-center relative px-6 pt-20 overflow-hidden">
        <div class="max-w-7xl w-full grid lg:grid-cols-2 gap-12 items-center">
            <div class="space-y-8 z-10"   >
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs font-mono text-slavia-red">
                    <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    v1.0 STABLE RELEASE
                </div>
                <h1 class="text-5xl lg:text-7xl font-display font-bold leading-[1.1]">
                    Bezpečnost <br>
                    <span class="text-gradient-red">Bez Kompromisů.</span>
                </h1>
                <p class="text-lg text-slate-400 max-w-lg leading-relaxed">
                    Nová generace řízení rizik pro pojišťovny. Centralizace dat, real-time monitoring a governance standardy OS 18 v jednom prémiovém rozhraní.
                </p>
                <div class="flex flex-col sm:flex-row gap-4 pt-4">
                    <a href="#gallery" class="px-8 py-4 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition text-center">
                        Prohlédnout Aplikaci
                    </a>
                    <div class="px-8 py-4 glass rounded-xl flex items-center gap-3">
                        <div class="flex -space-x-3">
                            <div class="w-8 h-8 rounded-full bg-slate-700 border-2 border-black"></div>
                            <div class="w-8 h-8 rounded-full bg-slate-600 border-2 border-black"></div>
                            <div class="w-8 h-8 rounded-full bg-slate-500 border-2 border-black"></div>
                        </div>
                        <span class="text-sm font-medium text-slate-300">Používáno risk manažery</span>
                    </div>
                </div>
                
                <!-- Author Badge -->
                <div class="pt-8 border-t border-slate-800/50 flex items-center gap-4">
                    <div class="text-right">
                        <p class="text-xs text-slate-500 uppercase tracking-widest">Created By</p>
                        <p class="font-display font-bold text-white">Stefan Lesnak</p>
                    </div>
                    <div class="h-10 w-[1px] bg-slate-800"></div>
                    <div>
                        <p class="text-xs text-slate-500 uppercase tracking-widest">Methodology</p>
                        <p class="font-display font-bold text-slavia-red">Systematic Vibe Coding</p>
                    </div>
                </div>
            </div>
            
            <div class="relative group perspective-1000">
                <div class="absolute -inset-4 bg-slavia-red/20 blur-[100px] rounded-full group-hover:bg-slavia-red/30 transition duration-1000"></div>
                <img src="{hero_src}" alt="RiskHub Shield" 
                     class="relative w-full rounded-2xl shadow-2xl border border-slate-800 transform rotate-y-12 rotate-x-6 group-hover:rotate-0 transition duration-700 ease-out">
            </div>
        </div>
    </header>

    <!-- Gallery Section -->
    <section id="gallery" class="py-32 px-6">
        <div class="max-w-7xl mx-auto space-y-12">
            <div class="text-center space-y-4">
                <span class="text-slavia-red font-mono text-sm tracking-widest uppercase">Visual Proof</span>
                <h2 class="text-4xl md:text-5xl font-display font-bold">Rozhraní nové generace</h2>
                <p class="text-slate-400 max-w-2xl mx-auto">
                    Zapomeňte na Excel. RiskHub přináší konzistentní design system, dark mode a UX optimalizované pro efektivitu.
                </p>
            </div>
            
            <div class="gallery-grid">
                {screenshots_html}
            </div>
        </div>
    </section>

    <!-- Architecture Section -->
    <section id="arch" class="py-32 px-6 bg-slate-900/30 border-y border-white/5">
        <div class="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div class="order-2 lg:order-1 relative">
                <img src="{arch_src}" alt="Architecture Viz" class="rounded-2xl shadow-2xl border border-white/10">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-2xl"></div>
                <div class="absolute bottom-6 left-6 font-mono text-xs text-green-400">
                    <div>> STATUS: OPERATIONAL</div>
                    <div>> UPTIME: 99.99%</div>
                    <div>> SYNC: ACTIVE DIRECTORY CONNECTED</div>
                </div>
            </div>
            
            <div class="order-1 lg:order-2 space-y-8">
                <div>
                    <span class="text-blue-500 font-mono text-sm tracking-widest uppercase">Under the Hood</span>
                    <h2 class="text-4xl font-display font-bold mt-2">Robustní Architektura</h2>
                </div>
                
                <div class="space-y-6">
                    <div class="glass p-6 rounded-xl hover:border-blue-500/50 transition">
                        <h3 class="text-xl font-bold mb-2 flex items-center gap-2">
                            <span class="text-yellow-400">⚡</span> Backend Core
                        </h3>
                        <p class="text-slate-400 text-sm leading-relaxed">
                            Postaveno na <strong>FastAPI (Python 3.13)</strong> s plnou podporou async/await. 
                            Využívá <strong>PostgreSQL</strong> pro perzistenci a Pydantic V2 pro striktní validaci dat.
                        </p>
                    </div>

                    <div class="glass p-6 rounded-xl hover:border-cyan-500/50 transition">
                        <h3 class="text-xl font-bold mb-2 flex items-center gap-2">
                            <span class="text-cyan-400">⚛️</span> Modern Frontend
                        </h3>
                        <p class="text-slate-400 text-sm leading-relaxed">
                            <strong>React 19 + Vite</strong> zajišťují bleskovou odezvu. 
                            Design system postavený na <strong>Tailwind CSS</strong> a Shadcn/UI s důrazem na glassmorphism.
                        </p>
                    </div>

                    <div class="glass p-6 rounded-xl hover:border-slavia-red/50 transition">
                        <h3 class="text-xl font-bold mb-2 flex items-center gap-2">
                            <span class="text-slavia-red">🔄</span> AD Integration
                        </h3>
                        <p class="text-slate-400 text-sm leading-relaxed">
                            Standalone mikroslužba <strong>AD Emulator</strong> simuluje podnikovou Active Directory. 
                            Plná synchronizace uživatelů, rolí a detekce osiřelých účtů (Governance).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Roadmap & Author -->
    <section id="roadmap" class="py-32 px-6">
        <div class="max-w-4xl mx-auto">
            <div class="text-center mb-16">
                <span class="text-green-500 font-mono text-sm tracking-widest uppercase">Execution Log</span>
                <h2 class="text-4xl font-display font-bold mt-2">Cesta Projektu</h2>
                <p class="text-slate-400 mt-4">15 fází dokončeno v rekordním čase díky Systematic Vibe Coding.</p>
            </div>

            <div class="glass p-8 md:p-12 rounded-3xl">
                <div class="space-y-0">
                    <!-- Phases -->
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <h4 class="font-bold text-lg">Fáze 1-6: Foundation & Core</h4>
                        <p class="text-slate-400 text-sm mt-1">Setup, Control Catalog, Risk Register, KRI, Dashboards.</p>
                        <span class="text-xs font-mono text-green-500 mt-2 block">DONE: 26.12.2025</span>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <h4 class="font-bold text-lg">Fáze 7-9: Security & Workflow</h4>
                        <p class="text-slate-400 text-sm mt-1">RBAC, Permission Filtering, Notifikace.</p>
                        <span class="text-xs font-mono text-green-500 mt-2 block">DONE: 28.12.2025</span>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <h4 class="font-bold text-lg">Fáze 90 & 99: Integration</h4>
                        <p class="text-slate-400 text-sm mt-1">AD Emulator, Data Migration, Governance.</p>
                        <span class="text-xs font-mono text-green-500 mt-2 block">DONE: 29.12.2025</span>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-dot future rounded-none border border-green-500 bg-green-500/20"></div>
                        <h4 class="font-bold text-white text-lg">Fáze 100: Marketing Presentation</h4>
                        <p class="text-slate-300 text-sm mt-1">Slavia Pojišťovna Board Pitch.</p>
                        <span class="text-xs font-mono text-slavia-red mt-2 block animate-pulse">>>> CURRENT STATUS</span>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Author Section -->
    <section id="author" class="py-20 px-6 border-t border-white/5 bg-gradient-to-b from-slate-900 to-black">
        <div class="max-w-3xl mx-auto text-center space-y-8">
            <h2 class="text-3xl font-display font-bold">O Projektu</h2>
            <div class="glass p-8 rounded-2xl border-t-2 border-slavia-red relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-32 h-32 bg-slavia-red/20 blur-[50px] rounded-full"></div>
                
                <p class="text-lg text-slate-300 leading-relaxed italic">
                    "Tento projekt vznikl během vánočního hackathonu 2025 (25.-29. prosince). 
                    Demonstruje sílu metodologie <strong>Systematic Vibe Coding</strong> – spojení lidské kreativity 
                    a AI orchestrace pro rapidní vývoj enterprise softwaru."
                </p>
                <div class="mt-8 flex items-center justify-center gap-4">
                    <div class="text-right">
                        <div class="font-bold text-white">Stefan Lesnak</div>
                        <div class="text-xs text-slate-500">Lead Engineer</div>
                    </div>
                    <div class="h-8 w-px bg-slate-700"></div>
                    <div class="text-left">
                        <div class="font-bold text-white">Claude 3.5 Sonnet</div>
                        <div class="text-xs text-slate-500">AI Co-Pilot</div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="py-12 text-center text-slate-600 text-sm">
        <p>&copy; 2025 Slavia Pojišťovna | RiskHub Enterprise</p>
        <p class="mt-2">Designed with Silicon Valley Standards.</p>
    </footer>

    <!-- Image Modal -->
    <div id="imgModal" class="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4" onclick="closeModal()">
        <img id="modalImg" src="" class="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-white/10">
        <div class="absolute top-4 right-4 text-white/50 hover:text-white cursor-pointer" onclick="closeModal()">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </div>
    </div>

    <script>
        function openModal(src) {{
            document.getElementById('modalImg').src = src;
            document.getElementById('imgModal').classList.add('open');
        }}
        function closeModal() {{
            document.getElementById('imgModal').classList.remove('open');
        }}
        
        // Keydown escape to close
        document.addEventListener('keydown', function(event) {{
            if (event.key === "Escape") {{
                closeModal();
            }}
        }});
    </script>
</body>
</html>
"""

# Write File
output_path = "presentation.html"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(HTML_CONTENT)

print(f"Presentation generated at {output_path} with {len(SCREENSHOTS_ORDER)} screenshots.")
