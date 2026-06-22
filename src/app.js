const WeathermanApp = (() => {
  const zone = "Europe/Budapest";
  const forecastDays = 5;
  const openMeteoHourly = "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover";
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
    FAMILY: "family"
  });
  const SUPPORTED_LOCALES = Object.freeze([LOCALE.EN_GB, LOCALE.HU_HU]);
  const SUPPORTED_CROPS = Object.freeze(Object.values(CROP));
  const SUPPORTED_WORK = Object.freeze(Object.values(WORK));
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
    DRYING_WEAK_CLOUD_PERCENT: 75,
    WIND_POOR_KMH: 35,
    WIND_CAUTION_KMH: 22,
    HEAT_STRESS_C: 34,
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
  // { key, date, temp, precip, wind, windDirection, cloud } with Budapest-local time and metric units.
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
  const agriTab = document.querySelector("#agriTab");
  const familyTab = document.querySelector("#familyTab");
  const agriPanel = document.querySelector("#agriPanel");
  const familyPanel = document.querySelector("#familyPanel");
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
      providers: "Provider Snapshots",
      sources: "Sources",
      insightTitle: "Forecast insight",
      sourceComparison: "Source comparison",
      medianNote: "Median values ignore sources that fail or do not report a metric. Precipitation is the median daily sum, not a probability.",
      agriNote: "Heuristic field-work guidance only. It does not include soil moisture, crop stage, machinery limits or field access.",
      familyNote: "Practical weather-risk guidance only. It is not medical advice and does not account for personal health conditions.",
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
      dailyTotal: "Median daily total",
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
        sprayHeat: "heat can reduce spray accuracy and crop safety",
        dryingWeak: "cloud cover suggests weak drying",
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
        heatHydration: "heat can affect anyone; plan water and shade",
        heatReduceActivity: "reduce strenuous midday outdoor activity",
        checkVulnerable: "check children, older adults and people with chronic conditions",
        coldExposure: "cold exposure risk; keep children warm and dry",
        wetCold: "rain with cool air can increase chill risk",
        strongWind: "strong wind can make walking, cycling and playground time harder",
        heavyRain: "heavy rain may disrupt school runs and outdoor plans",
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
      providers: "Források röviden",
      sources: "Nyers források",
      insightTitle: "Előrejelzési összkép",
      sourceComparison: "Forrás-összehasonlítás",
      medianNote: "A medián értékek kihagyják a hibás vagy hiányos forrásokat. A csapadék napi medián összeg, nem valószínűség.",
      agriNote: "Csak heurisztikus munkaszervezési jelzés. Nem tartalmaz talajnedvességet, fenológiai állapotot, gépkorlátot vagy területi megközelítést.",
      familyNote: "Csak gyakorlati időjárási kockázati jelzés. Nem orvosi tanács, és nem veszi figyelembe az egyéni egészségi állapotot.",
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
      dailyTotal: "Medián napi összeg",
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
        sprayHeat: "a meleg ronthatja a permetezés pontosságát és a növénybiztonságot",
        dryingWeak: "a felhőzet gyenge száradást jelez",
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
        heatHydration: "a hőség bárkit érinthet; tervezzetek vízzel és árnyékkal",
        heatReduceActivity: "érdemes csökkenteni a megterhelő déli kinti aktivitást",
        checkVulnerable: "figyeljetek a gyerekekre, idősekre és krónikus betegekre",
        coldExposure: "hideg kitettségi kockázat; a gyerekek maradjanak melegen és szárazon",
        wetCold: "az eső és hűvös levegő növelheti az áthűlés kockázatát",
        strongWind: "az erős szél nehezítheti a sétát, biciklizést és játszóterezést",
        heavyRain: "a nagy eső zavarhatja az iskolába járást és a kinti programokat",
        noData: "nincs használható előrejelzés"
      }
    }
  };

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

    sectionAccordions.forEach(section => {
      section.addEventListener("toggle", saveSettings);
    });

    [language, theme, crop, work].forEach(control => {
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

  function showUpdateToast() {
    updateToast.hidden = false;
  }

  async function loadWeather() {
    const coords = readCoords();
    if (!coords) return;

    refreshButton.disabled = true;
    todayEl.innerHTML = loadingMetricMarkup();
    forecastInsightEl.innerHTML = "";
    forecastEl.innerHTML = "";
    agriEl.innerHTML = "";
    familyEl.innerHTML = "";
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

  function renderAll(results, aggregate) {
    const usable = results.filter(result => result.ok);
    renderStatus(results);
    renderToday(aggregate.today, usable.length);
    renderForecastInsight(aggregate.days, usable);
    renderForecast(aggregate.days);
    renderHourlyWork(usable);
    renderAgriculture(aggregate.days);
    renderFamily(aggregate.days);
    renderProviders(results);
    renderSources(results);
  }

  function rerenderCachedWeather() {
    if (lastAggregate) renderAll(lastResults, lastAggregate);
  }

  // Preferences And Client Inputs

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
      if (SUPPORTED_ADVISORY_DOMAINS.includes(settings.advisoryDomain)) setActiveDomain(settings.advisoryDomain);
      if (Array.isArray(settings.openSections)) applySectionState(settings.openSections);
      return true;
    } catch {
      return false;
    }
  }

  function applySectionState(openSections) {
    sectionAccordions.forEach(section => {
      section.open = openSections.includes(section.id);
    });
  }

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

  function applyBrowserLocale() {
    const browserLocale = (navigator.languages || [navigator.language])
      .filter(Boolean)
      .map(locale => locale.toLowerCase())
      .find(locale => locale.startsWith("hu"));
    language.value = browserLocale ? LOCALE.HU_HU : LOCALE.EN_GB;
  }

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

  function readCoords() {
    const coords = parseCoords();
    if (!coords) {
      statusEl.innerHTML = statusMessageMarkup(t().invalidCoords, "error", "fa-triangle-exclamation");
      return null;
    }
    return coords;
  }

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

  function t() {
    const locale = SUPPORTED_LOCALES.includes(language.value) ? language.value : LOCALE.EN_GB;
    return text[locale];
  }

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
    document.querySelector("#providersTitle").innerHTML = `${iconMarkup("fa-satellite-dish")} ${escapeHtml(strings.providers)}`;
    document.querySelector("#sourcesTitle").innerHTML = `${iconMarkup("fa-code")} ${escapeHtml(strings.sources)}`;
    document.querySelector("#medianNote").textContent = strings.medianNote;
    document.querySelector("#agriNote").textContent = strings.agriNote;
    document.querySelector("#familyNote").textContent = strings.familyNote;
    updateThemeOptions();
    updateOptionLabels(crop, SUPPORTED_CROPS);
    updateOptionLabels(work, SUPPORTED_WORK);
    sortSelectOptions(language, locale);
    sortSelectOptions(theme, locale);
    sortSelectOptions(crop, locale);
    sortSelectOptions(work, locale);
  }

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

  function providerErrorMessage(response, raw) {
    const message = raw?.reason || raw?.error || response.statusText;
    return message ? `${response.status} ${message}` : `${response.status}`;
  }

  function normaliseOpenMeteo(raw) {
    const hourly = raw.hourly || {};
    return (hourly.time || []).map((time, index) => ({
      key: `${time.slice(0, 13)}:00`,
      date: time.slice(0, 10),
      temp: valueAt(hourly.temperature_2m, index),
      precip: valueAt(hourly.precipitation, index),
      wind: valueAt(hourly.wind_speed_10m, index),
      windDirection: valueAt(hourly.wind_direction_10m, index),
      cloud: valueAt(hourly.cloud_cover, index),
      uv: valueAt(hourly.uv_index, index),
      uvClearSky: valueAt(hourly.uv_index_clear_sky, index)
    }));
  }

  function normaliseDailyUv(raw) {
    const daily = raw.daily || {};
    return (daily.time || []).map((date, index) => ({
      date,
      uv: valueAt(daily.uv_index_max, index),
      uvClearSky: valueAt(daily.uv_index_clear_sky_max, index)
    }));
  }

  function normaliseMetNo(raw) {
    return (raw.properties?.timeseries || []).map(entry => {
      const details = entry.data?.instant?.details || {};
      const nextHour = entry.data?.next_1_hours?.details || {};
      const key = budapestHourKey(new Date(entry.time));
      return {
        key,
        date: key.slice(0, 10),
        temp: numberOrNull(details.air_temperature),
        precip: numberOrNull(nextHour.precipitation_amount),
        wind: numberOrNull(details.wind_speed) === null ? null : details.wind_speed * 3.6,
        windDirection: numberOrNull(details.wind_from_direction),
        cloud: numberOrNull(details.cloud_area_fraction),
        uvClearSky: numberOrNull(details.ultraviolet_index_clear_sky)
      };
    });
  }

  // Forecast Read Models

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
      wind: median(providerDays.map(day => day.wind)),
      windDirection: prevailingDirection(providerDays.map(day => day.windDirection)),
      cloud: median(providerDays.map(day => day.cloud)),
      uv: median(providerDays.map(day => day.uv)),
      uvClearSky: median(providerDays.map(day => day.uvClearSky))
    };
  }

  function providerSpread(providerDays) {
    return {
      high: rangeFor(providerDays.map(day => day.high)),
      low: rangeFor(providerDays.map(day => day.low)),
      precip: rangeFor(providerDays.map(day => day.precip)),
      wind: rangeFor(providerDays.map(day => day.wind)),
      uv: rangeFor(providerDays.map(day => day.uv))
    };
  }

  function rangeFor(values) {
    const clean = values.filter(value => Number.isFinite(value));
    if (!clean.length) return { min: null, max: null, range: null, count: 0 };
    const low = Math.min(...clean);
    const high = Math.max(...clean);
    return { min: low, max: high, range: high - low, count: clean.length };
  }

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
        precip: median(hours.map(hour => hour.precip)),
        wind: median(hours.map(hour => hour.wind)),
        windDirection: prevailingDirection(hours.map(hour => hour.windDirection)),
        cloud: median(hours.map(hour => hour.cloud))
      }));
  }

  function workWindows(hours, size = 6, step = size) {
    const windows = [];
    for (let start = 0; start < hours.length; start += step) {
      const slice = hours.slice(start, start + size);
      if (slice.length < size) break;
      const summary = {
        date: slice[0].date,
        sources: max(slice.map(hour => hour.sources)),
        currentTemp: slice[0].temp,
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

  function nearestCurrentTemp(hours) {
    const currentKey = budapestHourKey(new Date());
    const exact = hours.find(hour => hour.key === currentKey);
    if (exact) return exact.temp;
    return hours.find(hour => hour.key > currentKey)?.temp ?? null;
  }

  // Advisory Heuristics

  function setActiveDomain(domain, persist = false) {
    const familyActive = domain === ADVISORY_DOMAIN.FAMILY;
    agriTab.classList.toggle("active", !familyActive);
    familyTab.classList.toggle("active", familyActive);
    agriTab.classList.toggle("tab-active", !familyActive);
    familyTab.classList.toggle("tab-active", familyActive);
    agriTab.setAttribute("aria-selected", String(!familyActive));
    familyTab.setAttribute("aria-selected", String(familyActive));
    agriPanel.hidden = familyActive;
    familyPanel.hidden = !familyActive;
    if (!familyActive && hourlyChart) hourlyChart.resize();
    if (persist) saveSettings();
  }

  function currentAdvisoryDomain() {
    return familyTab.classList.contains("active") ? ADVISORY_DOMAIN.FAMILY : ADVISORY_DOMAIN.AGRI;
  }

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

  function familySituationEntries(day) {
    const strings = t();
    const rain = day.precip ?? 0;
    const wind = day.wind ?? 0;
    const high = day.high ?? 0;
    const low = day.low ?? 99;
    const uv = day.uv ?? day.uvClearSky ?? 0;
    return [
      [strings.schoolRun, rain >= 8 || wind >= 35 ? strings.caution : strings.good],
      [strings.outdoorPlay, rain >= 3 || wind >= 35 || high >= 34 ? strings.caution : strings.good],
      [strings.middaySun, uv >= 6 || high >= 30 ? strings.caution : strings.good],
      [strings.eveningWeather, low <= 8 || rain >= 1 ? strings.caution : strings.good]
    ];
  }

  function agriInputSummary(day, previousDays) {
    const wetness = carryOverWetness(previousDays, day);
    const inputs = [
      `${t().rain}: ${formatMm(day.precip)}`,
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
      if (cloud >= AGRI_LIMITS.DRYING_WEAK_CLOUD_PERCENT) addReason("dryingWeak", 1);
      if ([CROP.RAPESEED, CROP.WHEAT, CROP.BARLEY].includes(cropKey) && rain >= AGRI_LIMITS.HARVEST_RAIN_CAUTION_MM) addReason("cerealHarvest", 1);
    } else if (workKey === WORK.SPRAYING) {
      if (rain >= AGRI_LIMITS.SPRAY_RAIN_POOR_MM) addReason("sprayRain", 3);
      else if (rain >= AGRI_LIMITS.SPRAY_RAIN_CAUTION_MM) addReason("sprayRain", 1);
      if (wind >= AGRI_LIMITS.SPRAY_WIND_POOR_KMH) addReason("sprayDrift", 3);
      else if (wind >= AGRI_LIMITS.SPRAY_WIND_CAUTION_KMH) addReason("sprayDrift", 1);
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

  function advisoryRain(day) {
    const wettest = day.spread?.precip?.max;
    if (Number.isFinite(wettest)) return Math.max(day.precip ?? 0, wettest);
    return day.precip ?? 0;
  }

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

  function dryingCredit(day) {
    let credit = 0;
    if ((day.precip ?? 0) <= 0.5) credit += 1;
    if ((day.high ?? 0) >= 22) credit += 1;
    if ((day.wind ?? 0) >= 10 && (day.wind ?? 0) <= 28) credit += 0.75;
    if ((day.cloud ?? 100) <= 45) credit += 0.75;
    return credit;
  }

  // Visual Embeds

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
      metricMarkup("fa-temperature-half", strings.now, formatTemp(day.currentTemp), strings.activeSources(sourceCount)),
      metricMarkup("fa-arrows-up-down", strings.highLow, `${formatTemp(day.high)} / ${formatTemp(day.low)}`, strings.dailyRange),
      metricMarkup("fa-cloud-rain", strings.precipitation, formatMm(day.precip), strings.dailyTotal),
      metricMarkup("fa-sun", strings.uv, formatUv(day.uv), `${strings.dailyUvMax} · ${strings.uvClearSky}: ${formatUv(day.uvClearSky)}`),
      metricMarkup("fa-wind", strings.wind, formatKmh(day.wind), `${strings.dailyMax} · ${formatWindDirection(day.windDirection)}`)
    ].join("");
  }

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

  function renderForecast(days) {
    const strings = t();
    forecastEl.innerHTML = days.map(day => `
      <article class="day card bg-base-100 border border-base-300 shadow-sm" style="--confidence-color: ${forecastConfidenceColor(day.confidence)}">
        <time datetime="${day.date}">${formatDate(day.date)}</time>
        <strong>${formatTemp(day.high)} / ${formatTemp(day.low)}</strong>
        <dl>
          <dt>${iconMarkup("fa-gauge-high")} ${strings.confidence}</dt><dd>${formatConfidence(day.confidence)}</dd>
          <dt>${iconMarkup("fa-cloud-rain")} ${strings.rain}</dt><dd>${formatMm(day.precip)}</dd>
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
            <dt>${strings.uv}</dt><dd>${formatUv(today?.uv)}</dd>
            <dt>${strings.wind}</dt><dd>${formatKmh(today?.wind)}</dd>
            <dt>${strings.rulingWindDirection}</dt><dd>${formatWindDirection(today?.windDirection)}</dd>
          </dl>
        </article>
      `;
    }).join("");
  }

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
                <td>${formatKmh(day.wind)}</td>
                <td>${formatUv(day.uv)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

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
      metricMarkup("fa-cloud-rain", strings.precipitation, "...", strings.loading(providers.length)),
      metricMarkup("fa-sun", strings.uv, "...", strings.loading(providers.length)),
      metricMarkup("fa-wind", strings.wind, "...", strings.loading(providers.length))
    ].join("");
  }

  function metricMarkup(icon, label, value, help) {
    return `
      <article class="metric card bg-base-100 border border-base-300 shadow-sm">
        <span>${iconMarkup(icon)} ${label}</span>
        <strong>${value}</strong>
        <small>${help}</small>
      </article>
    `;
  }

  // Forecast History

  function forecastHistoryKey(coords) {
    return `${FORECAST_HISTORY_PREFIX}:${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
  }

  function loadForecastHistory(coords) {
    try {
      const snapshots = JSON.parse(localStorage.getItem(forecastHistoryKey(coords)) || "[]");
      return Array.isArray(snapshots) ? snapshots : [];
    } catch {
      return [];
    }
  }

  function saveForecastHistory(coords, days) {
    try {
      const snapshots = loadForecastHistory(coords);
      snapshots.unshift({
        fetchedAt: new Date().toISOString(),
        days: days.map(({ date, high, low, precip, wind, cloud, uv, uvClearSky, sources }) => ({ date, high, low, precip, wind, cloud, uv, uvClearSky, sources }))
      });
      localStorage.setItem(forecastHistoryKey(coords), JSON.stringify(snapshots.slice(0, MAX_FORECAST_SNAPSHOTS)));
    } catch {
      // localStorage may be disabled; confidence falls back to forecast distance.
    }
  }

  // Calculation Utilities

  function median(values) {
    const clean = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
    if (!clean.length) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }

  function max(values) {
    const clean = values.filter(value => Number.isFinite(value));
    return clean.length ? Math.max(...clean) : null;
  }

  function min(values) {
    const clean = values.filter(value => Number.isFinite(value));
    return clean.length ? Math.min(...clean) : null;
  }

  function sum(values) {
    const clean = values.filter(value => Number.isFinite(value));
    return clean.length ? clean.reduce((total, value) => total + value, 0) : null;
  }

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

  function budapestDateKey(date) {
    return partsFor(date).slice(0, 3).join("-");
  }

  function tomorrowDateKey() {
    return budapestDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  }

  function budapestHourKey(date) {
    const [year, month, day, hour] = partsFor(date);
    return `${year}-${month}-${day}T${hour}:00`;
  }

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

  function changePhrase(current, previous, threshold, formatter, increase, decrease) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return "";
    const delta = current - previous;
    if (Math.abs(delta) < threshold) return "";
    return delta > 0 ? increase(formatter(Math.abs(delta))) : decrease(formatter(Math.abs(delta)));
  }

  // Markup Utilities

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

  function scoreIconMarkup(level) {
    if (level === SCORE.GOOD) return iconMarkup("fa-circle-check");
    if (level === SCORE.CAUTION) return iconMarkup("fa-triangle-exclamation");
    return iconMarkup("fa-circle-xmark");
  }

  function scoreBadgeClass(level) {
    if (level === SCORE.GOOD) return "badge-success";
    if (level === SCORE.CAUTION) return "badge-warning";
    return "badge-error";
  }

  return Object.freeze({
    start
  });
})();

WeathermanApp.start();
