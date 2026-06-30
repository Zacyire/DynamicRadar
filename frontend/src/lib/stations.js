/**
 * WSR-88D (NEXRAD) network for the Live NOAA Feed picker — grouped by region.
 *
 * Coordinates are approximate radar-site locations used only for the initial
 * camera fly-to and NWS-alert centering; the backend returns the authoritative
 * radar lat/lon with each decoded sweep. ICAO ids are what matter (they key the
 * S3 objects) and are exact.
 */

export const STATION_REGIONS = [
  {
    region: 'Northeast',
    stations: [
      { icao: 'KCBW', name: 'Caribou, ME', lat: 46.04, lon: -67.81 },
      { icao: 'KGYX', name: 'Portland, ME', lat: 43.89, lon: -70.26 },
      { icao: 'KCXX', name: 'Burlington, VT', lat: 44.51, lon: -73.17 },
      { icao: 'KTYX', name: 'Fort Drum, NY', lat: 43.76, lon: -75.68 },
      { icao: 'KENX', name: 'Albany, NY', lat: 42.59, lon: -74.06 },
      { icao: 'KBGM', name: 'Binghamton, NY', lat: 42.2, lon: -75.98 },
      { icao: 'KBUF', name: 'Buffalo, NY', lat: 42.95, lon: -78.74 },
      { icao: 'KBOX', name: 'Boston, MA', lat: 41.96, lon: -71.14 },
      { icao: 'KOKX', name: 'New York / Long Island, NY', lat: 40.87, lon: -72.86 },
    ],
  },
  {
    region: 'Mid-Atlantic',
    stations: [
      { icao: 'KDIX', name: 'Philadelphia, PA', lat: 39.95, lon: -74.41 },
      { icao: 'KCCX', name: 'State College, PA', lat: 40.92, lon: -78.0 },
      { icao: 'KPBZ', name: 'Pittsburgh, PA', lat: 40.53, lon: -80.22 },
      { icao: 'KDOX', name: 'Dover, DE', lat: 38.83, lon: -75.44 },
      { icao: 'KLWX', name: 'Washington, DC / Sterling, VA', lat: 38.98, lon: -77.48 },
      { icao: 'KAKQ', name: 'Wakefield, VA', lat: 36.98, lon: -77.01 },
      { icao: 'KFCX', name: 'Roanoke / Blacksburg, VA', lat: 37.02, lon: -80.27 },
      { icao: 'KRLX', name: 'Charleston, WV', lat: 38.31, lon: -81.72 },
    ],
  },
  {
    region: 'Southeast',
    stations: [
      { icao: 'KRAX', name: 'Raleigh / Durham, NC', lat: 35.67, lon: -78.49 },
      { icao: 'KMHX', name: 'Morehead City, NC', lat: 34.78, lon: -76.88 },
      { icao: 'KLTX', name: 'Wilmington, NC', lat: 33.99, lon: -78.43 },
      { icao: 'KGSP', name: 'Greenville / Spartanburg, SC', lat: 34.88, lon: -82.22 },
      { icao: 'KCAE', name: 'Columbia, SC', lat: 33.95, lon: -81.12 },
      { icao: 'KCLX', name: 'Charleston, SC', lat: 32.66, lon: -81.04 },
      { icao: 'KFFC', name: 'Atlanta, GA', lat: 33.36, lon: -84.57 },
      { icao: 'KJGX', name: 'Macon / Robins AFB, GA', lat: 32.68, lon: -83.35 },
      { icao: 'KVAX', name: 'Valdosta / Moody AFB, GA', lat: 30.89, lon: -83.0 },
    ],
  },
  {
    region: 'Florida',
    stations: [
      { icao: 'KJAX', name: 'Jacksonville, FL', lat: 30.48, lon: -81.7 },
      { icao: 'KTLH', name: 'Tallahassee, FL', lat: 30.4, lon: -84.33 },
      { icao: 'KEVX', name: 'Eglin AFB, FL', lat: 30.56, lon: -85.92 },
      { icao: 'KTBW', name: 'Tampa Bay, FL', lat: 27.71, lon: -82.4 },
      { icao: 'KMLB', name: 'Melbourne, FL', lat: 28.11, lon: -80.65 },
      { icao: 'KAMX', name: 'Miami, FL', lat: 25.61, lon: -80.41 },
      { icao: 'KBYX', name: 'Key West, FL', lat: 24.6, lon: -81.7 },
    ],
  },
  {
    region: 'Ohio Valley & Great Lakes',
    stations: [
      { icao: 'KILN', name: 'Cincinnati, OH', lat: 39.42, lon: -83.82 },
      { icao: 'KCLE', name: 'Cleveland, OH', lat: 41.41, lon: -81.86 },
      { icao: 'KDTX', name: 'Detroit, MI', lat: 42.7, lon: -83.47 },
      { icao: 'KGRR', name: 'Grand Rapids, MI', lat: 42.89, lon: -85.54 },
      { icao: 'KAPX', name: 'Gaylord, MI', lat: 44.91, lon: -84.72 },
      { icao: 'KMQT', name: 'Marquette, MI', lat: 46.53, lon: -87.55 },
      { icao: 'KIWX', name: 'Fort Wayne, IN', lat: 41.36, lon: -85.7 },
      { icao: 'KIND', name: 'Indianapolis, IN', lat: 39.71, lon: -86.28 },
      { icao: 'KVWX', name: 'Evansville, IN', lat: 38.26, lon: -87.72 },
      { icao: 'KLOT', name: 'Chicago, IL', lat: 41.6, lon: -88.08 },
      { icao: 'KILX', name: 'Lincoln, IL', lat: 40.15, lon: -89.34 },
      { icao: 'KLVX', name: 'Louisville, KY', lat: 37.98, lon: -85.94 },
      { icao: 'KPAH', name: 'Paducah, KY', lat: 37.07, lon: -88.77 },
      { icao: 'KHPX', name: 'Fort Campbell, KY', lat: 36.74, lon: -87.29 },
      { icao: 'KJKL', name: 'Jackson, KY', lat: 37.59, lon: -83.31 },
    ],
  },
  {
    region: 'Upper Midwest',
    stations: [
      { icao: 'KGRB', name: 'Green Bay, WI', lat: 44.5, lon: -88.11 },
      { icao: 'KMKX', name: 'Milwaukee, WI', lat: 42.97, lon: -88.55 },
      { icao: 'KARX', name: 'La Crosse, WI', lat: 43.82, lon: -91.19 },
      { icao: 'KMPX', name: 'Minneapolis, MN', lat: 44.85, lon: -93.57 },
      { icao: 'KDLH', name: 'Duluth, MN', lat: 46.84, lon: -92.21 },
      { icao: 'KMVX', name: 'Grand Forks / Fargo, ND', lat: 47.53, lon: -97.33 },
      { icao: 'KBIS', name: 'Bismarck, ND', lat: 46.77, lon: -100.76 },
      { icao: 'KMBX', name: 'Minot, ND', lat: 48.39, lon: -100.86 },
      { icao: 'KABR', name: 'Aberdeen, SD', lat: 45.46, lon: -98.41 },
      { icao: 'KFSD', name: 'Sioux Falls, SD', lat: 43.59, lon: -96.73 },
      { icao: 'KUDX', name: 'Rapid City, SD', lat: 44.13, lon: -102.83 },
      { icao: 'KDMX', name: 'Des Moines, IA', lat: 41.73, lon: -93.72 },
      { icao: 'KDVN', name: 'Davenport / Quad Cities, IA', lat: 41.61, lon: -90.58 },
    ],
  },
  {
    region: 'Central Plains',
    stations: [
      { icao: 'KOAX', name: 'Omaha, NE', lat: 41.32, lon: -96.37 },
      { icao: 'KLNX', name: 'North Platte, NE', lat: 41.96, lon: -100.58 },
      { icao: 'KUEX', name: 'Hastings, NE', lat: 40.32, lon: -98.44 },
      { icao: 'KEAX', name: 'Kansas City, MO', lat: 38.81, lon: -94.26 },
      { icao: 'KSGF', name: 'Springfield, MO', lat: 37.24, lon: -93.4 },
      { icao: 'KLSX', name: 'St. Louis, MO', lat: 38.7, lon: -90.68 },
      { icao: 'KICT', name: 'Wichita, KS', lat: 37.65, lon: -97.44 },
      { icao: 'KTWX', name: 'Topeka, KS', lat: 39.0, lon: -96.23 },
      { icao: 'KDDC', name: 'Dodge City, KS', lat: 37.76, lon: -99.97 },
      { icao: 'KGLD', name: 'Goodland, KS', lat: 39.37, lon: -101.7 },
    ],
  },
  {
    region: 'Southern Plains',
    stations: [
      { icao: 'KTLX', name: 'Oklahoma City, OK', lat: 35.33, lon: -97.28 },
      { icao: 'KINX', name: 'Tulsa, OK', lat: 36.18, lon: -95.56 },
      { icao: 'KVNX', name: 'Enid / Vance AFB, OK', lat: 36.74, lon: -98.13 },
      { icao: 'KFDR', name: 'Frederick, OK', lat: 34.36, lon: -98.98 },
      { icao: 'KLZK', name: 'Little Rock, AR', lat: 34.84, lon: -92.26 },
      { icao: 'KSRX', name: 'Fort Smith, AR', lat: 35.29, lon: -94.36 },
    ],
  },
  {
    region: 'Texas',
    stations: [
      { icao: 'KFWS', name: 'Dallas / Fort Worth, TX', lat: 32.57, lon: -97.3 },
      { icao: 'KDYX', name: 'Abilene / Dyess AFB, TX', lat: 32.54, lon: -99.25 },
      { icao: 'KGRK', name: 'Central Texas / Fort Cavazos, TX', lat: 30.72, lon: -97.38 },
      { icao: 'KEWX', name: 'Austin / San Antonio, TX', lat: 29.7, lon: -98.03 },
      { icao: 'KDFX', name: 'Del Rio, TX', lat: 29.27, lon: -100.28 },
      { icao: 'KSJT', name: 'San Angelo, TX', lat: 31.37, lon: -100.49 },
      { icao: 'KMAF', name: 'Midland / Odessa, TX', lat: 31.94, lon: -102.19 },
      { icao: 'KAMA', name: 'Amarillo, TX', lat: 35.23, lon: -101.71 },
      { icao: 'KLBB', name: 'Lubbock, TX', lat: 33.65, lon: -101.81 },
      { icao: 'KHGX', name: 'Houston, TX', lat: 29.47, lon: -95.08 },
      { icao: 'KCRP', name: 'Corpus Christi, TX', lat: 27.78, lon: -97.51 },
      { icao: 'KBRO', name: 'Brownsville, TX', lat: 25.92, lon: -97.42 },
      { icao: 'KEPZ', name: 'El Paso, TX', lat: 31.87, lon: -106.7 },
    ],
  },
  {
    region: 'Deep South & Gulf',
    stations: [
      { icao: 'KSHV', name: 'Shreveport, LA', lat: 32.45, lon: -93.84 },
      { icao: 'KLCH', name: 'Lake Charles, LA', lat: 30.13, lon: -93.22 },
      { icao: 'KLIX', name: 'New Orleans, LA', lat: 30.34, lon: -89.83 },
      { icao: 'KPOE', name: 'Fort Polk, LA', lat: 31.16, lon: -92.98 },
      { icao: 'KDGX', name: 'Jackson, MS', lat: 32.28, lon: -89.98 },
      { icao: 'KGWX', name: 'Columbus AFB, MS', lat: 33.9, lon: -88.33 },
      { icao: 'KMOB', name: 'Mobile, AL', lat: 30.68, lon: -88.24 },
      { icao: 'KBMX', name: 'Birmingham, AL', lat: 33.17, lon: -86.77 },
      { icao: 'KHTX', name: 'Huntsville, AL', lat: 34.93, lon: -86.08 },
      { icao: 'KMXX', name: 'Montgomery / Maxwell, AL', lat: 32.54, lon: -85.79 },
    ],
  },
  {
    region: 'Tennessee Valley',
    stations: [
      { icao: 'KNQA', name: 'Memphis, TN', lat: 35.34, lon: -89.87 },
      { icao: 'KOHX', name: 'Nashville, TN', lat: 36.25, lon: -86.56 },
      { icao: 'KMRX', name: 'Knoxville / Morristown, TN', lat: 36.17, lon: -83.4 },
    ],
  },
  {
    region: 'Northern Rockies',
    stations: [
      { icao: 'KFTG', name: 'Denver, CO', lat: 39.79, lon: -104.55 },
      { icao: 'KGJX', name: 'Grand Junction, CO', lat: 39.06, lon: -108.21 },
      { icao: 'KPUX', name: 'Pueblo, CO', lat: 38.46, lon: -104.18 },
      { icao: 'KCYS', name: 'Cheyenne, WY', lat: 41.15, lon: -104.81 },
      { icao: 'KRIW', name: 'Riverton, WY', lat: 43.07, lon: -108.48 },
      { icao: 'KGGW', name: 'Glasgow, MT', lat: 48.21, lon: -106.62 },
      { icao: 'KTFX', name: 'Great Falls, MT', lat: 47.46, lon: -111.39 },
      { icao: 'KMSX', name: 'Missoula, MT', lat: 47.04, lon: -113.99 },
      { icao: 'KBLX', name: 'Billings, MT', lat: 45.85, lon: -108.61 },
    ],
  },
  {
    region: 'Southwest',
    stations: [
      { icao: 'KABX', name: 'Albuquerque, NM', lat: 35.15, lon: -106.82 },
      { icao: 'KFDX', name: 'Clovis / Cannon AFB, NM', lat: 34.63, lon: -103.62 },
      { icao: 'KHDX', name: 'Alamogordo / Holloman AFB, NM', lat: 33.08, lon: -106.12 },
      { icao: 'KFSX', name: 'Flagstaff, AZ', lat: 34.57, lon: -111.2 },
      { icao: 'KIWA', name: 'Phoenix, AZ', lat: 33.29, lon: -111.67 },
      { icao: 'KEMX', name: 'Tucson, AZ', lat: 31.89, lon: -110.63 },
      { icao: 'KYUX', name: 'Yuma, AZ', lat: 32.5, lon: -114.66 },
    ],
  },
  {
    region: 'Great Basin',
    stations: [
      { icao: 'KMTX', name: 'Salt Lake City, UT', lat: 41.26, lon: -112.45 },
      { icao: 'KICX', name: 'Cedar City, UT', lat: 37.59, lon: -112.86 },
      { icao: 'KCBX', name: 'Boise, ID', lat: 43.49, lon: -116.24 },
      { icao: 'KSFX', name: 'Pocatello / Idaho Falls, ID', lat: 43.11, lon: -112.69 },
      { icao: 'KRGX', name: 'Reno, NV', lat: 39.75, lon: -119.46 },
      { icao: 'KLRX', name: 'Elko, NV', lat: 40.74, lon: -116.8 },
      { icao: 'KESX', name: 'Las Vegas, NV', lat: 35.7, lon: -114.89 },
    ],
  },
  {
    region: 'California',
    stations: [
      { icao: 'KBHX', name: 'Eureka, CA', lat: 40.5, lon: -124.29 },
      { icao: 'KBBX', name: 'Chico / Beale AFB, CA', lat: 39.5, lon: -121.63 },
      { icao: 'KDAX', name: 'Sacramento, CA', lat: 38.5, lon: -121.68 },
      { icao: 'KMUX', name: 'San Francisco Bay Area, CA', lat: 37.15, lon: -121.9 },
      { icao: 'KHNX', name: 'San Joaquin Valley / Hanford, CA', lat: 36.31, lon: -119.63 },
      { icao: 'KVTX', name: 'Los Angeles / Oxnard, CA', lat: 34.41, lon: -119.18 },
      { icao: 'KSOX', name: 'San Diego / Santa Ana Mtns, CA', lat: 33.82, lon: -117.64 },
      { icao: 'KNKX', name: 'San Diego, CA', lat: 32.92, lon: -117.04 },
      { icao: 'KEYX', name: 'Edwards AFB, CA', lat: 35.1, lon: -117.56 },
      { icao: 'KVBX', name: 'Vandenberg SFB, CA', lat: 34.84, lon: -120.4 },
    ],
  },
  {
    region: 'Pacific Northwest',
    stations: [
      { icao: 'KATX', name: 'Seattle / Everett, WA', lat: 48.19, lon: -122.49 },
      { icao: 'KOTX', name: 'Spokane, WA', lat: 47.68, lon: -117.63 },
      { icao: 'KLGX', name: 'Langley Hill, WA', lat: 47.12, lon: -124.11 },
      { icao: 'KRTX', name: 'Portland, OR', lat: 45.71, lon: -122.97 },
      { icao: 'KPDT', name: 'Pendleton, OR', lat: 45.69, lon: -118.85 },
      { icao: 'KMAX', name: 'Medford, OR', lat: 42.08, lon: -122.72 },
    ],
  },
  {
    region: 'Alaska',
    stations: [
      { icao: 'PABC', name: 'Bethel, AK', lat: 60.79, lon: -161.88 },
      { icao: 'PAPD', name: 'Fairbanks, AK', lat: 65.04, lon: -147.5 },
      { icao: 'PAHG', name: 'Anchorage / Kenai, AK', lat: 60.73, lon: -151.35 },
      { icao: 'PAKC', name: 'King Salmon, AK', lat: 58.68, lon: -156.63 },
      { icao: 'PAIH', name: 'Middleton Island, AK', lat: 59.46, lon: -146.3 },
      { icao: 'PAEC', name: 'Nome, AK', lat: 64.51, lon: -165.3 },
      { icao: 'PACG', name: 'Sitka / Biorka Island, AK', lat: 56.85, lon: -135.53 },
    ],
  },
  {
    region: 'Hawaii & Pacific',
    stations: [
      { icao: 'PHKI', name: 'Kauai, HI', lat: 21.89, lon: -159.55 },
      { icao: 'PHKM', name: 'Kohala / Kamuela, HI', lat: 20.13, lon: -155.78 },
      { icao: 'PHMO', name: 'Molokai, HI', lat: 21.13, lon: -157.18 },
      { icao: 'PHWA', name: 'South Hawaii, HI', lat: 19.1, lon: -155.57 },
      { icao: 'PGUA', name: 'Andersen AFB, Guam', lat: 13.45, lon: 144.81 },
    ],
  },
  {
    region: 'Caribbean',
    stations: [
      { icao: 'TJUA', name: 'San Juan, PR', lat: 18.12, lon: -66.08 },
    ],
  },
];

// Flat list (initial-camera + alert centering lookups).
export const LIVE_STATIONS = STATION_REGIONS.flatMap((r) =>
  r.stations.map((s) => ({ ...s, region: r.region, zoom: 8 }))
);

export function findStation(icao) {
  return LIVE_STATIONS.find((s) => s.icao === icao) || null;
}

/** Region groups filtered by a query (matches ICAO or city), empty groups dropped. */
export function filterRegions(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return STATION_REGIONS;
  return STATION_REGIONS.map((r) => ({
    region: r.region,
    stations: r.stations.filter(
      (s) => s.icao.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ),
  })).filter((r) => r.stations.length > 0);
}
