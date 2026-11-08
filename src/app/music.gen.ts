// Собрано tools/sound/music.ts из assets/audio/music.yaml (spec docs/specs/2026-11-sound.md, часть 3) — не править руками.
import type { Track } from './music';

export const TRACKS: readonly Track[] = [
  { id: "bluebonnet", title: "Bluebonnet", author: "Kistol", license: "CC0", page: "https://opengameart.org/content/bluebonnet" },
  { id: "another-august", title: "Another August", author: "The Cynic Project", license: "CC0", page: "https://opengameart.org/content/another-august" },
  { id: "piano-iix", title: "Piano IIX", author: "Hardmoon (Arjen Schumacher)", license: "CC0", page: "https://opengameart.org/content/piano-iix" },
  { id: "little-lullaby", title: "Little Lullaby", author: "Alex_089", license: "CC BY 4.0", page: "https://opengameart.org/content/little-lullaby", credit: "«Little Lullaby» — Alex_089, OpenGameArt.org, CC BY 4.0" },
  { id: "the-woods", title: "The Woods (Remastered)", author: "Axletree", license: "CC BY 4.0", page: "https://freemusicarchive.org/music/Axletree/erthe/the-woods-remastered/", credit: "«The Woods (Remastered)» — Axletree, Free Music Archive, CC BY 4.0" },
  { id: "ambient-breath", title: "(Ambient) Breath", author: "Kirk Osamayo", license: "CC BY 4.0", page: "https://freemusicarchive.org/music/kirk-osamayo/season-one/ambient-breath/", credit: "«(Ambient) Breath» — Kirk Osamayo, Free Music Archive, CC BY 4.0" },
  { id: "celosia", title: "Celosia", author: "sawsquarenoise", license: "CC BY 4.0", page: "https://freemusicarchive.org/music/sawsquarenoise/piano-works/celosia/", credit: "«Celosia» — sawsquarenoise, Free Music Archive, CC BY 4.0" },
  { id: "tokyo-sunset", title: "Tokyo Sunset", author: "HoliznaCC0", license: "CC0", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tokyo-sunset-lofi-peaceful-soft/" },
];
