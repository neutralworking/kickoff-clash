from pathlib import Path

component_path = Path('src/components/match-v8/V8CalibrationLab.tsx')
css_path = Path('src/components/match-v8/v8lab.css')

component = component_path.read_text()
css = css_path.read_text()

# Keep the lab drawer open while changing calibration squads; a squad reset is not a request
# to close the drawer the user just opened.
component = component.replace("    setFinished(false);\n    setDebugOpen(false);\n  };", "    setFinished(false);\n  };", 1)

css += r'''

/* Pass 02 visual review: map football depth vertically on the portrait pitch. */
.v8-pitch {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(3, minmax(0, 1fr));
  padding: 7px 8px;
}
/* Home attacks upward: ATT is nearest the opponent goal, DEF nearest the user's goal. */
.v8-zone:nth-of-type(1) { grid-row: 3; }
.v8-zone:nth-of-type(2) { grid-row: 2; }
.v8-zone:nth-of-type(3) { grid-row: 1; }
.v8-zone {
  width: 100%;
  height: 100%;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(48px, 1fr) 18px minmax(48px, 1fr);
  gap: 0;
  padding: 2px 7px;
  border-right: 0;
  border-bottom: 1px solid rgba(255,255,255,.035);
}
.v8-zone:nth-of-type(1) { border-bottom: 0; }
.v8-zone__side {
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  justify-items: center;
  padding: 1px 19px;
}
.v8-zone__heading {
  width: 100%;
  min-height: 18px;
  height: 18px;
  justify-content: space-between;
  padding: 0 3px;
  background: transparent;
  backdrop-filter: none;
}
.v8-zone__heading strong {
  display: inline-flex;
  align-items: center;
  height: 15px;
  padding: 0 6px;
  border: 1px solid rgba(255,255,255,.055);
  border-radius: 99px;
  background: rgba(4, 14, 9, .46);
  color: rgba(246,255,247,.48);
  font-size: 6px;
}
.v8-zone__heading span {
  max-width: 64%;
  height: 15px;
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  border-radius: 99px;
  background: rgba(36, 27, 11, .56);
}
.v8-zone__side i {
  width: 38px;
  height: 43px;
  border-color: rgba(255,255,255,.035);
  background: rgba(0,0,0,.018);
  opacity: .22;
  transition: opacity .15s ease, border-color .15s ease, background .15s ease;
}
.v8-shell.is-dragging .v8-zone__side i,
.v8-shell:has(.v8-card.is-selected) .v8-zone__side i {
  border-color: rgba(255, 215, 116, .13);
  border-style: dashed;
  background: rgba(255, 214, 104, .018);
  opacity: .72;
}

/* Pitch markings follow the portrait football orientation rather than creating three lanes. */
.v8-pitch__stadium > i {
  left: 5%;
  right: 5%;
  top: auto;
  bottom: auto;
  width: auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.07) 16% 84%, transparent);
}
.v8-pitch__stadium > i:nth-child(1) { left: 5%; top: 33.333%; }
.v8-pitch__stadium > i:nth-child(2) { left: 5%; top: 66.666%; }
.v8-pitch__stadium > i:nth-child(3) {
  left: 50%;
  right: auto;
  top: 50%;
  width: 4px;
  height: 4px;
  background: rgba(255,255,255,.35);
}

/* Deployed cards should read as pitch pieces, not miniature hand cards. */
.v8-chip {
  width: 40px;
  height: 54px;
  grid-template-rows: 31px auto auto;
  border-radius: 7px;
}
.v8-chip__portrait { height: 31px; }
.v8-chip__name { padding-top: 2px; font-size: 5.8px; }
.v8-chip b { bottom: 2px; font-size: 6.2px; }
.v8-chip--transient { height: 50px; }
.v8-chip--transient::before { padding-top: 5px; }

/* Give the collectible hand more visual weight in the remaining phone viewport. */
.v8-hand-wrap,
.v8-hand {
  height: 226px;
  min-height: 226px;
}
.v8-hand { padding: 29px 23px 8px 30px; }
.v8-card {
  flex-basis: 114px;
  width: 114px;
  min-width: 114px;
  height: 177px;
  margin-left: -22px;
  border-radius: 11px;
}
.v8-card__art { inset-bottom: 63px; }
.v8-card > strong { bottom: 46px; font-size: 11.5px; }
.v8-card > small { bottom: 28px; }
.v8-card__att,
.v8-card__def { bottom: 5px; font-size: 16px; }
.v8-card.is-selected { transform: translateY(-18px) scale(1.06) rotate(0); }

/* The lab affordance is deliberately an afterthought, not part of the game HUD. */
.v8-debug-toggle { margin-top: 72px; }

@media (max-width: 420px) {
  .v8-pitch { padding-inline: 6px; }
  .v8-zone { padding-inline: 5px; }
  .v8-zone__side { padding-inline: 15px; gap: 7px; }
  .v8-chip { width: 38px; height: 52px; grid-template-rows: 30px auto auto; }
  .v8-chip__portrait { height: 30px; }
  .v8-hand-wrap, .v8-hand { height: 221px; min-height: 221px; }
  .v8-card { flex-basis: 111px; width:111px; min-width:111px; height:173px; margin-left:-21px; }
}
'''

component_path.write_text(component)
css_path.write_text(css)
