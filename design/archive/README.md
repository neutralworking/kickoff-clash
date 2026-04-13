# fbal

A Balatro-style football management roguelike. Build a squad deck, apply manager skill cards each match, and develop players through an 18-match season.

## What's Working

✅ **Core Match Engine** — 6-turn matches with phase-based resolution (build-up → penetration → finishing vs pressing → structure → resistance)  
✅ **Squad Progression** — XP curves, trait unlocks (Lv 3/6/9/12/15/18), class upgrades (Lv 5/10/15)  
✅ **Formation System** — 8 formations with positional synergies (4-4-2, 4-3-3, 4-2-3-1, 3-4-2-1, 4-2-4, 3-4-3, 5-3-2, 4-1-4-1)  
✅ **Manager Cards** — 10 skill cards (The Conductor, Press Fanatic, Killer Instinct, etc.)  
✅ **18-Match Season** — League table with promotion/relegation

## Running Locally

```bash
pip install flask
python app.py
# Open http://localhost:5055
```

## Development Roadmap

### Path A: Complete the Core Game Loop

**Priority order:**

1. **[Opponent AI Card Picker](https://github.com/neutralworking/fbal/issues/1)** ⚡ *15 min*  
   Enable AI teams to use skill cards based on archetypes (Counter/Defensive/Attacking/Possession/Balanced) with difficulty scaling by league position.

2. **[Formation & Substitution System](https://github.com/neutralworking/fbal/issues/2)** 🔧 *2-3 hours*  
   In-match formation switcher + 3 subs per match with XP tracking.

3. **[Transfer Market & Youth Academy](https://github.com/neutralworking/fbal/issues/3)** 💰 *3-4 hours*  
   Mid-season window (matchday 10), buy/sell players, youth development with 2× XP multiplier.

4. **[Save/Load System](https://github.com/neutralworking/fbal/issues/4)** 💾 *30 min*  
   localStorage persistence with auto-save.

---

**After Path A:** Consider Path B (match visuals), Path C (injuries + personalities), or Path D (polish + mobile)

## Contributing

This is an experimental design prototype. Feel free to fork and extend!

## License

MIT
