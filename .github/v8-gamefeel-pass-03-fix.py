from pathlib import Path

css_path = Path('src/components/match-v8/v8lab.css')
css_path.write_text(css_path.read_text().rstrip() + '\n')
