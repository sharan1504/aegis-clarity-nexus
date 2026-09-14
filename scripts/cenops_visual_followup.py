from pathlib import Path
import re


def edit(path: str, fn) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    updated = fn(text)
    if updated != text:
        p.write_text(updated, encoding="utf-8")


# Standardize visible CenOps casing without touching stable lowercase keys/URLs.
for p in Path("src").rglob("*"):
    if p.is_file() and p.suffix in {".ts", ".tsx", ".js", ".jsx", ".css"} and p.name != "theme.tsx":
        text = p.read_text(encoding="utf-8")
        updated = re.sub(r"(?<![A-Za-z0-9_])Cenops(?![A-Za-z0-9_])", "CenOps", text)
        if updated != text:
            p.write_text(updated, encoding="utf-8")

edit("src/components/layout/AppSidebar.tsx", lambda s: s
    .replace('text-[17px] font-semibold tracking-[-0.02em] text-sidebar-foreground">CenOps</div>', 'text-[17px] font-extrabold tracking-[-0.02em] text-sidebar-foreground">CenOps</div>')
    .replace("AI for Reliable Operations", "AI Control Plane for Enterprise Operations")
    .replace('{ title: "AI Agents", url: "/agents", icon: Bot },', '{ title: "AI Agents", url: "/agents", icon: Bot },\n    { title: "CenOps Copilot", url: "/chat", icon: Sparkles },')
    .replace('<div className="mt-1 text-[10px] leading-4 text-muted-foreground">Observe · Govern · Optimize · Act · Verify</div>', '')
)


def index_edit(s: str) -> str:
    s = s.replace('className="relative min-h-full overflow-hidden rounded-2xl bg-[#07111f] text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"', 'className="command-center-shell relative min-h-full overflow-hidden rounded-2xl bg-[#07111f] text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"')
    s = re.sub(r'\n        <div className="mt-6 flex flex-wrap items-center gap-1 border-b border-white/10 pb-0 text-\[11px\] font-semibold uppercase tracking-\[0\.16em\]">.*?</div>\n      </section>', '\n      </section>', s, flags=re.S)
    marker = '      <section className="grid grid-cols-2 gap-px border-b border-white/10 bg-white/10 lg:grid-cols-5">'
    copilot = '''      <section className="mx-5 mt-5 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.12] via-cyan-400/[0.06] to-transparent px-4 py-3 shadow-[0_12px_35px_rgba(76,55,180,0.12)] lg:mx-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><Sparkles className="h-4 w-4" /></div><div><div className="text-sm font-semibold text-white">CenOps Copilot</div><div className="mt-0.5 text-xs text-slate-400">Ask questions across your authorized operational evidence, recommendations and investigations.</div></div></div><Button size="sm" asChild className="bg-violet-500 text-white hover:bg-violet-400"><Link to="/chat">Open Copilot</Link></Button></div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-px border-b border-white/10 bg-white/10 lg:grid-cols-5">'''
    s = s.replace(marker, copilot, 1)
    s = re.sub(r'<section className="rounded-xl border border-white/10 bg-\[#0b192b\]/90 p-5"><div className="mb-4 flex items-center justify-between"><div><div className="text-sm font-semibold text-white">Control loop</div>.*?</section></section>', '</section></section>', s, flags=re.S)
    s = s.replace('grid gap-5 lg:grid-cols-2"><section className="rounded-xl', 'grid gap-5 lg:grid-cols-1"><section className="rounded-xl', 1)
    return s

edit("src/routes/_app.index.tsx", index_edit)

edit("src/routes/_app.chat.tsx", lambda s: s
    .replace('title: "Aegis Enterprise AI"', 'title: "CenOps Copilot"')
    .replace('description: "Enterprise analysis, recommendations and evidence from connected systems."', 'description: "Evidence-grounded operational analysis powered by GPT-6 Astra."')
    .replace('<PageHeader title="Aegis Enterprise AI"', '<PageHeader title="CenOps Copilot"')
    .replace('placeholder={`Ask Aegis about ${departmentName.toLowerCase()}…`}', 'placeholder={`Ask CenOps Copilot about ${departmentName.toLowerCase()}…`}')
    .replace('<Badge variant="outline">Human approval required</Badge>', '<Badge variant="outline">GPT-6 Astra</Badge><Badge variant="outline">Human approval required</Badge>')
)
edit("src/components/layout/GlobalSearch.tsx", lambda s: s.replace("Ask Cenops", "CenOps Copilot"))

styles = Path("src/styles.css")
css = styles.read_text(encoding="utf-8")
if "Command Center: preserve the operational composition" not in css:
    styles.write_text(css + '''\n\n/* Command Center: preserve the operational composition while making light mode native to CenOps. */\n@layer components {\n  html:not(.dark) .command-center-shell { background:linear-gradient(180deg,#f8fafc 0%,#eef3f9 100%) !important; color:#172033 !important; box-shadow:0 18px 50px rgba(33,53,85,.10) !important; }\n  html:not(.dark) .command-center-shell > .pointer-events-none { display:none !important; }\n  html:not(.dark) .command-center-shell [class*="text-white"] { color:#172033 !important; }\n  html:not(.dark) .command-center-shell [class*="text-slate-100"], html:not(.dark) .command-center-shell [class*="text-slate-200"] { color:#25334a !important; }\n  html:not(.dark) .command-center-shell [class*="text-slate-300"] { color:#40516a !important; }\n  html:not(.dark) .command-center-shell [class*="text-slate-400"] { color:#56677f !important; }\n  html:not(.dark) .command-center-shell [class*="text-slate-500"] { color:#64748b !important; }\n  html:not(.dark) .command-center-shell [class*="text-slate-600"], html:not(.dark) .command-center-shell [class*="text-slate-700"] { color:#8290a5 !important; }\n  html:not(.dark) .command-center-shell [class*="border-white"] { border-color:rgba(51,65,85,.14) !important; }\n  html:not(.dark) .command-center-shell [class*="bg-[#07111f]"], html:not(.dark) .command-center-shell [class*="bg-[#091625]"], html:not(.dark) .command-center-shell [class*="bg-[#0b192b]"], html:not(.dark) .command-center-shell [class*="bg-[#102139]"], html:not(.dark) .command-center-shell [class*="bg-[#111f39]"] { background:rgba(255,255,255,.82) !important; }\n  html:not(.dark) .command-center-shell [class*="from-[#111f39]"], html:not(.dark) .command-center-shell [class*="via-[#0c1a2d]"], html:not(.dark) .command-center-shell [class*="to-[#091525]"] { background:linear-gradient(135deg,#fff,#f1f5f9) !important; }\n}\n''', encoding="utf-8")
