from pathlib import Path
p = Path("src/routes/_app.index.tsx")
s = p.read_text(encoding="utf-8")
s = s.replace("</section></section></section>}", "</section></section>}")
p.write_text(s, encoding="utf-8")
