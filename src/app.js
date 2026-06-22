/**
 * @fileoverview Dependency-free weather median app for Hungary-relevant forecasts.
 *
 * The file is intentionally organised as a readable demo pipeline:
 * external providers -> canonical hourly forecasts -> daily medians -> advisory heuristics -> DOM rendering.
 */
const WeathermanApp = (() => {
  /** @typedef {{ lat: number, lon: number }} Coordinates */
  /**
   * Canonical hourly forecast shape shared by every provider adapter.
   * All times are Budapest-local keys and all units are metric.
   *
   * @typedef {Object} ForecastHour
   * @property {string} key Budapest-local hour key, for example `2026-06-22T14:00`.
   * @property {string} date Budapest-local date key, for example `2026-06-22`.
   * @property {?number} temp Temperature in Celsius.
   * @property {?number} humidity Relative humidity percentage.
   * @property {?number} precip Precipitation in millimetres for the hour.
   * @property {?number} wind Wind speed in kilometres per hour.
   * @property {?number} windDirection Wind direction in degrees.
   * @property {?number} cloud Cloud cover percentage.
   * @property {?number} [uv] UV index.
   * @property {?number} [uvClearSky] Clear-sky UV index.
   */
  /**
   * One provider's daily summary before cross-provider median aggregation.
   *
   * @typedef {Object} ProviderDayForecast
   * @property {string} provider Provider display name.
   * @property {string} date Budapest-local date key.
   * @property {?number} currentTemp Current or nearest upcoming hourly temperature.
   * @property {?number} humidity Daily median relative humidity percentage.
   * @property {?number} high Daily high temperature in Celsius.
   * @property {?number} low Daily low temperature in Celsius.
   * @property {?number} precip Daily precipitation sum in millimetres.
   * @property {?number} wind Daily maximum wind speed in kilometres per hour.
   * @property {?number} windDirection Prevailing wind direction in degrees.
   * @property {?number} cloud Daily median cloud cover percentage.
   * @property {?number} uv Daily maximum UV index.
   * @property {?number} uvClearSky Daily maximum clear-sky UV index.
   */
  /**
   * Cross-provider daily median used by the UI and advisory heuristics.
   *
   * @typedef {ProviderDayForecast & {
   *   sources: number,
   *   providerDays: ProviderDayForecast[],
   *   spread: Object,
   *   confidence?: number,
   *   previous?: AggregateDayForecast
   * }} AggregateDayForecast
   */
  /**
   * Provider fetch result. Failed providers stay in the result list so the UI can show source health.
   *
   * @typedef {Object} ProviderResult
   * @property {boolean} ok Whether the provider returned usable data.
   * @property {Object} provider Provider adapter metadata.
   * @property {string} url Requested endpoint URL.
   * @property {Object} [raw] Raw API payload.
   * @property {ForecastHour[]} [hourly] Canonical hourly forecast rows.
   * @property {Array<{date: string, uv: ?number, uvClearSky: ?number}>} [dailyUv] Daily UV rows.
   * @property {string} fetchedAt ISO timestamp for display and cache freshness.
   * @property {boolean} [fromCache] Whether the response came from the in-memory cache.
   * @property {number} [cacheAgeMs] Age of the cached response.
   * @property {string} [error] Human-readable provider failure.
   */
  /** @typedef {{ level: string, reasons: string[] }} ScoreEvaluation */
  /**
   * Fixed-size hourly window evaluated with the same agricultural rules as daily forecasts.
   *
   * @typedef {Object} WorkWindow
   * @property {number} start First hourly index covered by the window.
   * @property {number} end Last hourly index covered by the window.
   * @property {string} startKey Budapest-local start hour key.
   * @property {string} endKey Budapest-local end hour key.
   * @property {AggregateDayForecast} summary Window-level aggregate weather summary.
   * @property {ScoreEvaluation} evaluation Agricultural suitability score.
   */
  const zone = "Europe/Budapest";
  const forecastDays = 5;
  const openMeteoHourly = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover";
  const openMeteoDaily = "uv_index_max,uv_index_clear_sky_max";
  const LOCALE = Object.freeze({
    EN_GB: "en-GB",
    HU_HU: "hu-HU"
  });
  const CROP = Object.freeze({
    RAPESEED: "rapeseed",
    WHEAT: "wheat",
    BARLEY: "barley",
    CORN: "corn",
    SUNFLOWER: "sunflower"
  });
  const WORK = Object.freeze({
    SEEDING: "seeding",
    HARVESTING: "harvesting",
    SPRAYING: "spraying"
  });
  const SCORE = Object.freeze({
    GOOD: "good",
    CAUTION: "caution",
    POOR: "poor"
  });
  const ADVISORY_DOMAIN = Object.freeze({
    AGRI: "agri",
    FAMILY: "family",
    SPORTS: "sports"
  });
  const SPORT = Object.freeze({
    HIKING: "hiking",
    MOUNTAIN_BIKING: "mountainBiking",
    OPEN_WATER_SWIMMING: "openWaterSwimming"
  });
  const SUPPORTED_LOCALES = Object.freeze([LOCALE.EN_GB, LOCALE.HU_HU]);
  const SUPPORTED_CROPS = Object.freeze(Object.values(CROP));
  const SUPPORTED_WORK = Object.freeze(Object.values(WORK));
  const SUPPORTED_SPORTS = Object.freeze(Object.values(SPORT));
  const SUPPORTED_ADVISORY_DOMAINS = Object.freeze(Object.values(ADVISORY_DOMAIN));
  const SUPPORTED_THEMES = Object.freeze([
    "light", "dark", "cupcake", "bumblebee", "emerald", "corporate", "synthwave", "retro", "cyberpunk",
    "valentine", "halloween", "garden", "forest", "aqua", "lofi", "pastel", "fantasy", "wireframe",
    "black", "luxury", "dracula", "cmyk", "autumn", "business", "acid", "lemonade", "night", "coffee",
    "winter", "dim", "nord", "sunset", "caramellatte", "abyss", "silk"
  ]);
  const COORD_LIMITS = Object.freeze({
    LAT_MIN: -90,
    LAT_MAX: 90,
    LON_MIN: -180,
    LON_MAX: 180
  });
  const AGRI_LIMITS = Object.freeze({
    SEEDING_RAIN_POOR_MM: 8,
    SEEDING_RAIN_CAUTION_MM: 2,
    DRY_SEEDBED_RAIN_MM: 0.2,
    DRY_SEEDBED_HIGH_C: 30,
    COLD_SENSITIVE_LOW_C: 10,
    RAPESEED_HEAT_C: 29,
    RAPESEED_HEAT_RAIN_MM: 0.5,
    HARVEST_RAIN_POOR_MM: 3,
    HARVEST_RAIN_CAUTION_MM: 0.5,
    SPRAY_RAIN_POOR_MM: 1,
    SPRAY_RAIN_CAUTION_MM: 0.2,
    SPRAY_WIND_POOR_KMH: 20,
    SPRAY_WIND_CAUTION_KMH: 12,
    SPRAY_HEAT_POOR_C: 30,
    SPRAY_HEAT_CAUTION_C: 25,
    SPRAY_LOW_HUMIDITY_PERCENT: 35,
    DRYING_WEAK_CLOUD_PERCENT: 75,
    DRYING_WEAK_HUMIDITY_PERCENT: 85,
    WIND_POOR_KMH: 35,
    WIND_CAUTION_KMH: 22,
    HEAT_STRESS_C: 34,
    HUMID_HEAT_STRESS_C: 30,
    HUMID_HEAT_PERCENT: 70,
    SPORT_RAIN_CAUTION_MM: 2,
    SPORT_RAIN_POOR_MM: 8,
    SPORT_WIND_CAUTION_KMH: 25,
    SPORT_WIND_POOR_KMH: 40,
    SPORT_HOT_C: 30,
    SPORT_COLD_C: 5,
    SWIM_MIN_C: 20,
    SWIM_WIND_CAUTION_KMH: 18,
    SWIM_WIND_POOR_KMH: 28,
    SATURATED_WETNESS: 4,
    PARTIAL_DRYING_WETNESS: 2
  });
  const PROVIDER_ID = Object.freeze({
    OPENMETEO: "openmeteo",
    ECMWF: "ecmwf",
    DWD: "dwd",
    METEOFRANCE: "meteofrance",
    GFS: "gfs",
    METNO: "metno"
  });
  const SETTINGS_KEY = "weatherman.settings.v1";
  const SECTION_IDS = Object.freeze(["todaySection", "forecastSection", "mapSection", "advisorySection", "providersSection", "sourcesSection"]);
  const DEFAULT_OPEN_SECTIONS = Object.freeze(["todaySection", "advisorySection"]);
  const FORECAST_HISTORY_PREFIX = "weatherman.forecastHistory.v1";
  const PROVIDER_CACHE_TTL_MS = 15 * 60 * 1000;
  const PROVIDER_TIMEOUT_MS = 10000;
  const MAX_FORECAST_SNAPSHOTS = 6;
  const providerCache = new Map();
  // Provider adapters map raw API payloads into this canonical hourly shape:
  // { key, date, temp, humidity, precip, wind, windDirection, cloud } with Budapest-local time and metric units.
  const providers = [
    {
      id: PROVIDER_ID.OPENMETEO,
      name: "Open-Meteo Forecast",
      url: coords => openMeteoUrl("/v1/forecast", coords)
    },
    {
      id: PROVIDER_ID.ECMWF,
      name: "ECMWF IFS",
      url: coords => openMeteoUrl("/v1/ecmwf", coords)
    },
    {
      id: PROVIDER_ID.DWD,
      name: "DWD ICON",
      url: coords => openMeteoUrl("/v1/dwd-icon", coords)
    },
    {
      id: PROVIDER_ID.METEOFRANCE,
      name: "Meteo-France",
      url: coords => openMeteoUrl("/v1/meteofrance", coords)
    },
    {
      id: PROVIDER_ID.GFS,
      name: "NOAA GFS",
      url: coords => openMeteoUrl("/v1/gfs", coords)
    },
    {
      id: PROVIDER_ID.METNO,
      name: "MET Norway",
      url: coords => `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${coords.lat}&lon=${coords.lon}`,
      mapResponse: normaliseMetNo
    }
  ];

  const todayEl = document.querySelector("#today");
  const forecastEl = document.querySelector("#forecast");
  const forecastInsightEl = document.querySelector("#forecastInsight");
  const hourlyChartCanvas = document.querySelector("#hourlyChart");
  const workWindowsEl = document.querySelector("#workWindows");
  const weatherMap = document.querySelector("#weatherMap");
  const agriEl = document.querySelector("#agri");
  const familyEl = document.querySelector("#family");
  const sportsEl = document.querySelector("#sports");
  const providersEl = document.querySelector("#providers");
  const sourceComparisonEl = document.querySelector("#sourceComparison");
  const sourcesEl = document.querySelector("#sources");
  const statusEl = document.querySelector("#status");
  const refreshButton = document.querySelector("#refresh");
  const locateButton = document.querySelector("#locate");
  const updateToast = document.querySelector("#updateToast");
  const updateToastText = document.querySelector("#updateToastText");
  const updateReload = document.querySelector("#updateReload");
  const controls = document.querySelector("#controls");
  const place = document.querySelector("#place");
  const lat = document.querySelector("#lat");
  const lon = document.querySelector("#lon");
  const language = document.querySelector("#language");
  const theme = document.querySelector("#theme");
  const crop = document.querySelector("#crop");
  const work = document.querySelector("#work");
  const sport = document.querySelector("#sport");
  const agriTab = document.querySelector("#agriTab");
  const familyTab = document.querySelector("#familyTab");
  const sportsTab = document.querySelector("#sportsTab");
  const agriPanel = document.querySelector("#agriPanel");
  const familyPanel = document.querySelector("#familyPanel");
  const sportsPanel = document.querySelector("#sportsPanel");
  const sectionAccordions = SECTION_IDS.map(id => document.querySelector(`#${id}`));
  let lastResults = [];
  let lastAggregate = null;
  let hourlyChart = null;

  const text = {
    [LOCALE.EN_GB]: {
      title: "Hungary Weather Median",
      subtitle: "Median forecast from Europe/Hungary-relevant public sources. Raw responses stay available below.",
      place: "Place",
      lat: "Latitude",
      lon: "Longitude",
      language: "Language",
      theme: "Theme",
      crop: "Crop",
      work: "Work",
      sport: "Sport",
      refresh: "Refresh",
      locate: "Use my location",
      updateAvailable: "New version available.",
      updateReload: "Reload",
      today: "Today",
      forecast: "Forecast",
      hourly: "Hourly Work Window",
      hourlyNote: "Hourly median for the next 48 hours. Shaded 6-hour windows use the selected crop and work rules.",
      map: "Weather Map",
      mapNote: "Visual Windy cloud layer only. It is not part of the median forecast calculation.",
      advisories: "Advisories",
      agriculture: "Agricultural Work",
      family: "Family",
      sports: "Sports",
      providers: "Provider Snapshots",
      sources: "Sources",
      footerText: "Open-source weather median app.",
      license: "MIT license",
      insightTitle: "Forecast insight",
      sourceComparison: "Source comparison",
      medianNote: "Median values ignore sources that fail or do not report a metric. Precipitation is the median daily sum, not a probability.",
      agriNote: "Heuristic field-work guidance only. It does not include soil moisture, crop stage, machinery limits or field access.",
      familyNote: "Practical weather-risk guidance only. It is not medical advice and does not account for personal health conditions.",
      sportsNote: "Practical outdoor sport guidance only. It does not replace local trail, water-quality, lifeguard or storm warnings.",
      loading: count => `Loading ${count} sources...`,
      providerTimeout: seconds => `Provider timed out after ${seconds} seconds.`,
      invalidCoords: "Latitude must be between -90 and 90. Longitude must be between -180 and 180.",
      locating: "Waiting for browser location permission...",
      geolocationUnavailable: "Browser location is not available.",
      geolocationFailed: "Could not read browser location.",
      now: "Now",
      activeSources: count => `${count} active sources`,
      highLow: "High / low",
      dailyRange: "Median daily range",
      precipitation: "Precipitation",
      humidity: "Humidity",
      dailyTotal: "Median daily total",
      dailyMedian: "Median daily value",
      uv: "UV index",
      dailyUvMax: "Median daily max",
      uvClearSky: "clear sky",
      wind: "Wind",
      dailyMax: "Median daily max",
      rulingWindDirection: "Ruling direction",
      chartUnavailable: "Chart library unavailable.",
      tempChart: "Temperature",
      rainChart: "Rain",
      windChart: "Wind",
      workWindow: "Work window",
      agriculturalWorkWindow: "Best agricultural work window",
      confidence: "Confidence",
      fetched: "Fetched",
      cached: "cached",
      rain: "Rain",
      cloud: "Cloud",
      sourceCount: "Sources",
      providerAgreement: "Provider agreement",
      changeSinceLast: "Change since last forecast",
      bestWindow: "Best work window",
      noGoodWindow: "No good 6-hour work window in the next 48 hours.",
      agriInputs: "Inputs behind the score",
      wettestSource: "Wettest source",
      wetness: "Carry-over wetness",
      familySituations: "Daily situations",
      schoolRun: "School run",
      outdoorPlay: "Outdoor play",
      middaySun: "Midday sun",
      eveningWeather: "Evening",
      agreementClose: "sources agree closely",
      agreementMixed: "sources show moderate spread",
      agreementWide: "sources disagree materially",
      noHistoryChange: "no earlier local snapshot for this day",
      noMeaningfulChange: "no meaningful change",
      changedWetter: amount => `wetter by ${amount}`,
      changedDrier: amount => `drier by ${amount}`,
      changedWarmer: amount => `warmer by ${amount}`,
      changedCooler: amount => `cooler by ${amount}`,
      changedWindier: amount => `windier by ${amount}`,
      changedCalmer: amount => `calmer by ${amount}`,
      bestWindowSummary: (range, level, rain, wind) => `${range}: ${level}, ${rain} rain, ${wind} wind.`,
      uvSuppressed: clearSky => `Clouds may be suppressing UV; clear-sky potential is ${clearSky}.`,
      high: "High",
      low: "Low",
      rawData: "raw data",
      seeding: "Seeding",
      harvesting: "Harvesting",
      spraying: "Spraying",
      rapeseed: "Rapeseed",
      wheat: "Wheat",
      barley: "Barley",
      corn: "Corn",
      sunflower: "Sunflower",
      hiking: "Hiking",
      mountainBiking: "Mountain biking",
      openWaterSwimming: "Open-water swimming",
      dress: "Dress",
      health: "Health risks",
      good: "Good",
      caution: "Caution",
      poor: "Poor",
      noData: "No usable forecast data",
      reasons: {
        rainPoor: "rain makes field work and soil contact unreliable",
        rainCaution: "some rain may interrupt work",
        drySeedbed: "dry forecast may limit seedbed moisture",
        wetHarvest: "rain and wet crop risk are too high for harvest",
        sprayRain: "rain may wash spray off before it can work",
        sprayDrift: "wind increases spray drift risk",
        sprayEvaporation: "low humidity can increase spray evaporation risk",
        sprayHeat: "heat can reduce spray accuracy and crop safety",
        dryingWeak: "cloud cover or high humidity suggests weak drying",
        windPoor: "wind is too strong for accurate field operations",
        windCaution: "wind may affect machinery accuracy and losses",
        coldSensitive: "cold nights may slow emergence",
        heatStress: "high heat increases crop and operator stress",
        rapeseedHeat: "rapeseed seeding is sensitive to dry heat",
        cerealHarvest: "small-grain harvest needs a dry window",
        saturatedLand: "heavy earlier rain may leave the land too wet for field work",
        partialDrying: "recent rain may still need more drying time",
        workable: "weather window looks workable on the available forecast",
        noData: "no usable forecast data"
      },
      familyReasons: {
        lightClothes: "light breathable clothes",
        warmLayer: "warm layer for cooler parts of the day",
        coat: "coat, hat and gloves for cold exposure",
        rainGear: "rain jacket or umbrella",
        windLayer: "wind-resistant outer layer",
        sunProtection: "hat, sunglasses and sunscreen for long outdoor time",
        comfortable: "ordinary outdoor plans look comfortable",
        uvModerate: "UV exposure needs sunscreen for longer outdoor time",
        uvHigh: "high UV; prefer shade and reduce late-morning to afternoon exposure",
        uvVeryHigh: "very high UV; keep children's midday outdoor time short",
        uvCloudBreaks: "cloud breaks could raise UV exposure quickly",
        humidHeat: "humidity makes heat harder to tolerate",
        heatHydration: "heat can affect anyone; plan water and shade",
        heatReduceActivity: "reduce strenuous midday outdoor activity",
        checkVulnerable: "check children, older adults and people with chronic conditions",
        coldExposure: "cold exposure risk; keep children warm and dry",
        wetCold: "rain with cool air can increase chill risk",
        strongWind: "strong wind can make walking, cycling and playground time harder",
        heavyRain: "heavy rain may disrupt school runs and outdoor plans",
        noData: "no usable forecast data"
      },
      sportsReasons: {
        rain: "rain may reduce grip, visibility or comfort",
        heavyRain: "heavy rain makes conditions unreliable",
        wind: "wind may make exposed areas harder to manage",
        heat: "heat increases exertion and hydration risk",
        cold: "cold conditions need extra layers and caution",
        stormRisk: "rain with strong wind suggests possible storm exposure",
        trailWet: "wet trails may be slippery or vulnerable to damage",
        swimCold: "air temperature is low for open-water swimming comfort",
        swimWind: "wind can make open water choppy and harder to exit safely",
        swimRain: "rain can reduce visibility and comfort on open water",
        workable: "weather looks suitable for the selected sport",
        noData: "no usable forecast data"
      }
    },
    [LOCALE.HU_HU]: {
      title: "Magyarországi időjárási medián",
      subtitle: "Medián előrejelzés Európához és Magyarországhoz releváns nyilvános forrásokból. A nyers válaszok lent elérhetők.",
      place: "Hely",
      lat: "Szélesség",
      lon: "Hosszúság",
      language: "Nyelv",
      theme: "Téma",
      crop: "Kultúra",
      work: "Munka",
      sport: "Sport",
      refresh: "Frissítés",
      locate: "Saját helyzet",
      updateAvailable: "Új verzió érhető el.",
      updateReload: "Újratöltés",
      today: "Ma",
      forecast: "Előrejelzés",
      hourly: "Óránkénti munkablak",
      hourlyNote: "Óránkénti medián a következő 48 órára. Az árnyékolt 6 órás ablakok a kiválasztott kultúra és munka szabályait használják.",
      map: "Időjárási térkép",
      mapNote: "Csak vizuális Windy felhőréteg. Nem része a medián előrejelzés számításának.",
      advisories: "Tanácsok",
      agriculture: "Mezőgazdasági munka",
      family: "Család",
      sports: "Sport",
      providers: "Források röviden",
      sources: "Nyers források",
      footerText: "Nyílt forráskódú időjárási medián alkalmazás.",
      license: "MIT licenc",
      insightTitle: "Előrejelzési összkép",
      sourceComparison: "Forrás-összehasonlítás",
      medianNote: "A medián értékek kihagyják a hibás vagy hiányos forrásokat. A csapadék napi medián összeg, nem valószínűség.",
      agriNote: "Csak heurisztikus munkaszervezési jelzés. Nem tartalmaz talajnedvességet, fenológiai állapotot, gépkorlátot vagy területi megközelítést.",
      familyNote: "Csak gyakorlati időjárási kockázati jelzés. Nem orvosi tanács, és nem veszi figyelembe az egyéni egészségi állapotot.",
      sportsNote: "Csak gyakorlati kültéri sportjelzés. Nem helyettesíti a helyi túraútvonal-, vízminőségi, vízimentői vagy viharjelzéseket.",
      loading: count => `${count} forrás betöltése...`,
      providerTimeout: seconds => `A forrás ${seconds} másodperc után időtúllépésre futott.`,
      invalidCoords: "A szélességnek -90 és 90, a hosszúságnak -180 és 180 között kell lennie.",
      locating: "Várakozás a böngésző helymeghatározási engedélyére...",
      geolocationUnavailable: "A böngésző helymeghatározása nem elérhető.",
      geolocationFailed: "Nem sikerült beolvasni a böngésző helyzetét.",
      now: "Most",
      activeSources: count => `${count} aktív forrás`,
      highLow: "Max / min",
      dailyRange: "Medián napi tartomány",
      precipitation: "Csapadék",
      humidity: "Páratartalom",
      dailyTotal: "Medián napi összeg",
      dailyMedian: "Medián napi érték",
      uv: "UV-index",
      dailyUvMax: "Medián napi maximum",
      uvClearSky: "derült égbolt",
      wind: "Szél",
      dailyMax: "Medián napi maximum",
      rulingWindDirection: "Uralkodó irány",
      chartUnavailable: "A diagramkönyvtár nem elérhető.",
      tempChart: "Hőmérséklet",
      rainChart: "Eső",
      windChart: "Szél",
      workWindow: "Munkablak",
      agriculturalWorkWindow: "Legjobb mezőgazdasági munkablak",
      confidence: "Bizalom",
      fetched: "Lekérve",
      cached: "gyorsítótárból",
      rain: "Eső",
      cloud: "Felhő",
      sourceCount: "Forrás",
      providerAgreement: "Forrásegyezés",
      changeSinceLast: "Változás az előző előrejelzéshez képest",
      bestWindow: "Legjobb munkablak",
      noGoodWindow: "Nincs jó 6 órás munkablak a következő 48 órában.",
      agriInputs: "A pontszám bemenetei",
      wettestSource: "Legcsapadékosabb forrás",
      wetness: "Áthúzódó nedvesség",
      familySituations: "Napi helyzetek",
      schoolRun: "Iskolába menet",
      outdoorPlay: "Kinti program",
      middaySun: "Déli nap",
      eveningWeather: "Este",
      agreementClose: "a források szorosan együtt mozognak",
      agreementMixed: "a források között közepes szórás van",
      agreementWide: "a források érdemben eltérnek",
      noHistoryChange: "nincs korábbi helyi pillanatkép erre a napra",
      noMeaningfulChange: "nincs érdemi változás",
      changedWetter: amount => `${amount} csapadékkal nedvesebb`,
      changedDrier: amount => `${amount} csapadékkal szárazabb`,
      changedWarmer: amount => `${amount} értékkel melegebb`,
      changedCooler: amount => `${amount} értékkel hűvösebb`,
      changedWindier: amount => `${amount} értékkel szelesebb`,
      changedCalmer: amount => `${amount} értékkel gyengébb szél`,
      bestWindowSummary: (range, level, rain, wind) => `${range}: ${level}, ${rain} eső, ${wind} szél.`,
      uvSuppressed: clearSky => `A felhőzet csökkentheti az UV-t; derült égbolt mellett ${clearSky} lehetne.`,
      high: "Max",
      low: "Min",
      rawData: "nyers adat",
      seeding: "Vetés",
      harvesting: "Aratás",
      spraying: "Permetezés",
      rapeseed: "Repce",
      wheat: "Búza",
      barley: "Árpa",
      corn: "Kukorica",
      sunflower: "Napraforgó",
      hiking: "Túrázás",
      mountainBiking: "Hegyi kerékpározás",
      openWaterSwimming: "Nyílt vízi úszás",
      dress: "Öltözet",
      health: "Egészségi kockázatok",
      good: "Jó",
      caution: "Óvatosan",
      poor: "Nem ajánlott",
      noData: "Nincs használható előrejelzés",
      reasons: {
        rainPoor: "az eső bizonytalanná teszi a munkát és a mag-talaj kapcsolatot",
        rainCaution: "kisebb eső megszakíthatja a munkát",
        drySeedbed: "a száraz előrejelzés korlátozhatja a kelést",
        wetHarvest: "az eső és a nedves termény kockázata túl magas aratáshoz",
        sprayRain: "az eső lemoshatja a permetet, mielőtt hatna",
        sprayDrift: "a szél növeli az elsodródás kockázatát",
        sprayEvaporation: "az alacsony páratartalom növelheti a párolgási kockázatot permetezéskor",
        sprayHeat: "a meleg ronthatja a permetezés pontosságát és a növénybiztonságot",
        dryingWeak: "a felhőzet vagy magas páratartalom gyenge száradást jelez",
        windPoor: "a szél túl erős a pontos munkavégzéshez",
        windCaution: "a szél ronthatja a gépek pontosságát és növelheti a veszteséget",
        coldSensitive: "a hideg éjszakák lassíthatják a kelést",
        heatStress: "a nagy meleg növeli a növényi és kezelői stresszt",
        rapeseedHeat: "a repce vetése érzékeny a száraz melegre",
        cerealHarvest: "a gabonaaratásnak száraz ablak kell",
        saturatedLand: "a korábbi nagy eső miatt a terület még túl nedves lehet a munkához",
        partialDrying: "a friss csapadék után még száradási időre lehet szükség",
        workable: "az elérhető előrejelzés alapján a munkablak használhatónak tűnik",
        noData: "nincs használható előrejelzés"
      },
      familyReasons: {
        lightClothes: "könnyű, jól szellőző ruházat",
        warmLayer: "melegebb réteg a hűvösebb napszakokra",
        coat: "kabát, sapka és kesztyű hideg kitettséghez",
        rainGear: "esőkabát vagy esernyő",
        windLayer: "szélálló külső réteg",
        sunProtection: "sapka, napszemüveg és naptej hosszabb kinti időhöz",
        comfortable: "a szokásos kinti programok kényelmesnek tűnnek",
        uvModerate: "az UV-sugárzás miatt hosszabb kinti időhöz naptej kell",
        uvHigh: "magas UV; inkább árnyék és kevesebb késő délelőtti-délutáni kitettség",
        uvVeryHigh: "nagyon magas UV; a gyerekek déli kinti ideje legyen rövid",
        uvCloudBreaks: "a felhőzet felszakadozása gyorsan növelheti az UV-kitettséget",
        humidHeat: "a páratartalom nehezíti a hőség elviselését",
        heatHydration: "a hőség bárkit érinthet; tervezzetek vízzel és árnyékkal",
        heatReduceActivity: "érdemes csökkenteni a megterhelő déli kinti aktivitást",
        checkVulnerable: "figyeljetek a gyerekekre, idősekre és krónikus betegekre",
        coldExposure: "hideg kitettségi kockázat; a gyerekek maradjanak melegen és szárazon",
        wetCold: "az eső és hűvös levegő növelheti az áthűlés kockázatát",
        strongWind: "az erős szél nehezítheti a sétát, biciklizést és játszóterezést",
        heavyRain: "a nagy eső zavarhatja az iskolába járást és a kinti programokat",
        noData: "nincs használható előrejelzés"
      },
      sportsReasons: {
        rain: "az eső ronthatja a tapadást, láthatóságot vagy komfortot",
        heavyRain: "a nagy eső megbízhatatlanná teszi a körülményeket",
        wind: "a szél nehezítheti a kitett szakaszokat",
        heat: "a hőség növeli a terhelési és hidratálási kockázatot",
        cold: "hidegben több réteg és nagyobb óvatosság kell",
        stormRisk: "az eső és erős szél viharkitettségre utalhat",
        trailWet: "a vizes útvonal csúszós lehet vagy sérülékenyebb lehet",
        swimCold: "a levegő hűvös a nyílt vízi úszás komfortjához",
        swimWind: "a szél hullámossá teheti a nyílt vizet és nehezítheti a kijutást",
        swimRain: "az eső ronthatja a láthatóságot és komfortot nyílt vízen",
        workable: "az időjárás megfelelőnek tűnik a kiválasztott sporthoz",
        noData: "nincs használható előrejelzés"
      }
    }
  };

  /**
   * Bootstraps DOM event listeners, restores saved preferences, applies static UI state, and loads weather data.
   * This is the only method exposed from the module.
   *
   * @returns {void}
   */
  function start() {
    place.addEventListener("change", () => {
      if (place.value === "custom") return;
      const [nextLat, nextLon] = place.value.split(",");
      lat.value = nextLat;
      lon.value = nextLon;
      saveSettings();
    });

    controls.addEventListener("submit", event => {
      event.preventDefault();
      saveSettings();
      loadWeather();
    });

    locateButton.addEventListener("click", useBrowserLocation);
    agriTab.addEventListener("click", () => setActiveDomain(ADVISORY_DOMAIN.AGRI, true));
    familyTab.addEventListener("click", () => setActiveDomain(ADVISORY_DOMAIN.FAMILY, true));
    sportsTab.addEventListener("click", () => setActiveDomain(ADVISORY_DOMAIN.SPORTS, true));

    sectionAccordions.forEach(section => {
      section.addEventListener("toggle", saveSettings);
    });

    [language, theme, crop, work, sport].forEach(control => {
      control.addEventListener("change", () => {
        applyStaticText();
        applyTheme();
        updateMap();
        saveSettings();
        rerenderCachedWeather();
      });
    });

    updateThemeOptions();
    if (!loadSettings()) {
      applyBrowserLocale();
      applySectionState(DEFAULT_OPEN_SECTIONS);
    }
    applyStaticText();
    applyTheme();
    registerServiceWorker();
    loadWeather();
  }

  // Application Lifecycle

  /**
   * Registers the PWA service worker and exposes the update toast when a newer worker is waiting.
   *
   * @returns {void}
   */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" })
      .then(registration => {
        registration.update().catch(() => {});

        updateReload.addEventListener("click", () => {
          const worker = registration.waiting;
          if (!worker) return;
          updateReload.disabled = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateToast();
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      })
      .catch(() => {});
  }

  /**
   * Shows the reload prompt after a new service worker version is available.
   *
   * @returns {void}
   */
  function showUpdateToast() {
    updateToast.hidden = false;
  }

  /**
   * Fetches all configured providers for the selected coordinates, aggregates usable forecasts, and renders the app.
   * Failed providers are retained for source health display but excluded from median calculations.
   *
   * @returns {Promise<void>}
   */
  async function loadWeather() {
    const coords = readCoords();
    if (!coords) return;

    refreshButton.disabled = true;
    todayEl.innerHTML = loadingMetricMarkup();
    forecastInsightEl.innerHTML = "";
    forecastEl.innerHTML = "";
    agriEl.innerHTML = "";
    familyEl.innerHTML = "";
    sportsEl.innerHTML = "";
    sourceComparisonEl.innerHTML = "";
    providersEl.innerHTML = "";
    sourcesEl.innerHTML = "";
    statusEl.innerHTML = statusMessageMarkup(t().loading(providers.length), "info", "fa-cloud-arrow-down");

    const results = await Promise.all(providers.map(provider => fetchProvider(provider, coords)));
    const usable = results.filter(result => result.ok);
    const aggregate = buildAggregate(usable);
    const history = loadForecastHistory(coords);
    aggregate.days = withForecastConfidence(aggregate.days, history);
    aggregate.today = aggregate.days.find(day => day.date === budapestDateKey(new Date())) || aggregate.today;
    lastResults = results;
    lastAggregate = aggregate;
    updateMap();

    renderAll(results, aggregate);
    saveForecastHistory(coords, aggregate.days);

    refreshButton.disabled = false;
  }

  /**
   * Renders every weather-dependent section from the latest provider results and aggregate forecast.
   *
   * @param {ProviderResult[]} results Provider fetch results, including failures.
   * @param {{ today: AggregateDayForecast, days: AggregateDayForecast[] }} aggregate Median forecast read model.
   * @returns {void}
   */
  function renderAll(results, aggregate) {
    const usable = results.filter(result => result.ok);
    renderStatus(results);
    renderToday(aggregate.today, usable.length);
    renderForecastInsight(aggregate.days, usable);
    renderForecast(aggregate.days);
    renderHourlyWork(usable);
    renderAgriculture(aggregate.days);
    renderFamily(aggregate.days);
    renderSports(aggregate.days);
    renderProviders(results);
    renderSources(results);
  }

  /**
   * Re-renders the current forecast when a display preference changes without refetching providers.
   *
   * @returns {void}
   */
  function rerenderCachedWeather() {
    if (lastAggregate) renderAll(lastResults, lastAggregate);
  }

  // Preferences And Client Inputs

  /**
   * Restores persisted controls and open sections from localStorage.
   * Invalid or stale values are ignored so changed option sets do not break the page.
   *
   * @returns {boolean} Whether settings were restored.
   */
  function loadSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!settings) return false;
      if (selectHasValue(place, settings.place)) place.value = settings.place;
      if (Number.isFinite(settings.lat)) lat.value = String(settings.lat);
      if (Number.isFinite(settings.lon)) lon.value = String(settings.lon);
      if (selectHasValue(language, settings.language)) language.value = settings.language;
      if (selectHasValue(theme, settings.theme)) theme.value = settings.theme;
      if (selectHasValue(crop, settings.crop)) crop.value = settings.crop;
      if (selectHasValue(work, settings.work)) work.value = settings.work;
      if (selectHasValue(sport, settings.sport)) sport.value = settings.sport;
      if (SUPPORTED_ADVISORY_DOMAINS.includes(settings.advisoryDomain)) setActiveDomain(settings.advisoryDomain);
      if (Array.isArray(settings.openSections)) applySectionState(settings.openSections);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Applies the persisted accordion open/closed state.
   *
   * @param {string[]} openSections Section element IDs that should be open.
   * @returns {void}
   */
  function applySectionState(openSections) {
    sectionAccordions.forEach(section => {
      section.open = openSections.includes(section.id);
    });
  }

  /**
   * Persists the current controls and section state. Storage failures are ignored because persistence is optional.
   *
   * @returns {void}
   */
  function saveSettings() {
    try {
      const coords = parseCoords();
      if (!coords) return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        place: place.value,
        lat: coords.lat,
        lon: coords.lon,
        language: language.value,
        theme: theme.value,
        crop: crop.value,
        work: work.value,
        sport: sport.value,
        advisoryDomain: currentAdvisoryDomain(),
        openSections: sectionAccordions
          .filter(section => section.open)
          .map(section => section.id)
      }));
    } catch {
      // localStorage may be disabled; the page remains usable without persistence.
    }
  }

  function selectHasValue(select, value) {
    return [...select.options].some(option => option.value === value);
  }

  /**
   * Selects Hungarian when the browser advertises any Hungarian locale, otherwise falls back to British English.
   *
   * @returns {void}
   */
  function applyBrowserLocale() {
    const browserLocale = (navigator.languages || [navigator.language])
      .filter(Boolean)
      .map(locale => locale.toLowerCase())
      .find(locale => locale.startsWith("hu"));
    language.value = browserLocale ? LOCALE.HU_HU : LOCALE.EN_GB;
  }

  /**
   * Reads the browser geolocation permission result into the coordinate controls and refreshes the forecast.
   *
   * @returns {void}
   */
  function useBrowserLocation() {
    if (!navigator.geolocation) {
      statusEl.innerHTML = statusMessageMarkup(t().geolocationUnavailable, "error", "fa-triangle-exclamation");
      return;
    }

    locateButton.disabled = true;
    statusEl.innerHTML = statusMessageMarkup(t().locating, "info", "fa-location-crosshairs");
    navigator.geolocation.getCurrentPosition(
      position => {
        place.value = "custom";
        lat.value = position.coords.latitude.toFixed(5);
        lon.value = position.coords.longitude.toFixed(5);
        locateButton.disabled = false;
        saveSettings();
        loadWeather();
      },
      () => {
        locateButton.disabled = false;
        statusEl.innerHTML = statusMessageMarkup(t().geolocationFailed, "error", "fa-triangle-exclamation");
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000
      }
    );
  }

  /**
   * Reads and validates coordinate controls, reporting a translated validation error in the status area.
   *
   * @returns {?Coordinates} Valid coordinates, or null when the current form values are invalid.
   */
  function readCoords() {
    const coords = parseCoords();
    if (!coords) {
      statusEl.innerHTML = statusMessageMarkup(t().invalidCoords, "error", "fa-triangle-exclamation");
      return null;
    }
    return coords;
  }

  /**
   * Parses coordinate controls into numeric latitude and longitude values.
   * Commas are accepted as decimal separators for Hungarian input habits.
   *
   * @returns {?Coordinates} Valid coordinates, or null when parsing or range validation fails.
   */
  function parseCoords() {
    const coords = {
      lat: Number(lat.value.trim().replace(",", ".")),
      lon: Number(lon.value.trim().replace(",", "."))
    };
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return null;
    if (coords.lat < COORD_LIMITS.LAT_MIN || coords.lat > COORD_LIMITS.LAT_MAX) return null;
    if (coords.lon < COORD_LIMITS.LON_MIN || coords.lon > COORD_LIMITS.LON_MAX) return null;
    return coords;
  }

  // Localisation And Theme

  /**
   * Returns the active translation table, falling back to English if the selected locale is unsupported.
   *
   * @returns {Object} Translation strings and formatter callbacks for the current locale.
   */
  function t() {
    const locale = SUPPORTED_LOCALES.includes(language.value) ? language.value : LOCALE.EN_GB;
    return text[locale];
  }

  /**
   * Applies translated static labels and option text after startup or language changes.
   * Dynamic weather sections are rendered separately from forecast data.
   *
   * @returns {void}
   */
  function applyStaticText() {
    const strings = t();
    const locale = SUPPORTED_LOCALES.includes(language.value) ? language.value : LOCALE.EN_GB;
    document.documentElement.lang = locale;
    document.title = strings.title;
    document.querySelector("#title").textContent = strings.title;
    document.querySelector("#subtitle").textContent = strings.subtitle;
    document.querySelector("#placeLabel").textContent = strings.place;
    document.querySelector("#latLabel").textContent = strings.lat;
    document.querySelector("#lonLabel").textContent = strings.lon;
    document.querySelector("#languageLabel").textContent = strings.language;
    document.querySelector("#themeLabel").textContent = strings.theme;
    document.querySelector("#cropLabel").textContent = strings.crop;
    document.querySelector("#workLabel").textContent = strings.work;
    document.querySelector("#sportLabel").textContent = strings.sport;
    refreshButton.innerHTML = `${iconMarkup("fa-rotate-right")} ${escapeHtml(strings.refresh)}`;
    locateButton.innerHTML = `${iconMarkup("fa-location-crosshairs")} ${escapeHtml(strings.locate)}`;
    updateToastText.textContent = strings.updateAvailable;
    updateReload.innerHTML = `${iconMarkup("fa-rotate")} ${escapeHtml(strings.updateReload)}`;
    document.querySelector("#todayTitle").innerHTML = `${iconMarkup("fa-sun")} ${escapeHtml(strings.today)}`;
    document.querySelector("#forecastTitle").innerHTML = `${iconMarkup("fa-cloud-sun")} ${escapeHtml(strings.forecast)}`;
    document.querySelector("#hourlyTitle").textContent = strings.hourly;
    document.querySelector("#hourlyNote").textContent = strings.hourlyNote;
    document.querySelector("#mapTitle").innerHTML = `${iconMarkup("fa-map-location-dot")} ${escapeHtml(strings.map)}`;
    document.querySelector("#mapNote").textContent = strings.mapNote;
    document.querySelector("#advisoryTitle").innerHTML = `${iconMarkup("fa-clipboard-list")} ${escapeHtml(strings.advisories)}`;
    agriTab.innerHTML = `${iconMarkup("fa-seedling")} ${escapeHtml(strings.agriculture)}`;
    familyTab.innerHTML = `${iconMarkup("fa-people-roof")} ${escapeHtml(strings.family)}`;
    sportsTab.innerHTML = `${iconMarkup("fa-person-running")} ${escapeHtml(strings.sports)}`;
    document.querySelector("#providersTitle").innerHTML = `${iconMarkup("fa-satellite-dish")} ${escapeHtml(strings.providers)}`;
    document.querySelector("#sourcesTitle").innerHTML = `${iconMarkup("fa-code")} ${escapeHtml(strings.sources)}`;
    document.querySelector("#footerText").textContent = strings.footerText;
    document.querySelector("#licenseLink").textContent = strings.license;
    document.querySelector("#medianNote").textContent = strings.medianNote;
    document.querySelector("#agriNote").textContent = strings.agriNote;
    document.querySelector("#familyNote").textContent = strings.familyNote;
    document.querySelector("#sportsNote").textContent = strings.sportsNote;
    updateThemeOptions();
    updateOptionLabels(crop, SUPPORTED_CROPS);
    updateOptionLabels(work, SUPPORTED_WORK);
    updateOptionLabels(sport, SUPPORTED_SPORTS);
    sortSelectOptions(language, locale);
    sortSelectOptions(theme, locale);
    sortSelectOptions(crop, locale);
    sortSelectOptions(work, locale);
    sortSelectOptions(sport, locale);
  }

  /**
   * Rebuilds DaisyUI theme options while preserving the selected theme when it is still supported.
   *
   * @returns {void}
   */
  function updateThemeOptions() {
    const selected = theme.value || "emerald";
    theme.innerHTML = SUPPORTED_THEMES
      .map(name => `<option value="${name}">${themeLabel(name)}</option>`)
      .join("");
    theme.value = SUPPORTED_THEMES.includes(selected) ? selected : "emerald";
  }

  function themeLabel(name) {
    return name.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  /**
   * Applies the selected DaisyUI theme to the document root.
   *
   * @returns {void}
   */
  function applyTheme() {
    document.documentElement.dataset.theme = SUPPORTED_THEMES.includes(theme.value) ? theme.value : "emerald";
  }

  function updateOptionLabels(select, values) {
    values.forEach(value => {
      select.querySelector(`option[value="${value}"]`).textContent = t()[value];
    });
  }

  function sortSelectOptions(select, locale) {
    const selected = select.value;
    [...select.options]
      .sort((a, b) => a.textContent.localeCompare(b.textContent, locale))
      .forEach(option => select.append(option));
    select.value = selected;
  }

  // External Provider Adapters

  /**
   * Builds an Open-Meteo-compatible forecast URL for all Open-Meteo-hosted provider APIs.
   *
   * @param {string} path API path such as `/v1/forecast` or `/v1/ecmwf`.
   * @param {Coordinates} coords Forecast location.
   * @returns {string} Fully qualified provider URL.
   */
  function openMeteoUrl(path, coords) {
    const params = new URLSearchParams({
      latitude: coords.lat,
      longitude: coords.lon,
      hourly: openMeteoHourly,
      daily: openMeteoDaily,
      forecast_days: String(forecastDays),
      timezone: zone,
      wind_speed_unit: "kmh",
      precipitation_unit: "mm",
      temperature_unit: "celsius",
      cell_selection: "land"
    });
    return `https://api.open-meteo.com${path}?${params}`;
  }

  /**
   * Fetches one provider with timeout and short-lived in-memory caching, then maps successful payloads to the canonical model.
   *
   * @param {Object} provider Provider adapter metadata.
   * @param {Coordinates} coords Forecast location.
   * @returns {Promise<ProviderResult>} Normalised provider result or a displayable failure result.
   */
  async function fetchProvider(provider, coords) {
    const url = provider.url(coords);
    const cacheKey = `${provider.id}:${url}`;
    const cached = providerCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < PROVIDER_CACHE_TTL_MS) {
      return { ...cached.result, fromCache: true, cacheAgeMs: Date.now() - cached.cachedAt };
    }
    providerCache.delete(cacheKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      const raw = await parseProviderPayload(response);
      if (!response.ok) {
        throw new Error(providerErrorMessage(response, raw));
      }
      const mapResponse = provider.mapResponse || normaliseOpenMeteo;
      const result = {
        ok: true,
        provider,
        url,
        raw,
        hourly: mapResponse(raw),
        dailyUv: normaliseDailyUv(raw),
        fetchedAt: new Date().toISOString(),
        fromCache: false,
        cacheAgeMs: 0
      };
      providerCache.set(cacheKey, {
        cachedAt: Date.now(),
        result
      });
      return result;
    } catch (error) {
      return {
        ok: false,
        provider,
        url,
        error: error.name === "AbortError" ? t().providerTimeout(PROVIDER_TIMEOUT_MS / 1000) : error.message,
        fetchedAt: new Date().toISOString()
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parses a provider response body while preserving useful error text from non-JSON error responses.
   *
   * @param {Response} response Fetch API response.
   * @returns {Promise<?Object>} Parsed JSON payload, null for empty error bodies, or a short error wrapper.
   */
  async function parseProviderPayload(response) {
    const body = await response.text();
    if (!body) {
      if (!response.ok) return null;
      throw new Error("Provider returned an empty response.");
    }
    try {
      return JSON.parse(body);
    } catch {
      if (!response.ok) return { error: body.slice(0, 180) };
      throw new Error("Provider returned invalid JSON.");
    }
  }

  /**
   * Builds a compact provider error message from HTTP status and provider-specific error fields.
   *
   * @param {Response} response Fetch API response.
   * @param {?Object} raw Parsed provider payload, when available.
   * @returns {string} Human-readable provider failure.
   */
  function providerErrorMessage(response, raw) {
    const message = raw?.reason || raw?.error || response.statusText;
    return message ? `${response.status} ${message}` : `${response.status}`;
  }

  /**
   * Converts Open-Meteo-style hourly arrays into canonical hourly forecast rows.
   *
   * @param {Object} raw Open-Meteo-compatible API payload.
   * @returns {ForecastHour[]} Canonical hourly forecast rows.
   */
  function normaliseOpenMeteo(raw) {
    const hourly = raw.hourly || {};
    return (hourly.time || []).map((time, index) => ({
      key: `${time.slice(0, 13)}:00`,
      date: time.slice(0, 10),
      temp: valueAt(hourly.temperature_2m, index),
      humidity: valueAt(hourly.relative_humidity_2m, index),
      precip: valueAt(hourly.precipitation, index),
      wind: valueAt(hourly.wind_speed_10m, index),
      windDirection: valueAt(hourly.wind_direction_10m, index),
      cloud: valueAt(hourly.cloud_cover, index),
      uv: valueAt(hourly.uv_index, index),
      uvClearSky: valueAt(hourly.uv_index_clear_sky, index)
    }));
  }

  /**
   * Extracts daily UV maxima from providers that expose daily Open-Meteo fields.
   *
   * @param {Object} raw Open-Meteo-compatible API payload.
   * @returns {Array<{date: string, uv: ?number, uvClearSky: ?number}>} Daily UV rows.
   */
  function normaliseDailyUv(raw) {
    const daily = raw.daily || {};
    return (daily.time || []).map((date, index) => ({
      date,
      uv: valueAt(daily.uv_index_max, index),
      uvClearSky: valueAt(daily.uv_index_clear_sky_max, index)
    }));
  }

  /**
   * Converts MET Norway's nested timeseries payload into canonical hourly forecast rows.
   * MET Norway reports wind in metres per second, so this adapter converts wind to kilometres per hour.
   *
   * @param {Object} raw MET Norway locationforecast payload.
   * @returns {ForecastHour[]} Canonical hourly forecast rows.
   */
  function normaliseMetNo(raw) {
    return (raw.properties?.timeseries || []).map(entry => {
      const details = entry.data?.instant?.details || {};
      const nextHour = entry.data?.next_1_hours?.details || {};
      const key = budapestHourKey(new Date(entry.time));
      return {
        key,
        date: key.slice(0, 10),
        temp: numberOrNull(details.air_temperature),
        humidity: numberOrNull(details.relative_humidity),
        precip: numberOrNull(nextHour.precipitation_amount),
        wind: numberOrNull(details.wind_speed) === null ? null : details.wind_speed * 3.6,
        windDirection: numberOrNull(details.wind_from_direction),
        cloud: numberOrNull(details.cloud_area_fraction),
        uvClearSky: numberOrNull(details.ultraviolet_index_clear_sky)
      };
    });
  }

  // Forecast Read Models

  /**
   * Builds the median forecast read model from all usable provider results.
   * Providers are first summarised independently by day, then each metric is median-aggregated across providers.
   *
   * @param {ProviderResult[]} results Successful provider results.
   * @returns {{ today: AggregateDayForecast, days: AggregateDayForecast[] }} Daily median forecast model.
   */
  function buildAggregate(results) {
    const today = budapestDateKey(new Date());
    const byProviderDay = results.flatMap(result => dailyForProvider(result, today));
    const dayKeys = [...new Set(byProviderDay.map(day => day.date))].sort().slice(0, forecastDays);
    const days = dayKeys.map(date => aggregateDay(date, byProviderDay.filter(day => day.date === date)));
    return {
      today: days.find(day => day.date === today) || aggregateDay(today, []),
      days
    };
  }

  /**
   * Summarises one provider's hourly rows into daily weather rows.
   *
   * @param {ProviderResult} result Successful provider result with canonical hourly data.
   * @returns {ProviderDayForecast[]} Provider-level daily summaries.
   */
  function dailyForProvider(result) {
    const groups = new Map();
    const uvByDate = new Map((result.dailyUv || []).map(day => [day.date, day]));
    result.hourly.forEach(hour => {
      if (!groups.has(hour.date)) groups.set(hour.date, []);
      groups.get(hour.date).push(hour);
    });
    return [...groups].map(([date, hours]) => ({
      provider: result.provider.name,
      date,
      currentTemp: nearestCurrentTemp(hours),
      humidity: median(hours.map(hour => hour.humidity)),
      high: max(hours.map(hour => hour.temp)),
      low: min(hours.map(hour => hour.temp)),
      precip: sum(hours.map(hour => hour.precip)),
      wind: max(hours.map(hour => hour.wind)),
      windDirection: prevailingDirection(hours.map(hour => hour.windDirection)),
      cloud: median(hours.map(hour => hour.cloud)),
      uv: uvByDate.get(date)?.uv ?? max(hours.map(hour => hour.uv)),
      uvClearSky: uvByDate.get(date)?.uvClearSky ?? max(hours.map(hour => hour.uvClearSky))
    }));
  }

  /**
   * Median-aggregates all provider summaries for one date.
   *
   * @param {string} date Budapest-local date key.
   * @param {ProviderDayForecast[]} providerDays Provider-level summaries for the date.
   * @returns {AggregateDayForecast} Cross-provider daily median and spread details.
   */
  function aggregateDay(date, providerDays) {
    return {
      date,
      sources: providerDays.length,
      providerDays,
      spread: providerSpread(providerDays),
      currentTemp: median(providerDays.map(day => day.currentTemp)),
      high: median(providerDays.map(day => day.high)),
      low: median(providerDays.map(day => day.low)),
      precip: median(providerDays.map(day => day.precip)),
      humidity: median(providerDays.map(day => day.humidity)),
      wind: median(providerDays.map(day => day.wind)),
      windDirection: prevailingDirection(providerDays.map(day => day.windDirection)),
      cloud: median(providerDays.map(day => day.cloud)),
      uv: median(providerDays.map(day => day.uv)),
      uvClearSky: median(providerDays.map(day => day.uvClearSky))
    };
  }

  /**
   * Calculates min/max/range metadata used to explain provider agreement and confidence.
   *
   * @param {ProviderDayForecast[]} providerDays Provider-level daily summaries.
   * @returns {Object} Spread metadata by metric.
   */
  function providerSpread(providerDays) {
    return {
      high: rangeFor(providerDays.map(day => day.high)),
      low: rangeFor(providerDays.map(day => day.low)),
      precip: rangeFor(providerDays.map(day => day.precip)),
      humidity: rangeFor(providerDays.map(day => day.humidity)),
      wind: rangeFor(providerDays.map(day => day.wind)),
      uv: rangeFor(providerDays.map(day => day.uv))
    };
  }

  /**
   * Calculates numeric range details while ignoring missing provider values.
   *
   * @param {Array<?number>} values Raw metric values.
   * @returns {{ min: ?number, max: ?number, range: ?number, count: number }} Range metadata.
   */
  function rangeFor(values) {
    const clean = values.filter(value => Number.isFinite(value));
    if (!clean.length) return { min: null, max: null, range: null, count: 0 };
    const low = Math.min(...clean);
    const high = Math.max(...clean);
    return { min: low, max: high, range: high - low, count: clean.length };
  }

  /**
   * Adds a rough confidence score to each day using forecast distance, source count, provider spread, and local history drift.
   * The score is explanatory rather than meteorological truth; it helps users spot less stable forecasts.
   *
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @param {Array<{days: AggregateDayForecast[]}>} history Locally stored earlier forecast snapshots.
   * @returns {AggregateDayForecast[]} Forecast days with `confidence` and optional `previous` fields.
   */
  function withForecastConfidence(days, history) {
    const previousDays = history.flatMap(snapshot => Array.isArray(snapshot.days) ? snapshot.days : []);
    return days.map((day, index) => {
      const previous = previousDays.find(candidate => candidate.date === day.date);
      const base = index < 2 ? 96 - index * 3 : Math.max(58, 92 - index * 10);
      const penalty = sourceCountPenalty(day) + providerSpreadPenalty(day) + (previous ? forecastChangePenalty(day, previous) : 0);
      const score = Math.max(35, Math.round(base - penalty));
      return { ...day, confidence: score, previous };
    });
  }

  function sourceCountPenalty(day) {
    if (!day.sources) return 40;
    if (day.sources === 1) return 22;
    if (day.sources === 2) return 12;
    return 0;
  }

  function providerSpreadPenalty(day) {
    const spread = day.spread || {};
    return Math.min(24, [
      normalisedRange(spread.high, 6),
      normalisedRange(spread.low, 6),
      normalisedRange(spread.precip, 10),
      normalisedRange(spread.wind, 30),
      normalisedRange(spread.uv, 5)
    ].reduce((total, value) => total + value, 0) * 8);
  }

  function forecastChangePenalty(day, previous) {
    return Math.min(28, [
      normalisedDelta(day.high, previous.high, 6),
      normalisedDelta(day.low, previous.low, 6),
      normalisedDelta(day.precip, previous.precip, 10),
      normalisedDelta(day.wind, previous.wind, 30),
      normalisedDelta(day.cloud, previous.cloud, 60),
      normalisedDelta(day.uv, previous.uv, 5)
    ].reduce((total, value) => total + value, 0) * 12);
  }

  function normalisedDelta(current, previous, range) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    return Math.min(1, Math.abs(current - previous) / range);
  }

  function normalisedRange(spread, range) {
    if (!Number.isFinite(spread?.range)) return 0;
    return Math.min(1, spread.range / range);
  }

  /**
   * Median-aggregates provider hours from the current Budapest hour forward.
   *
   * @param {ProviderResult[]} results Successful provider results.
   * @param {number} [limit=48] Maximum number of hourly rows to return.
   * @returns {ForecastHour[]} Cross-provider hourly median rows.
   */
  function hourlyAggregate(results, limit = 48) {
    const currentKey = budapestHourKey(new Date());
    const byHour = new Map();
    results.forEach(result => {
      result.hourly.forEach(hour => {
        if (hour.key < currentKey) return;
        if (!byHour.has(hour.key)) byHour.set(hour.key, []);
        byHour.get(hour.key).push(hour);
      });
    });
    return [...byHour]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, limit)
      .map(([key, hours]) => ({
        key,
        date: key.slice(0, 10),
        sources: hours.length,
        temp: median(hours.map(hour => hour.temp)),
        humidity: median(hours.map(hour => hour.humidity)),
        precip: median(hours.map(hour => hour.precip)),
        wind: median(hours.map(hour => hour.wind)),
        windDirection: prevailingDirection(hours.map(hour => hour.windDirection)),
        cloud: median(hours.map(hour => hour.cloud))
      }));
  }

  /**
   * Splits hourly forecasts into fixed-size windows and evaluates each window for the selected agricultural work.
   *
   * @param {ForecastHour[]} hours Cross-provider hourly forecast rows.
   * @param {number} [size=6] Number of hours per window.
   * @param {number} [step=size] Number of hours to advance between windows.
   * @returns {WorkWindow[]} Evaluated agricultural work windows.
   */
  function workWindows(hours, size = 6, step = size) {
    const windows = [];
    for (let start = 0; start < hours.length; start += step) {
      const slice = hours.slice(start, start + size);
      if (slice.length < size) break;
      const summary = {
        date: slice[0].date,
        sources: max(slice.map(hour => hour.sources)),
        currentTemp: slice[0].temp,
        humidity: median(slice.map(hour => hour.humidity)),
        high: max(slice.map(hour => hour.temp)),
        low: min(slice.map(hour => hour.temp)),
        precip: sum(slice.map(hour => hour.precip)),
        wind: max(slice.map(hour => hour.wind)),
        windDirection: prevailingDirection(slice.map(hour => hour.windDirection)),
        cloud: median(slice.map(hour => hour.cloud))
      };
      windows.push({
        start,
        end: start + slice.length - 1,
        startKey: slice[0].key,
        endKey: slice[slice.length - 1].key,
        summary,
        evaluation: evaluateAgriculture(summary, crop.value, work.value, windows.map(window => window.summary))
      });
    }
    return windows;
  }

  /**
   * Picks the current Budapest-hour temperature, or the nearest upcoming hour when the exact hour is unavailable.
   *
   * @param {ForecastHour[]} hours Provider hourly rows for one day.
   * @returns {?number} Current or next available temperature in Celsius.
   */
  function nearestCurrentTemp(hours) {
    const currentKey = budapestHourKey(new Date());
    const exact = hours.find(hour => hour.key === currentKey);
    if (exact) return exact.temp;
    return hours.find(hour => hour.key > currentKey)?.temp ?? null;
  }

  // Advisory Heuristics

  /**
   * Activates one advisory tab and optionally persists the selected domain.
   *
   * @param {string} domain Advisory domain key from `ADVISORY_DOMAIN`.
   * @param {boolean} [persist=false] Whether to save the change to localStorage.
   * @returns {void}
   */
  function setActiveDomain(domain, persist = false) {
    const panels = [
      [ADVISORY_DOMAIN.AGRI, agriTab, agriPanel],
      [ADVISORY_DOMAIN.FAMILY, familyTab, familyPanel],
      [ADVISORY_DOMAIN.SPORTS, sportsTab, sportsPanel]
    ];
    panels.forEach(([key, tab, panel]) => {
      const active = domain === key;
      tab.classList.toggle("active", active);
      tab.classList.toggle("tab-active", active);
      tab.setAttribute("aria-selected", String(active));
      panel.hidden = !active;
    });
    if (domain === ADVISORY_DOMAIN.AGRI && hourlyChart) hourlyChart.resize();
    if (persist) saveSettings();
  }

  /**
   * Reads the currently active advisory tab from DOM state.
   *
   * @returns {string} Active advisory domain key.
   */
  function currentAdvisoryDomain() {
    if (familyTab.classList.contains("active")) return ADVISORY_DOMAIN.FAMILY;
    if (sportsTab.classList.contains("active")) return ADVISORY_DOMAIN.SPORTS;
    return ADVISORY_DOMAIN.AGRI;
  }

  /**
   * Produces family-oriented clothing and health guidance from a daily forecast.
   * The scoring is deliberately heuristic and transparent so demo users can inspect the thresholds.
   *
   * @param {AggregateDayForecast} day Daily median forecast.
   * @returns {{ level: string, dress: string[], health: string[] }} Family advisory score and reason keys.
   */
  function evaluateFamily(day) {
    if (!day.sources) {
      return { level: SCORE.POOR, dress: ["noData"], health: ["noData"] };
    }

    const dress = [];
    const health = [];
    let score = 0;
    const high = day.high ?? 0;
    const low = day.low ?? 99;
    const rain = day.precip ?? 0;
    const wind = day.wind ?? 0;
    const cloud = day.cloud ?? 100;
    const humidity = Number.isFinite(day.humidity) ? day.humidity : null;
    const uv = day.uv ?? day.uvClearSky ?? 0;
    const clearSkyUv = day.uvClearSky ?? 0;

    if (high >= 28) addDress("lightClothes");
    else if (low <= 0) addDress("coat");
    else if (low <= 12) addDress("warmLayer");
    else addDress("comfortable");

    if (rain >= 1) addDress("rainGear");
    if (wind >= 22) addDress("windLayer");
    if (uv >= 3 || high >= 24 && cloud <= 45) addDress("sunProtection");

    if (high >= 34) addHealth("heatReduceActivity", 3);
    else if (high >= 30) addHealth("heatHydration", 2);
    if (high >= AGRI_LIMITS.HUMID_HEAT_STRESS_C && humidity >= AGRI_LIMITS.HUMID_HEAT_PERCENT) addHealth("humidHeat", 1);
    if (high >= 30) addHealth("checkVulnerable", 1);
    if (uv >= 8) addHealth("uvVeryHigh", 3);
    else if (uv >= 6) addHealth("uvHigh", 2);
    else if (uv >= 3) addHealth("uvModerate", 1);
    if (clearSkyUv - uv >= 2 && clearSkyUv >= 6) addHealth("uvCloudBreaks", 1);
    if (low <= 0) addHealth("coldExposure", 2);
    if (low <= 8 && rain >= 1) addHealth("wetCold", 1);
    if (wind >= 35) addHealth("strongWind", 2);
    if (rain >= 8) addHealth("heavyRain", 2);

    if (!health.length) addHealth("comfortable", 0);

    return {
      level: score >= 4 ? SCORE.POOR : score >= 2 ? SCORE.CAUTION : SCORE.GOOD,
      dress,
      health
    };

    function addDress(reason) {
      if (!dress.includes(reason)) dress.push(reason);
    }

    function addHealth(reason, points) {
      if (!health.includes(reason)) health.push(reason);
      score += points;
    }
  }

  /**
   * Builds short situation labels for common family planning moments.
   *
   * @param {AggregateDayForecast} day Daily median forecast.
   * @returns {Array<[string, string]>} Display label and score label pairs.
   */
  function familySituationEntries(day) {
    const strings = t();
    const rain = day.precip ?? 0;
    const wind = day.wind ?? 0;
    const high = day.high ?? 0;
    const low = day.low ?? 99;
    const humidHeat = high >= AGRI_LIMITS.HUMID_HEAT_STRESS_C && (day.humidity ?? 0) >= AGRI_LIMITS.HUMID_HEAT_PERCENT;
    const uv = day.uv ?? day.uvClearSky ?? 0;
    return [
      [strings.schoolRun, rain >= 8 || wind >= 35 ? strings.caution : strings.good],
      [strings.outdoorPlay, rain >= 3 || wind >= 35 || high >= 34 || humidHeat ? strings.caution : strings.good],
      [strings.middaySun, uv >= 6 || high >= 30 || humidHeat ? strings.caution : strings.good],
      [strings.eveningWeather, low <= 8 || rain >= 1 ? strings.caution : strings.good]
    ];
  }

  /**
   * Scores practical outdoor sport suitability for the selected sport.
   *
   * @param {AggregateDayForecast} day Daily median forecast.
   * @param {string} sportKey Sport key from `SPORT`.
   * @returns {ScoreEvaluation} Sports suitability score and reason keys.
   */
  function evaluateSports(day, sportKey) {
    if (!day.sources) return { level: SCORE.POOR, reasons: ["noData"] };

    const reasons = [];
    let score = 0;
    const rain = day.precip ?? 0;
    const wind = day.wind ?? 0;
    const high = day.high ?? 0;
    const low = day.low ?? 99;
    const humidHeat = high >= AGRI_LIMITS.HUMID_HEAT_STRESS_C && (day.humidity ?? 0) >= AGRI_LIMITS.HUMID_HEAT_PERCENT;

    if (sportKey === SPORT.OPEN_WATER_SWIMMING) {
      if (low < AGRI_LIMITS.SWIM_MIN_C) addReason("swimCold", 2);
      if (wind >= AGRI_LIMITS.SWIM_WIND_POOR_KMH) addReason("swimWind", 3);
      else if (wind >= AGRI_LIMITS.SWIM_WIND_CAUTION_KMH) addReason("swimWind", 1);
      if (rain >= AGRI_LIMITS.SPORT_RAIN_CAUTION_MM) addReason("swimRain", 1);
    } else {
      if (rain >= AGRI_LIMITS.SPORT_RAIN_POOR_MM) addReason("heavyRain", 3);
      else if (rain >= AGRI_LIMITS.SPORT_RAIN_CAUTION_MM) addReason("rain", 1);
      if (wind >= AGRI_LIMITS.SPORT_WIND_POOR_KMH) addReason("wind", 3);
      else if (wind >= AGRI_LIMITS.SPORT_WIND_CAUTION_KMH) addReason("wind", 1);
      if (sportKey === SPORT.MOUNTAIN_BIKING && rain >= AGRI_LIMITS.SPORT_RAIN_CAUTION_MM) addReason("trailWet", 1);
    }

    if (high >= AGRI_LIMITS.SPORT_HOT_C || humidHeat) addReason("heat", 1);
    if (low <= AGRI_LIMITS.SPORT_COLD_C && sportKey !== SPORT.OPEN_WATER_SWIMMING) addReason("cold", 1);
    if (rain >= AGRI_LIMITS.SPORT_RAIN_CAUTION_MM && wind >= AGRI_LIMITS.SPORT_WIND_CAUTION_KMH) addReason("stormRisk", 1);

    if (!reasons.length) return { level: SCORE.GOOD, reasons: ["workable"] };
    return { level: score >= 4 ? SCORE.POOR : SCORE.CAUTION, reasons };

    function addReason(reason, points) {
      if (!reasons.includes(reason)) reasons.push(reason);
      score += points;
    }
  }

  /**
   * Builds the compact evidence string shown under agricultural scores.
   *
   * @param {AggregateDayForecast} day Daily median forecast.
   * @param {AggregateDayForecast[]} previousDays Earlier days used for wetness carry-over.
   * @returns {string} Human-readable list of score inputs.
   */
  function agriInputSummary(day, previousDays) {
    const wetness = carryOverWetness(previousDays, day);
    const inputs = [
      `${t().rain}: ${formatMm(day.precip)}`,
      `${t().humidity}: ${formatPercent(day.humidity)}`,
      `${t().highLow}: ${formatTemp(day.high)} / ${formatTemp(day.low)}`,
      `${t().cloud}: ${formatPercent(day.cloud)}`,
      `${t().wetness}: ${wetness.toFixed(1)}`
    ];
    const wettest = day.spread?.precip?.max;
    if (Number.isFinite(wettest) && wettest > (day.precip ?? 0)) {
      inputs.push(`${t().wettestSource}: ${formatMm(wettest)}`);
    }
    return inputs.join(", ");
  }

  /**
   * Scores agricultural work suitability for the selected crop and work type.
   * The model favours explainable field-work rules over hidden optimisation.
   *
   * @param {AggregateDayForecast} day Daily or window-level weather summary.
   * @param {string} cropKey Crop key from `CROP`.
   * @param {string} workKey Work key from `WORK`.
   * @param {AggregateDayForecast[]} [previousDays=[]] Earlier days used to estimate carry-over wetness.
   * @returns {ScoreEvaluation} Agricultural suitability score and reason keys.
   */
  function evaluateAgriculture(day, cropKey, workKey, previousDays = []) {
    if (!day.sources) {
      return { level: SCORE.POOR, reasons: ["noData"] };
    }

    const reasons = [];
    let score = 0;
    const rain = advisoryRain(day);
    const wind = day.wind ?? 0;
    const high = day.high ?? 0;
    const low = day.low ?? 99;
    const cloud = day.cloud ?? 0;
    const humidity = day.humidity ?? 0;
    const wetness = carryOverWetness(previousDays, day);

    if (workKey === WORK.SEEDING) {
      if (rain >= AGRI_LIMITS.SEEDING_RAIN_POOR_MM) addReason("rainPoor", 3);
      else if (rain >= AGRI_LIMITS.SEEDING_RAIN_CAUTION_MM) addReason("rainCaution", 1);
      else if (rain <= AGRI_LIMITS.DRY_SEEDBED_RAIN_MM && high >= AGRI_LIMITS.DRY_SEEDBED_HIGH_C) addReason("drySeedbed", 1);

      if ([CROP.CORN, CROP.SUNFLOWER].includes(cropKey) && low < AGRI_LIMITS.COLD_SENSITIVE_LOW_C) addReason("coldSensitive", 2);
      if (cropKey === CROP.RAPESEED && high >= AGRI_LIMITS.RAPESEED_HEAT_C && rain <= AGRI_LIMITS.RAPESEED_HEAT_RAIN_MM) addReason("rapeseedHeat", 2);
    } else if (workKey === WORK.HARVESTING) {
      if (rain >= AGRI_LIMITS.HARVEST_RAIN_POOR_MM) addReason("wetHarvest", 3);
      else if (rain >= AGRI_LIMITS.HARVEST_RAIN_CAUTION_MM) addReason("rainCaution", 2);
      if (cloud >= AGRI_LIMITS.DRYING_WEAK_CLOUD_PERCENT || humidity !== null && humidity >= AGRI_LIMITS.DRYING_WEAK_HUMIDITY_PERCENT) addReason("dryingWeak", 1);
      if ([CROP.RAPESEED, CROP.WHEAT, CROP.BARLEY].includes(cropKey) && rain >= AGRI_LIMITS.HARVEST_RAIN_CAUTION_MM) addReason("cerealHarvest", 1);
    } else if (workKey === WORK.SPRAYING) {
      if (rain >= AGRI_LIMITS.SPRAY_RAIN_POOR_MM) addReason("sprayRain", 3);
      else if (rain >= AGRI_LIMITS.SPRAY_RAIN_CAUTION_MM) addReason("sprayRain", 1);
      if (wind >= AGRI_LIMITS.SPRAY_WIND_POOR_KMH) addReason("sprayDrift", 3);
      else if (wind >= AGRI_LIMITS.SPRAY_WIND_CAUTION_KMH) addReason("sprayDrift", 1);
      if (humidity !== null && humidity <= AGRI_LIMITS.SPRAY_LOW_HUMIDITY_PERCENT && (high >= AGRI_LIMITS.SPRAY_HEAT_CAUTION_C || wind >= AGRI_LIMITS.SPRAY_WIND_CAUTION_KMH)) addReason("sprayEvaporation", 1);
      if (high >= AGRI_LIMITS.SPRAY_HEAT_POOR_C) addReason("sprayHeat", 3);
      else if (high >= AGRI_LIMITS.SPRAY_HEAT_CAUTION_C) addReason("sprayHeat", 1);
    }

    if (workKey !== WORK.SPRAYING) {
      if (wind >= AGRI_LIMITS.WIND_POOR_KMH) addReason("windPoor", 3);
      else if (wind >= AGRI_LIMITS.WIND_CAUTION_KMH) addReason("windCaution", 1);
      if (high >= AGRI_LIMITS.HEAT_STRESS_C) addReason("heatStress", 1);
    }
    if (wetness >= AGRI_LIMITS.SATURATED_WETNESS) addReason("saturatedLand", 3);
    else if (wetness >= AGRI_LIMITS.PARTIAL_DRYING_WETNESS) addReason("partialDrying", 1);

    if (!reasons.length) {
      return { level: SCORE.GOOD, reasons: ["workable"] };
    }
    return {
      level: score >= 4 ? SCORE.POOR : SCORE.CAUTION,
      reasons
    };

    function addReason(reason, points) {
      if (!reasons.includes(reason)) reasons.push(reason);
      score += points;
    }
  }

  /**
   * Uses the wettest provider as the advisory rain value when provider spread exposes a wetter credible scenario.
   *
   * @param {AggregateDayForecast} day Daily median forecast.
   * @returns {number} Rain value used by advisory rules.
   */
  function advisoryRain(day) {
    const wettest = day.spread?.precip?.max;
    if (Number.isFinite(wettest)) return Math.max(day.precip ?? 0, wettest);
    return day.precip ?? 0;
  }

  /**
   * Estimates residual field wetness from the two preceding forecast days and today's drying conditions.
   *
   * @param {AggregateDayForecast[]} previousDays Earlier forecast days.
   * @param {AggregateDayForecast} day Current day or work-window summary.
   * @returns {number} Relative wetness score used by agricultural rules.
   */
  function carryOverWetness(previousDays, day) {
    const recent = previousDays.slice(-2);
    const wetness = recent.reduce((total, previousDay, index) => {
      const ageWeight = index === recent.length - 1 ? 1 : 0.45;
      const rain = previousDay.precip ?? 0;
      if (rain >= 15) return total + 5 * ageWeight;
      if (rain >= 8) return total + 3 * ageWeight;
      if (rain >= 3) return total + 1.5 * ageWeight;
      return total;
    }, 0);
    return Math.max(0, wetness - dryingCredit(day));
  }

  /**
   * Estimates how much today's weather helps reduce carry-over wetness.
   *
   * @param {AggregateDayForecast} day Current day or work-window summary.
   * @returns {number} Drying credit subtracted from wetness carry-over.
   */
  function dryingCredit(day) {
    let credit = 0;
    if ((day.precip ?? 0) <= 0.5) credit += 1;
    if ((day.high ?? 0) >= 22) credit += 1;
    if ((day.wind ?? 0) >= 10 && (day.wind ?? 0) <= 28) credit += 0.75;
    if ((day.cloud ?? 100) <= 45) credit += 0.75;
    return credit;
  }

  // Visual Embeds

  /**
   * Updates the Windy embed for the selected coordinates.
   * The map is visual context only and is not used in forecast aggregation.
   *
   * @returns {void}
   */
  function updateMap() {
    const coords = readCoords();
    if (!coords) return;
    const params = new URLSearchParams({
      lat: coords.lat.toFixed(4),
      lon: coords.lon.toFixed(4),
      detailLat: coords.lat.toFixed(4),
      detailLon: coords.lon.toFixed(4),
      width: "650",
      height: "450",
      zoom: "8",
      level: "surface",
      overlay: "clouds",
      product: "ecmwf",
      menu: "",
      message: "true",
      marker: "true",
      calendar: "now",
      pressure: "",
      type: "map",
      location: "coordinates",
      detail: "",
      metricWind: "km/h",
      metricTemp: "°C",
      radarRange: "-1"
    });
    weatherMap.src = `https://embed.windy.com/embed2.html?${params}`;
  }

  // Rendering

  function renderStatus(results) {
    statusEl.innerHTML = "";
  }

  function statusMessageMarkup(message, level, icon) {
    return `
      <div class="source-status-row alert alert-${level}">
        ${iconMarkup(icon)}
        <span class="source-status-name">${escapeHtml(message)}</span>
      </div>
    `;
  }

  function renderToday(day, sourceCount) {
    const strings = t();
    todayEl.innerHTML = [
      metricMarkup("fa-temperature-half", strings.now, formatTemp(day.currentTemp), strings.activeSources(sourceCount), comfortClassForTemp(day.currentTemp)),
      metricMarkup("fa-arrows-up-down", strings.highLow, `${formatTemp(day.high)} / ${formatTemp(day.low)}`, strings.dailyRange, comfortClassForDailyRange(day.high, day.low)),
      metricMarkup("fa-droplet", strings.humidity, formatPercent(day.humidity), strings.dailyMedian, comfortClassForHumidity(day.humidity)),
      metricMarkup("fa-cloud-rain", strings.precipitation, formatMm(day.precip), strings.dailyTotal, comfortClassForRain(day.precip)),
      metricMarkup("fa-sun", strings.uv, formatUv(day.uv), `${strings.dailyUvMax} · ${strings.uvClearSky}: ${formatUv(day.uvClearSky)}`, comfortClassForUv(day.uv)),
      metricMarkup("fa-wind", strings.wind, formatKmh(day.wind), `${strings.dailyMax} · ${formatWindDirection(day.windDirection)}`, comfortClassForWind(day.wind))
    ].join("");
  }

  function comfortClassForTemp(temp) {
    if (!Number.isFinite(temp)) return "";
    if (temp >= 18 && temp <= 26) return "comfort-good";
    if (temp >= 10 && temp <= 30) return "comfort-caution";
    return "comfort-poor";
  }

  function comfortClassForDailyRange(high, low) {
    if (!Number.isFinite(high) || !Number.isFinite(low)) return "";
    if (high <= 26 && low >= 10) return "comfort-good";
    if (high <= 30 && low >= 3) return "comfort-caution";
    return "comfort-poor";
  }

  function comfortClassForRain(rain) {
    if (!Number.isFinite(rain)) return "";
    if (rain < 1) return "comfort-good";
    if (rain < 8) return "comfort-caution";
    return "comfort-poor";
  }

  function comfortClassForHumidity(humidity) {
    if (!Number.isFinite(humidity)) return "";
    if (humidity >= 40 && humidity <= 70) return "comfort-good";
    if (humidity >= 30 && humidity <= 80) return "comfort-caution";
    return "comfort-poor";
  }

  function comfortClassForUv(uv) {
    if (!Number.isFinite(uv)) return "";
    if (uv < 3) return "comfort-good";
    if (uv < 6) return "comfort-caution";
    return "comfort-poor";
  }

  function comfortClassForWind(wind) {
    if (!Number.isFinite(wind)) return "";
    if (wind < 20) return "comfort-good";
    if (wind < 35) return "comfort-caution";
    return "comfort-poor";
  }

  /**
   * Renders the short forecast explanation panel: provider agreement, change since last snapshot, and best work window.
   *
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @param {ProviderResult[]} results Successful provider results.
   * @returns {void}
   */
  function renderForecastInsight(days, results) {
    const strings = t();
    const target = days.find(day => day.date === tomorrowDateKey()) || days[1] || days[0];
    const windows = workWindows(hourlyAggregate(results), 6, 1);
    const bestWindow = windows.find(window => window.evaluation.level === SCORE.GOOD)
      || windows.find(window => window.evaluation.level === SCORE.CAUTION);
    const items = [
      [strings.providerAgreement, describeProviderAgreement(target)],
      [strings.changeSinceLast, describeForecastChange(target)],
      [strings.agriculturalWorkWindow, describeBestWindow(bestWindow)]
    ];
    const uvNote = describeUvNuance(target);
    if (uvNote) items.push([strings.uv, uvNote]);
    forecastInsightEl.innerHTML = `
      <h3>${iconMarkup("fa-chart-line")} ${escapeHtml(strings.insightTitle)}</h3>
      <dl>
        ${items.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
      </dl>
    `;
  }

  function describeProviderAgreement(day) {
    if (!day?.sources || day.sources < 2) return t().noData;
    const spread = day.spread || {};
    const wide = (spread.precip?.range ?? 0) >= 5 || (spread.wind?.range ?? 0) >= 15 || (spread.high?.range ?? 0) >= 4;
    const mixed = (spread.precip?.range ?? 0) >= 2 || (spread.wind?.range ?? 0) >= 8 || (spread.high?.range ?? 0) >= 2;
    const label = wide ? t().agreementWide : mixed ? t().agreementMixed : t().agreementClose;
    return `${label}: ${formatTempRange(spread.high)}, ${formatMmRange(spread.precip)}, ${formatKmhRange(spread.wind)}`;
  }

  function describeForecastChange(day) {
    const strings = t();
    if (!day?.previous) return strings.noHistoryChange;
    const changes = [
      changePhrase(day.precip, day.previous.precip, 1, formatMm, strings.changedWetter, strings.changedDrier),
      changePhrase(day.high, day.previous.high, 1, formatTempDelta, strings.changedWarmer, strings.changedCooler),
      changePhrase(day.wind, day.previous.wind, 4, formatKmh, strings.changedWindier, strings.changedCalmer)
    ].filter(Boolean);
    return changes[0] || strings.noMeaningfulChange;
  }

  function describeBestWindow(window) {
    const strings = t();
    if (!window) return strings.noGoodWindow;
    return strings.bestWindowSummary(
      formatWindowRange(window.startKey, window.endKey),
      strings[window.evaluation.level],
      formatMm(window.summary.precip),
      formatKmh(window.summary.wind)
    );
  }

  function describeUvNuance(day) {
    if (!day || !Number.isFinite(day.uv) || !Number.isFinite(day.uvClearSky)) return "";
    if (day.uvClearSky - day.uv < 2 || day.uvClearSky < 6) return "";
    return t().uvSuppressed(formatUv(day.uvClearSky));
  }

  /**
   * Renders daily median forecast cards.
   *
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @returns {void}
   */
  function renderForecast(days) {
    const strings = t();
    forecastEl.innerHTML = days.map(day => `
      <article class="day card bg-base-100 border border-base-300 shadow-sm" style="--confidence-color: ${forecastConfidenceColor(day.confidence)}">
        <time datetime="${day.date}">${formatDate(day.date)}</time>
        <strong>${formatTemp(day.high)} / ${formatTemp(day.low)}</strong>
        <dl>
          <dt>${iconMarkup("fa-gauge-high")} ${strings.confidence}</dt><dd>${formatConfidence(day.confidence)}</dd>
          <dt>${iconMarkup("fa-cloud-rain")} ${strings.rain}</dt><dd>${formatMm(day.precip)}</dd>
          <dt>${iconMarkup("fa-droplet")} ${strings.humidity}</dt><dd>${formatPercent(day.humidity)}</dd>
          <dt>${iconMarkup("fa-sun")} ${strings.uv}</dt><dd>${formatUv(day.uv)}</dd>
          <dt>${iconMarkup("fa-wind")} ${strings.wind}</dt><dd>${formatKmh(day.wind)}</dd>
          <dt>${strings.rulingWindDirection}</dt><dd>${formatWindDirection(day.windDirection)}</dd>
          <dt>${strings.cloud}</dt><dd>${formatPercent(day.cloud)}</dd>
          <dt>${strings.sourceCount}</dt><dd>${day.sources}</dd>
        </dl>
        ${describeUvNuance(day) ? `<p class="card-note">${escapeHtml(describeUvNuance(day))}</p>` : ""}
      </article>
    `).join("");
  }

  /**
   * Renders hourly median data, agricultural work-window cards, and the Chart.js visualisation when available.
   *
   * @param {ProviderResult[]} results Successful provider results.
   * @returns {void}
   */
  function renderHourlyWork(results) {
    const strings = t();
    const hours = hourlyAggregate(results);
    const windows = workWindows(hours);
    renderWorkWindowCards(windows);

    if (typeof Chart === "undefined") {
      workWindowsEl.innerHTML += noteMarkup(strings.chartUnavailable);
      return;
    }

    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new Chart(hourlyChartCanvas, {
      type: "bar",
      data: {
        labels: hours.map(hour => formatHour(hour.key)),
        datasets: [
          {
            type: "line",
            label: strings.tempChart,
            data: hours.map(hour => hour.temp),
            yAxisID: "temp",
            borderColor: "#b42318",
            backgroundColor: "#b42318",
            pointRadius: 0,
            tension: 0.25
          },
          {
            label: strings.rainChart,
            data: hours.map(hour => hour.precip),
            yAxisID: "rain",
            backgroundColor: "rgba(15, 118, 110, 0.32)",
            borderColor: "#0f766e",
            borderWidth: 1
          },
          {
            type: "line",
            label: strings.windChart,
            data: hours.map(hour => hour.wind),
            yAxisID: "wind",
            borderColor: "#334e68",
            backgroundColor: "#334e68",
            pointRadius: 0,
            tension: 0.2
          }
        ]
      },
      options: hourlyChartOptions(strings, windows, hours),
      plugins: [workWindowBands]
    });
  }

  function renderWorkWindowCards(windows) {
    const strings = t();
    workWindowsEl.innerHTML = windows.map(window => `
      <article class="window-card card bg-base-100 border border-base-300 shadow-sm ${window.evaluation.level}">
        <strong>${formatWindowRange(window.startKey, window.endKey)}</strong>
        <span>${scoreIconMarkup(window.evaluation.level)} ${strings[window.evaluation.level]} · ${formatMm(window.summary.precip)} · ${formatKmh(window.summary.wind)}</span>
      </article>
    `).join("");
  }

  function hourlyChartOptions(strings, windows, hours) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "top"
        },
        tooltip: {
          callbacks: {
            label(item) {
              const label = item.dataset.label || "";
              if (item.dataset.yAxisID === "temp") return `${label}: ${formatTemp(item.parsed.y)}`;
              if (item.dataset.yAxisID === "rain") return `${label}: ${formatMm(item.parsed.y)}`;
              if (item.dataset.yAxisID === "wind") return `${label}: ${formatKmh(item.parsed.y)}`;
              return `${label}: ${item.formattedValue}`;
            },
            afterBody(items) {
              const window = windows.find(candidate => items[0].dataIndex >= candidate.start && items[0].dataIndex <= candidate.end);
              const hour = hours[items[0].dataIndex];
              return [
                `${strings.rulingWindDirection}: ${formatWindDirection(hour?.windDirection)}`,
                window ? `${strings.workWindow}: ${strings[window.evaluation.level]}` : ""
              ].filter(Boolean);
            }
          }
        },
        workWindowBands: {
          windows
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 0,
            autoSkipPadding: 18
          }
        },
        temp: {
          type: "linear",
          position: "left",
          title: {
            display: true,
            text: "°C"
          }
        },
        rain: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          title: {
            display: true,
            text: "mm"
          },
          grid: {
            drawOnChartArea: false
          }
        },
        wind: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          display: false,
          grid: {
            drawOnChartArea: false
          }
        }
      }
    };
  }

  const workWindowBands = {
    id: "workWindowBands",
    beforeDatasetsDraw(chart, args, options) {
      const windows = options.windows || [];
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;
      ctx.save();
      windows.forEach(window => {
        const start = windowBoundary(scales.x, window.start, -0.5);
        const end = windowBoundary(scales.x, window.end, 0.5);
        ctx.fillStyle = windowBandColor(window.evaluation.level);
        ctx.fillRect(start, chartArea.top, end - start, chartArea.bottom - chartArea.top);
      });
      ctx.restore();
    }
  };

  function windowBoundary(scale, index, offset) {
    const here = scale.getPixelForValue(index);
    const other = scale.getPixelForValue(index + (offset < 0 ? 1 : -1));
    const width = Math.abs(here - other) || 12;
    return here + width * offset;
  }

  function windowBandColor(level) {
    if (level === SCORE.GOOD) return "rgba(19, 115, 51, 0.08)";
    if (level === SCORE.CAUTION) return "rgba(161, 92, 0, 0.10)";
    return "rgba(180, 35, 24, 0.08)";
  }

  /**
   * Renders daily agricultural suitability cards for the selected crop and work type.
   *
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @returns {void}
   */
  function renderAgriculture(days) {
    const strings = t();
    agriEl.innerHTML = days.map((day, index) => {
      const evaluation = evaluateAgriculture(day, crop.value, work.value, days.slice(0, index));
      return `
        <article class="agri-card card bg-base-100 border border-base-300 shadow-sm">
          <time datetime="${day.date}">${formatDate(day.date)}</time>
          <h3>${strings[crop.value]} - ${strings[work.value]}</h3>
          <span class="score badge ${scoreBadgeClass(evaluation.level)} ${evaluation.level}">${scoreIconMarkup(evaluation.level)} ${strings[evaluation.level]}</span>
          <dl>
            <dt>${strings.rain}</dt><dd>${formatMm(day.precip)}</dd>
            <dt>${strings.humidity}</dt><dd>${formatPercent(day.humidity)}</dd>
            <dt>${strings.highLow}</dt><dd>${formatTemp(day.high)} / ${formatTemp(day.low)}</dd>
            <dt>${strings.wind}</dt><dd>${formatKmh(day.wind)}</dd>
            <dt>${strings.rulingWindDirection}</dt><dd>${formatWindDirection(day.windDirection)}</dd>
            <dt>${strings.cloud}</dt><dd>${formatPercent(day.cloud)}</dd>
          </dl>
          <p class="card-note">${escapeHtml(strings.agriInputs)}: ${escapeHtml(agriInputSummary(day, days.slice(0, index)))}</p>
          <ul class="reasons">
            ${evaluation.reasons.map(reason => `<li>${escapeHtml(strings.reasons[reason])}</li>`).join("")}
          </ul>
        </article>
      `;
    }).join("");
  }

  /**
   * Renders daily family clothing and health guidance cards.
   *
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @returns {void}
   */
  function renderFamily(days) {
    const strings = t();
    familyEl.innerHTML = days.map(day => {
      const advice = evaluateFamily(day);
      return `
        <article class="family-card card bg-base-100 border border-base-300 shadow-sm">
          <time datetime="${day.date}">${formatDate(day.date)}</time>
          <h3>${strings.dress}</h3>
          <span class="score badge ${scoreBadgeClass(advice.level)} ${advice.level}">${scoreIconMarkup(advice.level)} ${strings[advice.level]}</span>
          <ul class="reasons">
            ${advice.dress.map(reason => `<li>${escapeHtml(strings.familyReasons[reason])}</li>`).join("")}
          </ul>
          <h3>${strings.health}</h3>
          <ul class="reasons">
            ${advice.health.map(reason => `<li>${escapeHtml(strings.familyReasons[reason])}</li>`).join("")}
          </ul>
          <h3>${strings.familySituations}</h3>
          <dl>
            ${familySituationEntries(day).map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
          </dl>
        </article>
      `;
    }).join("");
  }

  /**
   * Renders daily outdoor sport suitability cards for the selected sport.
   *
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @returns {void}
   */
  function renderSports(days) {
    const strings = t();
    sportsEl.innerHTML = days.map(day => {
      const evaluation = evaluateSports(day, sport.value);
      return `
        <article class="sports-card card bg-base-100 border border-base-300 shadow-sm">
          <time datetime="${day.date}">${formatDate(day.date)}</time>
          <h3>${escapeHtml(strings[sport.value])}</h3>
          <span class="score badge ${scoreBadgeClass(evaluation.level)} ${evaluation.level}">${scoreIconMarkup(evaluation.level)} ${strings[evaluation.level]}</span>
          <dl>
            <dt>${strings.rain}</dt><dd>${formatMm(day.precip)}</dd>
            <dt>${strings.highLow}</dt><dd>${formatTemp(day.high)} / ${formatTemp(day.low)}</dd>
            <dt>${strings.humidity}</dt><dd>${formatPercent(day.humidity)}</dd>
            <dt>${strings.wind}</dt><dd>${formatKmh(day.wind)}</dd>
            <dt>${strings.rulingWindDirection}</dt><dd>${formatWindDirection(day.windDirection)}</dd>
            <dt>${strings.uv}</dt><dd>${formatUv(day.uv)}</dd>
          </dl>
          <ul class="reasons">
            ${evaluation.reasons.map(reason => `<li>${escapeHtml(strings.sportsReasons[reason])}</li>`).join("")}
          </ul>
        </article>
      `;
    }).join("");
  }

  /**
   * Renders per-provider snapshots and errors so users can inspect source health behind the median.
   *
   * @param {ProviderResult[]} results Provider fetch results, including failures.
   * @returns {void}
   */
  function renderProviders(results) {
    const strings = t();
    renderSourceComparison(results);
    providersEl.innerHTML = results.map(result => {
      if (!result.ok) {
        return `
          <article class="provider card bg-base-100 border border-base-300 shadow-sm">
            <h3>${iconMarkup("fa-satellite-dish")} ${escapeHtml(result.provider.name)}</h3>
            <p class="error alert alert-error">${escapeHtml(result.error)}</p>
          </article>
        `;
      }
      const today = dailyForProvider(result).find(day => day.date === budapestDateKey(new Date()));
      return `
        <article class="provider card bg-base-100 border border-base-300 shadow-sm">
          <h3>${iconMarkup("fa-satellite-dish")} ${escapeHtml(result.provider.name)}</h3>
          <dl>
            <dt>${strings.fetched}</dt><dd>${formatFreshness(result)}</dd>
            <dt>${strings.now}</dt><dd>${formatTemp(today?.currentTemp)}</dd>
            <dt>${strings.high}</dt><dd>${formatTemp(today?.high)}</dd>
            <dt>${strings.low}</dt><dd>${formatTemp(today?.low)}</dd>
            <dt>${strings.rain}</dt><dd>${formatMm(today?.precip)}</dd>
            <dt>${strings.humidity}</dt><dd>${formatPercent(today?.humidity)}</dd>
            <dt>${strings.uv}</dt><dd>${formatUv(today?.uv)}</dd>
            <dt>${strings.wind}</dt><dd>${formatKmh(today?.wind)}</dd>
            <dt>${strings.rulingWindDirection}</dt><dd>${formatWindDirection(today?.windDirection)}</dd>
          </dl>
        </article>
      `;
    }).join("");
  }

  /**
   * Renders today's side-by-side provider comparison table.
   *
   * @param {ProviderResult[]} results Provider fetch results, including failures.
   * @returns {void}
   */
  function renderSourceComparison(results) {
    const strings = t();
    const rows = results
      .filter(result => result.ok)
      .map(result => dailyForProvider(result).find(day => day.date === budapestDateKey(new Date())))
      .filter(Boolean);
    if (!rows.length) {
      sourceComparisonEl.innerHTML = "";
      return;
    }
    sourceComparisonEl.innerHTML = `
      <h3>${iconMarkup("fa-table")} ${escapeHtml(strings.sourceComparison)}</h3>
      <div class="table-wrap">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>${escapeHtml(strings.sources)}</th>
              <th>${escapeHtml(strings.high)}</th>
              <th>${escapeHtml(strings.low)}</th>
              <th>${escapeHtml(strings.rain)}</th>
              <th>${escapeHtml(strings.humidity)}</th>
              <th>${escapeHtml(strings.wind)}</th>
              <th>${escapeHtml(strings.uv)}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(day => `
              <tr>
                <th scope="row">${escapeHtml(day.provider)}</th>
                <td>${formatTemp(day.high)}</td>
                <td>${formatTemp(day.low)}</td>
                <td>${formatMm(day.precip)}</td>
                <td>${formatPercent(day.humidity)}</td>
                <td>${formatKmh(day.wind)}</td>
                <td>${formatUv(day.uv)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renders raw provider payloads for demo transparency and manual debugging.
   *
   * @param {ProviderResult[]} results Provider fetch results, including failures.
   * @returns {void}
   */
  function renderSources(results) {
    sourcesEl.innerHTML = results.map(result => {
      const payload = result.ok ? result.raw : { error: result.error };
      const statusClass = result.ok ? "status-success" : "status-error";
      const meta = result.ok ? formatFreshness(result) : result.error;
      return `
        <details class="collapse collapse-arrow bg-base-100 border border-base-300">
          <summary class="collapse-title source-summary">
            <span class="status status-sm ${statusClass}" aria-hidden="true"></span>
            <span class="source-summary-name">${iconMarkup("fa-file-code")} ${escapeHtml(result.provider.name)} ${escapeHtml(t().rawData)}</span>
            <span class="source-summary-meta">${escapeHtml(meta)}</span>
          </summary>
          <pre class="collapse-content">${escapeHtml(JSON.stringify({
            url: result.url,
            fetchedAt: result.fetchedAt,
            payload
          }, null, 2))}</pre>
        </details>
      `;
    }).join("");
  }

  function loadingMetricMarkup() {
    const strings = t();
    return [
      metricMarkup("fa-temperature-half", strings.now, "...", strings.loading(providers.length)),
      metricMarkup("fa-arrows-up-down", strings.highLow, "...", strings.loading(providers.length)),
      metricMarkup("fa-droplet", strings.humidity, "...", strings.loading(providers.length)),
      metricMarkup("fa-cloud-rain", strings.precipitation, "...", strings.loading(providers.length)),
      metricMarkup("fa-sun", strings.uv, "...", strings.loading(providers.length)),
      metricMarkup("fa-wind", strings.wind, "...", strings.loading(providers.length))
    ].join("");
  }

  function metricMarkup(icon, label, value, help, comfortClass = "") {
    const className = ["metric card bg-base-100 border border-base-300 shadow-sm", comfortClass].filter(Boolean).join(" ");
    return `
      <article class="${className}">
        <span>${iconMarkup(icon)} ${label}</span>
        <strong>${value}</strong>
        <small>${help}</small>
      </article>
    `;
  }

  // Forecast History

  /**
   * Builds the localStorage key for forecast history at a rounded coordinate pair.
   *
   * @param {Coordinates} coords Forecast location.
   * @returns {string} Storage key for forecast snapshots.
   */
  function forecastHistoryKey(coords) {
    return `${FORECAST_HISTORY_PREFIX}:${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
  }

  /**
   * Loads earlier forecast snapshots for the selected location.
   *
   * @param {Coordinates} coords Forecast location.
   * @returns {Array<{fetchedAt: string, days: AggregateDayForecast[]}>} Stored forecast snapshots.
   */
  function loadForecastHistory(coords) {
    try {
      const snapshots = JSON.parse(localStorage.getItem(forecastHistoryKey(coords)) || "[]");
      return Array.isArray(snapshots) ? snapshots : [];
    } catch {
      return [];
    }
  }

  /**
   * Stores a compact forecast snapshot for later confidence and change comparisons.
   *
   * @param {Coordinates} coords Forecast location.
   * @param {AggregateDayForecast[]} days Current median forecast days.
   * @returns {void}
   */
  function saveForecastHistory(coords, days) {
    try {
      const snapshots = loadForecastHistory(coords);
      snapshots.unshift({
        fetchedAt: new Date().toISOString(),
        days: days.map(({ date, high, low, humidity, precip, wind, cloud, uv, uvClearSky, sources }) => ({ date, high, low, humidity, precip, wind, cloud, uv, uvClearSky, sources }))
      });
      localStorage.setItem(forecastHistoryKey(coords), JSON.stringify(snapshots.slice(0, MAX_FORECAST_SNAPSHOTS)));
    } catch {
      // localStorage may be disabled; confidence falls back to forecast distance.
    }
  }

  // Calculation Utilities

  /**
   * Calculates the median of finite numeric values, returning null when no values are usable.
   *
   * @param {Array<?number>} values Candidate numeric values.
   * @returns {?number} Median value.
   */
  function median(values) {
    const clean = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
    if (!clean.length) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }

  /**
   * Calculates the maximum finite numeric value.
   *
   * @param {Array<?number>} values Candidate numeric values.
   * @returns {?number} Maximum value.
   */
  function max(values) {
    const clean = values.filter(value => Number.isFinite(value));
    return clean.length ? Math.max(...clean) : null;
  }

  /**
   * Calculates the minimum finite numeric value.
   *
   * @param {Array<?number>} values Candidate numeric values.
   * @returns {?number} Minimum value.
   */
  function min(values) {
    const clean = values.filter(value => Number.isFinite(value));
    return clean.length ? Math.min(...clean) : null;
  }

  /**
   * Sums finite numeric values, returning null when no values are usable.
   *
   * @param {Array<?number>} values Candidate numeric values.
   * @returns {?number} Sum of finite values.
   */
  function sum(values) {
    const clean = values.filter(value => Number.isFinite(value));
    return clean.length ? clean.reduce((total, value) => total + value, 0) : null;
  }

  /**
   * Finds the most common eight-point compass sector from wind direction degrees.
   *
   * @param {Array<?number>} values Wind directions in degrees.
   * @returns {?number} Prevailing direction in degrees, rounded to 45-degree sectors.
   */
  function prevailingDirection(values) {
    const clean = values.filter(value => Number.isFinite(value));
    if (!clean.length) return null;
    const sectors = Array(8).fill(0);
    clean.forEach(value => {
      const index = Math.round((((value % 360) + 360) % 360) / 45) % 8;
      sectors[index] += 1;
    });
    const winningIndex = sectors.indexOf(Math.max(...sectors));
    return winningIndex * 45;
  }

  function valueAt(values, index) {
    return numberOrNull(Array.isArray(values) ? values[index] : null);
  }

  function numberOrNull(value) {
    return Number.isFinite(value) ? value : null;
  }

  // Date And Formatting Utilities

  /**
   * Formats a date as a Budapest-local `YYYY-MM-DD` key.
   *
   * @param {Date} date Absolute date/time.
   * @returns {string} Budapest-local date key.
   */
  function budapestDateKey(date) {
    return partsFor(date).slice(0, 3).join("-");
  }

  function tomorrowDateKey() {
    return budapestDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  }

  /**
   * Formats a date as a Budapest-local hourly key used to align provider timeseries rows.
   *
   * @param {Date} date Absolute date/time.
   * @returns {string} Budapest-local hour key.
   */
  function budapestHourKey(date) {
    const [year, month, day, hour] = partsFor(date);
    return `${year}-${month}-${day}T${hour}:00`;
  }

  /**
   * Extracts Budapest-local date and hour parts with `Intl.DateTimeFormat` to avoid manual timezone maths.
   *
   * @param {Date} date Absolute date/time.
   * @returns {string[]} `[year, month, day, hour]` with zero-padded month, day, and hour.
   */
  function partsFor(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      hour12: false
    }).formatToParts(date);
    const pick = type => parts.find(part => part.type === type).value;
    return [pick("year"), pick("month"), pick("day"), pick("hour")];
  }

  function formatDate(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat(language.value === LOCALE.HU_HU ? LOCALE.HU_HU : LOCALE.EN_GB, {
      weekday: "short",
      day: "2-digit",
      month: "short"
    }).format(parsed);
  }

  function formatHour(key) {
    return new Intl.DateTimeFormat(language.value === LOCALE.HU_HU ? LOCALE.HU_HU : LOCALE.EN_GB, {
      weekday: "short",
      hour: "2-digit"
    }).format(new Date(key));
  }

  function formatWindowRange(startKey, endKey) {
    const locale = language.value === LOCALE.HU_HU ? LOCALE.HU_HU : LOCALE.EN_GB;
    const dateFormat = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short"
    });
    const timeFormat = new Intl.DateTimeFormat(locale, {
      hour: "2-digit"
    });
    const start = new Date(startKey);
    const end = new Date(endKey);
    const startDate = dateFormat.format(start);
    const endDate = dateFormat.format(end);
    const startTime = timeFormat.format(start);
    const endTime = timeFormat.format(end);
    if (startDate === endDate) return `${startDate}, ${startTime}-${endTime}`;
    return `${startDate}, ${startTime} - ${endDate}, ${endTime}`;
  }

  function formatWindDirection(value) {
    if (!Number.isFinite(value)) return "n/a";
    const labels = language.value === LOCALE.HU_HU
      ? ["É", "ÉK", "K", "DK", "D", "DNY", "NY", "ÉNY"]
      : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round((((value % 360) + 360) % 360) / 45) % 8;
    return labels[index];
  }

  function formatTemp(value) {
    return Number.isFinite(value) ? `${Math.round(value)}°C` : "n/a";
  }

  function formatTempDelta(value) {
    return Number.isFinite(value) ? `${Math.abs(Math.round(value))}°C` : "n/a";
  }

  function formatTempRange(range) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return "n/a";
    return `${formatTemp(range.min)}-${formatTemp(range.max)}`;
  }

  function formatMm(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)} mm` : "n/a";
  }

  function formatMmRange(range) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return "n/a";
    return `${formatMm(range.min)}-${formatMm(range.max)}`;
  }

  function formatKmh(value) {
    return Number.isFinite(value) ? `${Math.round(value)} km/h` : "n/a";
  }

  function formatKmhRange(range) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return "n/a";
    return `${formatKmh(range.min)}-${formatKmh(range.max)}`;
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : "n/a";
  }

  function formatUv(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "n/a";
  }

  function formatConfidence(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : "n/a";
  }

  function formatFreshness(result) {
    const fetched = new Date(result.fetchedAt);
    if (Number.isNaN(fetched.getTime())) return "n/a";
    const locale = language.value === LOCALE.HU_HU ? LOCALE.HU_HU : LOCALE.EN_GB;
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(fetched);
    return result.fromCache ? `${time}, ${t().cached}` : time;
  }

  function forecastConfidenceColor(value) {
    if (!Number.isFinite(value)) return "161, 92, 0";
    const score = Math.max(0, Math.min(100, value));
    if (score >= 70) return "19, 115, 51";
    if (score >= 50) return "161, 92, 0";
    return "180, 35, 24";
  }

  /**
   * Builds a translated change phrase when a metric changed beyond a display threshold.
   *
   * @param {?number} current Current metric value.
   * @param {?number} previous Previous snapshot metric value.
   * @param {number} threshold Minimum absolute delta before a phrase is returned.
   * @param {Function} formatter Metric formatter.
   * @param {Function} increase Translation callback for positive deltas.
   * @param {Function} decrease Translation callback for negative deltas.
   * @returns {string} Change phrase or an empty string.
   */
  function changePhrase(current, previous, threshold, formatter, increase, decrease) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return "";
    const delta = current - previous;
    if (Math.abs(delta) < threshold) return "";
    return delta > 0 ? increase(formatter(Math.abs(delta))) : decrease(formatter(Math.abs(delta)));
  }

  // Markup Utilities

  /**
   * Escapes untrusted text before interpolation into HTML strings.
   *
   * @param {*} value Value to escape.
   * @returns {string} HTML-safe text.
   */
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function noteMarkup(message) {
    return `<p class="note alert alert-warning">${escapeHtml(message)}</p>`;
  }

  function iconMarkup(icon) {
    return `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
  }

  /**
   * Returns the Font Awesome status icon for a score level.
   *
   * @param {string} level Score key from `SCORE`.
   * @returns {string} Icon markup.
   */
  function scoreIconMarkup(level) {
    if (level === SCORE.GOOD) return iconMarkup("fa-circle-check");
    if (level === SCORE.CAUTION) return iconMarkup("fa-triangle-exclamation");
    return iconMarkup("fa-circle-xmark");
  }

  /**
   * Returns the DaisyUI badge class for a score level.
   *
   * @param {string} level Score key from `SCORE`.
   * @returns {string} Badge class name.
   */
  function scoreBadgeClass(level) {
    if (level === SCORE.GOOD) return "badge-success";
    if (level === SCORE.CAUTION) return "badge-warning";
    return "badge-error";
  }

  // ADR boundary map: keep the static app dependency-free while making the
  // single-file domains explicit enough to split later if a bundler is added.
  const DomainBoundaries = Object.freeze({
    applicationLifecycle: Object.freeze({
      start,
      registerServiceWorker,
      showUpdateToast,
      loadWeather,
      renderAll,
      rerenderCachedWeather
    }),
    clientInputs: Object.freeze({
      loadSettings,
      applySectionState,
      saveSettings,
      selectHasValue,
      applyBrowserLocale,
      useBrowserLocation,
      readCoords,
      parseCoords
    }),
    localisationAndTheme: Object.freeze({
      t,
      applyStaticText,
      updateThemeOptions,
      themeLabel,
      applyTheme,
      updateOptionLabels,
      sortSelectOptions
    }),
    providerAdapters: Object.freeze({
      openMeteoUrl,
      fetchProvider,
      parseProviderPayload,
      providerErrorMessage,
      normaliseOpenMeteo,
      normaliseDailyUv,
      normaliseMetNo
    }),
    forecastReadModels: Object.freeze({
      buildAggregate,
      dailyForProvider,
      aggregateDay,
      providerSpread,
      rangeFor,
      withForecastConfidence,
      hourlyAggregate,
      workWindows,
      nearestCurrentTemp
    }),
    advisoryHeuristics: Object.freeze({
      setActiveDomain,
      currentAdvisoryDomain,
      evaluateFamily,
      familySituationEntries,
      evaluateSports,
      agriInputSummary,
      evaluateAgriculture,
      advisoryRain,
      carryOverWetness,
      dryingCredit
    }),
    visualEmbeds: Object.freeze({
      updateMap
    }),
    rendering: Object.freeze({
      renderStatus,
      statusMessageMarkup,
      renderToday,
      renderForecastInsight,
      renderForecast,
      renderHourlyWork,
      renderAgriculture,
      renderFamily,
      renderSports,
      renderProviders,
      renderSourceComparison,
      renderSources
    }),
    forecastHistory: Object.freeze({
      forecastHistoryKey,
      loadForecastHistory,
      saveForecastHistory
    }),
    utilities: Object.freeze({
      median,
      max,
      min,
      sum,
      prevailingDirection,
      valueAt,
      numberOrNull,
      budapestDateKey,
      tomorrowDateKey,
      budapestHourKey,
      partsFor,
      formatDate,
      formatHour,
      formatWindowRange,
      formatWindDirection,
      formatTemp,
      formatTempDelta,
      formatTempRange,
      formatMm,
      formatMmRange,
      formatKmh,
      formatKmhRange,
      formatPercent,
      formatUv,
      formatConfidence,
      formatFreshness,
      forecastConfidenceColor,
      changePhrase,
      escapeHtml,
      noteMarkup,
      iconMarkup,
      scoreIconMarkup,
      scoreBadgeClass
    })
  });

  return Object.freeze({
    start: DomainBoundaries.applicationLifecycle.start,
    domains: DomainBoundaries
  });
})();

WeathermanApp.start();
