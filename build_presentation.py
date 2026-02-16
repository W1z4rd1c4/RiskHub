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
     "Centrální analytický uzel systému RiskHub. Tento modul v reálném čase agreguje data z celého rizikového landscape organizace. "
     "Manažerské pohledy poskytují okamžitou vizualizaci klíčových metrik (KRI), stavu kontrolního prostředí a celkové rizikové expozice. "
     "Díky reaktivním komponentám a asynchronnímu zpracování na backendu má management k dispozici vždy aktuální data pro informované rozhodování, "
     "včetně prediktivních trendů vývoje rizik a efektivity mitigujících opatření."),
    
    ("risk_register.png", "Centrální Registr Rizik", 
     "Robustní úložiště pro systematickou evidenci a kategorizaci veškerých rizik. Systém umožňuje detailní mapování rizik na "
     "organizační strukturu, procesní model a strategické cíle společnosti. Každý záznam obsahuje kompletní historii hodnocení, "
     "vazby na zmírňující kontroly a automaticky generované Net Scoring skóre. Filtrační mechanismy umožňují bleskovou navigaci "
     "tisíci záznamů a identifikaci nejkritičtějších oblastí organizace."),

    ("risk_assessment_details.png", "Kvantitativní Posouzení Rizika", 
     "Interaktivní modul pro precizní scoring pravděpodobnosti a dopadu. Využívá pokročilou heatmapu, která vizualizuje posun mezi "
     "inherentním a reziduálním rizikem po aplikaci kontrolních mechanismů. Systém automaticky přepočítává rizikové skóre "
     "na základě definovaných matic a umožňuje ukládat historické verze posouzení pro sledování vývoje rizika v čase (Time-travel Audit)."),

    ("control_definition.png", "Inteligentní Definice Kontrol", 
     "Standardizovaný 5-krokový průvodce (Wizard) pro návrh a zavádění nových kontrolních mechanismů. "
     "Tato metodika vynucuje definici jasného vlastníka (Owner), frekvence provádění, způsobu exekuce (Automated/Manual) "
     "a přímou vazbu na zmírňovaná rizika. Zajišťuje, že každá investice do bezpečnosti má měřitelný účel a jasnou odpovědnost."),

    ("control_details_execution.png", "Monitoring Exekuce Kontrol", 
     "Detailní náhled na operativní výkonnost konkrétní kontroly. Modul integruje historické záznamy o výkonu (Evidence Logs), "
     "statistiku úspěšnosti (Passed vs. Failed) a přehled všech incidentů, které tato kontrola pomohla zachytit. "
     "Poskytuje nezpochybnitelný důkaz (Audit Proof) o funkčnosti kontrolního landscape pro regulátory a auditory."),

    ("risk_appetite_kri.png", "Monitoring Klíčových Indikátorů (KRI)", 
     "Systém včasného varování (Early Warning System). Umožňuje definovat metriky, které automaticky indikují zvýšení rizikového napětí. "
     "Pro každý indikátor lze nastavit hranice tolerance a kritické limity (Breach Levels). Při jejich překročení systém okamžitě iniciuje "
     "eskalační proces a notifikuje odpovědné manažery, čímž minimalizuje reakční dobu na vznikající hrozby."),

    ("risk_appetite_list.png", "Strategický Přehled KRI", 
     "Agregovaný pohled na všechny rizikové indikátory v rámci organizace. Umožňuje managementu sledovat, zda se společnost "
     "pohybuje v mezích definovaného rizikového apetitu. Barevná vizualizace stavů poskytuje okamžitý 'High-Level' vhled do oblastí, "
     "které vyžadují okamžitý zásah nebo revizi strategie řízení rizik."),

    ("risk_appetite_details.png", "Propojení Strategie a Operativy", 
     "Detailní pohled na rizikový apetit pro konkrétní domény. Zde se definují strategické limity a k nim se přiřazují "
     "všechny relevantní kontrolní mechanismy a KRI. Toto propojení zajišťuje, že každá strategická hranice je hlídána "
     "konkrétními operativními nástroji, čímž vzniká uzavřený kruh řízení (Closed-loop Governance)."),

    ("governance_oversight.png", "Governance: Detekce Osiřelých Dat", 
     "Automatizovaný strážce integrity. Modul kontinuálně skenuje systém a identifikuje rizika, kontroly nebo KRI, které "
     "v důsledku organizačních změn nebo odchodů zaměstnanců ztratily svého odpovědného vlastníka. "
     "Vynucuje rychlé znovupřiřazení a zajišťuje, že žádná riziková oblast nezůstane bez dohledu."),

    ("governance_uncategorised.png", "Taxonomie a Integrita Dat", 
     "Nástroj pro správu datové konzistence. Identifikuje entity, které nejsou správně zařazeny do procesního nebo "
     "organizačního modelu společnosti. Zajišťuje, že rizikový landscape je vždy strukturovaný a reportovatelné, "
     "což je klíčové pro správné fungování automatických agregací a dashboardů."),

    ("workflow_pending_queue.png", "Governance: Schvalovací Workflow", 
     "Bezpečnostní pojistka systému. Kritické operace jako smazání rizika nebo změna nastavení kontroly vyžadují "
     "vícestupňové schválení (4-eyes principle). Všechny požadavky jsou transparentně řazeny do front a doprovázeny "
     "odůvodněním, což eliminuje riziko neautorizovaných změn a zajišťuje integritu datového modelu."),

    ("audit_trail.png", "Forenzní Auditní Stopa", 
     "Kompletní, časově neměnný záznam veškeré aktivity v systému. Každá změna, každé přihlášení a každý feedback "
     "u kontroly je zaznamenán s časovým razítkem a identitou uživatele. Tento modul je klíčovým pilířem pro prokázání "
     "compliance a poskytuje auditorům kompletní dataset pro retrospektivní analýzu událostí."),

    ("user_management.png", "Identita a Přístupy (RBAC)", 
     "Správa uživatelů postavená na principu nejmenšího oprávnění (Least Privilege). Role-Based Access Control "
     "umožňuje precizní nastavení oprávnění pro prohlížení, editaci nebo schvalování dat. Plná integrace s Active Directory "
     "zajišťuje automatickou synchronizaci uživatelů a centrální správu identit v souladu s podnikovými standardy."),

    ("departments_overview.png", "Strukturální Analýza Rizik", 
     "Pohled na rizikovost skrze organizační hierarchii. Umožňuje srovnání rizikové zralosti jednotlivých oddělení "
     "a identifikaci útvarů s nejvyšším přebytkovým rizikem. Slouží k efektivní alokaci zdrojů na posilování "
     "bezpečnosti tam, kde je to z pohledu celé organizace nejvíce potřeba."),
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
    <div class="page-break-inside-avoid mb-24 grid grid-cols-12 gap-12 items-start">
        <!-- Browser Frame UI -->
        <div class="col-span-7 w-full">
            <div class="browser-frame shadow-sm border border-slate-200">
                <div class="browser-header">
                    <div class="flex gap-1.5">
                        <div class="dot bg-red-400"></div>
                        <div class="dot bg-amber-400"></div>
                        <div class="dot bg-emerald-400"></div>
                    </div>
                    <div class="url-bar">riskhub.slavia.local/{filename.split('.')[0]}</div>
                </div>
                <div class="relative">
                    <img src="{b64}" alt="{title}" class="w-full h-auto object-cover border-t border-slate-100">
                </div>
            </div>
        </div>
        
        <!-- Enriched Description -->
        <div class="col-span-5 space-y-6">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slavia-red/5 border border-slavia-red/10 text-[10px] font-bold text-slavia-red uppercase tracking-widest">
                Feature Focus
            </div>
            <h3 class="text-3xl font-bold text-slate-900 leading-tight">{title}</h3>
            <div class="space-y-4">
                <p class="text-slate-600 leading-relaxed text-sm md:text-base italic border-l-4 border-slavia-red/20 pl-4">
                    {desc.split('. ')[0]}.
                </p>
                <p class="text-slate-500 leading-relaxed text-sm md:text-base">
                    {'. '.join(desc.split('. ')[1:])}
                </p>
            </div>
        </div>
    </div>
    """

HTML_CONTENT = f"""<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RiskHub - Slavia Pojišťovna (Board Presentation)</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {{
            theme: {{
                extend: {{
                    colors: {{
                        slavia: {{ red: '#e11d2b', slate: '#334155' }}
                    }},
                    fontFamily: {{ sans: ['Inter', 'sans-serif'] }}
                }}
            }}
        }}
    </script>
    <style>
        @media print {{
            .no-print {{ display: none !important; }}
            .page-break-before {{ page-break-before: always; break-before: page; }}
            .page-break-inside-avoid {{ page-break-inside: avoid; break-inside: avoid; }}
        }}
        body {{
            background-color: #ffffff;
            color: #1e293b;
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
        }}
        .browser-frame {{
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            background: #f8fafc;
        }}
        .browser-header {{
            background: #f1f5f9;
            padding: 8px 12px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .dot {{ width: 8px; height: 8px; rounded-full; background: #cbd5e1; border-radius: 50%; }}
        .url-bar {{
            flex-grow: 1;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-size: 10px;
            padding: 2px 8px;
            color: #64748b;
            margin: 0 40px;
            text-align: center;
        }}
    </style>
</head>
<body class="p-0 m-0">
    <!-- Hero -->
    <header class="py-20 px-12 border-b-4 border-slavia-red">
        <div class="max-w-6xl mx-auto grid grid-cols-12 gap-12 items-center">
            <div class="col-span-12 md:col-span-7 space-y-6">
                <div class="text-slavia-red font-bold tracking-widest uppercase text-sm">RiskHub Platform v1.0</div>
                <h1 class="text-6xl font-extrabold text-slate-900 leading-tight">Bezpečnost a Kontrola.</h1>
                <p class="text-xl text-slate-600">
                    Komplexní systém řízení rizik navržený specificky pro potřeby <strong>Slavia Pojišťovny</strong>. 
                    Transparentní governance, automatizované monitorování a integrovaný risk-management.
                </p>
                <div class="pt-8 grid grid-cols-2 gap-8 text-sm border-t border-slate-100">
                    <div>
                        <div class="text-slate-400 font-bold uppercase mb-1">Architekt</div>
                        <div class="text-slate-900 font-semibold">Stefan Lesnak</div>
                    </div>
                    <div>
                        <div class="text-slate-400 font-bold uppercase mb-1">Status</div>
                        <div class="text-slavia-red font-semibold">Production Ready</div>
                    </div>
                </div>
            </div>
            <div class="col-span-12 md:col-span-5">
                <img src="{hero_src}" class="w-full rounded-lg shadow-lg border border-slate-200">
            </div>
        </div>
    </header>

    <!-- Architecture -->
    <section class="py-20 px-12 bg-slate-50 page-break-before">
        <div class="max-w-6xl mx-auto space-y-12">
            <div class="grid grid-cols-12 gap-12 items-center">
                <div class="col-span-12 md:col-span-5 space-y-4">
                    <h2 class="text-3xl font-bold text-slate-900">Technologický Stack</h2>
                    <p class="text-slate-600">
                        Robustní backend na <strong>Python/FastAPI</strong> a moderní <strong>React</strong> frontend zajišťují 
                        maximální stabilitu, rychlost a škálovatelnost systému.
                    </p>
                    <div class="space-y-2">
                        <div class="flex items-center gap-2 text-slate-700 font-medium">✓ PostgreSQ v16 Core</div>
                        <div class="flex items-center gap-2 text-slate-700 font-medium">✓ Async Processing</div>
                        <div class="flex items-center gap-2 text-slate-700 font-medium">✓ RBAC Security</div>
                    </div>
                </div>
                <div class="col-span-12 md:col-span-7">
                    <img src="{arch_src}" class="w-full rounded-lg border border-slate-200 shadow-sm">
                </div>
            </div>

        </div>
    </section>

    <!-- Project Timeline -->
    <section class="py-20 px-12 page-break-before">
        <div class="max-w-3xl mx-auto space-y-12">
            <div class="text-center space-y-2">
                <h2 class="text-3xl font-bold">Vývojový Průběh</h2>
                <div class="text-slavia-red font-mono font-bold">Agilní Exekuce: 3 Pracovní Dny</div>
            </div>
            
            <div class="space-y-8">
                <div class="relative pl-12 border-l-2 border-slate-100 py-2">
                    <div class="absolute -left-[9px] top-6 w-4 h-4 rounded-full bg-slavia-red"></div>
                    <div class="text-slate-400 font-mono text-xs">23. 12. 2025</div>
                    <h4 class="text-lg font-bold text-slate-900">Fáze 1: Architektura a Jádro systému</h4>
                    <p class="text-slate-600 text-sm mt-1">Nastavení technologií, databázových modelů a základních registrů rizik a kontrol.</p>
                </div>
                <div class="relative pl-12 border-l-2 border-slate-100 py-2">
                    <div class="absolute -left-[9px] top-6 w-4 h-4 rounded-full bg-slavia-red"></div>
                    <div class="text-slate-400 font-mono text-xs">24. 12. 2025</div>
                    <h4 class="text-lg font-bold text-slate-900">Fáze 2: UI Dashboard a Business Logika</h4>
                    <p class="text-slate-600 text-sm mt-1">Vývoj interaktivních přehledů, KRI monitoringu a kompletního uživatelského rozhraní.</p>
                </div>
                <div class="relative pl-12 border-l-2 border-slate-100 py-2">
                    <div class="absolute -left-[9px] top-6 w-4 h-4 rounded-full bg-slavia-red"></div>
                    <div class="text-slate-400 font-mono text-xs">25. - 26. 12. 2025</div>
                    <h4 class="text-lg font-bold text-slate-900">Fáze 3: Integrace a Finální Polish</h4>
                    <p class="text-slate-600 text-sm mt-1">Implementace Governance modulu, integrace a příprava na produkční nasazení.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Gallery -->
    <section class="py-20 px-12 bg-slate-50 border-t border-slate-200 page-break-before">
        <div class="max-w-6xl mx-auto">
            <h2 class="text-4xl font-extrabold text-slate-900 mb-20 text-center">Detailní Screenshoty Aplikace</h2>
            <div class="space-y-32">
                {screenshots_html}
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="py-20 text-center text-slate-400 text-sm border-t border-slate-100">
        <p>&copy; 2025 Slavia Pojišťovna | Autorský projekt</p>
        <p>Jednoduchost. Rychlost. Bezpečnost.</p>
    </footer>

    <!-- Simple Modal -->
    <div id="imgModal" class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 hidden no-print" onclick="this.classList.add('hidden')">
        <img id="modalImg" class="max-w-full max-h-full rounded shadow-2xl">
    </div>
    <script>
        function openModal(src) {{
            document.getElementById('modalImg').src = src;
            document.getElementById('imgModal').classList.remove('hidden');
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
