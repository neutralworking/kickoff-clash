from pathlib import Path

path = Path('src/components/match-v8/v8lab.css')
text = path.read_text()
old = ".v8-condition {\n  margin-top: 54px;\n  padding: 11px 4px 0;"
new = ".v8-condition {\n  margin-top: 170px;\n  padding: 11px 4px 0;"
if old not in text:
    raise SystemExit('Pass 02 debug boundary not found')
path.write_text(text.replace(old, new, 1))
