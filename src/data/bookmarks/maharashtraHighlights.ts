/**
 * Bridges the Maharashtra gazetteer (`src/data/maharashtra`) into the curated world highlights so every important
 * Maharashtra place (and the external Taj Mahal hero) shows up in the Highlights panel and the offline gazetteer.
 * Ids are prefixed `mh-` so they never collide with the global highlight ids ("mumbai", "gateway-of-india"…).
 *
 * DATA NOTE — all positions are approximate (see each destination's `dataNote`); framing is derived per kind.
 */
import { ALL_MAHARASHTRA_PLACES } from '@/data/maharashtra/destinations';
import { maharashtraBookmarkId } from '@/data/maharashtra/search';
import type { Destination, DestinationKind } from '@/data/maharashtra/types';
import type { Bookmark, BookmarkCategory } from './types';

const CATEGORY_BY_KIND: Readonly<Record<DestinationKind, BookmarkCategory>> = {
  city: 'city', town: 'city', 'hill-station': 'mountain', coast: 'nature', fort: 'landmark', monument: 'landmark', temple: 'landmark', museum: 'landmark',
  stadium: 'landmark', station: 'landmark', airport: 'landmark', port: 'landmark', campus: 'landmark', showroom: 'landmark', park: 'park', dam: 'nature',
  waterfall: 'nature', nature: 'nature', village: 'rural',
};

/** Camera height bands per bookmark category (mirrors the guideline enforced by the bookmark unit tests). */
function clampHeight(category: BookmarkCategory, h: number): number {
  switch (category) {
    case 'city': return Math.min(4000, Math.max(1500, h));
    case 'landmark': return Math.min(3000, Math.max(400, h));
    case 'mountain': return Math.min(15000, Math.max(6000, h));
    default: return Math.min(80000, Math.max(1000, h));
  }
}

export function destinationToBookmark(d: Destination): Bookmark {
  const category = CATEGORY_BY_KIND[d.kind];
  const tags = [...new Set([...(d.tags ?? []), d.id.replace(/-/g, ' ')])];
  return {
    id: maharashtraBookmarkId(d.id),
    name: d.name,
    category,
    continent: 'Asia',
    country: 'India',
    lat: d.lat,
    lon: d.lon,
    camera: { heightM: clampHeight(category, d.overviewHeightM), headingDeg: d.spawn?.headingDeg ?? 0, pitchDeg: category === 'city' ? -35 : -30 },
    description: d.description,
    dataNote: d.dataNote,
    tags,
  };
}

/** Every Maharashtra place as a bookmark (appended to `WORLD_HIGHLIGHTS`). */
export const MAHARASHTRA_HIGHLIGHTS: Bookmark[] = ALL_MAHARASHTRA_PLACES.map(destinationToBookmark);
