# Audio sample sources

All samples in this folder are third-party recordings, trimmed, gain-normalised
and looped with ffmpeg. Each is licensed for free use, including commercial
projects, without attribution — but the provenance is recorded here anyway.

| File | Used for | Origin | Licence |
| --- | --- | --- | --- |
| `explosion.mp3` | Warhead detonation (primary blast) | Mixkit — "Explosion hit" (sfx 1704) | Mixkit Free License |
| `explosion_dirt.mp3` | Debris / dirt rain layer, played 60 ms behind the blast | Mixkit — "Explosion with rocks debris" (sfx 1703) | Mixkit Free License |
| `engine_truck.mp3` | Wheeled vehicle (truck) engine loop | Mixkit — "Truck driving steady" (sfx 1621) | Mixkit Free License |
| `engine_armor.mp3` | Tracked / armoured vehicle engine loop | Freesound #572294 — "tank_engine.wav" | CC0 1.0 |
| `drone_props.mp3` | FPV quad prop wash while flying | Freesound #854466 — "FPV Drone Flight 3" by *jgrzinich* | CC0 1.0 |

## Processing

* **Explosions** — trimmed to the impact and its tail (0.18–4.10 s and
  0.12–2.60 s), peak-normalised to −1 dB / −5 dB, short fade in/out so a
  retrigger never clicks.
* **Loops** — cut to 5.00 s (truck), 8.00 s (armour) and 7.50 s (props) with a
  0.4–0.5 s triangular crossfade between the tail and the head, then
  RMS-normalised to −19 dBFS. Because the loop points are crossfaded *before*
  encoding, and the MP3s are written with the LAME gapless header, the decoded
  loops come back at exactly their nominal length and run seamlessly in
  `AudioBufferSourceNode.loop`.
* Playback rate, low-pass cutoff, stereo pan and gain are all modulated at
  runtime in `src/game/audio.ts` (throttle, airspeed, distance and bearing).
* Airflow, motor whine, gunfire, impacts and UI beeps are still synthesised —
  no sample conveys the specific sound of this airframe.

## Links

* Mixkit free sound effects — https://mixkit.co/free-sound-effects/
  (asset URLs follow the form `https://assets.mixkit.co/active_storage/sfx/<id>/<id>-preview.mp3`)
* Mixkit license — https://mixkit.co/license/#sfxFree
* Freesound — https://freesound.org/
* Creative Commons CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/
