# App JavaScript Flow Chart

`src/app.js` is a dependency-free browser module that fetches multiple weather providers, converts them into one canonical forecast shape, builds median read models, applies advisory heuristics, and renders the static app.

```mermaid
flowchart TD
  Start[WeathermanApp.start] --> Setup[Attach event listeners]
  Start --> Restore[Restore settings or browser locale]
  Restore --> StaticUI[Apply static text and theme]
  StaticUI --> ServiceWorker[Register service worker]
  StaticUI --> LoadWeather[loadWeather]

  Setup --> UserChanges{User changes controls}
  UserChanges --> SaveSettings[saveSettings]
  UserChanges --> Rerender[rerenderCachedWeather]
  UserChanges --> LoadWeather

  LoadWeather --> ReadCoords[readCoords and parseCoords]
  ReadCoords --> ProviderFetch[fetchProvider for each provider]

  subgraph Providers[External Provider Adapters]
    ProviderFetch --> OpenMeteo[Open-Meteo compatible APIs]
    ProviderFetch --> MetNo[MET Norway API]
    OpenMeteo --> NormaliseOpenMeteo[normaliseOpenMeteo]
    OpenMeteo --> NormaliseDailyUv[normaliseDailyUv]
    MetNo --> NormaliseMetNo[normaliseMetNo]
    NormaliseOpenMeteo --> ProviderResult[ProviderResult]
    NormaliseDailyUv --> ProviderResult
    NormaliseMetNo --> ProviderResult
  end

  ProviderResult --> Usable{Provider ok?}
  Usable -->|yes| BuildAggregate[buildAggregate]
  Usable -->|no| SourceHealth[Render provider error]

  subgraph ForecastModel[Forecast Read Models]
    BuildAggregate --> DailyForProvider[dailyForProvider]
    DailyForProvider --> AggregateDay[aggregateDay]
    AggregateDay --> ProviderSpread[providerSpread]
    ProviderSpread --> Confidence[withForecastConfidence]
    Confidence --> AggregateForecast[Aggregate forecast days]
    ProviderResult --> HourlyAggregate[hourlyAggregate]
    HourlyAggregate --> WorkWindows[workWindows]
  end

  subgraph Storage[Local Storage]
    LoadWeather --> LoadHistory[loadForecastHistory]
    LoadHistory --> Confidence
    AggregateForecast --> SaveHistory[saveForecastHistory]
    SaveSettings --> SettingsKey[weatherman.settings.v1]
  end

  subgraph AdvisoryHeuristics[Advisory Heuristics]
    AggregateForecast --> EvaluateAgri[evaluateAgriculture]
    WorkWindows --> EvaluateAgri
    AggregateForecast --> EvaluateFamily[evaluateFamily]
    AggregateForecast --> EvaluateSports[evaluateSports]
    EvaluateAgri --> Score[good / caution / poor]
    EvaluateFamily --> Score
    EvaluateSports --> Score
  end

  subgraph Rendering[DOM Rendering]
    AggregateForecast --> RenderAll[renderAll]
    ProviderResult --> RenderAll
    RenderAll --> Today[renderToday]
    RenderAll --> Insight[renderForecastInsight]
    RenderAll --> Forecast[renderForecast]
    RenderAll --> Hourly[renderHourlyWork]
    RenderAll --> Agriculture[renderAgriculture]
    RenderAll --> Family[renderFamily]
    RenderAll --> Sports[renderSports]
    RenderAll --> ProvidersPanel[renderProviders]
    RenderAll --> Sources[renderSources]
    RenderAll --> Map[updateMap]
  end
```

## Main Boundaries

- Startup and preferences live in `start`, `loadSettings`, `saveSettings`, `applyStaticText`, and `applyTheme`.
- Provider adapters convert external API payloads into canonical `ForecastHour` rows before any aggregation happens.
- Forecast read models reduce provider data in two stages: provider-level daily summaries first, then cross-provider medians.
- Advisory heuristics are intentionally explainable rules that return score levels and translated reason keys.
- Rendering functions consume read models and advisory scores only; they do not fetch provider data directly.
- Forecast history is local-only and feeds confidence/change explanations, not provider fetching.
