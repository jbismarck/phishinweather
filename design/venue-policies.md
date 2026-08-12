# Venue Policy Research

Source data for the Phish Tour card's policy sprites (water bottles, water station,
poster tubes) and the `venues` table (`policy_water_bottles`, `policy_poster_tubes`,
`policy_water_station`). **Not yet wired into `tour.json`** — banked here until we
build the policy→sprite wiring.

> **Note (2026-08-11):** philm (phish.in) was the intended "authoritative tube data"
> source but went unresponsive. Turns out venues **don't publish poster-tube policy at
> all** — so there was never a dataset to get. Source policy ourselves from official
> venue pages + crowdsource corrections via the admin panel. Confidence is high on
> water + re-entry, low on tubes everywhere.

## Fall 2026 run + Dick's

| Venue | Poster tubes | Water bottles | Water station | Re-entry |
|---|---|---|---|---|
| Dick's Sporting Goods Park (Commerce City, CO) | unclear (bans hard cases/tripods → lean no) | 1 empty **or** sealed clear plastic ≤32oz, label removed; no glass/cans | **yes** — concourse refill stations | **no** |
| Jim Whelan Boardwalk Hall (Atlantic City, NJ) | unclear | **no** outside bottles (bottled water sold inside ~$4) | unclear (buy inside) | **no** |
| Allianz Amphitheater at Riverfront (Richmond, VA) | unclear (bans "posters/signs" → lean no) | 1 sealed **or** empty, ≤1 gallon, no glass, no hydration bladders | **yes** — "Hydration Station" | **no** |
| VyStar Veterans Memorial Arena (Jacksonville, FL) | unclear (bans sticks/poles → lean no) | **no** outside bottles | fountains yes; fillers unclear | **no** |
| The Orion Amphitheater (Huntsville, AL) | unclear | empty reusable ≤32oz only (no single-use) | **yes** — fill stations throughout | **no** |

## Key takeaways

- **Poster tubes: undocumented at all 5 venues.** None publish a tube policy; a couple
  lean no. Treat as *call-ahead / uncertain* — this is inherently a crowdsource field.
- **Re-entry: "no" at all 5.** Universal and high-value for tour travelers — worth a
  dedicated field/sprite (schema has none yet).
- **Water splits by venue type:** the amphitheaters/stadium (Dick's, Allianz, Orion)
  allow empty bottles + have refill stations; the arenas (Boardwalk, VyStar) ban
  outside bottles.

## Sources (official venue pages)

- Dick's: dickssportinggoodspark.com/stadium-info/fan-guide + /concert-info
- Boardwalk Hall: boardwalkhall.com/plan-your-visit/a-z-guide
- Allianz Richmond: allianzamphitheater.com/know-before-you-go + richmondamp.com/faq
- VyStar Jacksonville: arena.jaxevents.com/venue-info/faq
- Orion Huntsville: theorionhuntsville.com/visit-us/safety-security + /frequently-asked-questions

_Researched 2026-08-11. Verify at the box office before relying on any single item —
policies change and can be promoter-specific for a given show._
