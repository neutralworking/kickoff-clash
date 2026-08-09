from pathlib import Path

path = Path('src/components/match-v8/V8CalibrationLab.tsx')
text = path.read_text()
old = """  const zoneAtPoint = (x: number, y: number): V8Zone | null => {\n    const element = document.elementFromPoint(x, y);\n    const zoneElement = element?.closest<HTMLElement>('[data-v8-zone]');\n    const zone = zoneElement?.dataset.v8Zone as V8Zone | undefined;\n    return zone && ZONES.includes(zone) ? zone : null;\n  };"""
new = """  const zoneAtPoint = (x: number, y: number): V8Zone | null => {\n    const pitch = document.querySelector<HTMLElement>('.v8-pitch');\n    const rect = pitch?.getBoundingClientRect();\n    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;\n\n    // Mobile pitch is laid out in football depth: ATT at the opponent end, MID centrally,\n    // DEF nearest the user's goal. Resolve the finger position against those thirds directly\n    // instead of relying on nested slot/label DOM hitboxes.\n    const progress = (y - rect.top) / rect.height;\n    if (progress < 1 / 3) return 'ATT';\n    if (progress < 2 / 3) return 'MID';\n    return 'DEF';\n  };"""
if old not in text:
    raise SystemExit('zoneAtPoint block not found')
path.write_text(text.replace(old, new, 1))
