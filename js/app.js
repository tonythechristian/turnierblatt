(function () {
  const {
    MODES,
    MATCH_MODES,
    MATCH_MODE_ORDER,
    MATCH_STATUSES,
    MATCH_STATUS_ORDER,
    PLAYER_STATUSES,
    PLAYER_STATUS_ORDER,
    TIE_BREAK_CRITERIA,
    VALID_SCORES,
    buildMatchSchedule,
    clampCount,
    clampPositiveInteger,
    createDefaultState,
    getDefaultWinScore,
    getMatchStatusLabel,
    getPlayerStatusLabel,
    getValidScoresForMode,
    isFixedSetMatchMode,
    isDefaultScoringRules,
    isScoreCompatibleWithMode,
    isWinningMatchMode,
    matchModeAllowsDraw,
    normalizeScoringRules,
    analyzeRoundRobin,
    analyzeTeamCompetition,
    analyzeGroupsKnockout,
    shuffleRoundRobinDraw,
    shuffleGroupsKnockoutDraw,
    getRoundRobinRoundCount,
    getTeamRoundCount,
    getGroupsKnockoutGroupRoundCount,
    getGroupsKnockoutKnockoutRoundCount,
    normalizeState,
    reverseScore
  } = window.TournamentLogic;

  const {
    downloadBlob,
    exportRoundRobinCsv,
    exportRoundRobinRoundCsv,
    exportRoundRobinXlsx,
    exportRoundRobinRoundXlsx,
    sanitizeFilename,
    exportTeamCsv,
    exportTeamRoundCsv,
    exportTeamRoundXlsx,
    exportTeamXlsx,
    exportGroupsKnockoutCsv,
    exportGroupsKnockoutRoundCsv,
    exportGroupsKnockoutRoundXlsx,
    exportGroupsKnockoutXlsx
  } = window.TournamentExport;

  const { exampleRoundRobinState, exampleTeamState, exampleGroupsKnockoutState } = window.TournamentExamples;

  const STORAGE_KEY = "tournament-workspace-state-v1";
  const TEMPLATE_STORAGE_KEY = "tournament-templates-v1";
  const LEGACY_STORAGE_KEYS = [
    "table-tennis-tournament-state-v2",
    "table-tennis-tournament-state-v1"
  ];
  const VIEW_STORAGE_KEY = "tournament-workspace-view-v1";
  const LEGACY_VIEW_STORAGE_KEY = "table-tennis-tournament-view-v1";
  const PLAYER_STATS_FONT_SIZE_KEY = "tournament-player-stats-font-size-v1";
  const LEGACY_PLAYER_STATS_FONT_SIZE_KEY = "table-tennis-player-stats-font-size-v1";
  const ROUND_CHECKPOINTS_KEY = "tournament-round-checkpoints-v1";
  const BACKUP_KIND = "tournament-workspace-backup";
  const LEGACY_BACKUP_KIND = "table-tennis-workspace-backup";
  const UNDO_LIMIT = 5;
  const ROUND_CHECKPOINT_LIMIT = 20;
  const BTTV_TT_RACE_NAME = `BTTV Bavarian TT-Race ${new Date().getFullYear()}`;
  const NORMAL_SET_SCORE_INPUT_HINT =
    "Satzdetails als 11:7, 9:11 oder kurz 7, -9 eingeben.";
  const PLAYER_STATS_FONT_SIZES = ["small", "medium", "large"];
  const LIVE_RANKING_LIMIT_KEY = "tournament-live-ranking-limit-v1";
  const LIVE_RANKING_LIMIT_OPTIONS = [3, 5, 10, "all"];
  const INFO_MESSAGE_DURATION_MS = 5000;
  const BACKUP_FILE_VERSION = 1;
  const DYNAMIC_MODULE_VERSION = "tt-race-random-draw-all-rounds-20260523";
  // Kein eigener Namensschritt mehr: der Name steht im Formatschritt und ist
  // freiwillig, weil eine click-TT XML ihn ohnehin ersetzt.
  const TOURNAMENT_WIZARD_STEPS = ["Format", "Teilnehmer", "Spielmodus", "Zusammenfassung"];
  const SPORT_PRESETS = [
    {
      id: "tischtennis",
      label: "Tischtennis",
      sport: "Tischtennis",
      format: "roundRobin",
      playerCount: 8,
      teamACount: 4,
      teamBCount: 4,
      matchMode: "win3"
    }
  ];
  const WIZARD_FORMATS = [
    {
      id: "roundRobin",
      label: "Jeder-gegen-jeden",
      description: "Tischtennis-Einzel mit Rundenplan, Tischverteilung und Rangliste.",
      available: true,
      official: false
    },
    {
      id: "team",
      label: "Teamwettbewerb",
      description: "Zwei Mannschaften mit Einzeln, optionalen Doppeln und Teamwertung.",
      available: true,
      official: false
    },
    {
      id: "groupsKnockout",
      label: "Gruppen + KO",
      description: "Gruppenphase mit anschließender KO-Runde fuer die Bestplatzierten.",
      available: true,
      official: false
    },
    {
      id: "ttRace",
      label: "BTTV TT-Race",
      description:
        "3 Gewinnsaetze, TTR-Auslosung und 6 Schweizer Runden. click-TT XML moeglich, aber nicht noetig.",
      available: true,
      official: true
    },
    {
      id: "knockout",
      label: "KO-System",
      description: "Platzhalter für ein reines KO-Turnier.",
      available: false,
      official: false
    }
  ];

  let workspace = loadWorkspace();
  let roundCheckpoints = loadRoundCheckpoints();
  let tournamentTemplates = loadTournamentTemplates();
  let activeTournament = getActiveTournament();
  let analysis = computeAnalysis();
  let activeWorkspaceView = loadWorkspaceView();
  let playerStatsFontSize = loadPlayerStatsFontSize();
  let liveRankingLimit = loadLiveRankingLimit();
  let tournamentHistories = createTournamentHistories();
  let participantImportDrafts = new Map();
  let clickTtImportDraft = null;
  let clickTtBridgeModule = null;
  let clickTtBridgePromise = null;
  let ttRaceEngineModule = null;
  let ttRaceEnginePromise = null;
  let infoMessageTimeoutId = null;
  let draggedTournamentState = null;
  let tournamentWizardState = null;
  let tournamentWizardPlayerCountRenderTimer = null;

  const tabsElement = document.querySelector("#tournamentTabs");
  const workspaceViewTabs = document.querySelector("#workspaceViewTabs");
  const switcherButton = document.querySelector("#tournamentSwitcherBtn");
  const switcherPanel = document.querySelector("#tournamentSwitcherPanel");
  const switcherName = document.querySelector("#tournamentSwitcherName");
  const screenKicker = document.querySelector("#screenKicker");
  const screenFacts = document.querySelector("#screenFacts");
  const screenMeta = document.querySelector("#screenMeta");
  const startView = document.querySelector("#startView");
  const startTournamentList = document.querySelector("#startTournamentList");
  const mainLayout = document.querySelector("main.layout");
  const inputView = document.querySelector("#inputView");
  const outputView = document.querySelector("#outputView");
  const liveView = document.querySelector("#liveView");
  const configForm = document.querySelector("#configForm");
  const configDetails = document.querySelector("#configDetails");
  const raceDayShell = document.querySelector("#raceDayShell");
  const tournamentSheet = document.querySelector("#tournamentSheet");
  const appTitle = document.querySelector("#appTitle");
  const messageArea = document.querySelector("#messageArea");
  const sheetMeta = document.querySelector("#sheetMeta");
  const printDocument = document.querySelector("#printDocument");
  const printDocumentSelect = document.querySelector("#printDocumentSelect");
  const autosaveState = document.querySelector("#autosaveState");
  const autosaveDetail = document.querySelector("#autosaveDetail");
  const roundBackupStatus = document.querySelector("#roundBackupStatus");
  const roundCheckpointPanel = document.querySelector("#roundCheckpointPanel");
  const backupFileInput = document.querySelector("#backupFileInput");
  const clickTtFileInput = document.querySelector("#clickTtFileInput");
  const templateSelect = document.querySelector("#templateSelect");
  const templateIncludeResults = document.querySelector("#templateIncludeResults");
  const tournamentWizardDialog = document.querySelector("#tournamentWizardDialog");
  const tournamentWizardContent = document.querySelector("#tournamentWizardContent");
  const duplicateTournamentDialog = document.querySelector("#duplicateTournamentDialog");
  const duplicateTournamentText = document.querySelector("#duplicateTournamentText");

  // Die Überschrift trägt die Aufgabe des Reiters, nicht den Turniernamen.
  const VIEW_TITLES = {
    input: "Teilnehmer",
    output: "Ergebniseingabe",
    live: "Live-Ansicht"
  };

  /** Reines Gesamtergebnis wie 3:1 — wird als Ergebnis erkannt, nicht als Satz. */
  const TOTAL_SCORE_PATTERN = /^[0-5]\s*:\s*[0-5]$/;
  const QUICK_RESULT_PLACEHOLDER = "8, 3, 5 oder 3:1";
  const QUICK_RESULT_ERROR = "Nicht erkannt. Sätze als 11:7, 9:11 oder kurz 7, -9 eintragen.";

  /** Satzdetail-Schalter, getrennt je Screen. */
  const setDetailsByScreen = Object.create(null);

  /** Zeile der Startliste, die gerade bearbeitet wird. */
  let ttRaceEditingPlayerId = null;

  /** Ob die Turnierübersicht statt eines Turniers gezeigt wird. */
  let startViewOpen = false;

  initialize();

  function initialize() {
    const startupNotice = applyWorkspaceSeedFromUrl();
    renderAll();
    updateAutosaveStatus();
    primeOptionalModules();
    if (startupNotice) {
      showInfo(startupNotice);
    }

    document
      .querySelector("#openTournamentWizardBtn")
      .addEventListener("click", () => {
        closeTournamentSwitcher();
        handleOpenTournamentWizard();
      });
    document.querySelector("#startNewTournamentBtn").addEventListener("click", () => {
      hideStartView();
      handleOpenTournamentWizard();
    });
    switcherButton.addEventListener("click", toggleTournamentSwitcher);
    document.querySelector("#showAllTournamentsBtn").addEventListener("click", showStartView);
    document.querySelector("#closeStartViewBtn").addEventListener("click", hideStartView);

    // Klick daneben und Escape schließen den Schalter.
    document.addEventListener("click", (event) => {
      if (switcherPanel.hidden) {
        return;
      }

      if (!switcherPanel.contains(event.target) && !switcherButton.contains(event.target)) {
        closeTournamentSwitcher();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !switcherPanel.hidden) {
        closeTournamentSwitcher();
      }
    });
    document
      .querySelector("#addRoundRobinTournamentBtn")
      .addEventListener("click", () => handleAddTournamentTab("roundRobin"));
    document
      .querySelector("#addTtRaceTournamentBtn")
      .addEventListener("click", () => handleAddTournamentTab("ttRace"));
    document
      .querySelector("#addTeamTournamentBtn")
      .addEventListener("click", () => handleAddTournamentTab("team"));
    document
      .querySelector("#addGroupsKnockoutTournamentBtn")
      .addEventListener("click", () => handleAddTournamentTab("groupsKnockout"));
    document.querySelector("#newTournamentBtn").addEventListener("click", handleClearCurrentTournament);
    document.querySelector("#resetResultsBtn").addEventListener("click", handleResetResults);
    document.querySelector("#loadExampleBtn").addEventListener("click", handleLoadExample);
    document.querySelector("#saveBackupBtn").addEventListener("click", handleSaveBackup);
    document.querySelector("#loadBackupBtn").addEventListener("click", handleLoadBackup);
    document.querySelector("#duplicateTournamentBtn").addEventListener("click", handleDuplicateTournament);
    document.querySelector("#saveTemplateBtn").addEventListener("click", handleSaveTemplate);
    document.querySelector("#loadTemplateBtn").addEventListener("click", handleLoadTemplate);
    document.querySelector("#deleteTemplateBtn").addEventListener("click", handleDeleteTemplate);
    backupFileInput.addEventListener("change", handleBackupFileSelection);
    clickTtFileInput.addEventListener("change", handleClickTtFileSelection);
    raceDayShell.addEventListener("click", (event) => {
      if (event.target.closest("[data-print-now]")) {
        handlePrintDocument();
        return;
      }
      handleRaceDayShellClick(event);
    });
    raceDayShell.addEventListener("change", handleRaceDayShellChange);
    tournamentWizardDialog.addEventListener("click", handleTournamentWizardBackdropClick);
    tournamentWizardContent.addEventListener("click", handleTournamentWizardClick);
    duplicateTournamentDialog.addEventListener("click", handleDuplicateTournamentDialogClick);
    tournamentWizardContent.addEventListener("input", handleTournamentWizardInput);
    tournamentWizardContent.addEventListener("change", handleTournamentWizardInput);
    document
      .querySelector("#exportCurrentRoundCsvBtn")
      .addEventListener("click", handleExportCurrentRoundCsv);
    document
      .querySelector("#exportCurrentRoundXlsxBtn")
      .addEventListener("click", handleExportCurrentRoundXlsx);
    document.querySelector("#exportCsvBtn").addEventListener("click", handleExportCsv);
    document.querySelector("#exportXlsxBtn").addEventListener("click", handleExportXlsx);
    document.querySelector("#printBtn").addEventListener("click", handlePrintDocument);
    window.addEventListener("beforeprint", preparePrintDocument);
    window.addEventListener("afterprint", cleanupPrintDocument);
    workspaceViewTabs.querySelectorAll("[data-workspace-view]").forEach((button) => {
      button.addEventListener("click", () => {
        activeWorkspaceView = ["input", "output", "live"].includes(button.dataset.workspaceView)
          ? button.dataset.workspaceView
          : "input";
        saveWorkspaceView();
        hideStartView();
        renderWorkspacePanels();
        renderAppTitle();
      });
    });
    liveView.addEventListener("click", handleLiveViewClick);
    liveView.addEventListener("change", handleLiveViewChange);
  }

  function loadClickTtBridge() {
    if (!clickTtBridgePromise) {
      clickTtBridgePromise = import("./clickttBridge.js").then((module) => {
        clickTtBridgeModule = module;
        return module;
      });
    }

    return clickTtBridgePromise;
  }

  function loadTtRaceEngine() {
    if (!ttRaceEnginePromise) {
      ttRaceEnginePromise = import(`./ttRace.js?v=${DYNAMIC_MODULE_VERSION}`).then((module) => {
        ttRaceEngineModule = module;
        return module;
      });
    }

    return ttRaceEnginePromise;
  }

  function primeOptionalModules() {
    if (activeTournament?.clicktt?.rawXml) {
      loadClickTtBridge()
        .then(() => renderRaceDayShell())
        .catch((error) => console.warn("click-TT Adapter konnte nicht geladen werden.", error));
    }

    if (isTtRaceTournament()) {
      loadTtRaceEngine()
        .then(() => {
          renderRaceDayShell();
          renderLiveView();
        })
        .catch((error) => console.warn("TT-Race Engine konnte nicht geladen werden.", error));
    }
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function createTournamentId() {
    return `turnier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createDoubleId() {
    return `doppel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createStateForMode(modeId) {
    const state = createDefaultState();
    state.mode =
      modeId === "team"
        ? "team"
        : modeId === "groupsKnockout"
          ? "groupsKnockout"
          : "roundRobin";
    return state;
  }

  function createBttvTtRaceStarterState(tournamentName = BTTV_TT_RACE_NAME) {
    const state = createStateForMode("roundRobin");
    const cleanName = tournamentName.trim() || BTTV_TT_RACE_NAME;

    state.tabName = cleanName;
    state.tournamentName = cleanName;
    state.matchMode = "win3";
    state.schedule = {
      ...state.schedule,
      fieldCount: 8,
      startTime: "09:00",
      matchDurationMinutes: 18,
      breakMinutes: 2,
      fieldNames: Array.from({ length: 8 }, (_, index) => `Tisch ${index + 1}`)
    };
    state.roundRobin = {
      ...state.roundRobin,
      playerCount: 2,
      playerNames: ["Spieler 1", "Spieler 2"],
      playerStatuses: ["active", "active"],
      currentRound: 1,
      results: {},
      matchStatuses: {}
    };
    state.ttRace = {
      id: "bttv-tt-race",
      name: cleanName,
      settings: {
        maxRounds: 6,
        bttvRaceRules: true,
        regardTtrValues: true
      },
      players: [],
      rounds: []
    };
    return state;
  }

  function createTournamentRecord(seed, explicitId) {
    const normalizedState = normalizeState(seed || createDefaultState());
    upgradeLegacyTtRaceState(normalizedState);

    return {
      id: explicitId || createTournamentId(),
      ...normalizedState
    };
  }

  function upgradeLegacyTtRaceState(state) {
    if (state.ttRace || !looksLikeTtRaceState(state)) {
      return state;
    }

    const names = ensureLength(
      state.roundRobin?.playerNames ?? [],
      state.roundRobin?.playerCount ?? 0,
      "Teilnehmer"
    );
    const statuses = ensureLength(
      state.roundRobin?.playerStatuses ?? [],
      names.length,
      "active"
    );
    const hasNamedPlayers = names.some((name, index) => name && name !== `Teilnehmer ${index + 1}` && name !== `Spieler ${index + 1}`);

    state.mode = "roundRobin";
    state.matchMode = "win3";
    state.ttRace = {
      id: state.id || "bttv-tt-race",
      name: state.tournamentName || state.tabName || BTTV_TT_RACE_NAME,
      settings: {
        maxRounds: 6,
        bttvRaceRules: true,
        regardTtrValues: true
      },
      players: hasNamedPlayers
        ? names.map((name, index) => ({
            id: `legacy-player-${index + 1}`,
            name,
            seed: null,
            rating: null,
            status: PLAYER_STATUSES[statuses[index]] ? statuses[index] : "active"
          }))
        : [],
      rounds: []
    };
    state.roundRobin.results = {};
    state.roundRobin.setScores = {};
    state.roundRobin.matchStatuses = {};
    state.roundRobin.currentRound = 1;

    return state;
  }

  function looksLikeTtRaceState(state) {
    const name = `${state.tabName || ""} ${state.tournamentName || ""}`.toLowerCase();
    return name.includes("tt-race") || name.includes("tt race") || (name.includes("tt") && name.includes("race"));
  }

  function createDefaultWorkspace() {
    const tournament = createTournamentRecord(createDefaultState());
    return {
      activeTournamentId: tournament.id,
      tournaments: [tournament]
    };
  }

  function createTournamentHistories() {
    const histories = new Map();
    workspace.tournaments.forEach((tournament) => {
      histories.set(tournament.id, { undo: [], redo: [] });
    });
    return histories;
  }

  function normalizeWorkspace(rawWorkspace) {
    if (rawWorkspace && Array.isArray(rawWorkspace.tournaments)) {
      const tournaments = rawWorkspace.tournaments.map((entry) =>
        createTournamentRecord(entry, entry?.id)
      );
      const safeTournaments = tournaments.length > 0 ? tournaments : createDefaultWorkspace().tournaments;
      const activeExists = safeTournaments.some((entry) => entry.id === rawWorkspace.activeTournamentId);

      return {
        activeTournamentId: activeExists ? rawWorkspace.activeTournamentId : safeTournaments[0].id,
        tournaments: safeTournaments
      };
    }

    if (rawWorkspace && (rawWorkspace.mode || rawWorkspace.roundRobin || rawWorkspace.team)) {
      const migratedTournament = createTournamentRecord(rawWorkspace, rawWorkspace.id);
      return {
        activeTournamentId: migratedTournament.id,
        tournaments: [migratedTournament]
      };
    }

    return createDefaultWorkspace();
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn("localStorage ist in diesem Browser-Kontext nicht verfügbar.", error);
      return null;
    }
  }

  function loadWorkspace() {
    const savedWorkspace =
      readStorage(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(readStorage).find(Boolean);
    if (!savedWorkspace) {
      return createDefaultWorkspace();
    }

    try {
      return normalizeWorkspace(JSON.parse(savedWorkspace));
    } catch (error) {
      console.warn("Gespeicherter Turnierstand konnte nicht gelesen werden.", error);
      return createDefaultWorkspace();
    }
  }

  function loadWorkspaceView() {
    const savedView = readStorage(VIEW_STORAGE_KEY) || readStorage(LEGACY_VIEW_STORAGE_KEY);
    return ["input", "output", "live"].includes(savedView) ? savedView : "input";
  }

  function decodeBase64UrlJson(value) {
    const base64 = String(value ?? "").replaceAll("-", "+").replaceAll("_", "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function applyWorkspaceSeedFromUrl() {
    const url = new URL(window.location.href);
    const encodedSeed = url.searchParams.get("workspaceSeed");
    if (!encodedSeed) {
      return "";
    }

    try {
      const parsedSeed = decodeBase64UrlJson(encodedSeed);
      const seededWorkspace =
        parsedSeed.workspace ||
        (parsedSeed.activeTournamentId && Array.isArray(parsedSeed.tournaments) ? parsedSeed : null);

      if (!seededWorkspace) {
        throw new Error("Workspace-Seed enthaelt keinen gueltigen Turnierstand.");
      }

      workspace = normalizeWorkspace(seededWorkspace);
      activeWorkspaceView = ["input", "output", "live"].includes(parsedSeed.activeWorkspaceView)
        ? parsedSeed.activeWorkspaceView
        : "output";
      tournamentHistories = createTournamentHistories();
      syncDerivedState();
      saveWorkspace(parsedSeed.saveNote || "Turnierstand geladen");
      saveWorkspaceView();

      url.searchParams.delete("workspaceSeed");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

      return parsedSeed.notice || "Turnierstand wurde geladen.";
    } catch (error) {
      console.warn("Workspace-Seed konnte nicht geladen werden.", error);
      return "Turnierstand aus Link konnte nicht geladen werden.";
    }
  }

  function loadPlayerStatsFontSize() {
    const savedSize =
      readStorage(PLAYER_STATS_FONT_SIZE_KEY) || readStorage(LEGACY_PLAYER_STATS_FONT_SIZE_KEY);
    return PLAYER_STATS_FONT_SIZES.includes(savedSize) ? savedSize : "medium";
  }

  function loadLiveRankingLimit() {
    return normalizeLiveRankingLimit(readStorage(LIVE_RANKING_LIMIT_KEY));
  }

  function normalizeLiveRankingLimit(value) {
    if (value === "all") {
      return "all";
    }

    const numericLimit = Number.parseInt(value, 10);
    return LIVE_RANKING_LIMIT_OPTIONS.includes(numericLimit) ? numericLimit : 3;
  }
  function saveWorkspace(note) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      autosaveState.textContent = "Automatische Speicherung aktiv";
    } catch (error) {
      autosaveState.textContent = "Speicherung in diesem Browser eingeschränkt";
      console.warn("Turnierstand konnte nicht gespeichert werden.", error);
    }

    const now = new Date();
    autosaveDetail.textContent = `${note} um ${now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })}`;
  }

  function saveWorkspaceView() {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, activeWorkspaceView);
    } catch (error) {
      console.warn("Ansicht konnte nicht gespeichert werden.", error);
    }
  }

  function savePlayerStatsFontSize() {
    try {
      window.localStorage.setItem(PLAYER_STATS_FONT_SIZE_KEY, playerStatsFontSize);
    } catch (error) {
      console.warn("Schriftgröße für die Spielerstatistik konnte nicht gespeichert werden.", error);
    }
  }

  function saveLiveRankingLimit() {
    try {
      window.localStorage.setItem(LIVE_RANKING_LIMIT_KEY, String(liveRankingLimit));
    } catch (error) {
      console.warn("Live-Ranglistenlänge konnte nicht gespeichert werden.", error);
    }
  }

  function updateAutosaveStatus() {
    if (readStorage(STORAGE_KEY) || LEGACY_STORAGE_KEYS.some((key) => readStorage(key))) {
      autosaveDetail.textContent = "Vorheriger Stand wurde geladen.";
    }
  }

  function loadRoundCheckpoints() {
    const savedCheckpoints = readStorage(ROUND_CHECKPOINTS_KEY);
    if (!savedCheckpoints) {
      return [];
    }

    try {
      const parsed = JSON.parse(savedCheckpoints);
      const entries = Array.isArray(parsed) ? parsed : parsed?.checkpoints;
      if (!Array.isArray(entries)) {
        return [];
      }

      return entries
        .filter((entry) => entry?.id && entry?.checkpointKey && entry?.payload?.workspace)
        .slice(0, ROUND_CHECKPOINT_LIMIT);
    } catch (error) {
      console.warn("Gespeicherte Runden-Checkpoints konnten nicht gelesen werden.", error);
      return [];
    }
  }

  function saveRoundCheckpoints() {
    let checkpointsToSave = roundCheckpoints.slice(0, ROUND_CHECKPOINT_LIMIT);

    while (checkpointsToSave.length > 0) {
      try {
        window.localStorage.setItem(
          ROUND_CHECKPOINTS_KEY,
          JSON.stringify({
            version: 1,
            checkpoints: checkpointsToSave
          })
        );
        roundCheckpoints = checkpointsToSave;
        return true;
      } catch (error) {
        checkpointsToSave = checkpointsToSave.slice(0, -1);
        if (checkpointsToSave.length === 0) {
          console.warn("Runden-Checkpoints konnten nicht gespeichert werden.", error);
        }
      }
    }

    roundCheckpoints = [];
    return false;
  }

  function createTemplateId() {
    return `vorlage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadTournamentTemplates() {
    const savedTemplates = readStorage(TEMPLATE_STORAGE_KEY);
    if (!savedTemplates) {
      return [];
    }

    try {
      const parsed = JSON.parse(savedTemplates);
      const entries = Array.isArray(parsed) ? parsed : parsed?.templates;
      if (!Array.isArray(entries)) {
        return [];
      }

      return entries.map(normalizeTournamentTemplate).filter(Boolean);
    } catch (error) {
      console.warn("Gespeicherte Turnier-Vorlagen konnten nicht gelesen werden.", error);
      return [];
    }
  }

  function normalizeTournamentTemplate(entry) {
    if (!entry?.state) {
      return null;
    }

    try {
      const state = createReusableTournamentState(entry.state, Boolean(entry.includeResults));
      const name = String(entry.name || state.tabName || state.tournamentName || "Turnier-Vorlage").trim();

      return {
        id: entry.id || createTemplateId(),
        name: name || "Turnier-Vorlage",
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
        includeResults: Boolean(entry.includeResults),
        state
      };
    } catch (error) {
      console.warn("Eine Turnier-Vorlage wurde übersprungen.", error);
      return null;
    }
  }

  function saveTournamentTemplates() {
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(tournamentTemplates));
      return true;
    } catch (error) {
      console.warn("Turnier-Vorlagen konnten nicht gespeichert werden.", error);
      showInfo("Vorlagen konnten in diesem Browser-Kontext nicht gespeichert werden.");
      return false;
    }
  }

  function createReusableTournamentState(tournament, includeResults) {
    const state = normalizeState(cloneValue(tournament));
    delete state.id;

    if (!includeResults) {
      clearTournamentResults(state);
    }

    return state;
  }

  function clearTournamentResults(tournament) {
    tournament.roundRobin.results = {};
    tournament.roundRobin.setScores = {};
    tournament.roundRobin.matchStatuses = {};
    tournament.roundRobin.currentRound = 1;
    tournament.team.results = {};
    tournament.team.setScores = {};
    tournament.team.matchStatuses = {};
    tournament.team.doubleResults = {};
    tournament.team.doubleSetScores = {};
    tournament.team.doubleMatchStatuses = {};
    tournament.team.currentRound = 1;
    tournament.team.currentDoubleRound = 1;
    tournament.groupsKnockout.groupResults = {};
    tournament.groupsKnockout.groupSetScores = {};
    tournament.groupsKnockout.knockoutResults = {};
    tournament.groupsKnockout.knockoutSetScores = {};
    tournament.groupsKnockout.currentGroupRound = 1;
    tournament.groupsKnockout.currentKnockoutRound = 1;
    if (tournament.ttRace) {
      tournament.ttRace.rounds = [];
    }
    if (tournament.clicktt?.setScores) {
      tournament.clicktt.setScores = {};
    }
    return tournament;
  }

  function createTournamentFromReusableState(state) {
    const seed = cloneValue(state);
    delete seed.id;
    return createTournamentRecord(seed);
  }

  function buildWorkspaceBackupPayload(workspaceSnapshot = workspace) {
    return {
      kind: BACKUP_KIND,
      version: BACKUP_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: cloneValue(workspaceSnapshot),
      preferences: {
        activeWorkspaceView,
        playerStatsFontSize,
        liveRankingLimit
      },
      templates: {
        included: false,
        note: "Vorlagen bleiben separat in localStorage und werden nicht in Backups exportiert."
      },
      summary: {
        tournamentCount: workspaceSnapshot.tournaments.length,
        tournamentLabels: workspaceSnapshot.tournaments.map((tournament, index) =>
          getTournamentLabel(tournament, index)
        )
      }
    };
  }

  function buildWorkspaceBackupFilename(payload, workspaceSnapshot = workspace) {
    const primaryLabel =
      workspaceSnapshot.tournaments.length === 1
        ? getTournamentLabel(activeTournament, getActiveTournamentIndex())
        : `turnier_dashboard_${getTournamentLabel(activeTournament, getActiveTournamentIndex())}_${workspaceSnapshot.tournaments.length}_turniere`;
    return `${sanitizeFilename(primaryLabel)}_backup_${formatBackupTimestamp(payload.exportedAt)}.json`;
  }

  function buildRoundCheckpointBackupFilename(checkpointEvent, exportedAt) {
    return `${sanitizeFilename(`${checkpointEvent.tournamentLabel}_${checkpointEvent.roundLabel}`)}_auto_backup_${formatBackupTimestamp(exportedAt)}.json`;
  }

  function formatBackupTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const pad = (number) => String(number).padStart(2, "0");

    return [
      safeDate.getFullYear(),
      pad(safeDate.getMonth() + 1),
      pad(safeDate.getDate())
    ].join("-") +
      "_" +
      [pad(safeDate.getHours()), pad(safeDate.getMinutes()), pad(safeDate.getSeconds())].join("-");
  }

  function handleSaveBackup() {
    const payload = buildWorkspaceBackupPayload();
    const filename = buildWorkspaceBackupFilename(payload);
    const json = JSON.stringify(payload, null, 2);
    downloadBlob(filename, new Blob([json], { type: "application/json;charset=utf-8" }));
    showInfo(
      `Backup gespeichert: ${workspace.tournaments.length} Turnier${workspace.tournaments.length === 1 ? "" : "e"} als JSON-Datei heruntergeladen.`
    );
  }

  function handleLoadBackup() {
    backupFileInput.value = "";
    backupFileInput.click();
  }

  async function handleBackupFileSelection(event) {
    const file = event.target.files?.[0];
    backupFileInput.value = "";

    if (!file) {
      return;
    }

    try {
      const parsedBackup = parseWorkspaceBackup(await file.text());
      const shouldLoad = window.confirm(buildBackupLoadConfirmation(file.name, parsedBackup));

      if (!shouldLoad) {
        showInfo("Backup wurde nicht geladen.");
        return;
      }

      applyWorkspaceBackup(parsedBackup);
      showInfo(
        `Backup geladen: ${parsedBackup.summary.tournamentCount} Turnier${parsedBackup.summary.tournamentCount === 1 ? "" : "e"} wurden wiederhergestellt.`
      );
    } catch (error) {
      console.error("Backup konnte nicht geladen werden.", error);
      showInfo("Backup konnte nicht geladen werden. Bitte eine gültige JSON-Sicherungsdatei wählen.");
    }
  }

  function parseWorkspaceBackup(rawText) {
    const parsed = JSON.parse(rawText);

    if ([BACKUP_KIND, LEGACY_BACKUP_KIND].includes(parsed?.kind) && parsed?.workspace) {
      const normalizedWorkspace = normalizeWorkspace(parsed.workspace);
      return {
        workspace: normalizedWorkspace,
        preferences: {
          activeWorkspaceView: parsed.preferences?.activeWorkspaceView,
          playerStatsFontSize: parsed.preferences?.playerStatsFontSize,
          liveRankingLimit: parsed.preferences?.liveRankingLimit
        },
        exportedAt: parsed.exportedAt,
        summary: {
          tournamentCount: parsed.summary?.tournamentCount ?? normalizedWorkspace.tournaments.length,
          tournamentLabels:
            parsed.summary?.tournamentLabels ??
            normalizedWorkspace.tournaments.map((tournament, index) =>
              getTournamentLabel(tournament, index)
            )
        }
      };
    }

    if (parsed?.activeTournamentId && Array.isArray(parsed?.tournaments)) {
      const normalizedWorkspace = normalizeWorkspace(parsed);
      return {
        workspace: normalizedWorkspace,
        preferences: {},
        exportedAt: null,
        summary: {
          tournamentCount: normalizedWorkspace.tournaments.length,
          tournamentLabels: normalizedWorkspace.tournaments.map((tournament, index) =>
            getTournamentLabel(tournament, index)
          )
        }
      };
    }

    throw new Error("Ungültiges Backup-Format");
  }

  function buildBackupLoadConfirmation(filename, parsedBackup) {
    const exportedAtLabel = parsedBackup.exportedAt
      ? new Date(parsedBackup.exportedAt).toLocaleString("de-DE")
      : "unbekannt";
    const previewLabels = parsedBackup.summary.tournamentLabels.slice(0, 5);
    const remainingCount =
      parsedBackup.summary.tournamentLabels.length - previewLabels.length;
    const tournamentPreview = previewLabels.length
      ? `\n\nTurniere:\n- ${previewLabels.join("\n- ")}${remainingCount > 0 ? `\n- +${remainingCount} weitere` : ""}`
      : "";

    return (
      `${filename} laden?\n\n` +
      `Gesichert am: ${exportedAtLabel}\n` +
      `Turniere im Backup: ${parsedBackup.summary.tournamentCount}` +
      `${tournamentPreview}\n\n` +
      "Der aktuelle Stand im Dashboard wird durch dieses Backup ersetzt."
    );
  }

  function applyWorkspaceBackup(parsedBackup) {
    workspace = normalizeWorkspace(parsedBackup.workspace);
    activeWorkspaceView =
      ["input", "output", "live"].includes(parsedBackup.preferences.activeWorkspaceView)
        ? parsedBackup.preferences.activeWorkspaceView
        : "input";
    playerStatsFontSize = PLAYER_STATS_FONT_SIZES.includes(
      parsedBackup.preferences.playerStatsFontSize
    )
      ? parsedBackup.preferences.playerStatsFontSize
      : "medium";
    liveRankingLimit = normalizeLiveRankingLimit(parsedBackup.preferences.liveRankingLimit);
    tournamentHistories = createTournamentHistories();
    syncDerivedState();
    renderAll();
    saveWorkspaceView();
    savePlayerStatsFontSize();
    saveLiveRankingLimit();
    saveWorkspace("Backup geladen");
  }

  function handleDownloadSelectedRoundCheckpoint() {
    const checkpoint = getSelectedRoundCheckpoint();
    if (!checkpoint) {
      showInfo("Kein Runden-Checkpoint ausgewählt.");
      return;
    }

    downloadRoundCheckpoint(checkpoint);
    showInfo(`${checkpoint.roundLabel} wurde erneut als JSON-Backup heruntergeladen.`);
  }

  function handleRestoreSelectedRoundCheckpoint() {
    const checkpoint = getSelectedRoundCheckpoint();
    if (!checkpoint) {
      showInfo("Kein Runden-Checkpoint ausgewählt.");
      return;
    }

    const shouldRestore = window.confirm(
      `${checkpoint.roundLabel} laden?\n\n` +
        `Gesichert am: ${formatDateTime(checkpoint.completedAt)}\n` +
        "Der aktuelle Stand im Dashboard wird durch diesen Checkpoint ersetzt."
    );

    if (!shouldRestore) {
      showInfo("Checkpoint wurde nicht geladen.");
      return;
    }

    applyWorkspaceBackup({
      workspace: checkpoint.payload.workspace,
      preferences: checkpoint.payload.preferences || {},
      exportedAt: checkpoint.payload.exportedAt,
      summary: checkpoint.payload.summary || {
        tournamentCount: checkpoint.payload.workspace?.tournaments?.length ?? 0,
        tournamentLabels: []
      }
    });
    showInfo(`${checkpoint.roundLabel} wurde aus dem internen Checkpoint wiederhergestellt.`);
  }

  function downloadRoundCheckpoint(checkpoint) {
    const json = JSON.stringify(checkpoint.payload, null, 2);
    downloadBlob(
      checkpoint.backupFilename,
      new Blob([json], { type: "application/json;charset=utf-8" })
    );
  }

  function getActiveTournament() {
    return (
      workspace.tournaments.find((entry) => entry.id === workspace.activeTournamentId) ||
      workspace.tournaments[0]
    );
  }

  function syncDerivedState() {
    activeTournament = getActiveTournament();
    analysis = computeAnalysis();
    syncTournamentHistories();
  }

  function syncTournamentHistories() {
    const tournamentIds = new Set(workspace.tournaments.map((entry) => entry.id));

    tournamentHistories.forEach((_, tournamentId) => {
      if (!tournamentIds.has(tournamentId)) {
        tournamentHistories.delete(tournamentId);
      }
    });

    workspace.tournaments.forEach((tournament) => {
      if (!tournamentHistories.has(tournament.id)) {
        tournamentHistories.set(tournament.id, { undo: [], redo: [] });
      }
    });
  }

  function computeAnalysis() {
    if (activeTournament.mode === "team") {
      return withMatchSchedule(analyzeTeamCompetition({
        ...activeTournament.team,
        matchMode: activeTournament.matchMode,
        scoring: activeTournament.scoring,
        tournamentName: activeTournament.tournamentName
      }));
    }

    if (activeTournament.mode === "groupsKnockout") {
      return analyzeGroupsKnockout({
        ...activeTournament.groupsKnockout,
        matchMode: activeTournament.matchMode,
        scoring: activeTournament.scoring,
        tournamentName: activeTournament.tournamentName
      });
    }

    return withMatchSchedule(analyzeRoundRobin({
      ...activeTournament.roundRobin,
      matchMode: activeTournament.matchMode,
      scoring: activeTournament.scoring,
      tournamentName: activeTournament.tournamentName
    }));
  }

  function withMatchSchedule(analysisResult) {
    if (!activeTournament.schedule?.enabled) {
      return analysisResult;
    }

    return {
      ...analysisResult,
      schedule: buildMatchSchedule(analysisResult, activeTournament.schedule)
    };
  }

  function updateWorkspace(recipe, saveNote, options = {}) {
    const { clearRedo = false } = options;
    const previousWorkspace = cloneValue(workspace);
    const draft = cloneValue(workspace);
    recipe(draft);
    const nextWorkspace = normalizeWorkspace(draft);
    if (isSameWorkspace(previousWorkspace, nextWorkspace)) {
      return;
    }

    if (clearRedo) {
      clearAllRedoHistories();
    }
    workspace = nextWorkspace;
    syncDerivedState();
    renderAll();
    saveWorkspace(saveNote);
  }

  function updateTournamentById(tournamentId, recipe, saveNote, options = {}) {
    const { trackHistory = true, clearRedo = trackHistory, checkRoundBackups = false } = options;
    const sourceTournament = workspace.tournaments.find((entry) => entry.id === tournamentId);
    if (!sourceTournament) {
      return;
    }

    const previousWorkspace = cloneValue(workspace);
    const previousTournament = cloneValue(sourceTournament);
    const draft = cloneValue(workspace);
    const draftTournament = draft.tournaments.find((entry) => entry.id === tournamentId);

    if (!draftTournament) {
      return;
    }

    recipe(draftTournament, draft);

    const nextWorkspace = normalizeWorkspace(draft);
    const nextTournament = nextWorkspace.tournaments.find((entry) => entry.id === tournamentId);
    if (!nextTournament || isSameWorkspace(previousWorkspace, nextWorkspace)) {
      return;
    }

    if (trackHistory && !isSameWorkspace(previousTournament, nextTournament)) {
      pushTournamentHistorySnapshot(tournamentId, "undo", previousTournament);
    }
    if (clearRedo) {
      clearTournamentRedoHistory(tournamentId);
    }

    workspace = nextWorkspace;
    syncDerivedState();
    if (checkRoundBackups) {
      const tournamentIndex = nextWorkspace.tournaments.findIndex((entry) => entry.id === tournamentId);
      createAutomaticRoundCheckpoints(previousTournament, nextTournament, tournamentIndex);
    }
    renderAll();
    saveWorkspace(saveNote);
  }

  function updateActiveTournament(recipe, saveNote, options) {
    const tournamentId = workspace.activeTournamentId;
    updateTournamentById(tournamentId, recipe, saveNote, options);
  }

  function renderAll() {
    renderAppTitle();
    renderWorkspacePanels();
    renderTemplateControls();
    renderRoundCheckpointPanel();
    renderRoundBackupStatus();
    renderTabs();
    renderRaceDayShell();
    renderConfig();
    renderTournamentSheet();
    renderLiveView();
  }

  function renderHistoryButtons() {
    const history = getTournamentHistory(activeTournament?.id);
    const availableUndoSteps = history.undo.length;
    const availableRedoSteps = history.redo.length;
    tournamentSheet.querySelectorAll("[data-history-action]").forEach((button) => {
      const isUndo = button.dataset.historyAction === "undo";
      const availableSteps = isUndo ? availableUndoSteps : availableRedoSteps;
      button.disabled = availableSteps === 0;
      button.setAttribute("aria-disabled", availableSteps === 0 ? "true" : "false");
      button.title = isUndo
        ? availableSteps > 0
          ? `Letzte Änderung in diesem Reiter rückgängig machen (${availableSteps}/${UNDO_LIMIT})`
          : "Noch keine Änderung in diesem Reiter zum Rückgängigmachen vorhanden"
        : availableSteps > 0
          ? `Rückgängig gemachte Änderung in diesem Reiter wiederherstellen (${availableSteps}/${UNDO_LIMIT})`
          : "Noch keine rückgängig gemachte Änderung in diesem Reiter vorhanden";
    });
  }

  function getTournamentHistory(tournamentId) {
    if (!tournamentId) {
      return { undo: [], redo: [] };
    }

    if (!tournamentHistories.has(tournamentId)) {
      tournamentHistories.set(tournamentId, { undo: [], redo: [] });
    }

    return tournamentHistories.get(tournamentId);
  }

  function pushTournamentHistorySnapshot(tournamentId, stackKey, snapshot) {
    const history = getTournamentHistory(tournamentId);
    history[stackKey].push(cloneValue(snapshot));
    if (history[stackKey].length > UNDO_LIMIT) {
      history[stackKey] = history[stackKey].slice(-UNDO_LIMIT);
    }
  }

  function clearTournamentRedoHistory(tournamentId) {
    const history = getTournamentHistory(tournamentId);
    history.redo = [];
  }

  function clearAllRedoHistories() {
    tournamentHistories.forEach((history) => {
      history.redo = [];
    });
  }

  function restoreTournamentSnapshot(tournamentId, snapshot, saveNote) {
    updateTournamentById(
      tournamentId,
      (tournament) => {
        const restoredTournament = createTournamentRecord(cloneValue(snapshot), tournamentId);
        Object.keys(tournament).forEach((key) => {
          delete tournament[key];
        });
        Object.assign(tournament, restoredTournament);
      },
      saveNote,
      { trackHistory: false, clearRedo: false }
    );
  }

  function isSameWorkspace(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function collectCompletedRoundEvents(tournament, tournamentIndex = 0) {
    if (!tournament) {
      return [];
    }

    const tournamentLabel = getTournamentLabel(tournament, tournamentIndex);
    const base = {
      tournamentId: tournament.id,
      tournamentLabel,
      tournamentName: tournament.tournamentName || tournamentLabel,
      mode: isTtRaceTournament(tournament) ? "ttRace" : tournament.mode
    };

    if (isTtRaceTournament(tournament)) {
      const rounds = Array.isArray(tournament.ttRace?.rounds) ? tournament.ttRace.rounds : [];
      return rounds
        .filter((round) => Array.isArray(round.matches) && round.matches.length > 0 && isTtRaceRoundComplete(round))
        .map((round) => createCompletedRoundEvent(base, `tt-race-runde-${round.roundNumber}`, `Schweizer Runde ${round.roundNumber}`));
    }

    if (tournament.mode === "team") {
      const teamAnalysis = analyzeTeamCompetition({
        ...tournament.team,
        matchMode: tournament.matchMode,
        scoring: tournament.scoring,
        tournamentName: tournament.tournamentName
      });
      return [
        ...collectCompletedPairingRounds(
          base,
          teamAnalysis.rounds,
          "team-einzel",
          (round) => `Einzelrunde ${round.roundNumber}`
        ),
        ...collectCompletedPairingRounds(
          base,
          teamAnalysis.doubleRounds,
          "team-doppel",
          (round) => `Doppelrunde ${round.roundNumber}`
        )
      ];
    }

    if (tournament.mode === "groupsKnockout") {
      const groupsAnalysis = analyzeGroupsKnockout({
        ...tournament.groupsKnockout,
        matchMode: tournament.matchMode,
        scoring: tournament.scoring,
        tournamentName: tournament.tournamentName
      });
      return [
        ...collectCompletedPairingRounds(
          base,
          groupsAnalysis.groupRoundSchedule,
          "gruppenphase",
          (round) => `Gruppenrunde ${round.roundNumber}`
        ),
        ...collectCompletedKnockoutRounds(base, groupsAnalysis)
      ];
    }

    const roundRobinAnalysis = analyzeRoundRobin({
      ...tournament.roundRobin,
      matchMode: tournament.matchMode,
      scoring: tournament.scoring,
      tournamentName: tournament.tournamentName
    });
    return collectCompletedPairingRounds(
      base,
      roundRobinAnalysis.rounds,
      "jeder-gegen-jeden",
      (round) => `Runde ${round.roundNumber}`
    );
  }

  function collectCompletedPairingRounds(base, rounds, keyPrefix, getLabel) {
    return (rounds || [])
      .filter((round) => isPairingRoundComplete(round))
      .map((round) =>
        createCompletedRoundEvent(
          base,
          `${keyPrefix}-runde-${round.roundNumber}`,
          getLabel(round)
        )
      );
  }

  function collectCompletedKnockoutRounds(base, groupsAnalysis) {
    const knockoutRoundEvents = (groupsAnalysis.knockoutRounds || [])
      .filter((round) => {
        const scheduledPairings = (round.pairings || []).filter((pairing) => !pairing.isBye);
        return scheduledPairings.length > 0 && scheduledPairings.every((pairing) => pairing.isComplete);
      })
      .map((round) =>
        createCompletedRoundEvent(
          base,
          `ko-runde-${round.roundNumber}`,
          round.roundName || `KO-Runde ${round.roundNumber}`
        )
      );

    const placementEvents = (groupsAnalysis.placementMatches || [])
      .filter((match) => match.isReady && match.isComplete)
      .map((match) =>
        createCompletedRoundEvent(
          base,
          "ko-platzierung",
          match.roundName || "Platzierungsspiel"
        )
      );

    return [...knockoutRoundEvents, ...placementEvents];
  }

  function isPairingRoundComplete(round) {
    const pairings = round?.pairings || [];
    return pairings.length > 0 && pairings.every((pairing) => isPairingComplete(pairing));
  }

  function isPairingComplete(pairing) {
    if (!pairing) {
      return false;
    }
    if (pairing.isBye || pairing.isComplete || pairing.winner) {
      return true;
    }
    return Boolean(
      pairing.score ||
        pairing.rawScore ||
        (pairing.matchStatus && pairing.matchStatus !== "normal")
    );
  }

  function createCompletedRoundEvent(base, roundKey, roundLabel) {
    return {
      ...base,
      roundKey,
      roundLabel,
      checkpointKey: `${base.tournamentId}:${base.mode}:${roundKey}`
    };
  }

  function collectNewCompletedRoundEvents(previousTournament, nextTournament, tournamentIndex) {
    const previousKeys = new Set(
      collectCompletedRoundEvents(previousTournament, tournamentIndex).map((event) => event.checkpointKey)
    );
    const storedKeys = new Set(roundCheckpoints.map((checkpoint) => checkpoint.checkpointKey));

    return collectCompletedRoundEvents(nextTournament, tournamentIndex).filter(
      (event) => !previousKeys.has(event.checkpointKey) && !storedKeys.has(event.checkpointKey)
    );
  }

  function createAutomaticRoundCheckpoints(previousTournament, nextTournament, tournamentIndex) {
    const events = collectNewCompletedRoundEvents(previousTournament, nextTournament, tournamentIndex);
    if (events.length === 0) {
      return [];
    }

    const createdCheckpoints = events.map((event) => {
      const payload = buildWorkspaceBackupPayload(workspace);
      payload.checkpoint = {
        kind: "automatic-round-checkpoint",
        tournamentId: event.tournamentId,
        tournamentLabel: event.tournamentLabel,
        roundKey: event.roundKey,
        roundLabel: event.roundLabel
      };
      const completedAt = payload.exportedAt;
      const checkpoint = {
        id: `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        checkpointKey: event.checkpointKey,
        tournamentId: event.tournamentId,
        tournamentLabel: event.tournamentLabel,
        tournamentName: event.tournamentName,
        mode: event.mode,
        roundKey: event.roundKey,
        roundLabel: event.roundLabel,
        completedAt,
        backupFilename: buildRoundCheckpointBackupFilename(event, completedAt),
        payload
      };

      downloadRoundCheckpoint(checkpoint);
      return checkpoint;
    });

    roundCheckpoints = [
      ...createdCheckpoints,
      ...roundCheckpoints.filter(
        (checkpoint) =>
          !createdCheckpoints.some((created) => created.checkpointKey === checkpoint.checkpointKey)
      )
    ].slice(0, ROUND_CHECKPOINT_LIMIT);

    const saved = saveRoundCheckpoints();
    if (!saved) {
      showInfo("Rundenbackup wurde heruntergeladen, aber der interne Checkpoint konnte nicht im Browser gespeichert werden.");
    } else if (createdCheckpoints.length === 1) {
      showInfo(`${createdCheckpoints[0].roundLabel} automatisch gesichert. JSON-Backup wurde heruntergeladen.`);
    } else {
      showInfo(`${createdCheckpoints.length} Runden automatisch gesichert. JSON-Backups wurden heruntergeladen.`);
    }

    return createdCheckpoints;
  }

  function handleUndo() {
    if (!activeTournament) {
      renderHistoryButtons();
      return;
    }

    const history = getTournamentHistory(activeTournament.id);
    const previousTournament = history.undo.pop();
    if (!previousTournament) {
      renderHistoryButtons();
      return;
    }

    pushTournamentHistorySnapshot(activeTournament.id, "redo", activeTournament);
    restoreTournamentSnapshot(
      activeTournament.id,
      previousTournament,
      "Vorherige Änderung in diesem Reiter wiederhergestellt"
    );
  }

  function handleRedo() {
    if (!activeTournament) {
      renderHistoryButtons();
      return;
    }

    const history = getTournamentHistory(activeTournament.id);
    const nextTournament = history.redo.pop();
    if (!nextTournament) {
      renderHistoryButtons();
      return;
    }

    pushTournamentHistorySnapshot(activeTournament.id, "undo", activeTournament);
    restoreTournamentSnapshot(
      activeTournament.id,
      nextTournament,
      "Rückgängig gemachte Änderung in diesem Reiter wiederhergestellt"
    );
  }

  /**
   * Kurzform des Turnierzustands für Kopfleiste, Schalter und Startliste:
   * Format, laufende Runde und wie viele Spiele darin erfasst sind.
   */
  function describeTournamentState(tournament) {
    const format = getTournamentModeLabel(tournament);

    try {
      if (isTtRaceTournament(tournament)) {
        const rounds = Array.isArray(tournament.ttRace?.rounds) ? tournament.ttRace.rounds : [];
        const current = rounds[rounds.length - 1];
        if (!current) {
          return {
            format: "Schweizer System",
            round: "noch keine Runde ausgelost",
            progress: "Noch nicht gestartet",
            started: false,
            done: false
          };
        }

        const matches = Array.isArray(current.matches) ? current.matches : [];
        const played = matches.filter((match) => hasTtRaceMatchResult(match)).length;
        const target = Math.max(rounds.length, clampPositiveInteger(tournament.ttRace?.maxRounds, 1, 40));
        return {
          format,
          round: `Runde ${current.roundNumber} von ${target}`,
          progress: `${played} von ${matches.length} Spielen`,
          started: true,
          done: rounds.length >= target && played === matches.length
        };
      }

      const analysisForTournament = analyzeTournamentForState(tournament);
      const rounds = analysisForTournament?.rounds ?? [];
      if (rounds.length === 0) {
        return { format, round: "", progress: "Noch nicht gestartet", started: false, done: false };
      }

      const hasResult = (pairing) => Boolean(pairing.rawScore?.trim?.() || pairing.score);
      const allPairings = rounds.flatMap((round) => round.pairings ?? []);
      const played = allPairings.filter(hasResult).length;
      const openRound = rounds.find((round) => (round.pairings ?? []).some((pairing) => !hasResult(pairing)));
      const roundNumber = openRound?.roundNumber ?? rounds.length;

      return {
        format,
        round: `Runde ${roundNumber} von ${rounds.length}`,
        progress: `${played} von ${allPairings.length} Spielen`,
        started: played > 0,
        done: played === allPairings.length && allPairings.length > 0
      };
    } catch (error) {
      return { format, round: "", progress: "", started: false, done: false };
    }
  }

  function analyzeTournamentForState(tournament) {
    const shared = {
      matchMode: tournament.matchMode,
      scoring: tournament.scoring,
      tournamentName: tournament.tournamentName
    };

    if (tournament.mode === "team") {
      return analyzeTeamCompetition({ ...tournament.team, ...shared });
    }

    if (tournament.mode === "groupsKnockout") {
      const groups = analyzeGroupsKnockout({ ...tournament.groupsKnockout, ...shared });
      return { rounds: groups.groupRoundSchedule ?? [] };
    }

    return analyzeRoundRobin({ ...tournament.roundRobin, ...shared });
  }

  function formatTournamentStateLine(state) {
    return [state.format, state.round, state.progress].filter(Boolean).join(" · ");
  }

  /**
   * Der Turniername steht nur im Schalter. Die Überschrift trägt die Aufgabe
   * des Reiters, darunter die Rahmendaten als stille Zeile.
   */
  function renderAppTitle() {
    const index = workspace.tournaments.findIndex((entry) => entry.id === activeTournament.id);
    const name = getTournamentLabel(activeTournament, index < 0 ? 0 : index);
    const state = describeTournamentState(activeTournament);

    switcherName.textContent = name;

    // Die Startliste ist kein Turnier-Reiter; sie trägt ihren eigenen Titel.
    if (startViewOpen) {
      appTitle.textContent = "Meine Turniere";
      screenKicker.textContent = `${workspace.tournaments.length} Turnier${workspace.tournaments.length === 1 ? "" : "e"}`;
      screenFacts.textContent = "";
      screenMeta.innerHTML = "";
      document.title = "Meine Turniere — Turnierblatt";
      return;
    }

    appTitle.textContent = VIEW_TITLES[activeWorkspaceView] || "Turnierblatt";
    screenKicker.textContent = [state.format, state.round].filter(Boolean).join(" · ");

    // Die Rahmendaten stehen unter dem Titel. Nur wenn es zusätzlichen
    // Kontext gibt — den click-TT-Stand — wandern sie nach rechts, damit
    // beide Zeilen zusammen stehen.
    const { facts, source } = buildScreenMeta(state);
    if (source) {
      screenFacts.textContent = "";
      screenMeta.innerHTML = [facts, source]
        .filter(Boolean)
        .map((line) => `<span>${escapeHtml(line)}</span>`)
        .join("");
    } else {
      screenFacts.textContent = facts;
      screenMeta.innerHTML = "";
    }

    document.title = `${name} — Turnierblatt`;
  }

  function buildScreenMeta(state) {
    const parts = [];
    const participantCount = countActiveParticipants();

    if (participantCount > 0) {
      parts.push(`${participantCount} Teilnehmer`);
    }

    if (state.progress) {
      parts.push(state.progress);
    }

    if (analysis?.matchModeLabel) {
      parts.push(analysis.matchModeLabel);
    }

    const source = isTtRaceTournament()
      ? activeTournament.clicktt?.rawXml
        ? "click-TT XML verbunden · Namen, IDs, Vereine, TTR übernommen"
        : "Keine click-TT XML verbunden"
      : "";

    // Auf dem Teilnehmer-Reiter zählt die Startliste, nicht der Spielstand.
    if (isTtRaceTournament() && activeWorkspaceView === "input") {
      const players = activeTournament.ttRace?.players ?? [];
      const active = players.filter((player) => (player.status || "active") === "active").length;
      const rosterFacts = [
        `${players.length} gelistet`,
        `${active} aktiv`,
        `${activeTournament.schedule.fieldCount} Tische`
      ];
      return { facts: rosterFacts.join(" · "), source };
    }

    return { facts: parts.join(" · "), source };
  }

  function countActiveParticipants() {
    if (isTtRaceTournament()) {
      // getRaceDayParticipants liefert nur Namen; der Status hängt am Spielerobjekt.
      return (activeTournament.ttRace?.players ?? []).filter((player) => (player.status || "active") !== "withdrawn").length;
    }

    if (activeTournament.mode === "team") {
      const team = activeTournament.team ?? {};
      return (team.teamAPlayers?.length ?? 0) + (team.teamBPlayers?.length ?? 0);
    }

    const source =
      activeTournament.mode === "groupsKnockout" ? activeTournament.groupsKnockout : activeTournament.roundRobin;
    const names = source?.playerNames ?? [];
    const statuses = source?.playerStatuses ?? [];
    return names.filter((name, index) => statuses[index] !== "withdrawn").length;
  }

  function renderWorkspacePanels() {
    const isOutput = activeWorkspaceView === "output";
    const isLive = activeWorkspaceView === "live";
    inputView.hidden = isOutput || isLive;
    outputView.hidden = !isOutput;
    liveView.hidden = !isLive;
    inputView.classList.toggle("is-hidden", isOutput || isLive);
    outputView.classList.toggle("is-hidden", !isOutput);
    liveView.classList.toggle("is-hidden", !isLive);
    inputView.classList.toggle("is-race-workspace", !isOutput && !isLive && isTtRaceTournament());

    workspaceViewTabs.querySelectorAll("[data-workspace-view]").forEach((button) => {
      const isActive = button.dataset.workspaceView === activeWorkspaceView;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  /**
   * 12a — Turnierwechsel aus der Kopfleiste. Der Wechsel behält den Reiter:
   * wer in der Ergebniseingabe war, landet dort auch im anderen Turnier.
   */
  function renderTabs() {
    tabsElement.innerHTML = workspace.tournaments
      .map((tournament, index) => {
        const isActive = tournament.id === workspace.activeTournamentId;
        const label = getTournamentLabel(tournament, index);
        const state = describeTournamentState(tournament);
        return `
          <button class="switcher-row ${isActive ? "is-current" : ""}" type="button" data-tab-id="${tournament.id}">
            <span class="switcher-mark"></span>
            <span class="switcher-row-text">
              <span class="switcher-row-name">${escapeHtml(label)}</span>
              <span class="switcher-row-meta">${escapeHtml(formatTournamentStateLine(state))}</span>
            </span>
            <span class="switcher-row-action">${isActive ? "geöffnet" : "wechseln"}</span>
          </button>
        `;
      })
      .join("");

    tabsElement.querySelectorAll("[data-tab-id]").forEach((button) => {
      button.addEventListener("click", () => {
        closeTournamentSwitcher();
        if (button.dataset.tabId === workspace.activeTournamentId) {
          return;
        }

        updateWorkspace((draft) => {
          draft.activeTournamentId = button.dataset.tabId;
        }, "Turnier gewechselt");
      });
    });

    renderStartTournamentList();
  }

  /**
   * 5a — Meine Turniere. Zeile je Turnier mit Zustandsmarke und einer Aktion;
   * Umbenennen, Löschen und Sortieren liegen hier statt in der Kopfleiste.
   */
  function renderStartTournamentList() {
    startTournamentList.innerHTML = workspace.tournaments
      .map((tournament, index) => {
        const isActive = tournament.id === workspace.activeTournamentId;
        const label = getTournamentLabel(tournament, index);
        const state = describeTournamentState(tournament);

        const badge = state.done
          ? '<span class="tag tag-neutral">Abgeschlossen</span>'
          : state.started
            ? `<span class="tag tag-accent">${escapeHtml(state.round || "Läuft")}</span>`
            : '<span class="tag tag-outline">Noch nicht gestartet</span>';

        const action = state.done ? "Ansehen" : state.started ? "Fortsetzen" : "Öffnen";

        return `
          <div class="start-row ${isActive ? "is-current" : ""}" data-tab-shell="${tournament.id}">
            <button class="start-row-drag" type="button" data-tab-drag="${tournament.id}" aria-label="Turnier verschieben" title="Gedrückt halten und verschieben">
              ${renderTabToolIcon("drag")}
            </button>
            <span class="start-row-text">
              <span class="start-row-name">${escapeHtml(label)}</span>
              <span class="start-row-meta">${escapeHtml(formatTournamentStateLine(state))}</span>
            </span>
            ${badge}
            <span class="start-row-tools">
              <button class="link-button" type="button" data-tab-open="${tournament.id}">${action}</button>
              <button class="tab-tool-button icon-only" type="button" data-tab-rename="${tournament.id}" aria-label="Turnier umbenennen" title="Umbenennen">
                ${renderTabToolIcon("rename")}
              </button>
              <button class="tab-tool-button icon-only danger" type="button" data-tab-delete="${tournament.id}" ${workspace.tournaments.length <= 1 ? "disabled" : ""} aria-label="Turnier löschen" title="Löschen">
                ${renderTabToolIcon("delete")}
              </button>
            </span>
          </div>
        `;
      })
      .join("");

    startTournamentList.querySelectorAll("[data-tab-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.tabOpen;
        hideStartView();
        if (id === workspace.activeTournamentId) {
          return;
        }

        updateWorkspace((draft) => {
          draft.activeTournamentId = id;
        }, "Turnier gewechselt");
      });
    });

    startTournamentList.querySelectorAll("[data-tab-drag]").forEach((handle) => {
      handle.addEventListener("pointerdown", handleTournamentTabPointerDown);
    });

    startTournamentList.querySelectorAll("[data-tab-rename]").forEach((button) => {
      button.addEventListener("click", () => {
        handleRenameTournamentTab(button.dataset.tabRename);
      });
    });

    startTournamentList.querySelectorAll("[data-tab-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        handleDeleteTournamentTab(button.dataset.tabDelete);
      });
    });
  }

  function openTournamentSwitcher() {
    switcherPanel.hidden = false;
    switcherButton.setAttribute("aria-expanded", "true");
  }

  function closeTournamentSwitcher() {
    switcherPanel.hidden = true;
    switcherButton.setAttribute("aria-expanded", "false");
  }

  function toggleTournamentSwitcher() {
    if (switcherPanel.hidden) {
      openTournamentSwitcher();
    } else {
      closeTournamentSwitcher();
    }
  }

  function openWorkspaceView(view) {
    activeWorkspaceView = ["input", "output", "live"].includes(view) ? view : "input";
    saveWorkspaceView();
    hideStartView();
    renderWorkspacePanels();
    renderAppTitle();
  }

  function showStartView() {
    closeTournamentSwitcher();
    startViewOpen = true;
    startView.hidden = false;
    mainLayout.hidden = true;
    renderStartTournamentList();
    renderAppTitle();
  }

  function hideStartView() {
    const wasOpen = startViewOpen;
    startViewOpen = false;
    startView.hidden = true;
    mainLayout.hidden = false;
    if (wasOpen) {
      renderAppTitle();
    }
  }

  function renderTemplateControls() {
    const selectedTemplateId = templateSelect.value;
    const hasTemplates = tournamentTemplates.length > 0;

    templateSelect.innerHTML = hasTemplates
      ? tournamentTemplates
          .map(
            (template) =>
              `<option value="${escapeHtml(template.id)}">${escapeHtml(formatTemplateOptionLabel(template))}</option>`
          )
          .join("")
      : `<option value="">Keine Vorlage gespeichert</option>`;

    if (hasTemplates && tournamentTemplates.some((template) => template.id === selectedTemplateId)) {
      templateSelect.value = selectedTemplateId;
    }

    templateSelect.disabled = !hasTemplates;
    document.querySelector("#loadTemplateBtn").disabled = !hasTemplates;
    document.querySelector("#deleteTemplateBtn").disabled = !hasTemplates;
  }

  function renderRoundCheckpointPanel() {
    if (!roundCheckpointPanel) {
      return;
    }

    const activeCheckpoints = getRoundCheckpointsForTournament(activeTournament?.id);
    const hasCheckpoints = activeCheckpoints.length > 0;
    roundCheckpointPanel.classList.toggle("is-empty", !hasCheckpoints);

    if (!hasCheckpoints) {
      roundCheckpointPanel.innerHTML = `
        <p><strong>Rundenbackups</strong></p>
        <p>Nach jeder erstmals vollständig erfassten Runde wird automatisch ein interner Checkpoint gespeichert und ein JSON-Backup heruntergeladen.</p>
      `;
      return;
    }

    roundCheckpointPanel.innerHTML = `
      <p><strong>Rundenbackups</strong></p>
      <div class="round-checkpoint-toolbar">
        <label class="round-checkpoint-select-field">
          <span>Gesicherter Stand</span>
          <select data-round-checkpoint-select>
            ${activeCheckpoints
              .map(
                (checkpoint) => `
                  <option value="${escapeHtml(checkpoint.id)}">${escapeHtml(formatRoundCheckpointOptionLabel(checkpoint))}</option>
                `
              )
              .join("")}
          </select>
        </label>
        <button class="ghost-button" type="button" data-round-checkpoint-download>JSON erneut laden</button>
        <button class="secondary-button" type="button" data-round-checkpoint-restore>Checkpoint laden</button>
      </div>
      <p>${escapeHtml(formatLatestRoundCheckpointHint(activeCheckpoints[0]))}</p>
    `;

    roundCheckpointPanel
      .querySelector("[data-round-checkpoint-download]")
      ?.addEventListener("click", handleDownloadSelectedRoundCheckpoint);
    roundCheckpointPanel
      .querySelector("[data-round-checkpoint-restore]")
      ?.addEventListener("click", handleRestoreSelectedRoundCheckpoint);
  }

  function renderRoundBackupStatus() {
    if (!roundBackupStatus) {
      return;
    }

    const latestCheckpoint = getRoundCheckpointsForTournament(activeTournament?.id)[0];
    if (!latestCheckpoint) {
      roundBackupStatus.innerHTML = `
        <strong>Rundenbackup bereit</strong>
        <span>Der erste Checkpoint entsteht automatisch, sobald eine Runde vollständig erfasst ist.</span>
      `;
      return;
    }

    roundBackupStatus.innerHTML = `
      <strong>${escapeHtml(latestCheckpoint.roundLabel)} automatisch gesichert</strong>
      <span>${escapeHtml(formatDateTime(latestCheckpoint.completedAt))} · ${escapeHtml(latestCheckpoint.backupFilename)}</span>
    `;
  }

  function getRoundCheckpointsForTournament(tournamentId) {
    return roundCheckpoints
      .filter((checkpoint) => checkpoint.tournamentId === tournamentId)
      .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
  }

  function getSelectedRoundCheckpoint() {
    const checkpointId = roundCheckpointPanel?.querySelector("[data-round-checkpoint-select]")?.value;
    return roundCheckpoints.find((checkpoint) => checkpoint.id === checkpointId) || null;
  }

  function formatRoundCheckpointOptionLabel(checkpoint) {
    return `${checkpoint.roundLabel} · ${formatDateTime(checkpoint.completedAt)}`;
  }

  function formatLatestRoundCheckpointHint(checkpoint) {
    return `Letzter automatischer Checkpoint: ${checkpoint.roundLabel} um ${formatDateTime(checkpoint.completedAt)}.`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Zeitpunkt unbekannt";
    }
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatTemplateOptionLabel(template) {
    const resultHint = template.includeResults ? "mit Ergebnissen" : "ohne Ergebnisse";
    return `${template.name} (${getTournamentModeLabel(template.state)}, ${resultHint})`;
  }

  function getTournamentModeLabel(tournament) {
    if (isTtRaceTournament(tournament)) {
      return "TT-Race Schweizer System";
    }

    return MODES[tournament.mode]?.label || "Turnier";
  }

  function renderRaceDayShell() {
    const isRace = isTtRaceTournament();

    if (!isRace) {
      raceDayShell.hidden = true;
      raceDayShell.innerHTML = "";
      return;
    }

    raceDayShell.hidden = false;

    const roundContext = getRaceDayRoundContext();
    const participants = getRaceDayParticipants();
    const progress = getRaceDayProgress(roundContext);
    const clickttMeta = getActiveClickTtMeta();
    const canEditRoster = isRace && (activeTournament.ttRace?.rounds?.length ?? 0) === 0;
    const title =
      activeTournament.tournamentName?.trim() ||
      getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const completed = progress.completed;
    const total = progress.total;

    // 2cv2 — Startliste prüfen: Arbeitsfläche links, Vereinsquote rechts.
    const players = Array.isArray(activeTournament.ttRace?.players) ? activeTournament.ttRace.players : [];
    const activeCount = players.filter((player) => (player.status || "active") === "active").length;
    const generationState = getTtRaceGenerationStateFromTournament(activeTournament.ttRace);

    raceDayShell.innerHTML = `
      <h2 id="race-day-heading" class="sr-only">${escapeHtml(title)}</h2>
      <div class="work-split">
        <div class="work-main">
          <hr class="work-rule" />
          <div class="work-head">
            <h3>Startliste prüfen</h3>
            <button class="secondary-button" type="button" data-race-action="add-tt-race-player" ${canEditRoster ? "" : "disabled"}>Teilnehmer hinzufügen</button>
          </div>
          <p class="entry-lead">${
            canEditRoster
              ? `${players.length} Name${players.length === 1 ? "" : "n"}, zwei Spalten, eine Zeile pro Teilnehmer. Zum Ändern die Zeile anklicken.`
              : "Die Teilnehmerliste ist nach Rundenerzeugung gesperrt."
          }</p>

          ${renderTtRaceParticipantManager(canEditRoster)}

          <div class="work-action">
            <button class="primary-button" type="button" data-race-action="generate-swiss-round" ${generationState.canGenerate ? "" : "disabled"}>
              ${escapeHtml(generationState.label)}
            </button>
            <span class="action-reason">${
              generationState.canGenerate
                ? `${activeCount} aktive Teilnehmer · BTTV Race läuft von 9 bis 16.`
                : escapeHtml(generationState.reason)
            }</span>
          </div>
        </div>

        ${renderTtRaceRosterRail(players, clickttMeta)}
      </div>
    `;
  }

  /** Randspalte von 2cv2: Vereinsquote, Verteilung, Herkunft. */
  function renderTtRaceRosterRail(players, clickttMeta) {
    const clubCounts = new Map();
    players
      .filter((player) => (player.status || "active") === "active")
      .forEach((player) => {
        const club = player.clubName || player.club || "Ohne Verein";
        clubCounts.set(club, (clubCounts.get(club) ?? 0) + 1);
      });

    const distribution = [...clubCounts.entries()].sort((a, b) => b[1] - a[1]);
    const source = clickttMeta?.sourceFileName || clickttMeta?.fileName;

    return `
      <aside class="work-rail" aria-label="Prüfungen">
        ${renderTtRaceClubQuotaNotice(players)}

        ${
          distribution.length > 0
            ? `<section class="rail-block">
                <h6 class="rail-heading">Verteilung</h6>
                <table class="data-table rail-table">
                  <tbody>
                    ${distribution
                      .map(
                        ([club, count]) => `
                          <tr>
                            <td>${escapeHtml(club)}</td>
                            <td class="is-numeric">${count}</td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </section>`
            : ""
        }

        <hr class="hairline" />

        <div class="rail-links">
          <span class="rail-note">${escapeHtml(getAutosaveShortText())}</span>
          <button class="link-button" type="button" data-race-action="choose-clicktt-file">${clickttMeta ? "Andere XML wählen" : "click-TT XML wählen"}</button>
          <button class="link-button" type="button" data-race-action="load-race-demo">Demodaten laden</button>
          <button class="link-button" type="button" data-print-now>Startliste drucken</button>
          ${source ? `<span class="rail-note">Quelle: ${escapeHtml(source)}</span>` : ""}
        </div>
      </aside>
    `;
  }

  function renderRaceDayStatusGrid({ participants, roundContext, clickttMeta, isRace, completed, total }) {
    if (isRace) {
      const activeCount = getTtRaceActivePlayerCount();
      return `
        <div class="race-day-status-grid" aria-label="Teilnehmerstatus">
          <span><strong>${participants.length}</strong> Gelistet</span>
          <span><strong>${activeCount}</strong> Aktiv</span>
          <span><strong>${clickttMeta ? "XML" : "offen"}</strong> click-TT</span>
        </div>
      `;
    }

    return `
      <div class="race-day-status-grid" aria-label="Turnierstatus">
        <span><strong>${participants.length}</strong> Teilnehmer</span>
        <span><strong>${roundContext.currentRoundNumber || "-"}</strong> Runde</span>
        <span><strong>${completed}/${total}</strong> Spiele</span>
      </div>
    `;
  }

  function renderClickTtImportStatusText(participantCount) {
    const clickttMeta = getActiveClickTtMeta();

    if (!clickttMeta) {
      if (isTtRaceTournament()) {
        return "Noch keine click-TT Teilnehmer-XML verbunden. Import übernimmt Namen, IDs, Vereine und TTR.";
      }

      return `${participantCount} lokale Demo-Teilnehmer aktiv. Eine click-TT XML kann die Teilnehmer und IDs direkt uebernehmen.`;
    }

    return `${escapeHtml(clickttMeta.sourceFileName || clickttMeta.fileName || "click-TT XML")} verbunden; ${participantCount} Teilnehmer wurden uebernommen.`;
  }

  function renderClickTtImportMeta() {
    const clickttMeta = getActiveClickTtMeta();

    if (!clickttMeta) {
      if (isTtRaceTournament()) {
        return `
          <dl class="clicktt-meta-list">
            <div><dt>Quelle</dt><dd>click-TT XML ausstehend</dd></div>
            <div><dt>Status</dt><dd>Teilnehmerimport offen</dd></div>
          </dl>
        `;
      }

      return `
        <dl class="clicktt-meta-list">
          <div><dt>Quelle</dt><dd>Lokaler Demo-State</dd></div>
          <div><dt>Status</dt><dd>Ohne echte XML-Datei bedienbar</dd></div>
        </dl>
      `;
    }

    return `
      <dl class="clicktt-meta-list">
        <div><dt>Datei</dt><dd>${escapeHtml(clickttMeta.sourceFileName || clickttMeta.fileName || "click-TT XML")}</dd></div>
        <div><dt>Teilnehmer</dt><dd>${getRaceDayParticipants().length}</dd></div>
        <div><dt>Hinweise</dt><dd>${clickttMeta.validationIssues?.length ?? 0} Validierungs-Hinweise</dd></div>
      </dl>
    `;
  }

  function getActiveClickTtMeta() {
    return activeTournament.clicktt || clickTtImportDraft;
  }

  function isTtRaceTournament(tournament = activeTournament) {
    return Boolean(tournament?.ttRace);
  }

  function getTtRaceActivePlayerCount() {
    return (activeTournament.ttRace?.players ?? []).filter((player) => player.status === "active").length;
  }

  function renderRaceRoundControl(roundContext) {
    if (roundContext.kind === "ttRace") {
      const regardTtrValues = getTtRaceRegardTtrValues();
      const generationState = getTtRaceGenerationStateFromTournament(activeTournament.ttRace);
      const redrawState = getTtRaceInitialRedrawState(activeTournament.ttRace);
      const canChangeTtrSetting = (activeTournament.ttRace?.rounds?.length ?? 0) === 0;

      return `
        <div class="race-round-control">
          <button class="round-nav-button" type="button" data-race-action="generate-swiss-round" ${generationState.canGenerate ? "" : "disabled"}>
            ${escapeHtml(generationState.label)}
          </button>
          ${renderTtRaceRedrawButton(redrawState, "round-nav-button")}
          <span class="round-counter-total">
            ${roundContext.currentRound ? `${roundContext.currentRoundNumber} Runde${roundContext.currentRoundNumber === 1 ? "" : "n"} erzeugt` : "Noch keine Runde erzeugt"}
          </span>
	          <label class="race-setting-toggle">
	            <input data-race-setting="regardTtrValues" type="checkbox" ${regardTtrValues ? "checked" : ""} ${canChangeTtrSetting ? "" : "disabled"} />
	            <span>TTR bei Auslosung</span>
	          </label>
        </div>
      `;
    }

    return `
      <div class="race-round-control">
        <button class="round-nav-button" type="button" data-round-shift="-1" data-target-round="${roundContext.targetRound}" ${roundContext.currentRoundNumber <= 1 ? "disabled" : ""}>Vorherige</button>
        <label class="round-counter-input">
          <span class="sr-only">Aktuelle Runde</span>
          <input data-sheet-action="${roundContext.sheetAction}" type="number" min="1" max="${roundContext.totalRounds}" value="${roundContext.currentRoundNumber}" />
        </label>
        <span class="round-counter-total">von ${roundContext.totalRounds}</span>
        <button class="round-nav-button" type="button" data-round-shift="1" data-target-round="${roundContext.targetRound}" ${roundContext.currentRoundNumber >= roundContext.totalRounds ? "disabled" : ""}>Nächste</button>
      </div>
    `;
  }

  function renderRaceParticipantStrip(participants) {
    const ttRacePlayers = Array.isArray(activeTournament.ttRace?.players)
      ? activeTournament.ttRace.players
      : [];
    const entries = ttRacePlayers.length > 0
      ? ttRacePlayers.map((player) => ({
          name: player.name || player.id || "Spieler",
          rating: player.rating
        }))
      : participants.map((name) => ({ name, rating: null }));

    return `
      ${entries
        .slice(0, 10)
        .map(
          (entry) => `
            <span>
              ${escapeHtml(entry.name)}
              ${hasTtrValue(entry.rating) ? `<small>${escapeHtml(formatTtrValue(entry.rating))}</small>` : ""}
            </span>
          `
        )
        .join("")}
      ${entries.length > 10 ? `<span>+${entries.length - 10}</span>` : ""}
    `;
  }

  function renderTtRaceParticipantManager(canEditRoster) {
    const players = Array.isArray(activeTournament.ttRace?.players) ? activeTournament.ttRace.players : [];

    if (players.length === 0) {
      return `
        <div class="empty-round-state">
          <p>Noch keine Teilnehmer geladen.</p>
          <div class="clicktt-import-actions">
            <button class="secondary-button" type="button" data-race-action="choose-clicktt-file">click-TT XML wählen</button>
            <button class="ghost-button" type="button" data-race-action="add-tt-race-player">Manuell hinzufügen</button>
          </div>
        </div>
      `;
    }

    // 2cv2 — Startliste zweispaltig im Lesemodus; bearbeitet wird die
    // angeklickte Zeile, nicht ein Formularraster über alle Teilnehmer.
    const half = Math.ceil(players.length / 2);
    const columns = [players.slice(0, half), players.slice(half)];
    const editing = players.find((player, index) => (player.id || `player-${index + 1}`) === ttRaceEditingPlayerId);

    return `
      <div class="roster-columns">
        ${columns
          .map(
            (column, columnIndex) => `
              <div class="roster-column">
                ${column
                  .map((player, rowIndex) =>
                    renderTtRaceParticipantRow(player, columnIndex * half + rowIndex, canEditRoster)
                  )
                  .join("")}
              </div>
            `
          )
          .join("")}
      </div>

      ${editing ? renderTtRaceParticipantEditor(editing, players.indexOf(editing), canEditRoster) : ""}
    `;
  }

  /** Feldsatz für die eine angeklickte Zeile. */
  function renderTtRaceParticipantEditor(player, index, canEditRoster) {
    const id = escapeHtml(player.id || `player-${index + 1}`);
    const status = PLAYER_STATUSES[player.status] ? player.status : "active";
    const disabled = canEditRoster ? "" : "disabled";
    const ratingValue = hasTtrValue(player.rating) ? formatTtrValue(player.rating) : "";
    const names = splitParticipantName(player);

    return `
      <div class="roster-editor">
        <h4 class="roster-editor-heading">Nr. ${index + 1} bearbeiten</h4>
        <div class="roster-editor-grid">
          <label class="field">
            <span>Vorname</span>
            <input data-tt-race-player-first="${id}" type="text" value="${escapeHtml(names.firstName)}" ${disabled} />
          </label>
          <label class="field">
            <span>Nachname</span>
            <input data-tt-race-player-last="${id}" type="text" value="${escapeHtml(names.lastName)}" ${disabled} />
          </label>
          <label class="field">
            <span>TTR</span>
            <input data-tt-race-player-rating="${id}" type="number" min="0" max="4000" step="1" value="${escapeHtml(ratingValue)}" placeholder="—" ${disabled} />
          </label>
          <label class="field">
            <span>Status</span>
            <select data-tt-race-player-status="${id}" ${disabled}>
              ${Object.values(PLAYER_STATUSES)
                .map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === status ? "selected" : ""}>${escapeHtml(entry.label)}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <div class="action-row">
          <button class="secondary-button" type="button" data-race-action="apply-tt-race-player" data-player-id="${id}" ${disabled}>Übernehmen</button>
          <button class="ghost-button" type="button" data-race-action="remove-tt-race-player" data-player-id="${id}" ${disabled}>Teilnehmer entfernen</button>
        </div>
      </div>
    `;
  }

  /**
   * Vor- und Nachname kommen aus der click-TT XML. Fehlen sie (manuell
   * angelegte Teilnehmer), wird am letzten Leerzeichen getrennt.
   */
  function splitParticipantName(player) {
    if (player.firstName || player.lastName) {
      return { firstName: player.firstName || "", lastName: player.lastName || "" };
    }

    const parts = String(player.name || "").trim().split(/\s+/);
    if (parts.length < 2) {
      return { firstName: parts[0] || "", lastName: "" };
    }

    return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
  }

  function renderTtRaceClubQuotaNotice(players) {
    const activePlayers = players.filter((player) => (player.status || "active") === "active");
    const activeCount = activePlayers.length;

    if (activeCount === 0) {
      return "";
    }

    const maxAllowed = Math.ceil(activeCount / 2) - 1;
    const clubMap = new Map();
    const missingClubInfo = [];

    activePlayers.forEach((player) => {
      const clubNr = String(player.clubNr || player.clubNumber || player.clubId || "").trim();
      const clubName = String(player.clubName || player.club || "").trim();

      if (!clubNr && !clubName) {
        missingClubInfo.push(player);
        return;
      }

      const key = clubNr ? `club-nr:${clubNr}` : `club-name:${clubName.toLocaleLowerCase("de")}`;
      const entry = clubMap.get(key) ?? { clubName, clubNr, count: 0 };
      entry.count += 1;
      clubMap.set(key, entry);
    });

    const violations = [...clubMap.values()].filter((club) => club.count * 2 >= activeCount);
    const hasClickttImport = Boolean(activeTournament.clicktt?.rawXml);

    if (violations.length === 0 && (!hasClickttImport || missingClubInfo.length === 0)) {
      return "";
    }

    const messages = [];
    violations.forEach((club) => {
      const label = club.clubName || club.clubNr || "Ein Verein";
      messages.push(
        `${label}: ${club.count} von ${activeCount} aktiven Teilnehmern. Fuer BTTV Race sind maximal ${maxAllowed} erlaubt.`
      );
    });

    if (hasClickttImport && missingClubInfo.length > 0) {
      messages.push(
        `${missingClubInfo.length} aktive Teilnehmer haben keine Vereinsdaten. Bitte click-TT Import pruefen.`
      );
    }

    // Getönter Hinweis in der Randspalte, nicht als Warnkasten in der Liste.
    return `
      <section class="quota-notice" role="status">
        <h6 class="quota-notice-heading">Vereinsquote prüfen</h6>
        ${messages.map((message) => `<p class="quota-notice-text">${escapeHtml(message)}</p>`).join("")}
      </section>
    `;
  }

  /** Eine Zeile im Lesemodus: Nr, Name mit Verein, TTR, Marke nur wenn abweichend. */
  function renderTtRaceParticipantRow(player, index, canEditRoster) {
    const status = PLAYER_STATUSES[player.status] ? player.status : "active";
    const id = escapeHtml(player.id || `player-${index + 1}`);
    const isEditing = id === ttRaceEditingPlayerId;
    const club = player.clubName || player.club || "";

    return `
      <button
        class="roster-row ${status !== "active" ? "is-muted" : ""} ${isEditing ? "is-editing" : ""}"
        type="button"
        data-race-action="edit-tt-race-player"
        data-player-id="${id}"
        ${canEditRoster ? "" : "disabled"}
      >
        <span class="roster-number">${index + 1}</span>
        <span class="roster-name-cell">
          <span class="roster-name">${escapeHtml(player.name || "")}</span>
          ${club ? `<span class="roster-club">${escapeHtml(club)}</span>` : ""}
        </span>
        <span class="roster-ttr">${hasTtrValue(player.rating) ? escapeHtml(formatTtrValue(player.rating)) : "—"}</span>
        <span class="roster-status">${
          status === "active" ? "" : `<span class="tag tag-neutral">${escapeHtml(PLAYER_STATUSES[status].label)}</span>`
        }</span>
      </button>
    `;
  }

  function getTtRaceRegardTtrValues() {
    return activeTournament.ttRace?.settings?.regardTtrValues !== false;
  }

  function getRaceDayParticipants() {
    if (isTtRaceTournament()) {
      return (activeTournament.ttRace.players ?? []).map((player) => player.name || player.id || "Spieler");
    }

    if (activeTournament.mode === "team") {
      return [
        ...ensureLength(
          activeTournament.team.teamAPlayers,
          activeTournament.team.teamACount,
          "Spieler A"
        ),
        ...ensureLength(
          activeTournament.team.teamBPlayers,
          activeTournament.team.teamBCount,
          "Spieler B"
        )
      ];
    }

    if (activeTournament.mode === "groupsKnockout") {
      return ensureLength(
        activeTournament.groupsKnockout.playerNames,
        activeTournament.groupsKnockout.playerCount,
        "Spieler"
      );
    }

    return ensureLength(
      activeTournament.roundRobin.playerNames,
      activeTournament.roundRobin.playerCount,
      "Spieler"
    );
  }

  function getRaceDayRoundContext() {
    if (isTtRaceTournament()) {
      const rounds = Array.isArray(activeTournament.ttRace.rounds) ? activeTournament.ttRace.rounds : [];
      const currentRound = rounds[rounds.length - 1] || null;
      const currentRoundNumber = currentRound?.roundNumber ?? rounds.length;

      return {
        kind: "ttRace",
        label: currentRound ? `Schweizer Runde ${currentRoundNumber}` : "Noch keine Schweizer Runde",
        targetRound: "ttRace",
        sheetAction: "",
        totalRounds: Math.max(1, rounds.length),
        currentRoundNumber,
        currentRound
      };
    }

    if (activeTournament.mode === "team") {
      const totalRounds = Math.max(1, analysis.rounds?.length || 1);
      const currentRoundNumber = getCurrentTeamRoundNumber(totalRounds);
      return {
        label: `Einzelrunde ${currentRoundNumber}`,
        targetRound: "team",
        sheetAction: "teamCurrentRound",
        totalRounds,
        currentRoundNumber,
        currentRound: analysis.rounds?.[currentRoundNumber - 1]
      };
    }

    if (activeTournament.mode === "groupsKnockout") {
      const totalRounds = Math.max(1, analysis.groupRoundSchedule?.length || 1);
      const currentRoundNumber = getCurrentGroupsRoundNumber(totalRounds);
      return {
        label: `Gruppenrunde ${currentRoundNumber}`,
        targetRound: "groupStage",
        sheetAction: "groupsCurrentRound",
        totalRounds,
        currentRoundNumber,
        currentRound: analysis.groupRoundSchedule?.[currentRoundNumber - 1]
      };
    }

    const totalRounds = Math.max(1, analysis.rounds?.length || 1);
    const currentRoundNumber = getCurrentRoundNumber(totalRounds);
    return {
      label: `Runde ${currentRoundNumber}`,
      targetRound: "roundRobin",
      sheetAction: "roundRobinCurrentRound",
      totalRounds,
      currentRoundNumber,
      currentRound: analysis.rounds?.[currentRoundNumber - 1]
    };
  }

  function getRaceDayProgress(roundContext) {
    if (roundContext.kind === "ttRace") {
      const matches = (activeTournament.ttRace?.rounds ?? []).flatMap((round) => round.matches ?? []);
      const completed = matches.filter((match) =>
        match.status && !["scheduled", "void"].includes(match.status)
      ).length;
      const total = matches.length;

      return {
        completed,
        total,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    }

    const completed = analysis.completedMatches || 0;
    const total = analysis.totalMatches || 0;

    return {
      completed,
      total,
      completionRate: Math.max(0, Math.min(100, analysis.completionRate || 0))
    };
  }

  function isTtRaceMatchComplete(match) {
    return (
      Boolean(match?.playerAId) &&
      Boolean(match?.playerBId) &&
      Boolean(match?.status) &&
      !["scheduled", "void"].includes(match.status) &&
      Boolean(match.winnerId || match.sets?.length > 0 || match.setScore)
    );
  }

  function hasTtRaceMatchResult(match) {
    return Boolean(
      match?.winnerId ||
        match?.sets?.length > 0 ||
        match?.setScore ||
        ["completed", "walkover", "retired", "void"].includes(match?.status)
    );
  }

  function isTtRaceRoundComplete(round) {
    const matches = Array.isArray(round?.matches) ? round.matches : [];
    return matches.every((match) => isTtRaceMatchComplete(match));
  }

  function getTtRaceInitialRedrawState(ttRaceTournament = activeTournament.ttRace) {
    const rounds = Array.isArray(ttRaceTournament?.rounds) ? ttRaceTournament.rounds : [];
    const firstRound = rounds[0];

    if (rounds.length !== 1 || firstRound?.roundNumber !== 1) {
      return {
        visible: false,
        canRedraw: false,
        reason: ""
      };
    }

    const hasResults = (firstRound.matches ?? []).some(hasTtRaceMatchResult);
    return {
      visible: true,
      canRedraw: !hasResults,
      reason: hasResults
        ? "Runde 1 enthält bereits Ergebnisse."
        : "Runde 1 enthält noch keine Ergebnisse."
    };
  }

  function renderTtRaceRedrawButton(redrawState, className = "secondary-button") {
    if (!redrawState.visible) {
      return "";
    }

    return `
      <button class="${escapeHtml(className)}" type="button" data-race-action="redraw-initial-round" ${redrawState.canRedraw ? "" : "disabled"} title="${escapeHtml(redrawState.reason)}">
        Erste Runde neu losen
      </button>
    `;
  }

  function getTtRaceGenerationStateFromTournament(ttRaceTournament = activeTournament.ttRace) {
    const rounds = Array.isArray(ttRaceTournament?.rounds) ? ttRaceTournament.rounds : [];
    const lastRound = rounds[rounds.length - 1] || null;
    const settings = ttRaceTournament?.settings ?? {};
    const maxRounds = Number.isInteger(Number(settings.maxRounds)) ? Number(settings.maxRounds) : 6;
    const activePlayerCount = (ttRaceTournament?.players ?? []).filter((player) => player.status === "active").length;
    const label = lastRound ? "Nächste Schweizer Runde erzeugen" : "Erste Schweizer Runde erzeugen";

    if (rounds.length === 0 && settings.bttvRaceRules && (activePlayerCount < 9 || activePlayerCount > 16)) {
      return {
        canGenerate: false,
        label,
        reason: activePlayerCount === 7 || activePlayerCount === 8
          ? "Bei 7 oder 8 Teilnehmern ist das BTTV TT-Race kein Schweizer System."
          : "BTTV TT-Race im Schweizer System braucht 9 bis 16 aktive Teilnehmer."
      };
    }

    if (activePlayerCount < 2) {
      return {
        canGenerate: false,
        label,
        reason: "Bitte zuerst Teilnehmer laden oder anlegen."
      };
    }

    if (rounds.length >= maxRounds) {
      return {
        canGenerate: false,
        label: "Maximale Rundenzahl erreicht",
        reason: `Es sind bereits ${maxRounds} Schweizer Runden erzeugt.`
      };
    }

    if (lastRound && !isTtRaceRoundComplete(lastRound)) {
      return {
        canGenerate: false,
        label,
        reason: "Erst alle Spiele der aktuellen Runde mit gültigen Satzpunkten abschließen."
      };
    }

    return {
      canGenerate: true,
      label,
      reason: lastRound
        ? "Alle Spiele der aktuellen Runde sind erfasst."
        : "Die erste Runde wird aus der Teilnehmerliste ausgelost."
    };
  }

  function getTtRaceFinalExportState(ttRaceTournament = activeTournament.ttRace) {
    const rounds = Array.isArray(ttRaceTournament?.rounds) ? ttRaceTournament.rounds : [];
    const settings = ttRaceTournament?.settings ?? {};
    const maxRounds = Number.isInteger(Number(settings.maxRounds)) ? Number(settings.maxRounds) : 6;
    const allMatches = rounds.flatMap((round) => round.matches ?? []);
    const completedMatches = allMatches.filter((match) => isTtRaceMatchComplete(match)).length;
    const totalMatches = allMatches.length;

    if (!settings.bttvRaceRules) {
      return {
        canExport: completedMatches > 0,
        reason: completedMatches > 0
          ? "Export bereit."
          : "Noch keine exportierbaren Ergebnisse.",
        completedMatches,
        totalMatches
      };
    }

    if (rounds.length < maxRounds) {
      return {
        canExport: false,
        reason: `Finaler click-TT Export erst nach ${maxRounds} vollständig erfassten Schweizer Runden.`,
        completedMatches,
        totalMatches
      };
    }

    const incompleteRound = rounds.find((round) => !isTtRaceRoundComplete(round));
    if (incompleteRound) {
      return {
        canExport: false,
        reason: `Runde ${incompleteRound.roundNumber} ist noch nicht vollständig erfasst.`,
        completedMatches,
        totalMatches
      };
    }

    return {
      canExport: totalMatches > 0 && completedMatches === totalMatches,
      reason: "Finaler click-TT Export bereit.",
      completedMatches,
      totalMatches
    };
  }

  function renderRaceRoundCompleteness(round) {
    if (round?.matches) {
      const completedCount = round.matches.filter((match) =>
        match.status && !["scheduled", "void"].includes(match.status)
      ).length;
      return `<span class="race-day-state-pill">${completedCount}/${round.matches.length} erfasst</span>`;
    }

    const pairings = round?.pairings ?? [];
    const completedCount = pairings.filter(
      (pairing) => pairing.score || (pairing.matchStatus && pairing.matchStatus !== "normal")
    ).length;
    return `<span class="race-day-state-pill">${completedCount}/${pairings.length} erfasst</span>`;
  }

  function buildClickTtXmlPreview(roundContext = getRaceDayRoundContext()) {
    if (clickTtBridgeModule && activeTournament.clicktt?.rawXml) {
      try {
        const exportState = getTtRaceFinalExportState(activeTournament.ttRace);
        if (!exportState.canExport) {
          return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            "<!-- click-TT Export noch nicht bereit -->",
            `<!-- ${escapeXmlText(exportState.reason)} -->`
          ].join("\n");
        }
        const result = clickTtBridgeModule.exportClickttTournamentResults(activeTournament, {
          allowEmpty: true
        });
        if (result.matches.length === 0) {
          return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            "<!-- Noch keine exportierbaren Ergebnisse. -->",
            "<!-- Es wird bewusst keine leere <matches>-Liste als Vorschau ausgegeben. -->"
          ].join("\n");
        }
        const warningText = result.warnings.length
          ? `\n<!-- Hinweise: ${escapeXmlText(result.warnings.join(" | "))} -->`
          : "";
        return result.xml.trimEnd() + warningText;
      } catch (error) {
        return [
          '<?xml version="1.0" encoding="UTF-8"?>',
          "<!-- click-TT Export noch nicht bereit -->",
          `<!-- ${escapeXmlText(error.message || "Unbekannter Fehler")} -->`
        ].join("\n");
      }
    }

    const title =
      activeTournament.tournamentName?.trim() ||
      getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const ttRacePlayerById = new Map((activeTournament.ttRace?.players ?? []).map((player) => [player.id, player]));
    const ttRaceMatches = (roundContext.currentRound?.matches ?? []).map((match) => ({
      table: match.table,
      status: match.status,
      playerA: ttRacePlayerById.get(match.playerAId)?.name || match.playerAId,
      playerB: ttRacePlayerById.get(match.playerBId)?.name || match.playerBId,
      score: formatSetScoreDisplay(match.sets)
    }));
    const matches = (ttRaceMatches.length > 0 ? ttRaceMatches : (roundContext.currentRound?.pairings ?? [])).slice(0, 8);
    const matchLines = matches.length
      ? matches
          .map(
            (pairing, index) =>
              `    <match table="${escapeXmlAttribute(pairing.table ?? index + 1)}" status="${escapeXmlAttribute(pairing.score || pairing.status === "completed" ? "complete" : "open")}">` +
              `<home>${escapeXmlText(pairing.playerA)}</home>` +
              `<away>${escapeXmlText(pairing.playerB)}</away>` +
              `<sets>${escapeXmlText(pairing.score || "")}</sets>` +
              `</match>`
          )
          .join("\n")
      : "    <!-- Keine Paarungen in dieser Runde -->";

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<clickttResults source="TT-Race-MVP" adapter="demo">',
      `  <competition>${escapeXmlText(title)}</competition>`,
      `  <round number="${roundContext.currentRoundNumber}" label="${escapeXmlAttribute(roundContext.label)}">`,
      matchLines,
      "  </round>",
      "</clickttResults>"
    ].join("\n");
  }

  function formatSetScoreDisplay(sets) {
    return (Array.isArray(sets) ? sets : [])
      .map((set) => {
        if (Array.isArray(set) && set.length >= 2) {
          return `${set[0]}:${set[1]}`;
        }

        if (set && typeof set === "object") {
          return `${set.a}:${set.b}`;
        }

        return "";
      })
      .filter(Boolean)
      .join(", ");
  }

  function formatSetSummaryDisplay(sets) {
    const summary = (Array.isArray(sets) ? sets : []).reduce(
      (result, set) => {
        const left = Array.isArray(set) ? Number(set[0]) : Number(set?.a);
        const right = Array.isArray(set) ? Number(set[1]) : Number(set?.b);

        if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) {
          return result;
        }

        if (left > right) {
          result.left += 1;
        } else {
          result.right += 1;
        }

        return result;
      },
      { left: 0, right: 0 }
    );

    return summary.left + summary.right > 0 ? `${summary.left}:${summary.right}` : "";
  }

  function renderSetScoreSummaryPill(sets, { emptyText = "offen", showDetail = true } = {}) {
    const summary = formatSetSummaryDisplay(sets);
    const detail = formatSetScoreDisplay(sets);

    if (!summary) {
      return `<span class="set-score-summary-pill is-empty">${escapeHtml(emptyText)}</span>`;
    }

    return `
      <span class="set-score-summary-pill ${showDetail && detail ? "has-detail" : ""}">
        <strong>${escapeHtml(summary)}</strong>
        ${showDetail && detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </span>
    `;
  }

  function escapeXmlText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeXmlAttribute(value) {
    return escapeXmlText(value).replace(/"/g, "&quot;");
  }

  function getSelectedTemplate() {
    return tournamentTemplates.find((template) => template.id === templateSelect.value) || null;
  }

  function renderConfig() {
    // Beim TT-Race trägt die Turniertag-Hülle die Startliste (2cv2); der
    // private Eintragsbereich (2bv2) würde sie nur doppeln.
    const configContent = isTtRaceTournament()
      ? { top: "", details: "" }
      : activeTournament.mode === "team"
        ? renderTeamConfig()
        : activeTournament.mode === "groupsKnockout"
          ? renderGroupsKnockoutConfig()
          : renderRoundRobinConfig();

    configForm.innerHTML = configContent.top;
    configDetails.innerHTML = configContent.details;

    [configForm, configDetails].forEach((container) => {
      container.querySelectorAll("[data-action]").forEach((element) => {
        element.addEventListener("change", handleConfigInput);
      });

      container.querySelectorAll("[data-import-text]").forEach((element) => {
        element.addEventListener("input", handleParticipantImportTextInput);
      });

      container.querySelectorAll("[data-import-file]").forEach((element) => {
        element.addEventListener("change", handleParticipantImportFileSelection);
      });

      container.querySelectorAll("[data-import-team-name]").forEach((element) => {
        element.addEventListener("input", handleParticipantImportTeamNameInput);
      });

      container.querySelectorAll("[data-import-number-duplicates]").forEach((element) => {
        element.addEventListener("change", handleParticipantImportDuplicateOption);
      });

      container.querySelectorAll("[data-import-apply]").forEach((button) => {
        button.addEventListener("click", handleApplyParticipantImport);
      });

      container.querySelectorAll("[data-import-clear]").forEach((button) => {
        button.addEventListener("click", handleClearParticipantImport);
      });

      container.querySelectorAll("[data-draw-action]").forEach((button) => {
        button.addEventListener("click", handleDrawAction);
      });

      container.querySelectorAll("[data-open-view]").forEach((button) => {
        button.addEventListener("click", () => openWorkspaceView(button.dataset.openView));
      });

      container.querySelectorAll("[data-entry-remove]").forEach((button) => {
        button.addEventListener("click", () => handleRemoveEntry(button.dataset.entryRemove, Number(button.dataset.index)));
      });

      container.querySelectorAll("[data-draft-remove]").forEach((button) => {
        button.addEventListener("click", () => handleRemoveDraftLine(button.dataset.draftRemove, Number(button.dataset.index)));
      });

      container.querySelectorAll("[data-team-add]").forEach((button) => {
        button.addEventListener("click", () => handleAddTeamPlayer(button.dataset.teamAdd));
      });

      // "Liste einfügen" blendet den Import dieser Spalte ein.
      container.querySelectorAll("[data-team-paste]").forEach((button) => {
        button.addEventListener("click", () => {
          const panel = container.querySelector(`[data-team-paste-panel="${button.dataset.teamPaste}"]`);
          if (panel) {
            panel.hidden = !panel.hidden;
          }
        });
      });

      container.querySelectorAll("[data-open-example]").forEach((button) => {
        button.addEventListener("click", handleLoadExample);
      });

      container.querySelectorAll("[data-open-template]").forEach((button) => {
        button.addEventListener("click", handleLoadTemplate);
      });

      container.querySelectorAll("[data-race-action]").forEach((button) => {
        button.addEventListener("click", () => handleRaceAction(button));
      });

      container.querySelectorAll("[data-double-add]").forEach((button) => {
        button.addEventListener("click", handleAddDouble);
      });

      container.querySelectorAll("[data-double-remove]").forEach((button) => {
        button.addEventListener("click", handleRemoveDouble);
      });
    });
  }

  /**
   * 2bv2 — Teilnehmer für ein privates Turnier. Links eintragen, rechts
   * sofort die erkannte Liste. Spielmodus und Teilnehmerzahl gehören nicht
   * auf diesen Screen; sie liegen still in der Randspalte.
   */
  function renderRoundRobinConfig() {
    return {
      top: "",
      details: `
        <div class="work-split">
          <div class="work-main">
            <hr class="work-rule" />
            <h3 class="entry-title">Teilnehmer eintragen</h3>
            <p class="entry-lead">Privat genügt ein Name pro Zeile — Tobi bleibt Tobi. Ein Nachname ist nur nötig, wenn zwei gleich heißen.</p>
            ${renderParticipantEntry("roundRobin")}
          </div>
          ${renderParticipantEntryRail("roundRobin")}
        </div>
      `
    };
  }

  /** Textfeld links, erkannte oder eingetragene Namen rechts. */
  function renderParticipantEntry(targetKey) {
    const settings = getParticipantImportSettings(targetKey);
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    const preview = getParticipantImportPreview(targetKey);
    const importId = `${activeTournament.id}-${targetKey}`;
    const roster = getEntryRoster(targetKey);
    const showsDraft = preview.hasInput;
    const rows = showsDraft
      ? preview.displayNames.map((entry, index) => ({ name: preview.applyNames[index] || entry.name, index }))
      : roster.map((name, index) => ({ name, index }));

    return `
      <div data-import-panel="${escapeHtml(targetKey)}">
      <div class="entry-split">
        <div class="entry-input">
          <label for="participant-import-${escapeHtml(importId)}">Namen eintragen — ein Name pro Zeile</label>
          <textarea
            id="participant-import-${escapeHtml(importId)}"
            data-import-text="${escapeHtml(targetKey)}"
            rows="6"
            placeholder="${escapeHtml(settings.placeholder)}"
          >${escapeHtml(draft.text)}</textarea>
          <span class="entry-hint">Auch später jederzeit ergänzbar.</span>
        </div>

        <div class="entry-recognised">
          <h6 class="rail-heading" data-import-count>${escapeHtml(
            showsDraft ? formatImportCountHeading(preview.applyNames.length) : `Startliste · ${rows.length} Teilnehmer`
          )}</h6>
          <div data-import-preview="${escapeHtml(targetKey)}">
            ${renderEntryRows(rows, targetKey, showsDraft)}
          </div>
        </div>
      </div>

      <div class="work-action">
        <button class="primary-button" type="button" data-import-apply="${escapeHtml(targetKey)}" ${
          preview.applyNames.length === 0 ? "disabled" : ""
        }>Liste übernehmen</button>
        <span class="action-reason" data-import-hint>${
          showsDraft
            ? "Danach folgt die Auslosung der ersten Runde."
            : "Namen eintragen, dann übernehmen."
        }</span>
      </div>
      </div>
    `;
  }

  function renderEntryRows(rows, targetKey, isDraft) {
    if (rows.length === 0) {
      return '<p class="empty-note">Noch keine Namen eingetragen.</p>';
    }

    return rows
      .map(({ name, index }) => {
        const parts = String(name || "").trim().split(/\s+/);
        // "Spieler 1" ist ein Platzhalter, kein Vor- und Nachname.
        const hasNumericTail = parts.length > 1 && /^\d+$/.test(parts[parts.length - 1]);
        const first = hasNumericTail ? parts.join(" ") : parts[0] || "";
        const last = hasNumericTail ? "" : parts.slice(1).join(" ");

        return `
          <div class="entry-row">
            <span class="entry-nr">${index + 1}</span>
            <span class="entry-first">${escapeHtml(first)}</span>
            <span class="${last ? "entry-last" : "entry-last is-missing"}">${escapeHtml(last || "Nachname ergänzen")}</span>
            <button
              class="entry-remove"
              type="button"
              ${isDraft ? `data-draft-remove="${escapeHtml(targetKey)}"` : `data-entry-remove="${escapeHtml(targetKey)}"`}
              data-index="${index}"
              aria-label="${escapeHtml(name)} entfernen"
              title="Entfernen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12" /><path d="M18 6L6 18" />
              </svg>
            </button>
          </div>
        `;
      })
      .join("");
  }

  /**
   * Streicht eine Zeile aus dem noch nicht übernommenen Entwurf. Die
   * Startliste bleibt davon unberührt.
   */
  function handleRemoveDraftLine(targetKey, index) {
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    const lines = String(draft.text ?? "").split(/\r?\n/);
    const contentIndexes = lines
      .map((line, position) => ({ line, position }))
      .filter((entry) => entry.line.trim().length > 0)
      .map((entry) => entry.position);

    const target = contentIndexes[index];
    if (target === undefined) {
      return;
    }

    lines.splice(target, 1);
    draft.text = lines.join("\n");

    const textarea = configDetails.querySelector(`[data-import-text="${targetKey}"]`);
    if (textarea) {
      textarea.value = draft.text;
    }

    refreshParticipantImportPreview(targetKey);
  }

  function handleAddTeamPlayer(side) {
    updateActiveTournament((tournament) => {
      const key = side === "A" ? "teamAPlayers" : "teamBPlayers";
      const countKey = side === "A" ? "teamACount" : "teamBCount";
      const names = ensureLength(tournament.team[key], tournament.team[countKey], `Spieler ${side}`);
      names.push(`Spieler ${side}${names.length + 1}`);
      tournament.team[key] = names;
      tournament.team[countKey] = names.length;
    }, "Spieler hinzugefügt", { checkRoundBackups: true });
  }

  function handleRemoveEntry(targetKey, index) {
    if (!Number.isInteger(index)) {
      return;
    }

    updateActiveTournament((tournament) => {
      if (targetKey === "teamA" || targetKey === "teamB") {
        const key = targetKey === "teamA" ? "teamAPlayers" : "teamBPlayers";
        const countKey = targetKey === "teamA" ? "teamACount" : "teamBCount";
        const names = ensureLength(tournament.team[key], tournament.team[countKey], "Spieler");
        names.splice(index, 1);
        tournament.team[key] = names;
        tournament.team[countKey] = Math.max(1, names.length);
        return;
      }

      const names = ensureLength(
        tournament.roundRobin.playerNames,
        tournament.roundRobin.playerCount,
        "Spieler"
      );
      const statuses = tournament.roundRobin.playerStatuses ?? [];
      names.splice(index, 1);
      statuses.splice(index, 1);
      tournament.roundRobin.playerNames = names;
      tournament.roundRobin.playerStatuses = statuses;
      tournament.roundRobin.playerCount = Math.max(2, names.length);
    }, "Teilnehmer entfernt", { checkRoundBackups: true });
  }

  function getEntryRoster(targetKey) {
    if (targetKey === "teamA") {
      return ensureLength(activeTournament.team.teamAPlayers, activeTournament.team.teamACount, "Spieler A");
    }

    if (targetKey === "teamB") {
      return ensureLength(activeTournament.team.teamBPlayers, activeTournament.team.teamBCount, "Spieler B");
    }

    return ensureLength(
      activeTournament.roundRobin.playerNames,
      activeTournament.roundRobin.playerCount,
      "Spieler"
    );
  }

  /** Randspalte von 2bv2: offizieller Weg oben, Werkzeuge darunter. */
  function renderParticipantEntryRail(targetKey) {
    return `
      <aside class="work-rail" aria-label="Werkzeuge">
        <section class="rail-block">
          <h6 class="rail-heading">Offizielles Turnier</h6>
          <p class="rail-note">Die click-TT XML bringt Namen, IDs, Vereine und Q-TTR mit und ist Voraussetzung für den Ergebnis-Export.</p>
          <button class="secondary-button" type="button" data-race-action="choose-clicktt-file">click-TT XML wählen</button>
        </section>

        <hr class="hairline" />

        <section class="rail-block">
          <h6 class="rail-heading">Werkzeuge</h6>
          <div class="rail-links">
            <label class="link-button file-picker-button">
              CSV-Liste einlesen
              <input data-import-file="${escapeHtml(targetKey)}" type="file" accept=".csv,.txt,text/csv,text/plain" hidden />
            </label>
            <button class="link-button" type="button" data-open-example>Beispieldaten laden</button>
            <button class="link-button" type="button" data-open-template>Vorlage aus letztem Turnier</button>
          </div>
        </section>

        <hr class="hairline" />

        ${renderTournamentSettingsBlock()}
      </aside>
    `;
  }

  /**
   * Spielmodus, Teilnehmerzahl und Turniername stehen im Entwurf im
   * Assistenten. Für ein laufendes Turnier müssen sie erreichbar bleiben —
   * hier still am Ende der Randspalte statt oben auf der Arbeitsfläche.
   */
  function renderTournamentSettingsBlock() {
    return `
      <details class="rail-details">
        <summary>Turniereinstellungen</summary>
        <div class="rail-details-body">
          <label class="rail-field">
            <span>Turniername</span>
            <input data-action="tournamentName" type="text" value="${escapeHtml(activeTournament.tournamentName)}" placeholder="z. B. Vereinsabend" />
          </label>
          ${renderMatchModeField()}
          <label class="rail-field">
            <span>Anzahl der Teilnehmer</span>
            <input data-action="roundRobinCount" type="number" min="2" max="100" value="${activeTournament.roundRobin.playerCount}" />
          </label>
          ${renderScoringRulesToggle()}
        </div>
      </details>
    `;
  }

  function renderGroupsKnockoutConfig() {
    const names = ensureLength(
      activeTournament.groupsKnockout.playerNames,
      activeTournament.groupsKnockout.playerCount,
      "Spieler"
    );

    const placementOn = activeTournament.groupsKnockout.placementMatchesEnabled;
    const groupCount = activeTournament.groupsKnockout.groupCount;

    // 10a — die vier Einstellungen stehen als eine Zeile, abgeschlossen mit
    // einer Haarlinie; darunter die Gruppenaufteilung direkt sichtbar.
    return {
      top: "",
      details: `
        <div class="work-main">
          <hr class="work-rule" />

          <div class="settings-row">
            <label class="settings-item">
              <span>Teilnehmer</span>
              <input data-action="groupsKnockoutCount" type="number" min="4" max="100" value="${activeTournament.groupsKnockout.playerCount}" />
            </label>
            <label class="settings-item">
              <span>Gruppen</span>
              <input data-action="groupsKnockoutGroupCount" type="number" min="2" max="8" value="${groupCount}" />
            </label>
            <label class="settings-item">
              <span>Weiter je Gruppe</span>
              <input data-action="groupsKnockoutQualifiers" type="number" min="1" max="10" value="${activeTournament.groupsKnockout.qualifiersPerGroup}" />
            </label>
            <div class="settings-item settings-item-wide">
              <span>Spiel um Platz 3</span>
              <span class="seg">
                <label class="seg-opt">
                  <input data-action="groupsKnockoutPlacement" type="radio" name="groupsPlacement" value="yes" ${placementOn ? "checked" : ""} />
                  <span>Ja</span>
                </label>
                <label class="seg-opt">
                  <input data-action="groupsKnockoutPlacement" type="radio" name="groupsPlacement" value="no" ${placementOn ? "" : "checked"} />
                  <span>Nein</span>
                </label>
              </span>
            </div>
          </div>

          <h3 class="section-subheading">Gruppenaufteilung</h3>
          <p class="work-note">Die Teilnehmer werden reihum verteilt: Position 1 in Gruppe A, Position 2 in Gruppe B, Position 3 wieder in Gruppe A und so weiter. Vor den Spielen ist niemand qualifiziert.</p>

          <div class="group-split">
            ${Array.from({ length: groupCount }, (_, groupIndex) => {
              const groupNames = names.filter((_, index) => index % groupCount === groupIndex);
              return `
                <div class="group-split-column">
                  <h4 class="rail-heading">Gruppe ${String.fromCharCode(65 + groupIndex)}</h4>
                  ${groupNames
                    .map((name, position) => {
                      const nameIndex = position * groupCount + groupIndex;
                      return `
                        <label class="group-split-row">
                          <span class="roster-number">${position + 1}</span>
                          <input data-action="groupsKnockoutName" data-index="${nameIndex}" type="text" value="${escapeHtml(name)}" placeholder="Spieler ${nameIndex + 1}" />
                        </label>
                      `;
                    })
                    .join("")}
                </div>
              `;
            }).join("")}
          </div>

          <div class="work-action">
            <button class="primary-button" type="button" data-open-view="output">Gruppenphase öffnen</button>
            ${renderRandomDrawSection(
              "shuffle-groups-knockout",
              "Teilnehmer neu auslosen",
              "",
              "Mischt die Teilnehmer zufällig und verteilt sie danach neu auf die Gruppen.",
              hasGroupsKnockoutDrawStarted(activeTournament)
            )}
            <span class="action-reason">${
              hasGroupsKnockoutDrawStarted(activeTournament)
                ? "Die Auslosung ist nach dem ersten Ergebnis gesperrt."
                : "Die Aufteilung bleibt änderbar, solange kein Ergebnis erfasst ist."
            }</span>
          </div>

          ${renderTournamentSettingsBlock()}
        </div>
      `
    };
  }

  /** Die Auslosung steht als stiller Knopf neben der Hauptaktion, nicht als Kasten. */
  function renderRandomDrawSection(action, buttonLabel, title, description, locked) {
    const lockReason = "Nach dem ersten Ergebnis gesperrt.";
    return `
      <button
        class="secondary-button"
        type="button"
        data-draw-action="${escapeHtml(action)}"
        ${locked ? "disabled" : ""}
        title="${escapeHtml(locked ? lockReason : description)}"
      >${escapeHtml(buttonLabel)}</button>
    `;
  }

  /**
   * 8a — Aufstellung: beide Teams nebeneinander, getrennt durch eine
   * senkrechte Haarlinie. Doppel sind ein eigener, ausdrücklich optionaler
   * Abschnitt darunter.
   */
  function renderTeamConfig() {
    const doubles = Array.isArray(activeTournament.team.doubles) ? activeTournament.team.doubles : [];
    const teamADatalistId = `team-a-players-${activeTournament.id}`;
    const teamBDatalistId = `team-b-players-${activeTournament.id}`;
    const hasStarted = Object.keys(activeTournament.team.results ?? {}).length > 0;

    return {
      top: "",
      details: `
        <div class="work-main team-setup">
          <hr class="work-rule" />

          <div class="team-split">
            ${renderTeamRoster("A")}
            ${renderTeamRoster("B")}
          </div>

          <section class="team-doubles">
            <div class="work-head">
              <h3>Doppel</h3>
              <button class="secondary-button" type="button" data-double-add>Doppel hinzufügen</button>
            </div>
            <p class="entry-lead">Optional. Namen aus der Aufstellung wählen oder reine Doppelspieler frei eintippen.</p>
            ${
              doubles.length > 0
                ? `<div class="double-list">
                    ${doubles
                      .map((entry, index) => renderDoubleConfigCard(entry, index, teamADatalistId, teamBDatalistId))
                      .join("")}
                  </div>`
                : '<p class="empty-note">Noch keine Doppel angelegt.</p>'
            }
            <datalist id="${teamADatalistId}">${renderTeamPlayerOptions(
              ensureLength(activeTournament.team.teamAPlayers, activeTournament.team.teamACount, "Spieler A")
            )}</datalist>
            <datalist id="${teamBDatalistId}">${renderTeamPlayerOptions(
              ensureLength(activeTournament.team.teamBPlayers, activeTournament.team.teamBCount, "Spieler B")
            )}</datalist>
          </section>

          <div class="work-action">
            <button class="primary-button" type="button" data-open-view="output">Runde 1 öffnen</button>
            <span class="action-reason">${
              hasStarted
                ? "Es sind bereits Ergebnisse erfasst."
                : "Aufstellung und Doppel bleiben änderbar, solange keine Runde erfasst ist."
            }</span>
          </div>

          ${renderTournamentSettingsBlock()}
        </div>
      `
    };
  }

  /** Eine Teamspalte: Name und Größe oben, darunter die Aufstellung. */
  function renderTeamRoster(side) {
    const isA = side === "A";
    const names = ensureLength(
      isA ? activeTournament.team.teamAPlayers : activeTournament.team.teamBPlayers,
      isA ? activeTournament.team.teamACount : activeTournament.team.teamBCount,
      `Spieler ${side}`
    );
    const statuses = (isA ? activeTournament.team.teamAPlayerStatuses : activeTournament.team.teamBPlayerStatuses) ?? [];
    const teamName = isA ? activeTournament.team.teamAName : activeTournament.team.teamBName;

    return `
      <div class="team-column">
        <div class="team-column-head">
          <label class="team-name-field">
            <span>Teamname ${side} · ${isA ? "Zeilen" : "Spalten"}</span>
            <input data-action="team${side}Name" type="text" value="${escapeHtml(teamName)}" placeholder="Team ${side}" />
          </label>
          <label class="team-count-field">
            <span>Spieler</span>
            <input data-action="team${side}Count" type="number" min="1" max="100" value="${names.length}" />
          </label>
        </div>

        <div class="team-roster">
          ${names
            .map((name, index) => {
              const status = PLAYER_STATUSES[statuses[index]] ? statuses[index] : "active";
              return `
                <div class="team-roster-row ${status === "active" ? "" : "is-muted"}">
                  <span class="entry-nr">${index + 1}</span>
                  <input
                    class="team-roster-name"
                    data-action="team${side}Player"
                    data-index="${index}"
                    type="text"
                    value="${escapeHtml(name)}"
                    placeholder="Spieler ${index + 1}"
                    aria-label="Spieler ${index + 1} in Team ${side}"
                  />
                  <span class="team-roster-status">${escapeHtml(PLAYER_STATUSES[status].label)}</span>
                  <button
                    class="entry-remove"
                    type="button"
                    data-entry-remove="team${side}"
                    data-index="${index}"
                    aria-label="${escapeHtml(name)} entfernen"
                    title="Entfernen"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false">
                      <path d="M6 6l12 12" /><path d="M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>

        <div class="action-row team-column-actions">
          <button class="secondary-button" type="button" data-team-add="${side}">Spieler hinzufügen</button>
          <button class="link-button" type="button" data-team-paste="${side}">Liste einfügen</button>
        </div>

        <div class="team-paste" data-team-paste-panel="${side}" hidden>
          ${renderParticipantImportSection(isA ? "teamA" : "teamB")}
        </div>
      </div>
    `;
  }


  function renderPlayerConfigRow({ label, nameAction, statusAction, index, name, status }) {
    return `
      <div class="player-config-row">
        <label>
          <span>${escapeHtml(label)}</span>
          <input data-action="${nameAction}" data-index="${index}" type="text" value="${escapeHtml(name)}" placeholder="${escapeHtml(label)}" />
        </label>
        <label class="participant-status-field">
          <span>Status</span>
          ${renderParticipantStatusSelect(statusAction, index, status)}
        </label>
      </div>
    `;
  }

  function renderParticipantStatusSelect(action, index, selectedStatus) {
    const normalizedStatus = PLAYER_STATUSES[selectedStatus] ? selectedStatus : "active";
    return `
      <select class="participant-status-select" data-action="${action}" data-index="${index}">
        ${PLAYER_STATUS_ORDER.map(
          (statusId) => `
            <option value="${statusId}" ${normalizedStatus === statusId ? "selected" : ""}>
              ${escapeHtml(PLAYER_STATUSES[statusId].label)}
            </option>
          `
        ).join("")}
      </select>
    `;
  }


  function renderScheduleConfigSection() {
    const schedule = activeTournament.schedule;
    const fieldInputs = schedule.fieldNames
      .map((name, index) => [
        "                <label>",
        "                  <span>Name Tisch " + (index + 1) + "</span>",
        "                  <input data-sheet-action=\"scheduleFieldName\" data-index=\"" + index + "\" type=\"text\" value=\"" + escapeHtml(name) + "\" placeholder=\"Tisch " + (index + 1) + "\" />",
        "                </label>"
      ].join(""))
      .join("");

    return [
      "      <section class=\"table-card schedule-config-section\">",
      "        <div class=\"section-heading compact\">",
      "          <div>",
      "            <h3>Spielplan</h3>",
      "            <p>Optionaler Zeitplan mit Tischen, Uhrzeiten und Puffer.</p>",
      "          </div>",
      "        </div>",
      "        <label class=\"double-round-toggle schedule-enable-toggle\">",
      "          <input data-sheet-action=\"scheduleEnabled\" type=\"checkbox\" " + (schedule.enabled ? "checked" : "") + " />",
      "          <span>Spielplan verwenden</span>",
      "        </label>",
      schedule.enabled
        ? [
      "        <div class=\"schedule-config-grid\">",
      "          <label><span>Anzahl Tische</span><input data-sheet-action=\"scheduleFieldCount\" type=\"number\" min=\"1\" max=\"20\" value=\"" + schedule.fieldCount + "\" /></label>",
      "          <label><span>Startzeit</span><input data-sheet-action=\"scheduleStartTime\" type=\"time\" value=\"" + escapeHtml(schedule.startTime) + "\" /></label>",
      "          <label><span>Spieldauer je Spiel (Min.)</span><input data-sheet-action=\"scheduleMatchDuration\" type=\"number\" min=\"1\" max=\"240\" value=\"" + schedule.matchDurationMinutes + "\" /></label>",
      "          <label><span>Pause/Puffer (Min.)</span><input data-sheet-action=\"scheduleBreak\" type=\"number\" min=\"0\" max=\"120\" value=\"" + schedule.breakMinutes + "\" /></label>",
      "        </div>",
      "        <div class=\"field-name-grid\">",
      fieldInputs,
      "        </div>"
          ].join("")
        : "        <p class=\"muted-text\">Aktiviere den Spielplan nur, wenn du konkrete Uhrzeiten und Tische nutzen möchtest.</p>",
      "      </section>"
    ].join("");
  }
  function renderParticipantImportSection(targetKey) {
    const settings = getParticipantImportSettings(targetKey);
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    const preview = getParticipantImportPreview(targetKey);
    const importId = activeTournament.id + "-" + targetKey;
    const teamNameField = settings.hasTeamName
      ? [
          "          <label class=\"participant-import-team-name\">",
          "            <span>Teamname aus Import oder manuell</span>",
          "            <input data-import-team-name=\"" + targetKey + "\" type=\"text\" value=\"" + escapeHtml(draft.teamName) + "\" placeholder=\"" + escapeHtml(settings.teamNamePlaceholder) + "\" />",
          "          </label>"
        ].join("")
      : "";
    const fileNote = draft.fileName
      ? "<span class=\"participant-import-file-note\">" + escapeHtml(draft.fileName) + " geladen</span>"
      : "";

    return [
      "        <section class=\"participant-import-section\" data-import-panel=\"" + targetKey + "\">",
      "          <h3 class=\"section-subheading\">Teilnehmer einfügen</h3>",
      "          <p class=\"work-note\">" + escapeHtml(settings.description) + "</p>",
      "          <div class=\"import-split\">",
      "            <div class=\"import-entry\">",
      teamNameField,
      "          <label class=\"participant-import-textarea\" for=\"participant-import-" + importId + "\">",
      "            <span>" + escapeHtml(settings.textareaLabel) + "</span>",
      "            <textarea id=\"participant-import-" + importId + "\" data-import-text=\"" + targetKey + "\" rows=\"6\" placeholder=\"" + escapeHtml(settings.placeholder) + "\">" + escapeHtml(draft.text) + "</textarea>",
      "          </label>",
      "          <div class=\"participant-import-toolbar\">",
      "            <label class=\"file-picker-button ghost-button\">",
      "              CSV-Datei laden",
      "              <input data-import-file=\"" + targetKey + "\" type=\"file\" accept=\".csv,.txt,text/csv,text/plain\" hidden />",
      "            </label>",
      "            <label class=\"participant-import-checkbox\">",
      "              <input data-import-number-duplicates=\"" + targetKey + "\" type=\"checkbox\" " + (draft.numberDuplicates ? "checked" : "") + " />",
      "              <span>Doppelte Namen automatisch nummerieren</span>",
      "            </label>",
      fileNote,
      "          </div>",
      "          <div class=\"participant-import-actions\">",
      "            <button class=\"primary-button\" type=\"button\" data-import-apply=\"" + targetKey + "\" " + (preview.applyNames.length === 0 ? "disabled" : "") + ">Übernehmen</button>",
      "            <button class=\"ghost-button\" type=\"button\" data-import-clear=\"" + targetKey + "\">Eingabe leeren</button>",
      "          </div>",
      "            </div>",
      "            <div class=\"import-preview-column\">",
      "              <h4 class=\"rail-heading\" data-import-count>" + escapeHtml(formatImportCountHeading(preview.applyNames.length)) + "</h4>",
      "              <div class=\"participant-import-preview\" data-import-preview=\"" + targetKey + "\">",
      renderParticipantImportPreview(targetKey),
      "              </div>",
      "            </div>",
      "          </div>",
      "        </section>"
    ].join("");
  }

  function formatImportCountHeading(count) {
    return `Erkannt · ${count} Teilnehmer`;
  }

  function renderParticipantImportPreview(targetKey) {
    const preview = getParticipantImportPreview(targetKey);

    if (!preview.hasInput) {
      return "<p class=\"participant-import-empty\">Noch keine Namen eingefügt.</p>";
    }

    if (preview.names.length === 0) {
      return "<p class=\"participant-import-warning\">Keine verwertbaren Namen gefunden.</p>";
    }

    const previewItems = preview.displayNames.slice(0, 12).map((entry, index) => {
      const appliedName = preview.applyNames[index] || entry.name;
      const duplicateBadge = entry.isDuplicate
        ? " <span class=\"duplicate-badge\">doppelt</span>"
        : "";
      const numberedBadge = appliedName !== entry.name
        ? " <span class=\"numbered-badge\">wird zu " + escapeHtml(appliedName) + "</span>"
        : "";
      // Der Nachname ist beim privaten Turnier freiwillig; fehlt er, steht es
      // still daneben statt als Fehler.
      const lastNameHint = entry.name.trim().split(/\s+/).length < 2
        ? " <span class=\"missing-lastname-hint\">Nachname ergänzen</span>"
        : "";
      return "<li class=\"" + (entry.isDuplicate ? "is-duplicate" : "") + "\"><span>" + escapeHtml(entry.name) + "</span>" + lastNameHint + duplicateBadge + numberedBadge + "</li>";
    }).join("");
    const remainingCount = Math.max(0, preview.displayNames.length - 12);
    const remainingItem = remainingCount > 0
      ? "<li class=\"participant-import-more\">+" + remainingCount + " weitere</li>"
      : "";
    const duplicateNote = preview.duplicateCount > 0
      ? "<p class=\"participant-import-warning\">" + preview.duplicateCount + " doppelte Namensstelle" + (preview.duplicateCount === 1 ? "" : "n") + " markiert.</p>"
      : "";
    const limitNote = preview.ignoredCount > 0
      ? "<p class=\"participant-import-warning\">Maximal 100 Teilnehmer sind erlaubt. " + preview.ignoredCount + " Name" + (preview.ignoredCount === 1 ? "" : "n") + " werden nicht übernommen.</p>"
      : "";
    const teamNote = preview.teamName
      ? "<p class=\"participant-import-team-note\">Teamname: " + escapeHtml(preview.teamName) + "</p>"
      : "";

    return [
      "<div class=\"participant-import-summary\">",
      "<strong>Diese " + preview.applyNames.length + " Teilnehmer werden übernommen.</strong>",
      teamNote,
      duplicateNote,
      limitNote,
      "</div>",
      "<ul class=\"participant-import-list\">",
      previewItems,
      remainingItem,
      "</ul>"
    ].join("");
  }

  function renderTeamPlayerOptions(names) {
    return [...new Set(names.filter(Boolean))]
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
  }

  function renderDoubleConfigCard(entry, index, teamADatalistId, teamBDatalistId) {
    return `
      <article class="double-config-card">
        <div class="double-config-header">
          <strong class="double-config-title">Doppel-Aufstellung ${index + 1}</strong>
          <button
            class="ghost-button danger"
            type="button"
            data-double-remove
            data-double-id="${escapeHtml(entry.id)}"
          >
            Entfernen
          </button>
        </div>
        <div class="dual-names double-config-dual">
          <div class="name-section">
            <div class="section-heading">
              <h3>${escapeHtml(activeTournament.team.teamAName || "Team A")}</h3>
              <p>Spieler für die Doppel-Aufstellung von ${escapeHtml(activeTournament.team.teamAName || "Team A")}.</p>
            </div>
            <div class="name-grid stacked-name-grid">
              <label>
                <span>Spieler 1</span>
                <input
                  data-action="doubleTeamAPlayer1"
                  data-double-id="${escapeHtml(entry.id)}"
                  type="text"
                  list="${teamADatalistId}"
                  value="${escapeHtml(entry.teamAPlayer1 || "")}"
                  placeholder="Spieler auswählen oder frei eingeben"
                />
              </label>
              <label>
                <span>Spieler 2</span>
                <input
                  data-action="doubleTeamAPlayer2"
                  data-double-id="${escapeHtml(entry.id)}"
                  type="text"
                  list="${teamADatalistId}"
                  value="${escapeHtml(entry.teamAPlayer2 || "")}"
                  placeholder="Spieler auswählen oder frei eingeben"
                />
              </label>
            </div>
          </div>
          <div class="name-section">
            <div class="section-heading">
              <h3>${escapeHtml(activeTournament.team.teamBName || "Team B")}</h3>
              <p>Spieler für die Doppel-Aufstellung von ${escapeHtml(activeTournament.team.teamBName || "Team B")}.</p>
            </div>
            <div class="name-grid stacked-name-grid">
              <label>
                <span>Spieler 1</span>
                <input
                  data-action="doubleTeamBPlayer1"
                  data-double-id="${escapeHtml(entry.id)}"
                  type="text"
                  list="${teamBDatalistId}"
                  value="${escapeHtml(entry.teamBPlayer1 || "")}"
                  placeholder="Spieler auswählen oder frei eingeben"
                />
              </label>
              <label>
                <span>Spieler 2</span>
                <input
                  data-action="doubleTeamBPlayer2"
                  data-double-id="${escapeHtml(entry.id)}"
                  type="text"
                  list="${teamBDatalistId}"
                  value="${escapeHtml(entry.teamBPlayer2 || "")}"
                  placeholder="Spieler auswählen oder frei eingeben"
                />
              </label>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderTournamentSheet() {
    // Der Zustand des Turniers steht im Titelblock und in der Randspalte;
    // ein eigener Zusammenfassungsblock würde ihn nur wiederholen.
    if (isTtRaceTournament()) {
      sheetMeta.innerHTML = renderTtRaceSheetMeta();
      tournamentSheet.innerHTML = renderTtRaceSheet();
    } else {
      sheetMeta.innerHTML = renderSheetMeta();

      tournamentSheet.innerHTML =
        activeTournament.mode === "team"
          ? renderTeamSheet()
          : activeTournament.mode === "groupsKnockout"
            ? renderGroupsKnockoutSheet()
            : renderRoundRobinSheet();
    }

    tournamentSheet.querySelectorAll("[data-result-key]").forEach((select) => {
      select.addEventListener("change", handleResultChange);
    });
    tournamentSheet.querySelectorAll("[data-normal-set-key]").forEach((input) => {
      input.addEventListener("input", handleNormalSetScoreInput);
      input.addEventListener("change", handleNormalSetScoreChange);
    });
    tournamentSheet.querySelectorAll("[data-quick-key]").forEach((input) => {
      input.addEventListener("input", handleQuickResultInput);
      input.addEventListener("keydown", handleQuickResultKeydown);
      input.addEventListener("change", handleQuickResultChange);
    });
    tournamentSheet.querySelectorAll("[data-set-details-toggle]").forEach((button) => {
      button.addEventListener("click", handleSetDetailsToggle);
    });

    // Die Randspalte ist ein eigener Container und braucht ihre eigenen Bindungen.
    sheetMeta.querySelectorAll("[data-draw-action]").forEach((button) => {
      button.addEventListener("click", handleDrawAction);
    });
    sheetMeta.querySelectorAll("[data-print-now]").forEach((button) => {
      button.addEventListener("click", handlePrintDocument);
    });
    // Der Link in der Randspalte klappt den passenden Block darunter auf.
    sheetMeta.querySelectorAll("[data-open-details]").forEach((button) => {
      button.addEventListener("click", () => {
        const needle = button.dataset.openDetails.toLowerCase();
        const target = [...tournamentSheet.querySelectorAll("details.work-details")].find((entry) =>
          (entry.querySelector("summary")?.textContent || "").toLowerCase().includes(needle)
        );
        if (target) {
          target.open = true;
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
    sheetMeta.querySelectorAll("[data-export-csv]").forEach((button) => {
      button.addEventListener("click", handleExportCsv);
    });
    sheetMeta.querySelectorAll("[data-history-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.historyAction === "undo") {
          handleUndo();
        } else {
          handleRedo();
        }
      });
    });
    tournamentSheet.querySelectorAll("[data-match-status-key]").forEach((select) => {
      select.addEventListener("change", handleMatchStatusChange);
    });

    tournamentSheet.querySelectorAll("[data-sheet-action]").forEach((element) => {
      element.addEventListener("change", handleSheetInput);
    });

    tournamentSheet.querySelectorAll("[data-draw-action]").forEach((button) => {
      button.addEventListener("click", handleDrawAction);
    });

    tournamentSheet.querySelectorAll("[data-round-shift]").forEach((button) => {
      button.addEventListener("click", handleRoundShift);
    });
    tournamentSheet.querySelectorAll("[data-tt-race-sets]").forEach((input) => {
      input.addEventListener("input", handleTtRaceSetScoreInput);
      input.addEventListener("change", handleTtRaceSetScoreChange);
    });
    tournamentSheet.querySelectorAll("[data-race-setting]").forEach((input) => {
      input.addEventListener("change", handleRaceSettingChange);
    });
    tournamentSheet.querySelectorAll("[data-race-action]").forEach((button) => {
      button.addEventListener("click", () => handleRaceAction(button));
    });

    tournamentSheet.querySelectorAll("[data-history-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.historyAction === "undo") {
          handleUndo();
        } else {
          handleRedo();
        }
      });
    });

    tournamentSheet.querySelectorAll("[data-font-size-step]").forEach((button) => {
      button.addEventListener("click", handlePlayerStatsFontSizeAdjust);
    });

    renderHistoryButtons();
    applyPlayerStatsFontSizeUI();
  }


  function renderLiveView() {
    const complete = isLiveTournamentComplete();
    const title = activeTournament.tournamentName?.trim() || analysis.tournamentName || getTournamentLabel(activeTournament, getActiveTournamentIndex());

    if (isTtRaceTournament()) {
      renderTtRaceLiveView(title);
      return;
    }

    if (!["roundRobin", "team"].includes(activeTournament.mode)) {
      liveView.innerHTML = `
        <section id="liveStage" class="live-stage" aria-labelledby="liveTitle">
          <header class="live-hero">
            <div class="live-title-block">
              <p class="live-kicker">Live-Ansicht</p>
              <h1 id="liveTitle">${escapeHtml(title)}</h1>
              <div class="live-meta-row">
                <span>${escapeHtml(MODES[activeTournament.mode]?.label || "Turnier")}</span>
                <span>${analysis.completedMatches || 0}/${analysis.totalMatches || 0} Spiele</span>
              </div>
            </div>
            <div class="live-progress-panel">
              <span class="live-progress-value">${Math.max(0, Math.min(100, analysis.completionRate || 0))}%</span>
              <span class="live-progress-label">Fortschritt</span>
              <div class="live-progress-track" aria-hidden="true"><span style="width: ${Math.max(0, Math.min(100, analysis.completionRate || 0))}%"></span></div>
              <button class="live-fullscreen-button" type="button" data-live-fullscreen>Vollbild öffnen</button>
            </div>
          </header>
          <section class="live-panel">
            <div class="live-panel-heading">
              <p class="live-kicker">Hinweis</p>
              <h2>Live-Ansicht für Einzel- und Teamturniere</h2>
            </div>
            <p class="live-empty-state">Für diesen Turniermodus bleibt die normale Ausgabeansicht verfügbar.</p>
          </section>
        </section>
      `;
      return;
    }

    const currentRound = getLiveCurrentRoundGroups();
    const nextGames = currentRound.open.length > 0 ? currentRound.open : getUpcomingLivePairings();
    const progressValue = Math.max(0, Math.min(100, analysis.completionRate || 0));

    liveView.innerHTML = `
      <section id="liveStage" class="live-stage ${activeTournament.mode === "team" ? "is-team-live" : "is-round-robin-live"}" aria-labelledby="liveTitle">
        <header class="live-hero">
          <div class="live-title-block">
            <p class="live-kicker">Live-Ansicht</p>
            <h1 id="liveTitle">${escapeHtml(title)}</h1>
            <div class="live-meta-row">
              <span>${escapeHtml(MODES[activeTournament.mode].label)}</span>
              <span>${escapeHtml(analysis.matchModeLabel)}</span>
              <span>${analysis.completedMatches}/${analysis.totalMatches} Spiele</span>
            </div>
          </div>
          <div class="live-progress-panel">
            <span class="live-progress-value">${progressValue}%</span>
            <span class="live-progress-label">Fortschritt</span>
            <div class="live-progress-track" aria-hidden="true">
              <span style="width: ${progressValue}%"></span>
            </div>
            <button class="live-fullscreen-button" type="button" data-live-fullscreen>Vollbild öffnen</button>
          </div>
        </header>

        ${complete ? renderLiveWinnerBanner() : ""}

        <div class="live-main-grid">
          <section class="live-panel live-round-panel">
            <div class="live-panel-heading">
              <p class="live-kicker">Aktuelle Runde</p>
              <h2>${escapeHtml(currentRound.title)}</h2>
            </div>
            <div class="live-round-columns">
              <div>
                <h3>${currentRound.open.length > 0 ? "Offene Spiele" : "Nächste Spiele"}</h3>
                ${renderLivePairingList(nextGames, complete ? "Alle Spiele sind abgeschlossen." : "Keine offenen Spiele in den nächsten Runden.")}
              </div>
              <div>
                <h3>Gespielt diese Runde</h3>
                ${renderLivePairingList(currentRound.played, "In dieser Runde ist noch kein Ergebnis eingetragen.")}
              </div>
            </div>
          </section>

          <aside class="live-panel live-ranking-panel">
            ${activeTournament.mode === "team" ? renderLiveTeamStandings() : ""}
            ${renderLiveRanking()}
          </aside>
        </div>
        ${renderLiveResultMatrix()}
      </section>
    `;
  }

  function renderTtRaceLiveView(title) {
    const tournament = ttRaceEngineModule
      ? ttRaceEngineModule.normalizeTtRaceTournament(activeTournament.ttRace)
      : activeTournament.ttRace || {};
    const rounds = Array.isArray(tournament.rounds) ? tournament.rounds : [];
    const currentRound = rounds[rounds.length - 1] || null;
    const currentRoundNumber = currentRound?.roundNumber ?? rounds.length;
    const playerById = new Map((tournament.players ?? []).map((player) => [player.id, player]));
    const allMatches = rounds.flatMap((round) => round.matches ?? []);
    const completedMatches = allMatches.filter((match) => isTtRaceMatchComplete(match)).length;
    const totalMatches = allMatches.length;
    const progressValue = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;
    const roundLabel = currentRound ? `Schweizer Runde ${currentRoundNumber}` : "Noch keine Schweizer Runde";
    const roundMatches = currentRound?.matches ?? [];
    const complete = totalMatches > 0 && completedMatches === totalMatches;

    liveView.innerHTML = `
      <section id="liveStage" class="live-stage is-tt-race-live" aria-labelledby="liveTitle">
        <header class="live-hero">
          <div class="live-title-block">
            <p class="live-kicker">Live-Ansicht</p>
            <h1 id="liveTitle">${escapeHtml(title)}</h1>
            <div class="live-meta-row">
              <span>Schweizer System</span>
              <span>${escapeHtml(MATCH_MODES[activeTournament.matchMode]?.label || "3 Gewinnsätze")}</span>
              <span>${completedMatches}/${totalMatches} Spiele</span>
            </div>
          </div>
          <div class="live-progress-panel">
            <span class="live-progress-value">${progressValue}%</span>
            <span class="live-progress-label">Fortschritt</span>
            <div class="live-progress-track" aria-hidden="true">
              <span style="width: ${progressValue}%"></span>
            </div>
            <button class="live-fullscreen-button" type="button" data-live-fullscreen>Vollbild öffnen</button>
          </div>
        </header>

        ${complete ? renderTtRaceLiveCompleteBanner(tournament.standings ?? []) : ""}

        <div class="live-main-grid">
          <section class="live-panel live-round-panel">
            <div class="live-panel-heading">
              <p class="live-kicker">Aktuelle Runde</p>
              <h2>${escapeHtml(roundLabel)}</h2>
            </div>
            ${renderTtRaceLiveTables(roundMatches, currentRound?.byes ?? [], playerById)}
          </section>

          <aside class="live-panel live-ranking-panel">
            ${renderTtRaceLiveRanking(tournament.standings ?? [])}
          </aside>
        </div>
      </section>
    `;
  }

  /**
   * 4av1 — die Tische in zwei Spalten, je Block "Tisch N", beide Namen und
   * rechts das Ergebnis. Beide Spalten enden bündig, weil der Container die
   * Zeilenhöhe gleichmäßig verteilt.
   */
  function renderTtRaceLiveTables(matches, byes, playerById) {
    if (matches.length === 0 && byes.length === 0) {
      return '<p class="live-empty">Noch keine Schweizer Runde erzeugt.</p>';
    }

    const blocks = matches.map((match) => {
      const done = isTtRaceMatchComplete(match);
      const summary = formatSetSummaryDisplay(match.sets);

      return `
        <div class="live-table-block">
          <span class="live-table-kicker">Tisch ${escapeHtml(String(match.table ?? "—"))}</span>
          <div class="live-table-names">
            <span>${escapeHtml(playerById.get(match.playerAId)?.name || match.playerAId || "Offen")}</span>
            <span>${escapeHtml(playerById.get(match.playerBId)?.name || match.playerBId || "Offen")}</span>
          </div>
          <span class="live-table-score ${done ? "is-done" : "is-open"}">${done ? escapeHtml(summary || "erfasst") : "läuft"}</span>
        </div>
      `;
    });

    const byeBlocks = byes.map(
      (bye) => `
        <div class="live-table-block is-bye">
          <span class="live-table-kicker">Freilos</span>
          <div class="live-table-names">
            <span>${escapeHtml(playerById.get(bye.playerId)?.name || bye.playerId || "Offen")}</span>
          </div>
          <span class="live-table-score is-done">${escapeHtml(formatTtRaceByePoints(getTtRaceByePointValue(bye)))}</span>
        </div>
      `
    );

    return `<div class="live-table-columns">${[...blocks, ...byeBlocks].join("")}</div>`;
  }

  function renderTtRaceLiveCompleteBanner(standings) {
    const winner = standings[0];

    if (!winner) {
      return "";
    }

    return `
      <section class="live-winner-banner">
        <p class="live-kicker">Turnier abgeschlossen</p>
        <h2>Sieger: ${escapeHtml(winner.name)}</h2>
        <span>${winner.matchPoints} Punkte · Gegner ${winner.buchholz}</span>
      </section>
    `;
  }

  function handleLiveViewClick(event) {
    const button = event.target.closest?.("[data-live-fullscreen]");
    if (!button) {
      return;
    }

    const stage = liveView.querySelector("#liveStage");
    if (!stage?.requestFullscreen) {
      showInfo("Vollbild ist in diesem Browser nicht verfügbar.");
      return;
    }

    stage.requestFullscreen().catch((error) => {
      console.warn("Live-Ansicht konnte nicht im Vollbild geöffnet werden.", error);
      showInfo("Vollbild konnte nicht geöffnet werden. Bitte Browserberechtigungen prüfen.");
    });
  }

  function handleLiveViewChange(event) {
    const select = event.target.closest?.("[data-live-ranking-limit]");
    if (!select) {
      return;
    }

    liveRankingLimit = select.value === "all" ? "all" : Number.parseInt(select.value, 10);
    if (!LIVE_RANKING_LIMIT_OPTIONS.includes(liveRankingLimit)) {
      liveRankingLimit = 3;
    }

    saveLiveRankingLimit();
    renderLiveView();
  }

  function isLiveTournamentComplete() {
    return analysis.totalMatches > 0 && analysis.completedMatches >= analysis.totalMatches;
  }

  function getLiveCurrentRoundGroups() {
    if (activeTournament.mode === "team") {
      const currentRoundNumber = getCurrentTeamRoundNumber(analysis.rounds.length);
      const currentRound = analysis.rounds[currentRoundNumber - 1];
      const currentDoubleRoundNumber = getCurrentDoubleRoundNumber(analysis.doubleRounds.length);
      const currentDoubleRound = analysis.doubleRounds[currentDoubleRoundNumber - 1];
      const singles = formatLivePairings(currentRound?.pairings ?? [], `Einzelrunde ${currentRoundNumber}`);
      const doubles = formatLivePairings(currentDoubleRound?.pairings ?? [], `Doppelrunde ${currentDoubleRoundNumber}`, "Doppel");
      const pairings = [...singles, ...doubles];

      return {
        title: analysis.doubleRounds.length > 0
          ? `Einzel ${currentRoundNumber} / Doppel ${currentDoubleRoundNumber}`
          : `Runde ${currentRoundNumber} von ${analysis.rounds.length}`,
        open: pairings.filter((pairing) => !pairing.score),
        played: pairings.filter((pairing) => pairing.score)
      };
    }

    const currentRoundNumber = getCurrentRoundNumber(analysis.rounds.length);
    const currentRound = analysis.rounds[currentRoundNumber - 1];
    const pairings = formatLivePairings(currentRound?.pairings ?? [], `Runde ${currentRoundNumber}`);

    return {
      title: `Runde ${currentRoundNumber} von ${analysis.rounds.length}`,
      open: pairings.filter((pairing) => !pairing.score),
      played: pairings.filter((pairing) => pairing.score)
    };
  }

  function getUpcomingLivePairings(limit = 5) {
    const pairings = [];

    if (activeTournament.mode === "team") {
      const currentRoundNumber = getCurrentTeamRoundNumber(analysis.rounds.length);
      analysis.rounds.slice(currentRoundNumber).some((round) => {
        pairings.push(...formatLivePairings(round.pairings, `Einzelrunde ${round.roundNumber}`).filter((pairing) => !pairing.score));
        return pairings.length >= limit;
      });

      const currentDoubleRoundNumber = getCurrentDoubleRoundNumber(analysis.doubleRounds.length);
      analysis.doubleRounds.slice(currentDoubleRoundNumber).some((round) => {
        pairings.push(...formatLivePairings(round.pairings, `Doppelrunde ${round.roundNumber}`, "Doppel").filter((pairing) => !pairing.score));
        return pairings.length >= limit;
      });

      return pairings.slice(0, limit);
    }

    const currentRoundNumber = getCurrentRoundNumber(analysis.rounds.length);
    analysis.rounds.slice(currentRoundNumber).some((round) => {
      pairings.push(...formatLivePairings(round.pairings, `Runde ${round.roundNumber}`).filter((pairing) => !pairing.score));
      return pairings.length >= limit;
    });

    return pairings.slice(0, limit);
  }

  function formatLivePairings(pairings, roundLabel, fallbackType = "Spiel") {
    return pairings.map((pairing) => ({
      roundLabel,
      type: fallbackType,
      playerA: pairing.playerA || pairing.teamALabel || "Offen",
      playerB: pairing.playerB || pairing.teamBLabel || "Offen",
      score: pairing.score || ""
    }));
  }

  function renderLiveResultMatrix() {
    if (activeTournament.mode === "team") {
      return renderLiveTeamResultMatrix();
    }

    return renderLiveRoundRobinResultMatrix();
  }

  function renderLiveRoundRobinResultMatrix() {
    const players = analysis.players || [];
    if (players.length === 0) {
      return "";
    }

    return `
      <section class="live-panel live-result-matrix-panel">
        <div class="live-panel-heading">
          <p class="live-kicker">Ergebnismatrix</p>
          <h2>Alle Begegnungen</h2>
        </div>
        <div class="live-matrix-wrapper">
          <table class="live-result-matrix-table">
            <thead>
              <tr>
                <th>Spieler</th>
                ${players.map((player) => `<th>${escapeHtml(player)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${players.map((player, rowIndex) => `
                <tr>
                  <th>${escapeHtml(player)}</th>
                  ${players.map((_, columnIndex) => renderLiveRoundRobinMatrixCell(rowIndex, columnIndex)).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderLiveRoundRobinMatrixCell(rowIndex, columnIndex) {
    if (rowIndex === columnIndex) {
      return '<td class="is-diagonal">X</td>';
    }

    const isMirrored = rowIndex > columnIndex;
    const key = isMirrored ? `${columnIndex}-${rowIndex}` : `${rowIndex}-${columnIndex}`;
    const result = analysis.results?.[key] || "";
    const setScore = activeTournament.roundRobin?.setScores?.[key] || "";
    return renderLiveStaticMatrixCell(
      isMirrored && result ? reverseScore(result) : result,
      isMirrored && setScore ? reverseNormalSetScoreText(setScore) : setScore
    );
  }

  function renderLiveTeamResultMatrix() {
    if (!analysis.teamAPlayers?.length || !analysis.teamBPlayers?.length) {
      return "";
    }

    return `
      <section class="live-panel live-result-matrix-panel">
        <div class="live-panel-heading">
          <p class="live-kicker">Ergebnismatrix</p>
          <h2>Einzelmatrix</h2>
        </div>
        <div class="live-matrix-wrapper">
          <table class="live-result-matrix-table">
            <thead>
              <tr>
                <th>${escapeHtml(analysis.teamAName)} / ${escapeHtml(analysis.teamBName)}</th>
                ${analysis.teamBPlayers.map((player) => `<th>${escapeHtml(player)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${analysis.teamAPlayers.map((player, rowIndex) => `
                <tr>
                  <th>${escapeHtml(player)}</th>
                  ${analysis.teamBPlayers.map((_, columnIndex) => {
                    const key = `${rowIndex}-${columnIndex}`;
                    return renderLiveStaticMatrixCell(
                      activeTournament.team?.results?.[key] || "",
                      activeTournament.team?.setScores?.[key] || ""
                    );
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderLiveStaticMatrixCell(result, setScore) {
    return `
      <td class="${result ? "is-complete" : "is-open"}">
        <strong>${escapeHtml(result || "-")}</strong>
        ${setScore ? `<small>${escapeHtml(setScore)}</small>` : ""}
      </td>
    `;
  }

  function renderLivePairingList(pairings, emptyText) {
    if (!pairings.length) {
      return `<p class="live-empty-state">${escapeHtml(emptyText)}</p>`;
    }

    return `
      <ul class="live-match-list">
        ${pairings
          .map(
            (pairing) => `
              <li class="live-match-row ${pairing.score ? "is-complete" : ""} ${pairing.type === "Freilos" ? "is-bye" : ""}">
                <span class="live-match-type">${escapeHtml(pairing.roundLabel)}</span>
                <strong class="live-match-players">
                  <span class="live-match-player">${escapeHtml(pairing.playerA)}</span>
                  ${
                    pairing.type === "Freilos"
                      ? `<span class="live-match-versus">setzt aus</span>`
                      : `<span class="live-match-versus">gegen</span><span class="live-match-player">${escapeHtml(pairing.playerB)}</span>`
                  }
                </strong>
                <em class="live-match-score">
                  <span>${pairing.score ? escapeHtml(pairing.score) : "offen"}</span>
                  ${pairing.scoreDetail ? `<small>${escapeHtml(pairing.scoreDetail)}</small>` : ""}
                </em>
              </li>
            `
          )
          .join("")}
      </ul>
    `;
  }

  function renderLiveWinnerBanner() {
    if (activeTournament.mode === "team") {
      const winner = analysis.teamSummary.winner;
      const isDraw = winner === "Unentschieden";
      return `
        <section class="live-winner-banner ${isDraw ? "is-draw" : ""}">
          <p class="live-kicker">Turnier abgeschlossen</p>
          <h2>${isDraw ? "Endstand unentschieden" : `Sieger: ${escapeHtml(winner)}`}</h2>
          <span>Spiele ${analysis.teamSummary.byMatches.teamAValue}:${analysis.teamSummary.byMatches.teamBValue} · Sätze ${analysis.teamSummary.bySets.teamAValue}:${analysis.teamSummary.bySets.teamBValue}</span>
        </section>
      `;
    }

    const winners = analysis.ranking.filter((player) => player.place === 1);
    const winnerNames = winners.map((player) => player.name).join(", ");
    return `
      <section class="live-winner-banner ${winners.length > 1 ? "is-draw" : ""}">
        <p class="live-kicker">Turnier abgeschlossen</p>
        <h2>${winners.length > 1 ? "Geteilte Sieger" : "Sieger"}: ${escapeHtml(winnerNames || "Noch offen")}</h2>
        <span>${analysis.completedMatches} von ${analysis.totalMatches} Begegnungen gespielt</span>
      </section>
    `;
  }

  function renderLiveTeamStandings() {
    const { teamSummary } = analysis;
    return `
      <div class="live-team-standings">
        <article class="${teamSummary.winner === analysis.teamAName ? "is-leading" : ""}">
          <span>${escapeHtml(analysis.teamAName)}</span>
          <strong>${teamSummary.teamA.matchesWon}</strong>
          <em>${teamSummary.teamA.setsWon}:${teamSummary.teamA.setsLost} Sätze</em>
        </article>
        <article class="${teamSummary.winner === analysis.teamBName ? "is-leading" : ""}">
          <span>${escapeHtml(analysis.teamBName)}</span>
          <strong>${teamSummary.teamB.matchesWon}</strong>
          <em>${teamSummary.teamB.setsWon}:${teamSummary.teamB.setsLost} Sätze</em>
        </article>
      </div>
    `;
  }

  function renderLiveRanking() {
    const ranking = activeTournament.mode === "team" ? analysis.playerRanking : analysis.ranking;
    const displayedRanking = getLiveDisplayedRanking(ranking);
    const title = getLiveRankingTitle();

    return `
      <div class="live-ranking-block">
        <div class="live-ranking-heading-row">
          <div class="live-panel-heading">
            <p class="live-kicker">Rangliste</p>
            <h2>${escapeHtml(title)}</h2>
          </div>
          ${renderLiveRankingLimitControl(ranking.length)}
        </div>
        ${
          displayedRanking.length > 0
            ? `
              <ol class="live-ranking-list">
                ${displayedRanking.map((player) => renderLiveRankingRow(player)).join("")}
              </ol>
            `
            : `<p class="live-empty-state">Noch keine Rangliste verfügbar.</p>`
        }
      </div>
    `;
  }

  function renderTtRaceLiveRanking(standings) {
    const ranking = standings.map((standing, index) => ({
      ...standing,
      place: standing.rank || index + 1
    }));
    const displayedRanking = getLiveDisplayedRanking(ranking);

    return `
      <div class="live-ranking-block">
        <div class="live-ranking-heading-row">
          <div class="live-panel-heading">
            <p class="live-kicker">Rangliste</p>
            <h2>${liveRankingLimit === "all" ? "Alle Plätze" : `Top ${liveRankingLimit} Rangliste`}</h2>
          </div>
          ${renderLiveRankingLimitControl(ranking.length)}
        </div>
        ${
          displayedRanking.length > 0
            ? `
              <ol class="live-ranking-list">
                ${displayedRanking.map((player) => renderTtRaceLiveRankingRow(player)).join("")}
              </ol>
            `
            : `<p class="live-empty-state">Noch keine Rangliste verfügbar.</p>`
        }
      </div>
    `;
  }

  function renderTtRaceLiveRankingRow(player) {
    return `
      <li class="live-ranking-row ${placeClass(player.place)}">
        <span>${player.place}</span>
        <strong>${renderPlayerMatchName(player.name, player.status)}</strong>
        <em>${player.matchPoints} Punkte · ${player.wins} Siege</em>
        <small>Gegner ${escapeHtml(player.buchholz)} · Sätze ${escapeHtml(formatSignedValue(player.setDiff))}</small>
      </li>
    `;
  }

  function getLiveDisplayedRanking(ranking) {
    if (liveRankingLimit === "all") {
      return ranking;
    }

    return ranking.filter((player) => player.place <= liveRankingLimit);
  }

  function getLiveRankingTitle() {
    if (liveRankingLimit === "all") {
      return activeTournament.mode === "team" ? "Alle Spieler" : "Alle Plätze";
    }

    return activeTournament.mode === "team"
      ? `Top ${liveRankingLimit} Spieler`
      : `Top ${liveRankingLimit} Rangliste`;
  }

  function renderLiveRankingLimitControl(totalEntries) {
    return `
      <label class="live-ranking-limit-field">
        <span>Plätze anzeigen</span>
        <select data-live-ranking-limit aria-label="Anzahl der angezeigten Plätze wählen">
          ${LIVE_RANKING_LIMIT_OPTIONS.map((option) => {
            const value = String(option);
            const isSelected = option === liveRankingLimit;
            const label = option === "all" ? `Alle Plätze (${totalEntries})` : `Platz 1-${option}`;
            return `<option value="${value}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
          }).join("")}
        </select>
      </label>
    `;
  }
  function renderLiveRankingRow(player) {
    const metric = activeTournament.mode === "team"
      ? `${player.matchesWon}:${player.matchesLost} Spiele`
      : isFixedSetMatchMode(analysis.matchMode)
        ? `${player.setsWon}:${player.setsLost} Sätze`
        : `${player.wins}:${player.losses} Siege`;
    const detail = activeTournament.mode === "team"
      ? `${player.team} · Diff. ${formatSignedValue(player.setDiff)}`
      : `Satzdiff. ${formatSignedValue(player.setDiff)}`;

    return `
      <li class="live-ranking-row live-ranking-row-compact ${placeClass(player.place)}">
        <span>${player.place}</span>
        <strong>${renderPlayerMatchName(player.name, player.status)}</strong>
        <div class="live-ranking-metrics">
          <em>${escapeHtml(metric)}</em>
          <small>${escapeHtml(detail)}</small>
        </div>
      </li>
    `;
  }

  function getRoundRobinLeaderSummary() {
    const leaders = analysis.ranking.filter((player) => player.place === 1);
    const hasResults = analysis.completedMatches > 0;

    if (!hasResults || leaders.length === 0) {
      return {
        title: "Noch offen",
        subtitle: "Noch keine Ergebnisse eingetragen",
        metricLabel: "Stand",
        metricValue: "-",
        metricDetail: "Sobald Ergebnisse vorliegen, erscheint hier die Spitze.",
        isTied: false
      };
    }

    const leader = leaders[0];
    const metricLabel = isFixedSetMatchMode(analysis.matchMode) ? "Sätze" : "Bilanz";
    const metricValue = isFixedSetMatchMode(analysis.matchMode)
      ? `${leader.setsWon}:${leader.setsLost}`
      : `${leader.wins}:${leader.losses}`;
    const metricDetail = isFixedSetMatchMode(analysis.matchMode)
      ? `Differenz: ${formatSignedValue(leader.setDiff)}`
      : `Satzdifferenz: ${formatSignedValue(leader.setDiff)}`;

    if (leaders.length === 1) {
      return {
        title: leader.name,
        subtitle: "Platz 1",
        metricLabel,
        metricValue,
        metricDetail,
        isTied: false
      };
    }

    return {
      title: "Gleichstand",
      subtitle: `${formatPlayerNameList(leaders.map((player) => player.name))} teilen Platz 1`,
      metricLabel,
      metricValue,
      metricDetail,
      isTied: true
    };
  }

  function formatPlayerNameList(names) {
    const cleanNames = names.map((name) => String(name || "").trim()).filter(Boolean);

    if (cleanNames.length <= 2) {
      return cleanNames.join(" und ");
    }

    return `${cleanNames.slice(0, -1).join(", ")} und ${cleanNames[cleanNames.length - 1]}`;
  }

  function formatSignedValue(value) {
    return value > 0 ? `+${value}` : `${value}`;
  }

  function renderMatchModeField(extraClass = "") {
    const mismatchCount = analysis.modeMismatchCount || 0;
    return `
      <label${extraClass ? ` class="${extraClass}"` : ""}>
        <span>Spielmodus</span>
        <select data-action="matchMode">
          ${MATCH_MODE_ORDER.map(
            (modeId) => `
              <option value="${modeId}" ${activeTournament.matchMode === modeId ? "selected" : ""}>
                ${escapeHtml(MATCH_MODES[modeId].label)}
              </option>
            `
          ).join("")}
        </select>
      </label>
      ${
        mismatchCount > 0
          ? `<p class="field-note">${mismatchCount} gespeicherte Ergebnis${mismatchCount === 1 ? "" : "se"} stammen aus einem anderen Spielmodus und werden weiterhin gewertet.</p>`
          : ""
      }
    `;
  }

  function renderScoringRulesToggle() {
    const scoring = normalizeScoringRules(activeTournament.scoring);
    const isDefault = isDefaultScoringRules(scoring);
    const drawField = matchModeAllowsDraw(activeTournament.matchMode)
      ? `
        <label>
          <span>Punkte pro Unentschieden</span>
          <input data-action="scoringDrawPoints" type="number" min="-99" max="99" step="1" value="${scoring.drawPoints}" />
        </label>
      `
      : "";

    return `
      <details class="scoring-rules-toggle">
        <summary>
          Erweiterte Wertung
          <span>${isDefault ? "Standard" : "angepasst"}</span>
        </summary>
        <div class="scoring-rules-body">
          <div class="scoring-points-grid">
            <label>
              <span>Punkte pro Sieg</span>
              <input data-action="scoringWinPoints" type="number" min="-99" max="99" step="1" value="${scoring.winPoints}" />
            </label>
            ${drawField}
            <label>
              <span>Punkte pro Niederlage</span>
              <input data-action="scoringLossPoints" type="number" min="-99" max="99" step="1" value="${scoring.lossPoints}" />
            </label>
          </div>
          <div class="scoring-order-grid">
            ${scoring.tieBreakOrder
              .map(
                (criterion, index) => `
                  <label>
                    <span>${index + 1}. Tie-Break</span>
                    <select data-action="scoringTieBreak" data-index="${index}">
                      ${Object.values(TIE_BREAK_CRITERIA)
                        .map(
                          (option) => `
                            <option value="${option.id}" ${option.id === criterion ? "selected" : ""}>
                              ${escapeHtml(option.label)}
                            </option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>
                `
              )
              .join("")}
          </div>
          <p class="field-note">Alphabetisch sortiert nur noch technisch, wenn alle sportlichen Kriterien gleich bleiben; geteilte Plätze bleiben sichtbar.</p>
        </div>
      </details>
    `;
  }

  /** Randspalte der Ergebniseingabe: Stand oben, Spielmodus und Hinweise darunter. */
  function renderSheetMeta() {
    const mismatchCount = analysis.modeMismatchCount || 0;
    const scoringDescription = analysis.scoringDescription;

    return `
      ${renderRailStandings()}
      <p class="rail-note">Siege–Niederlagen und Satzdifferenz, bei Gleichstand entscheidet der direkte Vergleich.</p>
      ${
        mismatchCount > 0
          ? `<p class="rail-note">${mismatchCount} Ergebnis${mismatchCount === 1 ? "" : "se"} wurde${mismatchCount === 1 ? "" : "n"} in einem anderen Spielmodus erfasst und wird${mismatchCount === 1 ? "" : "en"} weiterhin gewertet.</p>`
          : ""
      }

      <hr class="hairline" />

      <div class="rail-links">
        <span class="rail-note" id="railAutosave">${escapeHtml(getAutosaveShortText())}</span>
        ${
          activeTournament.mode === "roundRobin"
            ? `<button class="link-button" type="button" data-draw-action="shuffle-round-robin" ${hasRoundRobinDrawStarted(activeTournament) ? "disabled" : ""}>Teilnehmer neu auslosen</button>`
            : ""
        }
        <button class="link-button" type="button" data-print-now>Spielplan drucken</button>
        <button class="link-button" type="button" data-export-csv>CSV / XLSX</button>
        <span class="rail-history">
          <button class="link-button" type="button" data-history-action="undo">Zurück</button>
          <button class="link-button" type="button" data-history-action="redo">Vor</button>
        </span>
      </div>
      ${
        scoringDescription
          ? `<p class="rail-note">Spielmodus ${escapeHtml(analysis.matchModeLabel)} · Wertung ${escapeHtml(scoringDescription.points)}.</p>`
          : ""
      }
    `;
  }

  function getAutosaveShortText() {
    const detail = autosaveDetail?.textContent?.trim();
    return detail && detail !== "Noch nichts gespeichert." ? detail : "Automatische Speicherung aktiv";
  }

  /** Kurzer Stand für die Randspalte: die ersten Plätze, Rest über einen Link. */
  function renderRailStandings() {
    if (activeTournament.mode === "team") {
      const summary = analysis.teamSummary ?? {};
      const leader = summary.byMatches?.winner;
      const teams = [
        { name: analysis.teamAName, stats: summary.teamA },
        { name: analysis.teamBName, stats: summary.teamB }
      ];
      const best = (analysis.playerRanking ?? []).slice(0, 3);

      return `
        <section class="rail-block">
          <h3 class="rail-heading">Teamstand</h3>
          <div class="team-standing">
            ${teams
              .map(
                (team) => `
                  <div class="team-standing-row ${leader && leader === team.name ? "is-leading" : ""}">
                    <span>${escapeHtml(team.name || "")}</span>
                    <span class="is-numeric">${team.stats?.singlesWon ?? 0}</span>
                    <span class="is-numeric">${formatSignedValue(team.stats?.setDiff ?? 0)}</span>
                  </div>
                `
              )
              .join("")}
          </div>
          <p class="rail-note">Gewonnene Einzel und Satzdifferenz.</p>
        </section>
        ${
          best.length > 0
            ? `<section class="rail-block">
                <h3 class="rail-heading">Beste Bilanz</h3>
                <table class="data-table rail-table">
                  <tbody>
                    ${best
                      .map(
                        (player) => `
                          <tr>
                            <td>${escapeHtml(player.name || "")}</td>
                            <td class="is-numeric">${player.wins ?? 0}–${player.losses ?? 0}</td>
                            <td class="is-numeric">${formatSignedValue(player.setDifference ?? 0)}</td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </section>`
            : ""
        }
      `;
    }

    if (activeTournament.mode === "groupsKnockout") {
      return `
        <section class="rail-block">
          <h3 class="rail-heading">Gruppentabellen</h3>
          ${(analysis.groups ?? [])
            .map(
              (group) => `
                <h4 class="rail-subheading">${escapeHtml(group.name || "")}</h4>
                ${renderGroupRankingTable(group.ranking ?? [])}
              `
            )
            .join("")}
        </section>
      `;
    }

    const ranking = analysis.ranking ?? [];
    if (ranking.length === 0) {
      return "";
    }

    const top = ranking.slice(0, 6);

    return `
      <section class="rail-block">
        <h3 class="rail-heading">Stand</h3>
        <table class="data-table rail-table">
          <thead>
            <tr><th>Pl.</th><th>Spieler</th><th class="is-numeric">S–N</th><th class="is-numeric">Sätze</th></tr>
          </thead>
          <tbody>
            ${top
              .map(
                (player, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(player.name || "")}</td>
                    <td class="is-numeric">${player.wins ?? 0}–${player.losses ?? 0}</td>
                    <td class="is-numeric">${formatSignedValue(player.setDifference ?? 0)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        ${
          ranking.length > top.length
            ? `<button class="link-button" type="button" data-open-details="rangliste">Ganze Rangliste (${ranking.length})</button>`
            : ""
        }
      </section>
    `;
  }

  /**
   * Kurzer Stand für die Randspalte: Platz, Spieler, Punkte, Sätze für die
   * ersten sechs. Die vollständige Wertung steht unter der Spielliste.
   */
  function renderTtRaceRailStandings(roundNumber) {
    const standings = getTtRaceStandings();
    if (standings.length === 0) {
      return "";
    }

    const top = standings.slice(0, 6);

    return `
      <section class="rail-block">
        <h3 class="rail-heading">${roundNumber ? `Stand nach Runde ${roundNumber}` : "Stand"}</h3>
        <table class="data-table rail-table">
          <thead>
            <tr><th>Pl.</th><th>Spieler</th><th class="is-numeric">Pkt</th><th class="is-numeric">Sätze</th></tr>
          </thead>
          <tbody>
            ${top
              .map(
                (standing) => `
                  <tr>
                    <td>${standing.rank}</td>
                    <td>${escapeHtml(standing.name)}</td>
                    <td class="is-numeric">${formatStandingNumber(standing.matchPoints)}</td>
                    <td class="is-numeric">${formatSignedValue(standing.setDiff)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        ${
          standings.length > top.length
            ? `<button class="link-button" type="button" data-open-details="rangliste">Ganze Rangliste (${standings.length})</button>`
            : ""
        }
      </section>
    `;
  }

  /** Randspalte der Ergebniseingabe: Stand, Prüfungen, Quelle. */
  function renderTtRaceSheetMeta() {
    const regardTtrValues = getTtRaceRegardTtrValues();
    const roundContext = getRaceDayRoundContext();
    const roundNumber = roundContext.currentRoundNumber || 0;
    const source = activeTournament.clicktt?.sourceFileName;

    return `
      ${renderTtRaceRailStandings(roundNumber)}

      <hr class="hairline" />

      <div class="rail-links">
        <span class="rail-note">${escapeHtml(getAutosaveShortText())}</span>
        <button class="link-button" type="button" data-print-now>Drucken, CSV, Backup …</button>
        <span class="rail-note">${
          source
            ? `Quelle: ${escapeHtml(source)}`
            : activeTournament.clicktt?.rawXml
              ? "click-TT XML verbunden"
              : "Keine XML geladen — der Export bleibt Vorschau."
        }</span>
        <span class="rail-note">${regardTtrValues ? "Auslosung mit TTR-Setzung." : "Auslosung ohne TTR-Setzung."} Jede Runde entsteht aus dem aktuellen Zwischenstand, nicht aus einer Vollmatrix.</span>
      </div>
    `;
  }

  function getTtRaceRoundByePlayers(round) {
    if (!round?.byes?.length) {
      return [];
    }

    const playersById = new Map((activeTournament.ttRace?.players ?? []).map((player) => [player.id, player]));
    return round.byes.map((bye) => ({
      name: playersById.get(bye.playerId)?.name || bye.playerId || "Unbekannter Spieler",
      points: getTtRaceByePointValue(bye)
    }));
  }

  function getTtRaceByePointValue(bye) {
    const points = Number(bye?.points);
    return Number.isFinite(points) ? points : 1;
  }

  function formatTtRaceByePoints(points) {
    return points === 1 ? "+1 Punkt" : `${points > 0 ? "+" : ""}${points} Punkte`;
  }

  function renderTtRaceRoundByeInline(round) {
    const byes = getTtRaceRoundByePlayers(round);
    if (byes.length === 0) {
      return "";
    }

    return `<p class="tt-race-bye-inline">Setzt aus: ${byes
      .map((bye) => `${escapeHtml(bye.name)} (${escapeHtml(formatTtRaceByePoints(bye.points))})`)
      .join(", ")}</p>`;
  }

  function renderTtRaceRoundByeNotice(round) {
    const byes = getTtRaceRoundByePlayers(round);
    if (byes.length === 0) {
      return "";
    }

    return `
      <div class="tt-race-bye-notice" role="note">
        <strong>${byes.length === 1 ? "Setzt diese Runde aus" : "Setzen diese Runde aus"}</strong>
        <div>
          ${byes
            .map(
              (bye) =>
                `<span>${escapeHtml(bye.name)} · Freilos ${escapeHtml(formatTtRaceByePoints(bye.points))}</span>`
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderTtRaceSheet() {
    const roundContext = getRaceDayRoundContext();
    const progress = getRaceDayProgress(roundContext);
    const players = activeTournament.ttRace?.players ?? [];
    const rounds = activeTournament.ttRace?.rounds ?? [];
    const hasExportPreview = progress.completed > 0 || Boolean(roundContext.currentRound);
    const generationState = getTtRaceGenerationStateFromTournament(activeTournament.ttRace);
    const exportState = getTtRaceFinalExportState(activeTournament.ttRace);

    const roundNumber = roundContext.currentRoundNumber || 0;
    const openCount = Math.max(0, progress.total - progress.completed);

    return `
      <div class="sheet-stack">
        <div class="work-head">
          <h3>${roundContext.currentRound ? `Runde ${roundNumber} erfassen` : "Erste Auslosung"}</h3>
          <span class="work-count">${progress.completed} von ${progress.total} Spielen</span>
        </div>

        <div class="work-intro">
          <p>
            ${
              roundContext.currentRound
                ? "Satzpunkte eintragen, kurz oder ausgeschrieben: „8, 3, 5“ wird mit Enter zu 3:0 und den Sätzen 11:8, 11:3, 11:5."
                : "Teilnehmer laden und dann die erste Schweizer Runde erzeugen."
            }
          </p>
          ${roundContext.currentRound ? renderSetDetailsToggle() : ""}
        </div>

        ${renderTtRaceRoundByeNotice(roundContext.currentRound)}

        ${renderCurrentRoundEntries(roundContext.currentRound)}

        <div class="work-action">
          <button class="primary-button" type="button" data-race-action="generate-swiss-round" ${generationState.canGenerate ? "" : "disabled"}>
            ${escapeHtml(generationState.label)}
          </button>
          ${
            generationState.canGenerate
              ? ""
              : `<span class="action-reason">${escapeHtml(
                  generationState.reason || (openCount > 0 ? `Noch ${openCount} Ergebnis${openCount === 1 ? "" : "se"} offen.` : "")
                )}</span>`
          }
        </div>

        <details class="work-details">
          <summary>Auslosung anpassen</summary>
          <div class="work-details-body">
            ${renderTtRaceRoundSettings()}
          </div>
        </details>

        ${
          rounds.length > 0
            ? `
              <details class="work-details">
                <summary>Vollständige Rangliste anzeigen</summary>
                <div class="work-details-body table-wrapper">
                  ${renderTtRaceStandings()}
                </div>
              </details>
              <details class="work-details">
                <summary>Rundenverlauf anzeigen</summary>
                ${renderTtRaceRoundHistory()}
              </details>
            `
            : players.length > 0
              ? `
                <details class="work-details">
                  <summary>Teilnehmer anzeigen (${players.length})</summary>
                  ${renderTtRaceParticipantPreview(players)}
                </details>
              `
              : ""
        }

        ${
          hasExportPreview
            ? `
              <details class="work-details race-export-panel">
                <summary>click-TT Ergebnis-XML</summary>
                <div class="work-details-body">
                  <div class="action-row">
                    <button class="secondary-button" type="button" data-race-action="download-clicktt-xml" ${activeTournament.clicktt?.rawXml && !exportState.canExport ? "disabled" : ""}>${activeTournament.clicktt?.rawXml ? "XML exportieren" : "XML Demo"}</button>
                    <span class="action-reason">${activeTournament.clicktt?.rawXml ? escapeHtml(exportState.reason) : "Demo-Vorschau, bis eine click-TT XML importiert wurde."}</span>
                  </div>
                  <pre class="clicktt-xml-preview"><code>${escapeHtml(buildClickTtXmlPreview(roundContext))}</code></pre>
                </div>
              </details>
            `
            : ""
        }
      </div>
    `;
  }

  /**
   * Auslosungseinstellungen stehen unter der Hauptaktion, damit die Zeile mit
   * dem Primär-Button ruhig bleibt.
   */
  function renderTtRaceRoundSettings() {
    const regardTtrValues = getTtRaceRegardTtrValues();
    const redrawState = getTtRaceInitialRedrawState(activeTournament.ttRace);
    const canChangeTtrSetting = (activeTournament.ttRace?.rounds?.length ?? 0) === 0;

    return `
      <div class="action-row work-settings">
        ${renderTtRaceRedrawButton(redrawState)}
        <label class="inline-check">
          <input data-race-setting="regardTtrValues" type="checkbox" ${regardTtrValues ? "checked" : ""} ${canChangeTtrSetting ? "" : "disabled"} />
          <span>TTR bei Auslosung berücksichtigen</span>
        </label>
      </div>
    `;
  }

  function renderTtRaceParticipantPreview(players) {
    if (players.length === 0) {
      return `
        <div class="empty-round-state">
          <p>Noch keine Teilnehmer geladen.</p>
          <button class="secondary-button" type="button" data-race-action="choose-clicktt-file">XML wählen</button>
        </div>
      `;
    }

    return `
      <div class="race-participant-strip" aria-label="Teilnehmer">
        ${players
          .map(
            (player) => `
              <span>
                ${escapeHtml(player.name || player.id || "Teilnehmer")}
                ${hasTtrValue(player.rating) ? `<small>${escapeHtml(formatTtrValue(player.rating))}</small>` : ""}
              </span>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderTtRaceRoundHistory() {
    const playersById = new Map((activeTournament.ttRace?.players ?? []).map((player) => [player.id, player]));
    const rounds = activeTournament.ttRace?.rounds ?? [];

    if (rounds.length === 0) {
      return "<p>Noch keine Runde erzeugt.</p>";
    }

    return `
      <div class="tt-race-round-history">
        ${rounds
          .map(
            (round) => `
              <article class="round-card">
                <div class="round-card-header">
                  <h4>Runde ${round.roundNumber}</h4>
                  <span>${round.matches.filter((match) => match.status && !["scheduled", "void"].includes(match.status)).length}/${round.matches.length} erfasst</span>
                </div>
                <ul class="compact-schedule-list">
                  ${round.matches
                    .map((match) => {
                      const playerA = playersById.get(match.playerAId);
                      const playerB = playersById.get(match.playerBId);
                      return `<li class="compact-schedule-row"><span>Tisch ${match.table}</span><strong>${escapeHtml(playerA?.name || match.playerAId)} - ${escapeHtml(playerB?.name || match.playerBId)}</strong>${renderSetScoreSummaryPill(match.sets)}</li>`;
                    })
                    .join("")}
                  ${(round.byes ?? [])
                    .map((bye) => {
                      const player = playersById.get(bye.playerId);
                      return `<li class="compact-schedule-row is-bye"><span>Freilos</span><strong>${escapeHtml(player?.name || bye.playerId)} setzt aus</strong><em>${escapeHtml(formatTtRaceByePoints(getTtRaceByePointValue(bye)))}</em></li>`;
                    })
                    .join("")}
                </ul>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderRoundRobinSheet() {
    const { players, ranking, results, rounds } = analysis;
    const currentRoundNumber = getCurrentRoundNumber(rounds.length);
    const currentRound = rounds[currentRoundNumber - 1];
    const roundRobinLayoutClass = getRoundRobinLayoutClass(players.length);
    const matrixColumnCount = players.length + 3;
    const roundPairings = currentRound?.pairings ?? [];
    const openInRound = roundPairings.filter((pairing) => !pairing.score).length;
    const openTotal = Math.max(0, (analysis.totalMatches ?? 0) - (analysis.completedMatches ?? 0));

    // Umkehrung von früher: die laufende Runde ist die Arbeitsfläche, die
    // Vollmatrix liegt aufklappbar darunter.
    return `
      <div class="sheet-stack">
        <div class="work-head">
          <h3>Runde ${currentRoundNumber} erfassen</h3>
          <span class="work-count">${roundPairings.length - openInRound} von ${roundPairings.length} Spielen</span>
        </div>

        <div class="work-intro">
          <p>Satzpunkte eintragen, kurz oder ausgeschrieben: „8, 3, 5“ wird mit Enter zu 3:0 und den Sätzen 11:8, 11:3, 11:5.</p>
          ${renderSetDetailsToggle()}
        </div>

        ${renderCurrentRoundEntries(currentRound)}

        <div class="work-action">
          <button class="primary-button" type="button" data-round-shift="1" data-target-round="roundRobin" ${
            currentRoundNumber >= rounds.length ? "disabled" : ""
          }>Weiter zu Runde ${Math.min(currentRoundNumber + 1, rounds.length)}</button>
          <span class="action-reason">${
            openTotal > 0
              ? `${openTotal} Begegnung${openTotal === 1 ? "" : "en"} im ganzen Turnier noch offen.`
              : "Alle Begegnungen sind erfasst."
          }</span>
          ${
            currentRoundNumber > 1
              ? `<button class="link-button" type="button" data-round-shift="-1" data-target-round="roundRobin">Zurück zu Runde ${currentRoundNumber - 1}</button>`
              : ""
          }
        </div>

        <details class="work-details">
          <summary>Vollmatrix anzeigen</summary>
          <div class="work-details-body">
            <div class="table-wrapper">
              <table class="data-table grid-matrix">
                <thead>
                  <tr>
                    <th>Spieler</th>
                    ${players
                      .map(
                        (player, index) =>
                          `<th class="is-centered" title="${escapeHtml(player)}">${escapeHtml(
                            shortenMatrixHeading(player, index)
                          )}</th>`
                      )
                      .join("")}
                  </tr>
                </thead>
                <tbody>
                  ${players
                    .map(
                      (player, rowIndex) => `
                        <tr>
                          <td class="matrix-player-cell">${escapeHtml(player)}</td>
                          ${players
                            .map((_, columnIndex) => renderRoundRobinCell(rowIndex, columnIndex, results))
                            .join("")}
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            <p class="matrix-note">Nur das obere Dreieck wird bearbeitet, die grauen Werte sind die automatisch gespiegelte Gegenseite.</p>
          </div>
        </details>

        <details class="work-details">
          <summary>Alle Runden anzeigen</summary>
          <div class="work-details-body">
            ${renderRoundOverviewToggle(rounds, currentRoundNumber, "Vollständige Rundenübersicht anzeigen")}
          </div>
        </details>

        <details class="work-details">
          <summary>Spielplan mit Tischen und Zeiten</summary>
          <div class="work-details-body">
            ${renderScheduleConfigSection()}
            ${activeTournament.schedule.enabled ? renderScheduleSection() : ""}
          </div>
        </details>

        <details class="work-details">
          <summary>Vollständige Rangliste anzeigen</summary>
          <div class="work-details-body table-wrapper">
            ${renderRoundRobinRankingTable(ranking)}
          </div>
        </details>
      </div>
    `;
  }

  function renderRoundRobinMatrixColGroup(playerCount) {
    return `
      <colgroup>
        <col class="matrix-name-col" />
        ${Array.from({ length: playerCount }, () => '<col class="matrix-score-col" />').join("")}
        <col class="matrix-summary-col" />
        <col class="matrix-summary-col" />
      </colgroup>
    `;
  }

  function renderRoundRobinMatrixPlayerHeading(player, index) {
    return `
      <th class="matrix-player-heading">
        <span class="matrix-player-inline">
          <span class="matrix-player-number">${index + 1}</span>
          <span class="matrix-player-name">${escapeHtml(player)}</span>
        </span>
      </th>
    `;
  }

  function renderRoundRobinMatrixSummaryCells(rowIndex) {
    const standing = getRoundRobinStandingForPlayer(rowIndex);

    if (!standing) {
      return `
        <td class="matrix-summary-cell matrix-sets-cell">-</td>
        <td class="matrix-summary-cell matrix-place-cell">-</td>
      `;
    }

    return `
      <td class="matrix-summary-cell matrix-sets-cell">
        <strong>${standing.setsWon}:${standing.setsLost}</strong>
        <span>Diff. ${formatSignedValue(standing.setDiff)}</span>
      </td>
      <td class="matrix-summary-cell matrix-place-cell ${placeClass(standing.place)} ${standing.sharedPlace ? "is-tied" : ""}">
        <strong>${standing.place}.</strong>
        ${standing.sharedPlace ? "<span>geteilt</span>" : ""}
      </td>
    `;
  }

  function getRoundRobinStandingForPlayer(rowIndex) {
    const sourceStat = analysis.stats?.[rowIndex];

    return (
      analysis.ranking?.find((player) => player.sourceIndex === rowIndex) ||
      analysis.ranking?.find(
        (player) =>
          sourceStat &&
          player.name === sourceStat.name &&
          player.setsWon === sourceStat.setsWon &&
          player.setsLost === sourceStat.setsLost &&
          player.wins === sourceStat.wins &&
          player.draws === sourceStat.draws &&
          player.losses === sourceStat.losses
      ) ||
      sourceStat
    );
  }

  function getRoundRobinLayoutClass(playerCount) {
    if (playerCount <= 4) {
      return "is-compact compact-small";
    }

    if (playerCount === 5) {
      return "is-compact compact-medium";
    }

    return "";
  }

  function renderCurrentRoundEntries(round) {
    if (!round) {
      if (isTtRaceTournament()) {
        if ((activeTournament.ttRace?.players ?? []).length === 0) {
          return `
            <div class="empty-round-state">
              <p>Noch keine Teilnehmer aus click-TT XML geladen.</p>
              <button class="secondary-button" type="button" data-race-action="choose-clicktt-file">XML wählen</button>
            </div>
          `;
        }

        return `
          <div class="empty-round-state">
            <p>Noch keine Schweizer Runde erzeugt.</p>
          </div>
        `;
      }

      return "<p>Keine Runde verfügbar.</p>";
    }

    if (round.matches) {
      return renderTtRaceRoundEntries(round);
    }

    const byePlayers = getRoundByePlayers(round);
    const usesContextColumn = round.pairings.some((pairing) => pairing.contextLabel);
    const listClass = usesContextColumn ? "match-list has-context" : "match-list";

    return `
      <ul class="${listClass}">
        ${round.pairings
          .map((pairing, index) => {
            const lead = usesContextColumn
              ? `<span class="match-context">${escapeHtml(pairing.contextLabel || "")}</span>`
              : `<span class="match-table">${index + 1}</span>`;

            return `
              <li class="match-row">
                ${lead}
                <span class="match-player">${renderPlayerMatchName(pairing.playerA, pairing.playerAStatus)}</span>
                <span class="match-versus">gegen</span>
                <span class="match-player">${renderPlayerMatchName(pairing.playerB, pairing.playerBStatus)}</span>
                ${renderCurrentRoundResultControls(pairing)}
              </li>
            `;
          })
          .join("")}
        ${byePlayers
          .map(
            (player) =>
              `<li class="match-row is-bye">
                <span class="match-table">—</span>
                <span class="match-player match-bye-text">${renderByePlayerName(player)} ist diese Runde spielfrei</span>
              </li>`
          )
          .join("")}
      </ul>
    `;
  }

  function renderTtRaceRoundEntries(round) {
    const playerById = new Map((activeTournament.ttRace?.players ?? []).map((player) => [player.id, player]));

    const showDetails = isSetDetailsVisible();

    return `
      <ul class="match-list">
        ${round.matches
          .map((match) => {
            const playerA = playerById.get(match.playerAId);
            const playerB = playerById.get(match.playerBId);
            const scoreText = formatSetScoreDisplay(match.sets);
            const detail = showDetails && scoreText ? `Sätze ${scoreText}` : "";

            return `
              <li class="match-row">
                <span class="match-table">${escapeHtml(String(match.table))}</span>
                <span class="match-player">${escapeHtml(playerA?.name || match.playerAId)}</span>
                <span class="match-versus">gegen</span>
                <span class="match-player">${escapeHtml(playerB?.name || match.playerBId)}</span>
                <span class="quick-result">
                  <input
                    class="quick-result-input"
                    data-tt-race-sets="${escapeHtml(match.id)}"
                    type="text"
                    autocomplete="off"
                    value="${escapeHtml(scoreText)}"
                    placeholder="9, 4, -6 oder 11:9"
                  />
                  <span class="quick-result-note" data-quick-note="${escapeHtml(match.id)}">${escapeHtml(detail)}</span>
                </span>
              </li>
            `;
          })
          .join("")}
        ${(round.byes ?? [])
          .map((bye) => {
            const player = playerById.get(bye.playerId);
            return `
              <li class="match-row is-bye">
                <span class="match-table">—</span>
                <span class="match-player match-bye-text">${escapeHtml(player?.name || bye.playerId)} ist diese Runde spielfrei · Freilos ${escapeHtml(formatTtRaceByePoints(getTtRaceByePointValue(bye)))}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  function getTtRaceStandings() {
    if ((activeTournament.ttRace?.rounds?.length ?? 0) === 0) {
      return [];
    }

    if (activeTournament.ttRace?.standings?.length > 0) {
      return activeTournament.ttRace.standings;
    }

    return ttRaceEngineModule
      ? ttRaceEngineModule.normalizeTtRaceTournament(activeTournament.ttRace).standings
      : [];
  }

  function renderTtRaceStandings() {
    const standings = getTtRaceStandings();

    if (standings.length === 0) {
      return "";
    }

    return `
      <section class="tt-race-standings" aria-labelledby="tt-race-standings-heading">
        <div class="section-heading compact">
          <h3 id="tt-race-standings-heading">TT-Race Rangliste</h3>
          <p>Schweizer-System-Wertung nach Siegen, Gegnerpunkten, direktem Vergleich und niedrigerem Q-TTR.</p>
        </div>
        <div class="table-wrapper compact-table-wrapper">
          <table class="ranking-table tt-race-standings-table">
            <thead>
              <tr>
                <th>Platz</th>
                <th>Spieler</th>
                <th>TTR</th>
                <th>Punkte</th>
                <th>Siege</th>
                <th>Gegner</th>
                <th>Sätze</th>
                <th>Bälle</th>
              </tr>
            </thead>
            <tbody>
              ${standings
                .map(
                  (standing) => `
                    <tr>
                      <td>${standing.rank}</td>
                      <td>${escapeHtml(standing.name)}</td>
                      <td>${escapeHtml(formatTtrValue(standing.rating))}</td>
                      <td>${formatStandingNumber(standing.matchPoints)}</td>
                      <td>${standing.wins}</td>
                      <td>${formatStandingNumber(standing.buchholz)}</td>
                      <td>${standing.setDiff >= 0 ? "+" : ""}${standing.setDiff}</td>
                      <td>${standing.ballDiff >= 0 ? "+" : ""}${standing.ballDiff}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <p class="rail-note">Gegner = Summe der Punkte aller Gegner, entscheidet bei gleicher Bilanz.</p>
      </section>
    `;
  }

  function formatStandingNumber(value) {
    return Number.isInteger(value) ? String(value) : Number(value).toFixed(1).replace(/\.0$/, "");
  }

  function hasTtrValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
  }

  function formatTtrValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number)) : "-";
  }

  function renderCurrentRoundResultControls(pairing) {
    if (activeTournament.mode === "groupsKnockout") {
      return renderNormalResultControlStack(
        pairing.matchKey,
        pairing.score || "",
        "",
        "compact-select",
        pairing.displayReversed,
        "group"
      );
    }

    const resultControls = renderMatchResultControls(
      pairing.matchKey,
      pairing.score || "",
      pairing.matchStatus,
      "compact-select",
      pairing.displayReversed
    );

    return renderNormalResultControlStack(
      pairing.matchKey,
      pairing.score || "",
      pairing.matchStatus,
      "compact-select",
      pairing.displayReversed,
      "",
      false,
      resultControls
    );
  }

  /**
   * Ein einziges Feld je Spiel trägt jetzt beides: das Gesamtergebnis und die
   * Satzpunkte. Die frühere Kombination aus Auswahlfeld und zusätzlichem
   * Satzfeld entfällt.
   */
  function renderNormalResultControlStack(
    key,
    selectedValue,
    selectedStatus = "normal",
    extraClass = "",
    reverseForDisplay = false,
    resultScope = "",
    isDisabled = false,
    resultControls = null
  ) {
    return (
      resultControls ||
      renderMatchResultControls(
        key,
        selectedValue,
        selectedStatus,
        extraClass,
        reverseForDisplay,
        resultScope,
        isDisabled
      )
    );
  }

  function getSetDetailsScreenKey() {
    return isTtRaceTournament() ? "ttRace" : activeTournament.mode || "roundRobin";
  }

  function isSetDetailsVisible() {
    return Boolean(setDetailsByScreen[getSetDetailsScreenKey()]);
  }

  function renderSetDetailsToggle() {
    return `
      <button class="ghost-button set-details-toggle" type="button" data-set-details-toggle>
        ${isSetDetailsVisible() ? "Satzdetails ausblenden" : "Satzdetails einblenden"}
      </button>
    `;
  }

  function handleSetDetailsToggle() {
    const screen = getSetDetailsScreenKey();
    setDetailsByScreen[screen] = !setDetailsByScreen[screen];
    renderTournamentSheet();
  }

  function renderQuickResultField(
    key,
    selectedValue,
    extraClass = "",
    reverseForDisplay = false,
    resultScope = "",
    isDisabled = false
  ) {
    const storedSetScore = getNormalSetScoreValue(activeTournament, resultScope, key);
    const displaySetScore = reverseForDisplay ? reverseNormalSetScoreText(storedSetScore) : storedSetScore;
    const note = isSetDetailsVisible() && displaySetScore ? `Sätze ${displaySetScore}` : "";

    return `
      <span class="quick-result">
        <input
          class="quick-result-input ${extraClass}"
          data-quick-key="${escapeHtml(key)}"
          data-quick-scope="${escapeHtml(resultScope)}"
          data-quick-reverse="${reverseForDisplay ? "true" : "false"}"
          type="text"
          autocomplete="off"
          value="${escapeHtml(selectedValue || "")}"
          placeholder="${escapeHtml(QUICK_RESULT_PLACEHOLDER)}"
          title="${escapeHtml(NORMAL_SET_SCORE_INPUT_HINT)}"
          ${isDisabled ? "disabled" : ""}
        />
        <span class="quick-result-note" data-quick-note="${escapeHtml(key)}">${escapeHtml(note)}</span>
      </span>
    `;
  }

  function setQuickResultNote(input, text, isError) {
    const note = input.parentElement?.querySelector("[data-quick-note]");
    if (!note) {
      return;
    }

    note.textContent = text;
    note.classList.toggle("is-error", Boolean(isError));
  }

  /** Während des Tippens sagt die Zeile unter dem Feld, was Enter übernimmt. */
  function handleQuickResultInput(event) {
    const input = event.target;
    const raw = input.value.trim();
    input.setCustomValidity("");

    if (!raw) {
      setQuickResultNote(input, "", false);
      return;
    }

    if (TOTAL_SCORE_PATTERN.test(raw)) {
      setQuickResultNote(input, `Enter übernimmt ${raw.replace(/\s+/g, "")}`, false);
      return;
    }

    const parsed = deriveMatchScoreFromSetScoreText(raw, activeTournament.matchMode, {
      disallowDraw: input.dataset.quickScope === "knockout"
    });

    if (!parsed.valid) {
      setQuickResultNote(input, QUICK_RESULT_ERROR, true);
      return;
    }

    setQuickResultNote(input, `Enter übernimmt ${parsed.matchScore} · ${parsed.normalizedText}`, false);
  }

  function handleQuickResultKeydown(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    commitQuickResult(event.target);
  }

  function handleQuickResultChange(event) {
    commitQuickResult(event.target);
  }

  /**
   * Enter schreibt das berechnete Gesamtergebnis ins Feld und speichert die
   * Sätze dazu. Ein von Hand gesetztes Gesamtergebnis verwirft sie wieder.
   */
  function commitQuickResult(input) {
    const key = input.dataset.quickKey;
    if (!key) {
      return;
    }

    const resultScope = input.dataset.quickScope || "";
    const reverseForDisplay = input.dataset.quickReverse === "true";
    const raw = input.value.trim();
    input.setCustomValidity("");

    if (!raw) {
      updateActiveTournament((tournament) => {
        const results = getResultMapForScope(tournament, resultScope);
        deleteNormalSetScore(tournament, resultScope, key);
        delete results[key];
      }, "Ergebnis gelöscht", { checkRoundBackups: true });
      return;
    }

    if (TOTAL_SCORE_PATTERN.test(raw)) {
      const normalized = raw.replace(/\s+/g, "");
      const value = reverseForDisplay ? reverseScore(normalized) : normalized;

      updateActiveTournament((tournament) => {
        const results = getResultMapForScope(tournament, resultScope);
        deleteNormalSetScore(tournament, resultScope, key);
        results[key] = value;
      }, "Ergebnis gespeichert", { checkRoundBackups: true });
      return;
    }

    const parsed = deriveMatchScoreFromSetScoreText(raw, activeTournament.matchMode, {
      disallowDraw: resultScope === "knockout"
    });

    if (!parsed.valid) {
      const message = parsed.errors[0] || NORMAL_SET_SCORE_INPUT_HINT;
      input.setCustomValidity(message);
      input.reportValidity?.();
      setQuickResultNote(input, message, true);
      return;
    }

    const storedSetScore = reverseForDisplay ? reverseNormalSetScoreText(parsed.normalizedText) : parsed.normalizedText;
    const storedMatchScore = reverseForDisplay ? reverseScore(parsed.matchScore) : parsed.matchScore;

    updateActiveTournament((tournament) => {
      const setScores = ensureNormalSetScoreMap(tournament, resultScope);
      const results = getResultMapForScope(tournament, resultScope);
      const statuses = getStatusMapForScope(tournament, resultScope);

      setScores[key] = storedSetScore;
      results[key] = storedMatchScore;
      if (statuses) {
        delete statuses[key];
      }
    }, "Ergebnis übernommen", { checkRoundBackups: true });
  }

  function renderPairingResultLabel(pairing) {
    if (pairing.score && pairing.matchStatus && pairing.matchStatus !== "normal") {
      return escapeHtml(pairing.score + " · " + getMatchStatusLabel(pairing.matchStatus));
    }
    if (pairing.score) {
      return escapeHtml(pairing.score);
    }
    if (pairing.matchStatus && pairing.matchStatus !== "normal") {
      return escapeHtml(getMatchStatusLabel(pairing.matchStatus));
    }
    return "offen";
  }

  function renderRoundCard(round, isActive) {
    const byePlayers = getRoundByePlayers(round);
    const status = getRoundStatus(round);

    return `
      <article class="round-card ${isActive ? "is-active-round" : ""}">
        <div class="round-card-header">
          <h4>${round.roundNumber}. Runde</h4>
          <span class="round-status-badge ${status.className}">${escapeHtml(status.label)}</span>
        </div>
        <ul class="round-pairings">
          ${round.pairings
            .map(
              (pairing) => `
                <li class="round-pairing ${pairing.score || (pairing.matchStatus && pairing.matchStatus !== "normal") ? "is-complete" : ""}">
                  <span>${renderPlayerMatchName(pairing.playerA, pairing.playerAStatus)} - ${renderPlayerMatchName(pairing.playerB, pairing.playerBStatus)}</span>
                  <strong>${renderPairingResultLabel(pairing)}</strong>
                </li>
              `
            )
            .join("")}
          ${
            byePlayers
              .map(
                (player) =>
                  `<li class="round-pairing bye-row"><span>${renderByePlayerName(player)} spielfrei</span><strong>Pause</strong></li>`
              )
              .join("")
          }
        </ul>
      </article>
    `;
  }

  function getRoundByePlayers(round) {
    if (Array.isArray(round?.byePlayers)) {
      return round.byePlayers;
    }
    return round?.byePlayer ? [round.byePlayer] : [];
  }

  function renderByePlayerName(player) {
    if (typeof player === "string") {
      return escapeHtml(player);
    }
    return renderPlayerMatchName(player?.name || "", player?.status);
  }

  /**
   * Die Kopfzeile der Matrix trägt nur so viel Name, wie in eine schmale
   * Spalte passt — bei Platzhaltern reicht die Nummer.
   */
  function shortenMatrixHeading(player, index) {
    const name = String(player || "").trim();
    const parts = name.split(/\s+/);
    const last = parts[parts.length - 1] || "";

    // "Spieler 3" und "Spieler B1" sind Platzhalter — dort trägt der letzte
    // Teil die Unterscheidung, bei echten Namen der erste.
    if (parts.length > 1 && /\d/.test(last)) {
      return last;
    }

    return parts[0] || String(index + 1);
  }

  /**
   * Eine bearbeitbare Matrixzelle: das nackte Feld trägt das Gesamtergebnis
   * (4:0, 3:2), darunter stehen auf Wunsch die einzelnen Sätze. Kein
   * Steuerelement-Rahmen, damit der Inhalt in der Spaltenmitte sitzt.
   */
  function renderMatrixInputCell(key, value, resultScope = "") {
    const storedSets = getNormalSetScoreValue(activeTournament, resultScope, key);
    const showSets = isSetDetailsVisible() && storedSets;

    return `
      <td class="matrix-cell is-editable">
        <input
          class="matrix-input"
          data-quick-key="${escapeHtml(key)}"
          data-quick-scope="${escapeHtml(resultScope)}"
          data-quick-reverse="false"
          type="text"
          autocomplete="off"
          value="${escapeHtml(value || "")}"
          placeholder="offen"
          aria-label="Ergebnis eintragen"
        />
        ${showSets ? `<span class="matrix-sets">${escapeHtml(storedSets)}</span>` : ""}
      </td>
    `;
  }

  /** Gespiegelte oder noch offene Zelle der unteren Hälfte. */
  function renderMatrixMirroredCell(mirrored, resultScope = "", mirrorKey = "") {
    if (!mirrored) {
      return '<td class="matrix-cell is-open">offen</td>';
    }

    const storedSets = getNormalSetScoreValue(activeTournament, resultScope, mirrorKey);
    const showSets = isSetDetailsVisible() && storedSets;

    return `
      <td class="matrix-cell is-mirrored">
        ${escapeHtml(reverseScore(mirrored))}
        ${showSets ? `<span class="matrix-sets">${escapeHtml(reverseNormalSetScoreText(storedSets))}</span>` : ""}
      </td>
    `;
  }

  /**
   * Obere Hälfte wird erfasst, untere zeigt gespiegelt und grau, die
   * Diagonale ist getönt. Fehlende Begegnungen stehen als "offen".
   */
  function renderRoundRobinCell(rowIndex, columnIndex, results) {
    if (rowIndex === columnIndex) {
      return '<td class="matrix-cell is-diagonal"></td>';
    }

    if (rowIndex < columnIndex) {
      const key = `${rowIndex}-${columnIndex}`;
      return renderMatrixInputCell(key, results[key] || "");
    }

    const mirrorKey = `${columnIndex}-${rowIndex}`;
    return renderMatrixMirroredCell(results[mirrorKey], "", mirrorKey);
  }

  function renderRoundRobinCompactMatrixOverview(players, results) {
    const size = players.length;
    const cells = [];

    cells.push('<div class="compact-matrix-cell compact-matrix-corner" aria-hidden="true"></div>');
    players.forEach((player, index) => {
      cells.push(
        `<div class="compact-matrix-cell compact-matrix-header" title="${escapeHtml(player)}">${escapeHtml(formatCompactPlayerLabel(player, index))}</div>`
      );
    });

    players.forEach((player, rowIndex) => {
      cells.push(
        `<div class="compact-matrix-cell compact-matrix-header" title="${escapeHtml(player)}">${escapeHtml(formatCompactPlayerLabel(player, rowIndex))}</div>`
      );

      players.forEach((_, columnIndex) => {
        const state = getRoundRobinCompactCellState(rowIndex, columnIndex, results);
        cells.push(
          `<div class="compact-matrix-cell ${state.className}" title="${escapeHtml(state.title)}">${escapeHtml(state.label)}</div>`
        );
      });
    });

    return `
      <div class="compact-matrix-overview" style="--matrix-columns: ${size + 1}" aria-label="Kompakte Ergebnismatrix">
        ${cells.join("")}
      </div>
    `;
  }

  function getRoundRobinCompactCellState(rowIndex, columnIndex, results) {
    if (rowIndex === columnIndex) {
      return {
        label: "X",
        title: "Gleicher Spieler",
        className: "is-diagonal"
      };
    }

    const key = rowIndex < columnIndex ? `${rowIndex}-${columnIndex}` : `${columnIndex}-${rowIndex}`;
    const rawScore = results[key] || "";
    const label = rawScore
      ? rowIndex < columnIndex
        ? rawScore
        : reverseScore(rawScore)
      : "-";

    return {
      label,
      title: rawScore ? `Ergebnis ${label}` : "Noch offen",
      className: rawScore ? "is-complete" : "is-open"
    };
  }

  function formatCompactPlayerLabel(player, index) {
    const trimmed = String(player || "").trim();
    const genericLabel = new RegExp(`^spieler\\s*${index + 1}$`, "i");

    if (!trimmed || genericLabel.test(trimmed)) {
      return String(index + 1);
    }

    return trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
  }

  function renderTeamSheet() {
    const { playerRanking, teamSummary, results, rounds, doubles, doubleRounds } = analysis;
    const currentRoundNumber = getCurrentTeamRoundNumber(rounds.length);
    const currentRound = rounds[currentRoundNumber - 1];
    const currentDoubleRoundNumber = getCurrentDoubleRoundNumber(doubleRounds.length);
    const currentDoubleRound = doubleRounds[currentDoubleRoundNumber - 1];
    const roundPairings = currentRound?.pairings ?? [];
    const openInRound = roundPairings.filter((pairing) => !pairing.score).length;
    const matrixSize = `${analysis.teamAPlayers.length} × ${analysis.teamBPlayers.length}`;

    return `
      <div class="sheet-stack">
        <div class="work-head">
          <h3>Runde ${currentRoundNumber} erfassen</h3>
          <span class="work-count">${roundPairings.length - openInRound} von ${roundPairings.length} Einzeln</span>
        </div>

        <div class="work-intro">
          <p>Satzpunkte eintragen, kurz oder ausgeschrieben: „8, 3, 5“ wird mit Enter zu 3:0 und den Sätzen 11:8, 11:3, 11:5.</p>
          ${renderSetDetailsToggle()}
        </div>

        ${renderCurrentRoundEntries(currentRound)}

        <div class="work-action">
          <div class="round-control-bar">
            <button class="secondary-button" type="button" data-round-shift="-1" data-target-round="team" ${currentRoundNumber <= 1 ? "disabled" : ""}>Vorherige Runde</button>
            <label class="round-counter-input">
              <span class="sr-only">Runde</span>
              <input data-sheet-action="teamCurrentRound" type="number" min="1" max="${rounds.length}" value="${currentRoundNumber}" />
            </label>
            <span class="round-counter-total">von ${rounds.length}</span>
            <button class="primary-button" type="button" data-round-shift="1" data-target-round="team" ${currentRoundNumber >= rounds.length ? "disabled" : ""}>Nächste Runde</button>
          </div>
          ${
            openInRound > 0
              ? `<span class="action-reason">Noch ${openInRound} Ergebnis${openInRound === 1 ? "" : "se"} in dieser Runde offen.</span>`
              : ""
          }
        </div>

        <details class="work-details">
          <summary>Einzelmatrix ${matrixSize} anzeigen</summary>
          <div class="work-details-body">
            <div class="work-intro">
              <p>${escapeHtml(analysis.teamAName)} stehen in den Zeilen, ${escapeHtml(analysis.teamBName)} in den Spalten. Ergebnis als 3:1 eintragen oder die Sätze — Enter rechnet um.</p>
              ${renderSetDetailsToggle()}
            </div>
            <div class="table-wrapper">
              <table class="data-table grid-matrix">
                <thead>
                  <tr>
                    <th>${escapeHtml(analysis.teamAName)}</th>
                    ${analysis.teamBPlayers
                      .map(
                        (player, index) =>
                          `<th class="is-centered" title="${escapeHtml(player)}">${escapeHtml(
                            shortenMatrixHeading(player, index)
                          )}</th>`
                      )
                      .join("")}
                  </tr>
                </thead>
                <tbody>
                  ${analysis.teamAPlayers
                    .map(
                      (player, rowIndex) => `
                        <tr>
                          <td class="matrix-player-cell">${escapeHtml(player)}</td>
                          ${analysis.teamBPlayers
                            .map(
                              (_, columnIndex) => `
                                ${renderMatrixInputCell(`${rowIndex}-${columnIndex}`, results[`${rowIndex}-${columnIndex}`] || "")}
                              `
                            )
                            .join("")}
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details class="work-details">
          <summary>Alle Teamrunden anzeigen</summary>
          <div class="work-details-body">
            ${renderRoundOverviewToggle(rounds, currentRoundNumber, "Vollständige Teamrunden anzeigen")}
          </div>
        </details>

        ${
          doubles.length > 0
            ? `
              <section class="table-card current-round-card">
                <div class="section-heading compact">
                  <div>
                    <h3>Aktuelle Doppelrunde</h3>
                    <p>Hier bestimmst du pro Runde, ob der Rundenplan gilt oder ob du die Doppel manuell neu setzt.</p>
                  </div>
                </div>
                ${renderProgressSummary(
                  doubleRounds,
                  currentDoubleRoundNumber,
                  analysis.completedDoubles,
                  analysis.totalDoubles,
                  "Doppelspiele"
                )}
                <div class="round-control-bar team-round-bar">
                  <button class="round-nav-button" type="button" data-round-shift="-1" data-target-round="double" ${currentDoubleRoundNumber <= 1 ? "disabled" : ""}>Vorherige</button>
                  <span class="round-control-label">Runde</span>
                  <label class="round-counter-input">
                    <span class="sr-only">Doppelrunde</span>
                    <input data-sheet-action="doubleCurrentRound" type="number" min="1" max="${doubleRounds.length}" value="${currentDoubleRoundNumber}" />
                  </label>
                  <span class="round-counter-total">von ${doubleRounds.length}</span>
                  <button class="round-nav-button" type="button" data-round-shift="1" data-target-round="double" ${currentDoubleRoundNumber >= doubleRounds.length ? "disabled" : ""}>Nächste</button>
                </div>
                <label class="double-round-toggle">
                  <input data-sheet-action="doubleRoundManual" type="checkbox" ${currentDoubleRound?.manual ? "checked" : ""} />
                  <span>${currentDoubleRound?.manual ? "Manuelle Paarung aktiv" : "Rundenplan aktiv"}</span>
                </label>
                <div class="double-match-list">
                  ${renderDoubleRoundEntries(currentDoubleRound)}
                </div>
                ${renderRoundOverviewToggle(doubleRounds, currentDoubleRoundNumber, "Vollständige Doppelrunden anzeigen")}
              </section>
            `
            : ""
        }

        <details class="work-details">
          <summary>Spielplan mit Tischen und Zeiten</summary>
          <div class="work-details-body">
            ${renderScheduleConfigSection()}
            ${activeTournament.schedule.enabled ? renderScheduleSection() : ""}
          </div>
        </details>

        <details class="work-details">
          <summary>Spielerstatistik anzeigen</summary>
          <div class="work-details-body">
            ${renderPlayerStatsFontControls()}
            <div class="table-wrapper player-stats-table-shell" data-font-size-target="playerStats">
              ${renderTeamRankingTable(playerRanking)}
            </div>
          </div>
        </details>
      </div>
    `;
  }

  function renderGroupsKnockoutSheet() {
    const currentGroupRoundNumber = getCurrentGroupsRoundNumber(analysis.groupRoundSchedule.length);
    const currentGroupRound = analysis.groupRoundSchedule[currentGroupRoundNumber - 1];
    const currentKnockoutRoundNumber = getCurrentKnockoutRoundNumber(analysis.knockoutRounds.length);
    const currentKnockoutRound = analysis.knockoutRounds[currentKnockoutRoundNumber - 1];

    const roundPairings = currentGroupRound?.pairings ?? [];
    const openInRound = roundPairings.filter((pairing) => !pairing.score).length;
    const isLastGroupRound = currentGroupRoundNumber >= analysis.groupRoundSchedule.length;
    const openGroupMatches = analysis.totalGroupMatches - analysis.completedGroupMatches;

    // Das Format hat zwei Phasen; die Arbeitsfläche führt nur die laufende.
    return `
      <div class="sheet-stack">
        <div class="work-head">
          <h3>Gruppenrunde ${currentGroupRoundNumber} erfassen</h3>
          <span class="work-count">${roundPairings.length - openInRound} von ${roundPairings.length} Spielen</span>
        </div>

        <div class="work-intro">
          <p>Ergebnisse aus allen Gruppen derselben Runde gesammelt eintragen. Satzpunkte kurz oder ausgeschrieben; Enter übernimmt.</p>
          ${renderSetDetailsToggle()}
        </div>

        ${renderCurrentRoundEntries(currentGroupRound)}

        <div class="work-action">
          <div class="round-control-bar">
            <button class="secondary-button" type="button" data-round-shift="-1" data-target-round="groupStage" ${currentGroupRoundNumber <= 1 ? "disabled" : ""}>Vorherige Runde</button>
            <label class="round-counter-input">
              <span class="sr-only">Gruppenrunde</span>
              <input data-sheet-action="groupsCurrentRound" type="number" min="1" max="${analysis.groupRoundSchedule.length}" value="${currentGroupRoundNumber}" />
            </label>
            <span class="round-counter-total">von ${analysis.groupRoundSchedule.length}</span>
            <button class="secondary-button" type="button" data-round-shift="1" data-target-round="groupStage" ${isLastGroupRound ? "disabled" : ""}>Nächste Runde</button>
          </div>
        </div>

        <div class="work-action">
          <button class="primary-button" type="button" data-round-shift="0" data-target-round="knockout" ${analysis.groupStageComplete ? "" : "disabled"}>
            KO-Runde öffnen
          </button>
          ${
            analysis.groupStageComplete
              ? ""
              : `<span class="action-reason">${
                  isLastGroupRound
                    ? `Runde ${currentGroupRoundNumber} ist die letzte Gruppenrunde — noch ${openGroupMatches} Spiel${openGroupMatches === 1 ? "" : "e"} offen.`
                    : `Noch ${openGroupMatches} Gruppenspiel${openGroupMatches === 1 ? "" : "e"} offen.`
                }</span>`
          }
        </div>

        <div class="action-row work-settings">
          ${renderHistoryControls()}
          ${renderRandomDrawSection(
            "shuffle-groups-knockout",
            "Teilnehmer neu auslosen",
            "Mischt die Teilnehmer zufällig und verteilt sie danach neu auf die Gruppen.",
            "Möglich solange die Gruppenphase noch nicht gestartet ist.",
            hasGroupsKnockoutDrawStarted(activeTournament)
          )}
        </div>

        <section class="knockout-preview">
          <h3 class="section-subheading">KO-Raster</h3>
          ${
            analysis.groupStageComplete
              ? renderKnockoutRounds(currentKnockoutRound, currentKnockoutRoundNumber)
              : renderKnockoutWaitingState()
          }
        </section>

        ${renderRoundOverviewToggle(analysis.groupRoundSchedule, currentGroupRoundNumber, "Alle Gruppenrunden anzeigen")}

        <details class="work-details">
          <summary>Gruppenmatrizen anzeigen</summary>
          <div class="work-details-body groups-grid">
            ${analysis.groups.map((group) => renderGroupStageCard(group)).join("")}
          </div>
        </details>

        ${
          analysis.finalStandings.length > 0
            ? `<details class="work-details" open>
                <summary>Finalstand</summary>
                <div class="work-details-body table-wrapper">
                  ${renderFinalStandingsTable(analysis.finalStandings)}
                </div>
              </details>`
            : ""
        }
      </div>
    `;
  }

  function renderGroupStageCard(group) {
    return `
      <article class="table-card group-stage-card">
        <div class="section-heading compact">
          <div>
            <h3>${escapeHtml(group.name)}</h3>
            <p>${group.completedMatches} von ${group.totalMatches} Spielen eingetragen.</p>
          </div>
          <span class="round-status-badge ${group.completedMatches === group.totalMatches ? "is-complete" : group.completedMatches > 0 ? "is-progress" : "is-pending"}">
            ${group.completedMatches === group.totalMatches ? "Fertig" : "Offen"}
          </span>
        </div>
        <div class="table-wrapper">
          <table class="matrix-table group-matrix-table">
            <thead>
              <tr>
                <th>Teilnehmer</th>
                ${group.players.map((player) => `<th>${escapeHtml(player.name)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${group.players
                .map(
                  (player, rowIndex) => `
                    <tr>
                      <th>${escapeHtml(player.name)}</th>
                      ${group.players.map((_, columnIndex) => renderGroupMatrixCell(group, rowIndex, columnIndex)).join("")}
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="table-wrapper group-ranking-wrapper">
          ${renderGroupRankingTable(group.ranking)}
        </div>
      </article>
    `;
  }

  function renderGroupMatrixCell(group, rowIndex, columnIndex) {
    if (rowIndex === columnIndex) {
      return '<td class="matrix-cell is-diagonal"></td>';
    }

    if (rowIndex < columnIndex) {
      const key = `group-${group.groupIndex}-${rowIndex}-${columnIndex}`;
      return renderMatrixInputCell(key, group.results[`${rowIndex}-${columnIndex}`] || "", "group");
    }

    return renderMatrixMirroredCell(group.results[`${columnIndex}-${rowIndex}`], "group");
  }

  function renderGroupRankingTable(ranking) {
    return `
      <table class="stats-table group-ranking-table">
        <thead>
          <tr>
            <th>Platz</th>
            <th>Teilnehmer</th>
            <th>Bilanz</th>
            <th>Saetze +</th>
            <th>Saetze -</th>
            <th>Differenz</th>
            <th>KO</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.map((player) => `
            <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
              <td>${player.place}</td>
              <td>${escapeHtml(player.name)}</td>
              <td>${player.wins}/${player.losses}</td>
              <td>${player.setsWon}</td>
              <td>${player.setsLost}</td>
              <td>${player.setDiff}</td>
              <td>${player.isQualified ? "Qualifiziert" : "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderKnockoutWaitingState() {
    return `
      <div class="knockout-waiting-state">
        <strong>KO-Runde noch nicht bereit</strong>
        <p>Trage zuerst alle Gruppenspiele ein. Danach werden die Qualifikanten automatisch gesetzt.</p>
      </div>
    `;
  }

  function renderKnockoutRounds(currentRound, currentRoundNumber) {
    return `
      <div class="progress-strip">
        <span class="progress-pill">Qualifikanten: ${analysis.qualifiers.length}</span>
        <span class="progress-pill">KO-Spiele: ${analysis.completedKnockoutMatches}/${analysis.totalKnockoutMatches}</span>
      </div>
      ${analysis.knockoutRounds.length > 0 ? `
        <div class="round-control-bar">
          <button class="round-nav-button" type="button" data-round-shift="-1" data-target-round="knockout" ${currentRoundNumber <= 1 ? "disabled" : ""}>Vorherige</button>
          <span class="round-control-label">KO-Runde</span>
          <label class="round-counter-input">
            <span class="sr-only">KO-Runde</span>
            <input data-sheet-action="knockoutCurrentRound" type="number" min="1" max="${analysis.knockoutRounds.length}" value="${currentRoundNumber}" />
          </label>
          <span class="round-counter-total">von ${analysis.knockoutRounds.length}</span>
          <button class="round-nav-button" type="button" data-round-shift="1" data-target-round="knockout" ${currentRoundNumber >= analysis.knockoutRounds.length ? "disabled" : ""}>Nächste</button>
        </div>
        <div class="knockout-round-focus">
          <h4>${escapeHtml(currentRound?.roundName || "KO-Runde")}</h4>
          <div class="knockout-match-grid">
            ${(currentRound?.pairings ?? []).map(renderKnockoutMatchCard).join("")}
          </div>
        </div>
      ` : ""}
      ${analysis.placementMatches.length > 0 ? `
        <div class="knockout-round-focus placement-round-focus">
          <h4>Platzierungsspiel</h4>
          <div class="knockout-match-grid">
            ${analysis.placementMatches.map(renderKnockoutMatchCard).join("")}
          </div>
        </div>
      ` : ""}
      <div class="knockout-round-grid">
        ${analysis.knockoutRounds.map((round) => renderKnockoutRoundCard(round, round.roundNumber === currentRoundNumber)).join("")}
      </div>
    `;
  }

  function renderKnockoutRoundCard(round, isActive) {
    const status = getRoundStatus(round);
    return `
      <article class="round-card knockout-round-card ${isActive ? "is-active-round" : ""}">
        <div class="round-card-header">
          <h4>${escapeHtml(round.roundName)}</h4>
          <span class="round-status-badge ${status.className}">${escapeHtml(status.label)}</span>
        </div>
        <div class="knockout-match-stack">
          ${round.pairings.map(renderKnockoutMatchSummary).join("")}
        </div>
      </article>
    `;
  }

  function renderKnockoutMatchSummary(match) {
    return `
      <div class="round-pairing ${match.isComplete ? "is-complete" : ""}">
        <span>${escapeHtml(match.playerA)} - ${escapeHtml(match.playerB)}</span>
        <strong>${match.isBye ? "Freilos" : match.score || "offen"}</strong>
      </div>
    `;
  }

  function renderKnockoutMatchCard(match) {
    const disabled = !match.isPlayable;
    const helper = match.isBye
      ? "Freilos - automatisch weiter"
      : match.isReady
        ? "Ergebnis eintragen"
        : "Wartet auf vorherige Spiele";

    return `
      <article class="knockout-match-card ${match.isComplete ? "is-complete" : ""}">
        <div>
          <strong>${escapeHtml(match.playerA)} - ${escapeHtml(match.playerB)}</strong>
          <span>${escapeHtml(helper)}</span>
        </div>
        ${renderNormalResultControlStack(match.id, match.score || "", "", "compact-select", false, "knockout", disabled)}
      </article>
    `;
  }

  function renderFinalStandingsTable(standings) {
    return `
      <table class="stats-table">
        <thead>
          <tr>
            <th>Platz</th>
            <th>Teilnehmer</th>
            <th>Qualifikation</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((player) => `
            <tr class="${placeClass(player.place)}">
              <td>${player.place}</td>
              <td>${escapeHtml(player.name)}</td>
              <td>${escapeHtml(player.seedLabel || player.groupName)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderScheduleSection() {
    const schedule = analysis.schedule;
    if (!schedule) {
      return "";
    }

    return [
      "      <section class=\"table-card schedule-card\">",
      "        <details class=\"details-toggle schedule-toggle\">",
      "          <summary>Spielplan anzeigen (" + schedule.completedMatches + "/" + schedule.totalMatches + " gespielt)</summary>",
      "          <div class=\"details-toggle-body schedule-toggle-body\">",
      "            <div class=\"schedule-meta-row\">",
      "              <span>Start " + escapeHtml(schedule.startTime) + "</span>",
      "              <span>Ende ca. " + escapeHtml(schedule.endTime) + "</span>",
      "              <span>" + schedule.config.fieldCount + " Tisch" + (schedule.config.fieldCount === 1 ? "" : "e") + "</span>",
      "              <span>" + schedule.config.matchDurationMinutes + " Min. + " + schedule.config.breakMinutes + " Min. Puffer</span>",
      "            </div>",
      "            <div class=\"table-wrapper\">",
      renderScheduleTable(schedule),
      "            </div>",
      renderCompactScheduleList(schedule),
      "          </div>",
      "        </details>",
      "      </section>"
    ].join("");
  }

  function renderScheduleTable(schedule) {
    if (schedule.matches.length === 0) {
      return "<p class=\"muted-text\">Noch keine Spiele im Plan.</p>";
    }

    const rows = schedule.matches
      .map((match) => [
        "                <tr class=\"" + (match.status === "gespielt" ? "is-complete" : "") + "\">",
        "                  <td>" + escapeHtml(match.plannedTime) + "</td>",
        "                  <td>" + escapeHtml(match.fieldName) + "</td>",
        "                  <td>" + escapeHtml(match.roundLabel) + "</td>",
        "                  <td><span class=\"schedule-match-type\">" + escapeHtml(match.matchType) + "</span> " + escapeHtml(match.matchLabel) + "</td>",
        "                  <td><span class=\"round-status-badge " + (match.status === "gespielt" ? "is-complete" : "is-pending") + "\">" + escapeHtml(match.status) + "</span></td>",
        "                </tr>"
      ].join(""))
      .join("");

    return [
      "      <table class=\"stats-table schedule-table\">",
      "        <thead>",
      "          <tr>",
      "            <th>Uhrzeit</th>",
      "            <th>Tisch</th>",
      "            <th>Runde</th>",
      "            <th>Begegnung</th>",
      "            <th>Status</th>",
      "          </tr>",
      "        </thead>",
      "        <tbody>",
      rows,
      "        </tbody>",
      "      </table>"
    ].join("");
  }

  function renderCompactScheduleList(schedule) {
    if (schedule.matches.length === 0) {
      return "<p class=\"compact-schedule-empty muted-text\">Noch keine Spiele im Plan.</p>";
    }

    const rows = schedule.matches
      .map((match) => {
        const statusClass = match.status === "gespielt" ? "is-complete" : "is-pending";
        return `
          <article class="compact-schedule-row ${match.status === "gespielt" ? "is-complete" : ""}">
            <div class="compact-schedule-time">
              <strong>${escapeHtml(match.plannedTime)}</strong>
              <span>${escapeHtml(match.fieldName)}</span>
            </div>
            <div class="compact-schedule-main">
              <div class="compact-schedule-meta">
                <span>${escapeHtml(match.roundLabel)}</span>
                <span class="schedule-match-type">${escapeHtml(match.matchType)}</span>
              </div>
              <strong>${escapeHtml(match.matchLabel)}</strong>
            </div>
            <span class="round-status-badge ${statusClass}">${escapeHtml(match.status)}</span>
          </article>
        `;
      })
      .join("");

    return `<div class="compact-schedule-list" aria-label="Kompakter Spielplan">${rows}</div>`;
  }

  function renderDoubleMatchEntry(entry) {
    const helperText =
      entry.teamADouble && entry.teamBDouble
        ? "Paarung wählen und Ergebnis eintragen."
        : "Bitte für diese Runde auf beiden Seiten ein Doppel auswählen.";

    return `
      <div class="double-match-row ${entry.score ? "is-complete" : ""}">
        <div class="double-match-copy">
          <strong>Doppel ${entry.pairingNumber}</strong>
          <span>${helperText}</span>
        </div>
        <div class="double-match-controls">
          <label>
            <span>${escapeHtml(analysis.teamAName)}</span>
            ${renderDoubleAssignmentSelect("teamA", entry)}
          </label>
          <label>
            <span>${escapeHtml(analysis.teamBName)}</span>
            ${renderDoubleAssignmentSelect("teamB", entry)}
          </label>
          <label>
            <span>Ergebnis</span>
            ${renderNormalResultControlStack(entry.id, entry.score || "", entry.matchStatus, "compact-select", false, "double", !entry.isComplete)}
          </label>
        </div>
      </div>
    `;
  }

  function renderDoubleRoundEntries(round) {
    if (!round) {
      return "<p>Keine Doppelrunde verfügbar.</p>";
    }

    return round.pairings.map((entry) => renderDoubleMatchEntry(entry)).join("");
  }

  function renderDoubleAssignmentSelect(side, entry) {
    const isTeamA = side === "teamA";
    const selectedId = isTeamA ? entry.teamADoubleId : entry.teamBDoubleId;
    const options = analysis.doubles
      .map((entry) => {
        const label = isTeamA ? entry.teamALabel : entry.teamBLabel;
        return {
          id: entry.id,
          label: label || `Doppel ${entry.order} unvollständig`,
          order: entry.order
        };
      })
      .filter((entry) => entry.id);
    const action = isTeamA ? "doubleRoundPairTeamA" : "doubleRoundPairTeamB";

    return `
      <select
        class="score-select compact-select double-assignment-select"
        data-sheet-action="${action}"
        data-double-pairing-id="${entry.id}"
        ${entry.manual ? "" : "disabled"}
      >
        <option value="" ${selectedId ? "" : "selected"}>Doppel wählen</option>
        ${options
          .map(
            (option) => `
              <option
                value="${option.id}"
                ${option.id === selectedId ? "selected" : ""}
              >
                Doppel ${option.order}: ${escapeHtml(option.label)}
              </option>
            `
          )
          .join("")}
      </select>
    `;
  }

  function renderRoundOverviewToggle(rounds, currentRoundNumber, summaryLabel) {
    const completedRounds = rounds.filter((round) => getRoundStatus(round).isComplete).length;
    return `
      <details class="round-overview-toggle">
        <summary>${escapeHtml(summaryLabel)} (${completedRounds}/${rounds.length} fertig)</summary>
        <div class="round-overview-body">
          <div class="round-plan-grid">
            ${rounds
              .map((round) => renderRoundCard(round, round.roundNumber === currentRoundNumber))
              .join("")}
          </div>
        </div>
      </details>
    `;
  }

  function renderCompactBalance(label, leftValue, rightValue) {
    return `<span>${escapeHtml(label)}: ${leftValue}/${rightValue}</span>`;
  }

  function renderPlayerStatsFontControls() {
    const currentIndex = PLAYER_STATS_FONT_SIZES.indexOf(playerStatsFontSize);

    return `
      <div class="font-size-toolbar" aria-label="Schriftgröße der detaillierten Spielerstatistik">
        <span class="font-size-toolbar-label">Schrift</span>
        <div class="font-size-button-row">
          <button class="font-size-button" type="button" data-font-size-step="-1" aria-label="Schrift kleiner" ${currentIndex <= 0 ? "disabled" : ""}>-</button>
          <button class="font-size-button" type="button" data-font-size-step="1" aria-label="Schrift größer" ${currentIndex >= PLAYER_STATS_FONT_SIZES.length - 1 ? "disabled" : ""}>+</button>
        </div>
      </div>
    `;
  }

  function renderRoundRobinRankingTable(ranking) {
    if (isFixedSetMatchMode(analysis.matchMode)) {
      return `
        <table class="stats-table">
          <thead>
            <tr>
              <th>Platz</th>
              <th>Spieler</th>
              <th>Punkte</th>
              <th>Satzbilanz</th>
              <th>Differenz</th>
            </tr>
          </thead>
          <tbody>
            ${ranking
              .map(
                (player) => `
                  <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                    <td>${player.place}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${player.points}</td>
                    <td>${player.setsWon}/${player.setsLost}</td>
                    <td>${player.setDiff}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    return `
      <table class="stats-table">
        <thead>
          <tr>
            <th>Platz</th>
            <th>Spieler</th>
            <th>Punkte</th>
            <th>Bilanz</th>
            <th>Saetze +</th>
            <th>Saetze -</th>
            <th>Differenz</th>
          </tr>
        </thead>
        <tbody>
          ${ranking
            .map(
              (player) => `
                <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                  <td>${player.place}</td>
                  <td>${escapeHtml(player.name)}</td>
                  <td>${player.points}</td>
                  <td>${player.wins}/${player.losses}</td>
                  <td>${player.setsWon}</td>
                  <td>${player.setsLost}</td>
                  <td>${player.setDiff}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderTeamRankingTable(playerRanking) {
    if (analysis.teamSummary.hasDoubles && isFixedSetMatchMode(analysis.matchMode)) {
      return `
        <table class="stats-table">
          <thead>
            <tr>
              <th>Platz</th>
              <th>Spieler</th>
              <th>Team</th>
              <th>Spielbilanz</th>
              <th>Einzel</th>
              <th>Doppel</th>
              <th>Satzbilanz</th>
              <th>Differenz</th>
            </tr>
          </thead>
          <tbody>
            ${playerRanking
              .map(
                (player) => `
                  <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                    <td>${player.place}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${escapeHtml(player.team)}</td>
                    <td>${player.matchesWon}/${player.matchesLost}</td>
                    <td>${player.singlesWon}/${player.singlesLost}</td>
                    <td>${player.doublesWon}/${player.doublesLost}</td>
                    <td>${player.setsWon}/${player.setsLost}</td>
                    <td>${player.setDiff}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (isFixedSetMatchMode(analysis.matchMode)) {
      return `
        <table class="stats-table">
          <thead>
            <tr>
              <th>Platz</th>
              <th>Spieler</th>
              <th>Team</th>
              <th>Satzbilanz</th>
              <th>Differenz</th>
            </tr>
          </thead>
          <tbody>
            ${playerRanking
              .map(
                (player) => `
                  <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                    <td>${player.place}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${escapeHtml(player.team)}</td>
                    <td>${player.setsWon}/${player.setsLost}</td>
                    <td>${player.setDiff}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (analysis.teamSummary.hasDoubles) {
      return `
        <table class="stats-table">
          <thead>
            <tr>
              <th>Platz</th>
              <th>Spieler</th>
              <th>Team</th>
              <th>Spielbilanz</th>
              <th>Einzel</th>
              <th>Doppel</th>
              <th>Saetze +</th>
              <th>Saetze -</th>
              <th>Differenz</th>
            </tr>
          </thead>
          <tbody>
            ${playerRanking
              .map(
                (player) => `
                  <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                    <td>${player.place}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${escapeHtml(player.team)}</td>
                    <td>${player.matchesWon}/${player.matchesLost}</td>
                    <td>${player.singlesWon}/${player.singlesLost}</td>
                    <td>${player.doublesWon}/${player.doublesLost}</td>
                    <td>${player.setsWon}</td>
                    <td>${player.setsLost}</td>
                    <td>${player.setDiff}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    return `
      <table class="stats-table">
        <thead>
          <tr>
            <th>Platz</th>
            <th>Spieler</th>
            <th>Team</th>
            <th>Einzelbilanz</th>
            <th>Saetze +</th>
            <th>Saetze -</th>
            <th>Differenz</th>
          </tr>
        </thead>
        <tbody>
          ${playerRanking
              .map(
                (player) => `
                  <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                    <td>${player.place}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${escapeHtml(player.team)}</td>
                    <td>${player.matchesWon}/${player.matchesLost}</td>
                    <td>${player.setsWon}</td>
                    <td>${player.setsLost}</td>
                    <td>${player.setDiff}</td>
                  </tr>
                `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function getPlayerStatsFontSizeClass() {
    return `is-font-${playerStatsFontSize}`;
  }

  function applyPlayerStatsFontSizeUI() {
    tournamentSheet.querySelectorAll("[data-font-size-target='playerStats']").forEach((element) => {
      element.classList.remove("is-font-small", "is-font-medium", "is-font-large");
      element.classList.add(getPlayerStatsFontSizeClass());
    });

    const currentIndex = PLAYER_STATS_FONT_SIZES.indexOf(playerStatsFontSize);
    tournamentSheet.querySelectorAll("[data-font-size-step]").forEach((button) => {
      const step = Number(button.dataset.fontSizeStep);
      button.disabled =
        (step < 0 && currentIndex <= 0) ||
        (step > 0 && currentIndex >= PLAYER_STATS_FONT_SIZES.length - 1);
    });
  }

  function renderPlayerMatchName(name, status) {
    const normalizedStatus = PLAYER_STATUSES[status] ? status : "active";
    const statusBadge = normalizedStatus === "active"
      ? ""
      : `<span class="player-status-badge is-${normalizedStatus}">${escapeHtml(getPlayerStatusLabel(normalizedStatus))}</span>`;

    return `<span class="player-name-with-status ${normalizedStatus === "withdrawn" ? "is-withdrawn" : ""}">${escapeHtml(name)}${statusBadge}</span>`;
  }

  function renderMatchResultControls(
    key,
    selectedValue,
    selectedStatus = "normal",
    extraClass = "",
    reverseForDisplay = false,
    resultScope = "",
    isDisabled = false
  ) {
    const normalizedStatus = MATCH_STATUSES[selectedStatus] ? selectedStatus : "normal";
    const statusLabel = getMatchStatusLabel(normalizedStatus);
    const anomalyDetails = [
      `<details class="match-anomaly-control ${normalizedStatus !== "normal" ? "is-active" : ""}" ${normalizedStatus !== "normal" ? "open" : ""}>`,
      '<summary class="match-anomaly-trigger" title="Sonderstatus setzen" aria-label="Sonderstatus setzen">!</summary>',
      '<div class="match-anomaly-panel">',
      renderMatchStatusSelect(key, normalizedStatus, reverseForDisplay, resultScope, isDisabled),
      "</div>",
      "</details>"
    ].join("");

    return [
      '<div class="match-result-controls">',
      renderQuickResultField(key, selectedValue, extraClass, reverseForDisplay, resultScope, isDisabled),
      anomalyDetails,
      normalizedStatus !== "normal"
        ? `<span class="match-status-chip">${escapeHtml(statusLabel)}</span>`
        : "",
      "</div>"
    ].join("");
  }

  function renderMatchStatusSelect(
    key,
    selectedStatus = "normal",
    reverseForDisplay = false,
    resultScope = "",
    isDisabled = false
  ) {
    const normalizedStatus = MATCH_STATUSES[selectedStatus] ? selectedStatus : "normal";
    const options = MATCH_STATUS_ORDER.map((statusId) =>
      "<option value=\"" + statusId + "\" " + (normalizedStatus === statusId ? "selected" : "") + ">" + escapeHtml(MATCH_STATUSES[statusId].label) + "<\/option>"
    ).join("");

    return [
      "<select class=\"match-status-select\" data-match-status-key=\"" + key + "\" data-match-status-reverse=\"" + (reverseForDisplay ? "true" : "false") + "\" data-match-status-scope=\"" + resultScope + "\" " + (isDisabled ? "disabled" : "") + ">",
      options,
      "<\/select>"
    ].join("");
  }

  function renderScoreSelect(
    key,
    selectedValue,
    extraClass = "",
    reverseForDisplay = false,
    resultScope = "",
    isDisabled = false
  ) {
    const modeScores = resultScope === "knockout"
      ? getValidScoresForMode(activeTournament.matchMode).filter((score) => {
          const [left, right] = score.split(":").map(Number);
          return left !== right;
        })
      : getValidScoresForMode(activeTournament.matchMode);
    const hasLegacySelectedValue =
      selectedValue && VALID_SCORES.includes(selectedValue) && !isScoreCompatibleWithMode(selectedValue, activeTournament.matchMode);

    return `
      <select
        class="score-select ${extraClass}"
        data-result-key="${key}"
        data-result-reverse="${reverseForDisplay ? "true" : "false"}"
        data-result-scope="${resultScope}"
        ${isDisabled ? "disabled" : ""}
      >
        <option value="">-</option>
        ${
          hasLegacySelectedValue
            ? `<option value="${selectedValue}" selected>${selectedValue}</option>`
            : ""
        }
        ${modeScores.map(
          (score) => `
            <option value="${score}" ${selectedValue === score ? "selected" : ""}>${score}</option>
          `
        ).join("")}
      </select>
    `;
  }

  function getSportPreset(presetId) {
    return SPORT_PRESETS.find((preset) => preset.id === presetId) || SPORT_PRESETS[0];
  }

  function getDefaultTournamentName(preset) {
    return `${preset.sport}-Turnier`;
  }

  function createWizardState(presetId = SPORT_PRESETS[0].id) {
    const preset = getSportPreset(presetId);
    return {
      step: 0,
      presetId: preset.id,
      sport: preset.sport,
      tournamentName: getDefaultTournamentName(preset),
      isNameCustom: false,
      format: preset.format,
      playerCount: preset.playerCount,
      playerNames: Array.from({ length: preset.playerCount }, (_, index) => `Spieler ${index + 1}`),
      teamAName: "Team A",
      teamBName: "Team B",
      teamACount: preset.teamACount,
      teamBCount: preset.teamBCount,
      groupCount: 2,
      qualifiersPerGroup: 2,
      placementMatchesEnabled: true,
      matchMode: preset.matchMode
    };
  }

  function applyWizardPreset(presetId) {
    const previousPreset = getSportPreset(tournamentWizardState.presetId);
    const nextPreset = getSportPreset(presetId);
    const shouldReplaceName =
      !tournamentWizardState.isNameCustom ||
      tournamentWizardState.tournamentName === getDefaultTournamentName(previousPreset);

    tournamentWizardState = {
      ...tournamentWizardState,
      presetId: nextPreset.id,
      sport: nextPreset.sport,
      tournamentName: shouldReplaceName
        ? getDefaultTournamentName(nextPreset)
        : tournamentWizardState.tournamentName,
      isNameCustom: shouldReplaceName ? false : tournamentWizardState.isNameCustom,
      format: nextPreset.format,
      playerCount: nextPreset.playerCount,
      playerNames: Array.from({ length: nextPreset.playerCount }, (_, index) => `Spieler ${index + 1}`),
      teamACount: nextPreset.teamACount,
      teamBCount: nextPreset.teamBCount,
      groupCount: 2,
      qualifiersPerGroup: 2,
      placementMatchesEnabled: true,
      matchMode: nextPreset.matchMode
    };
  }

  function handleOpenTournamentWizard() {
    tournamentWizardState = createWizardState();
    renderTournamentWizard();
    tournamentWizardDialog.showModal();
    tournamentWizardContent.querySelector(".wizard-body input, .wizard-body select, .wizard-body button")?.focus();
  }

  function handleTournamentWizardBackdropClick(event) {
    if (event.target === tournamentWizardDialog) {
      tournamentWizardDialog.close();
    }
  }

  function handleTournamentWizardClick(event) {
    const closeButton = event.target.closest("[data-wizard-close]");
    if (closeButton) {
      tournamentWizardDialog.close();
      return;
    }

    const formatButton = event.target.closest("[data-wizard-format]");
    if (formatButton && !formatButton.disabled) {
      const currentDefaultName = tournamentWizardState.format === "ttRace"
        ? BTTV_TT_RACE_NAME
        : getDefaultTournamentName(getSportPreset(tournamentWizardState.presetId));
      const nextFormat = ["team", "groupsKnockout", "ttRace"].includes(formatButton.dataset.wizardFormat)
        ? formatButton.dataset.wizardFormat
        : "roundRobin";
      const shouldReplaceName =
        !tournamentWizardState.isNameCustom || tournamentWizardState.tournamentName === currentDefaultName;

      tournamentWizardState.format = nextFormat;
      if (shouldReplaceName) {
        tournamentWizardState.tournamentName = nextFormat === "ttRace"
          ? BTTV_TT_RACE_NAME
          : getDefaultTournamentName(getSportPreset(tournamentWizardState.presetId));
        tournamentWizardState.isNameCustom = false;
      }
      renderTournamentWizard();
      return;
    }

    const gotoButton = event.target.closest("[data-wizard-goto]");
    if (gotoButton) {
      tournamentWizardState.step = clampPositiveInteger(
        Number(gotoButton.dataset.wizardGoto),
        0,
        TOURNAMENT_WIZARD_STEPS.length - 1
      );
      renderTournamentWizard();
      return;
    }

    const stepButton = event.target.closest("[data-wizard-step-shift]");
    if (stepButton) {
      const shift = Number.parseInt(stepButton.dataset.wizardStepShift, 10);
      tournamentWizardState.step = clampPositiveInteger(
        tournamentWizardState.step + shift,
        0,
        TOURNAMENT_WIZARD_STEPS.length - 1
      );
      renderTournamentWizard();
      return;
    }

    const createButton = event.target.closest("[data-wizard-create]");
    if (createButton) {
      handleCreateTournamentFromWizard();
    }
  }

  function handleTournamentWizardInput(event) {
    const field = event.target.dataset.wizardField;
    if (!field || !tournamentWizardState) {
      return;
    }

    switch (field) {
      case "tournamentName":
        tournamentWizardState.tournamentName = event.target.value;
        tournamentWizardState.isNameCustom = true;
        break;
      case "sportPreset":
        applyWizardPreset(event.target.value);
        renderTournamentWizard();
        break;
      case "playerCount":
        tournamentWizardState.playerCount = tournamentWizardState.format === "groupsKnockout"
          ? clampCount(event.target.value, 4, 100)
          : clampCount(event.target.value);
        if (event.type === "change") {
          clearTimeout(tournamentWizardPlayerCountRenderTimer);
          renderTournamentWizard();
        } else {
          clearTimeout(tournamentWizardPlayerCountRenderTimer);
          tournamentWizardPlayerCountRenderTimer = setTimeout(renderTournamentWizard, 250);
        }
        break;
      case "playerName":
        tournamentWizardState.playerNames[Number(event.target.dataset.index)] = event.target.value;
        break;
      case "teamAName":
        tournamentWizardState.teamAName = event.target.value;
        break;
      case "teamBName":
        tournamentWizardState.teamBName = event.target.value;
        break;
      case "teamACount":
        tournamentWizardState.teamACount = clampCount(event.target.value);
        break;
      case "teamBCount":
        tournamentWizardState.teamBCount = clampCount(event.target.value);
        break;
      case "groupCount":
        tournamentWizardState.groupCount = clampPositiveInteger(event.target.value, 2, 8);
        break;
      case "qualifiersPerGroup":
        tournamentWizardState.qualifiersPerGroup = clampPositiveInteger(event.target.value, 1, 10);
        break;
      case "placementMatchesEnabled":
        tournamentWizardState.placementMatchesEnabled = Boolean(event.target.checked);
        break;
      case "matchMode":
        tournamentWizardState.matchMode = event.target.value;
        break;
      default:
        break;
    }
  }

  /** Jeder Schritt stellt eine Frage; der Kicker zählt die Schritte. */
  const WIZARD_QUESTIONS = ["Welches Format?", "Woher kommen die Teilnehmer?", "Wie wird gespielt?", "Passt das so?"];

  function renderTournamentWizard() {
    const step = tournamentWizardState.step;
    const formatLabel = WIZARD_FORMATS.find((format) => format.id === tournamentWizardState.format)?.label || "";
    const kicker = step > 0 && formatLabel
      ? `Schritt ${step + 1} von ${TOURNAMENT_WIZARD_STEPS.length} · ${formatLabel}`
      : `Schritt ${step + 1} von ${TOURNAMENT_WIZARD_STEPS.length}`;

    tournamentWizardContent.innerHTML = `
      <div class="wizard-header">
        <div>
          <p class="kicker">${escapeHtml(kicker)}</p>
          <h2 id="wizardTitle">${escapeHtml(WIZARD_QUESTIONS[step] || TOURNAMENT_WIZARD_STEPS[step])}</h2>
        </div>
        <button class="wizard-close" type="button" data-wizard-close aria-label="Assistent schließen" title="Schließen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12" /><path d="M18 6L6 18" />
          </svg>
        </button>
      </div>
      ${renderTournamentWizardProgress(step)}
      <div class="wizard-body">
        ${renderTournamentWizardStep(step)}
      </div>
      ${renderTournamentWizardFooter(step)}
    `;
  }

  function renderTournamentWizardProgress(activeStep) {
    return `
      <ol class="wizard-progress" aria-label="Fortschritt im Assistenten">
        ${TOURNAMENT_WIZARD_STEPS.map(
          (label, index) => `
            <li class="wizard-progress-item ${index <= activeStep ? "is-reached" : ""}">
              ${index + 1} ${escapeHtml(label)}
            </li>
          `
        ).join("")}
      </ol>
    `;
  }

  function renderTournamentWizardStep(step) {
    if (step === 0) {
      return renderTournamentWizardFormatStep();
    }
    if (step === 1) {
      return renderTournamentWizardParticipantsStep();
    }
    if (step === 2) {
      return renderTournamentWizardMatchStep();
    }
    return renderTournamentWizardSummaryStep();
  }

  /** Format als Zeilenliste, darunter der freiwillige Turniername. */
  function renderTournamentWizardFormatStep() {
    return `
      <div class="wizard-format-list">
        ${WIZARD_FORMATS.map(
          (format) => `
            <button
              class="wizard-format-row ${tournamentWizardState.format === format.id ? "is-active" : ""}"
              type="button"
              data-wizard-format="${format.id}"
              ${format.available ? "" : "disabled"}
            >
              <span class="wizard-format-dot" aria-hidden="true"></span>
              <span class="wizard-format-text">
                <span class="wizard-format-title">${escapeHtml(format.label)}</span>
                <span class="wizard-format-description">${escapeHtml(format.description)}</span>
              </span>
              <span class="tag ${
                !format.available ? "tag-plain" : format.official ? "tag-accent" : "tag-neutral"
              }">${!format.available ? "noch nicht" : format.official ? "offiziell" : "privat"}</span>
            </button>
          `
        ).join("")}
      </div>

      <div class="wizard-name-field">
        <label for="wizardTournamentName">Turniername</label>
        <div class="wizard-name-input">
          <input
            id="wizardTournamentName"
            data-wizard-field="tournamentName"
            type="text"
            value="${escapeHtml(tournamentWizardState.tournamentName)}"
            placeholder="z. B. Vereinsabend, Stadtmeisterschaft"
          />
          <p class="wizard-name-note">Wird eine click-TT XML geladen, ersetzt ihr offizieller Name diesen Eintrag.</p>
        </div>
      </div>
    `;
  }

  function renderTournamentWizardParticipantsStep() {
    // Zwei gleichwertige Wege, keiner blockiert das Anlegen.
    if (tournamentWizardState.format === "ttRace") {
      return `
        <div class="wizard-path-list">
          <div class="wizard-path">
            <strong>Aus click-TT übernehmen</strong>
            <span>Namen, IDs, Vereine und TTR-Werte kommen aus der XML. Voraussetzung für den Ergebnis-Export ins Portal.</span>
          </div>
          <div class="wizard-path">
            <strong>Selbst eintragen</strong>
            <span>Teilnehmer im Reiter anlegen. Der Export bleibt dann eine Vorschau.</span>
          </div>
        </div>
        <p class="wizard-name-note">Beides lässt sich nach dem Erstellen im TT-Race-Reiter wählen.</p>
      `;
    }

    if (tournamentWizardState.format === "team") {
      return `
        <div class="wizard-field-grid two-columns">
          <label>
            <span>Teamname A</span>
            <input data-wizard-field="teamAName" type="text" value="${escapeHtml(tournamentWizardState.teamAName)}" placeholder="Team A" />
          </label>
          <label>
            <span>Teamgröße A</span>
            <input data-wizard-field="teamACount" type="number" min="2" max="100" value="${tournamentWizardState.teamACount}" />
          </label>
          <label>
            <span>Teamname B</span>
            <input data-wizard-field="teamBName" type="text" value="${escapeHtml(tournamentWizardState.teamBName)}" placeholder="Team B" />
          </label>
          <label>
            <span>Teamgröße B</span>
            <input data-wizard-field="teamBCount" type="number" min="2" max="100" value="${tournamentWizardState.teamBCount}" />
          </label>
        </div>
      `;
    }

    if (tournamentWizardState.format === "groupsKnockout") {
      const names = ensureLength(
        tournamentWizardState.playerNames,
        tournamentWizardState.playerCount,
        "Spieler"
      );

      return `
        <div class="wizard-participant-step">
          <div class="wizard-field-grid two-columns">
            <label>
              <span>Anzahl der Teilnehmer</span>
              <input data-wizard-field="playerCount" type="number" min="4" max="100" value="${tournamentWizardState.playerCount}" />
            </label>
            <label>
              <span>Gruppen</span>
              <input data-wizard-field="groupCount" type="number" min="2" max="8" value="${tournamentWizardState.groupCount}" />
            </label>
            <label>
              <span>Qualifikanten je Gruppe</span>
              <input data-wizard-field="qualifiersPerGroup" type="number" min="1" max="10" value="${tournamentWizardState.qualifiersPerGroup}" />
            </label>
            <label class="wizard-checkbox-field">
              <input data-wizard-field="placementMatchesEnabled" type="checkbox" ${tournamentWizardState.placementMatchesEnabled ? "checked" : ""} />
              <span>Spiel um Platz 3</span>
            </label>
          </div>
          ${renderTournamentWizardPlayerNameGrid(names)}
        </div>
      `;
    }

    const names = ensureLength(
      tournamentWizardState.playerNames,
      tournamentWizardState.playerCount,
      "Spieler"
    );

    return `
      <div class="wizard-participant-step">
        <div class="wizard-field-grid">
          <label>
            <span>Anzahl der Teilnehmer</span>
            <input data-wizard-field="playerCount" type="number" min="2" max="100" value="${tournamentWizardState.playerCount}" />
          </label>
        </div>
        ${renderTournamentWizardPlayerNameGrid(names)}
      </div>
    `;
  }

  function renderTournamentWizardPlayerNameGrid(names) {
    return `
      <section class="wizard-player-names">
        <div class="section-heading compact">
          <div>
            <h3>Teilnehmer</h3>
            <p>Du kannst die Namen jetzt eintragen oder später in der Eingabemaske ergänzen.</p>
          </div>
        </div>
        <div class="wizard-player-name-grid">
          ${names
            .map(
              (name, index) => `
                <label>
                  <span>Teilnehmer ${index + 1}</span>
                  <input data-wizard-field="playerName" data-index="${index}" type="text" value="${escapeHtml(name)}" placeholder="Spieler ${index + 1}" />
                </label>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderTournamentWizardMatchStep() {
    if (tournamentWizardState.format === "ttRace") {
      return `
        <div class="wizard-info-panel">
          <strong>BTTV Bavarian TT-Race</strong>
          <span>Voreingestellt sind 3 Gewinnsaetze, TTR-Auslosung, 6 Schweizer Runden und 9 bis 16 aktive Teilnehmer.</span>
        </div>
      `;
    }

    return `
      <div class="wizard-field-grid">
        <label>
          <span>Satz-/Matchmodus</span>
          <select data-wizard-field="matchMode">
            ${MATCH_MODE_ORDER.map(
              (modeId) => `
                <option value="${modeId}" ${tournamentWizardState.matchMode === modeId ? "selected" : ""}>
                  ${escapeHtml(MATCH_MODES[modeId].label)}
                </option>
              `
            ).join("")}
          </select>
        </label>
      </div>
    `;
  }

  /** Zeilen mit ändern-Link je Angabe; feste Werte tragen keinen Link. */
  function renderTournamentWizardSummaryStep() {
    return `
      <div class="wizard-summary">
        ${getTournamentWizardSummary()
          .map(
            (entry) => `
              <div class="wizard-summary-row">
                <span class="wizard-summary-label">${escapeHtml(entry.label)}</span>
                <span class="wizard-summary-value">
                  ${escapeHtml(entry.value)}
                  ${entry.note ? `<span class="wizard-summary-note">${escapeHtml(entry.note)}</span>` : ""}
                </span>
                ${
                  Number.isInteger(entry.step)
                    ? `<button class="link-button wizard-summary-change" type="button" data-wizard-goto="${entry.step}">ändern</button>`
                    : '<span class="wizard-summary-fixed">fest</span>'
                }
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderTournamentWizardFooter(step) {
    const isLastStep = step === TOURNAMENT_WIZARD_STEPS.length - 1;
    return `
      <div class="wizard-footer">
        <button class="link-button" type="button" data-wizard-close>Abbrechen</button>
        <div class="wizard-footer-actions">
          ${step === 0 ? "" : '<button class="secondary-button" type="button" data-wizard-step-shift="-1">Zurück</button>'}
          ${
            isLastStep
              ? `<button class="primary-button" type="button" data-wizard-create>Turnier erstellen</button>`
              : `<button class="primary-button" type="button" data-wizard-step-shift="1">Weiter</button>`
          }
        </div>
      </div>
    `;
  }

  function getTournamentWizardSummary() {
    const formatLabel = WIZARD_FORMATS.find((format) => format.id === tournamentWizardState.format)?.label || "Jeder-gegen-jeden";
    const namedParticipants = getWizardNamedParticipantCount();
    const participantLabel =
      tournamentWizardState.format === "team"
        ? `${tournamentWizardState.teamAName || "Team A"} (${tournamentWizardState.teamACount}) gegen ${tournamentWizardState.teamBName || "Team B"} (${tournamentWizardState.teamBCount})`
        : tournamentWizardState.format === "ttRace"
          ? "Import aus click-TT XML"
          : tournamentWizardState.format === "groupsKnockout"
            ? `${tournamentWizardState.playerCount} Teilnehmer, ${namedParticipants} benannt, ${tournamentWizardState.groupCount} Gruppen, ${tournamentWizardState.qualifiersPerGroup} weiter`
            : `${tournamentWizardState.playerCount} Teilnehmer, ${namedParticipants} benannt`;
    const matchModeLabel = tournamentWizardState.format === "ttRace"
      ? "3 Gewinnsaetze, TTR-Auslosung, 6 Runden"
      : MATCH_MODES[tournamentWizardState.matchMode].label;

    const isRace = tournamentWizardState.format === "ttRace";

    return [
      { label: "Format", value: formatLabel, step: 0 },
      { label: "Name", value: getWizardTournamentName(), step: 0 },
      { label: "Teilnehmer", value: participantLabel, step: 1 },
      { label: "Spielmodus", value: matchModeLabel, step: isRace ? null : 2 }
    ];
  }

  function getWizardNamedParticipantCount() {
    return ensureLength(tournamentWizardState.playerNames, tournamentWizardState.playerCount, "Spieler")
      .filter((name, index) => name.trim() && name.trim() !== `Spieler ${index + 1}`)
      .length;
  }

  function getWizardTournamentName() {
    const fallbackPreset = getSportPreset(tournamentWizardState.presetId);
    return tournamentWizardState.tournamentName.trim() || getDefaultTournamentName(fallbackPreset);
  }

  function buildTournamentStateFromWizard() {
    if (tournamentWizardState.format === "ttRace") {
      return createBttvTtRaceStarterState(getWizardTournamentName());
    }

    const mode = ["team", "groupsKnockout"].includes(tournamentWizardState.format)
      ? tournamentWizardState.format
      : "roundRobin";
    const state = createStateForMode(mode);
    const tournamentName = getWizardTournamentName();

    state.tabName = tournamentName;
    state.tournamentName = tournamentName;
    state.matchMode = MATCH_MODES[tournamentWizardState.matchMode]
      ? tournamentWizardState.matchMode
      : getSportPreset(tournamentWizardState.presetId).matchMode;

    if (mode === "team") {
      const teamACount = clampCount(tournamentWizardState.teamACount);
      const teamBCount = clampCount(tournamentWizardState.teamBCount);
      state.team.teamAName = tournamentWizardState.teamAName.trim() || "Team A";
      state.team.teamBName = tournamentWizardState.teamBName.trim() || "Team B";
      state.team.teamACount = teamACount;
      state.team.teamBCount = teamBCount;
      state.team.teamAPlayers = ensureLength([], teamACount, "Spieler A");
      state.team.teamBPlayers = ensureLength([], teamBCount, "Spieler B");
      state.team.currentRound = 1;
      return state;
    }

    if (mode === "groupsKnockout") {
      const playerCount = clampCount(tournamentWizardState.playerCount, 4, 100);
      state.groupsKnockout.playerCount = playerCount;
      state.groupsKnockout.groupCount = clampPositiveInteger(tournamentWizardState.groupCount, 2, 8);
      state.groupsKnockout.qualifiersPerGroup = clampPositiveInteger(tournamentWizardState.qualifiersPerGroup, 1, 10);
      state.groupsKnockout.placementMatchesEnabled = Boolean(tournamentWizardState.placementMatchesEnabled);
      state.groupsKnockout.playerNames = ensureLength(tournamentWizardState.playerNames, playerCount, "Spieler");
      state.groupsKnockout.currentGroupRound = 1;
      state.groupsKnockout.currentKnockoutRound = 1;
      return state;
    }

    const playerCount = clampCount(tournamentWizardState.playerCount);
    state.roundRobin.playerCount = playerCount;
    state.roundRobin.playerNames = ensureLength(tournamentWizardState.playerNames, playerCount, "Spieler");
    state.roundRobin.currentRound = 1;
    return state;
  }

  function handleCreateTournamentFromWizard() {
    const tournamentState = buildTournamentStateFromWizard();
    const selectedMode = tournamentState.mode;
    const isRace = Boolean(tournamentState.ttRace);
    activeWorkspaceView = "input";
    saveWorkspaceView();

    updateWorkspace((draft) => {
      const tournament = createTournamentRecord(tournamentState);
      draft.tournaments.push(tournament);
      draft.activeTournamentId = tournament.id;
    }, "Tischtennis-Turnier über Assistent angelegt");

    tournamentWizardDialog.close();
    showInfo(
      isRace
        ? `${getWizardTournamentName()} wurde angelegt. Importiere jetzt die click-TT Teilnehmer-XML.`
        : `${getWizardTournamentName()} wurde als Tischtennis-${MODES[selectedMode].label} angelegt.`
    );
  }

  function handleAddTournamentTab(modeId) {
    if (modeId === "ttRace") {
      activeWorkspaceView = "input";
      saveWorkspaceView();
      updateWorkspace((draft) => {
        const tournament = createTournamentRecord(createBttvTtRaceStarterState());
        draft.tournaments.push(tournament);
        draft.activeTournamentId = tournament.id;
      }, "Neuer BTTV TT-Race-Reiter angelegt");
      showInfo(`${BTTV_TT_RACE_NAME} wurde angelegt. Importiere jetzt die click-TT Teilnehmer-XML.`);
      return;
    }

    const selectedMode = ["team", "groupsKnockout"].includes(modeId) ? modeId : "roundRobin";
    updateWorkspace((draft) => {
      const tournament = createTournamentRecord(createStateForMode(selectedMode));
      draft.tournaments.push(tournament);
      draft.activeTournamentId = tournament.id;
    }, "Neuer Tischtennis-Reiter angelegt");
    showInfo(`Ein neuer Reiter für Tischtennis-${MODES[selectedMode].label} wurde angelegt.`);
  }

  function buildCopyLabel(label) {
    return `${label} Kopie`;
  }

  function handleDuplicateTournament() {
    const currentLabel = getTournamentLabel(activeTournament, getActiveTournamentIndex());
    duplicateTournamentText.textContent = `${currentLabel} als neuen Reiter anlegen?`;
    duplicateTournamentDialog.showModal();
  }

  function handleDuplicateTournamentDialogClick(event) {
    if (event.target === duplicateTournamentDialog || event.target.closest("[data-duplicate-cancel]")) {
      duplicateTournamentDialog.close();
      return;
    }

    const choiceButton = event.target.closest("[data-duplicate-choice]");
    if (!choiceButton) {
      return;
    }

    duplicateActiveTournament(choiceButton.dataset.duplicateChoice === "with-results");
    duplicateTournamentDialog.close();
  }

  function duplicateActiveTournament(includeResults) {
    const currentLabel = getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const duplicateState = createReusableTournamentState(activeTournament, includeResults);
    const duplicateLabel = buildCopyLabel(currentLabel);
    duplicateState.tabName = duplicateLabel;
    duplicateState.tournamentName = duplicateLabel;

    updateWorkspace((draft) => {
      const duplicate = createTournamentFromReusableState(duplicateState);
      draft.tournaments.push(duplicate);
      draft.activeTournamentId = duplicate.id;
    }, includeResults ? "Turnier mit Ergebnissen dupliziert" : "Turnier ohne Ergebnisse dupliziert");

    showInfo(
      includeResults
        ? `${currentLabel} wurde inklusive Ergebnissen dupliziert.`
        : `${currentLabel} wurde ohne Ergebnisse dupliziert.`
    );
  }

  function handleSaveTemplate() {
    const currentLabel = getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const suggestedName = activeTournament.tabName || activeTournament.tournamentName || currentLabel;
    const templateName = window.prompt("Name für die Vorlage:", suggestedName);

    if (templateName === null) {
      return;
    }

    const trimmedName = templateName.trim();
    if (!trimmedName) {
      showInfo("Die Vorlage braucht einen Namen.");
      return;
    }

    const includeResults = Boolean(templateIncludeResults.checked);
    const now = new Date().toISOString();
    const existingTemplate = tournamentTemplates.find(
      (template) => template.name.toLocaleLowerCase("de-DE") === trimmedName.toLocaleLowerCase("de-DE")
    );
    const nextTemplate = {
      id: existingTemplate?.id || createTemplateId(),
      name: trimmedName,
      createdAt: existingTemplate?.createdAt || now,
      updatedAt: now,
      includeResults,
      state: createReusableTournamentState(activeTournament, includeResults)
    };

    if (existingTemplate) {
      const shouldReplace = window.confirm(
        `Die Vorlage "${trimmedName}" existiert bereits. Überschreiben?`
      );

      if (!shouldReplace) {
        showInfo("Vorlage wurde nicht geändert.");
        return;
      }

      tournamentTemplates = tournamentTemplates.map((template) =>
        template.id === existingTemplate.id ? nextTemplate : template
      );
    } else {
      tournamentTemplates = [...tournamentTemplates, nextTemplate];
    }

    if (saveTournamentTemplates()) {
      renderTemplateControls();
      templateSelect.value = nextTemplate.id;
      showInfo(
        includeResults
          ? `Vorlage "${trimmedName}" wurde mit Ergebnissen gespeichert.`
          : `Vorlage "${trimmedName}" wurde ohne Ergebnisse gespeichert.`
      );
    }
  }

  function handleLoadTemplate() {
    const template = getSelectedTemplate();
    if (!template) {
      showInfo("Bitte zuerst eine Vorlage auswählen.");
      return;
    }

    const templateState = createReusableTournamentState(template.state, template.includeResults);
    templateState.tabName = template.name;
    if (!templateState.tournamentName) {
      templateState.tournamentName = template.name;
    }

    updateWorkspace((draft) => {
      const tournament = createTournamentFromReusableState(templateState);
      draft.tournaments.push(tournament);
      draft.activeTournamentId = tournament.id;
    }, "Vorlage als neues Turnier geladen");

    showInfo(
      template.includeResults
        ? `Vorlage "${template.name}" wurde inklusive Ergebnissen als neuer Reiter geladen.`
        : `Vorlage "${template.name}" wurde ohne Ergebnisse als neuer Reiter geladen.`
    );
  }

  function handleDeleteTemplate() {
    const template = getSelectedTemplate();
    if (!template) {
      showInfo("Bitte zuerst eine Vorlage auswählen.");
      return;
    }

    const shouldDelete = window.confirm(
      `Vorlage "${template.name}" wirklich löschen?\n\nGeöffnete Turniere bleiben unverändert.`
    );

    if (!shouldDelete) {
      showInfo("Vorlage wurde nicht gelöscht.");
      return;
    }

    tournamentTemplates = tournamentTemplates.filter((entry) => entry.id !== template.id);

    if (saveTournamentTemplates()) {
      renderTemplateControls();
      showInfo(`Vorlage "${template.name}" wurde gelöscht.`);
    }
  }

  function handleRenameTournamentTab(tournamentId) {
    const tournament = workspace.tournaments.find((entry) => entry.id === tournamentId);
    if (!tournament) {
      return;
    }

    const suggestedName = tournament.tabName || tournament.tournamentName || "";
    const nextName = window.prompt("Neuen Namen für diesen Reiter eingeben:", suggestedName);

    if (nextName === null) {
      return;
    }

    updateTournamentById(tournamentId, (draftTournament) => {
      const linkedName = nextName.trim();
      draftTournament.tabName = linkedName;
      draftTournament.tournamentName = linkedName;
    }, "Reitertitel aktualisiert");
  }

  function persistTournamentTabOrder(orderedTournamentIds) {
    if (!Array.isArray(orderedTournamentIds) || orderedTournamentIds.length !== workspace.tournaments.length) {
      return;
    }

    const currentOrder = workspace.tournaments.map((entry) => entry.id);
    if (JSON.stringify(currentOrder) === JSON.stringify(orderedTournamentIds)) {
      return;
    }

    updateWorkspace((draft) => {
      const rankById = new Map(orderedTournamentIds.map((id, index) => [id, index]));
      draft.tournaments.sort((left, right) => rankById.get(left.id) - rankById.get(right.id));
    }, "Turnier-Reiter neu angeordnet");
  }

  function handleTournamentTabPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const tournamentId = event.currentTarget.dataset.tabDrag;
    if (!tournamentId) {
      return;
    }

    const draggedShell = tabsElement.querySelector(`[data-tab-shell="${tournamentId}"]`);
    if (!draggedShell) {
      return;
    }

    event.preventDefault();

    const shellBounds = draggedShell.getBoundingClientRect();
    const placeholder = createTournamentTabPlaceholder(draggedShell, shellBounds);
    draggedShell.parentNode.insertBefore(placeholder, draggedShell);
    document.body.appendChild(draggedShell);

    draggedShell.classList.add("is-dragging");
    draggedShell.style.width = `${shellBounds.width}px`;
    draggedShell.style.height = `${shellBounds.height}px`;
    draggedShell.style.left = `${shellBounds.left}px`;
    draggedShell.style.top = `${shellBounds.top}px`;

    draggedTournamentState = {
      tournamentId,
      draggedShell,
      placeholder,
      offsetX: event.clientX - shellBounds.left,
      top: shellBounds.top,
      pointerId: event.pointerId
    };

    updateDraggedTournamentPosition(event.clientX);
    window.addEventListener("pointermove", handleTournamentTabPointerMove);
    window.addEventListener("pointerup", handleTournamentTabPointerUp);
    window.addEventListener("pointercancel", handleTournamentTabPointerUp);
  }

  function handleTournamentTabPointerMove(event) {
    if (!draggedTournamentState || event.pointerId !== draggedTournamentState.pointerId) {
      return;
    }

    autoScrollTournamentTabs(event.clientX);
    updateDraggedTournamentPosition(event.clientX);
    previewTournamentTabPlaceholder(event.clientX);
  }

  function handleTournamentTabPointerUp(event) {
    if (!draggedTournamentState || event.pointerId !== draggedTournamentState.pointerId) {
      return;
    }

    finishTournamentTabDrag();
  }

  function finishTournamentTabDrag() {
    if (!draggedTournamentState) {
      return;
    }

    const { draggedShell, placeholder } = draggedTournamentState;
    const nextOrder = getRenderedTournamentTabOrder();

    placeholder.parentNode.insertBefore(draggedShell, placeholder);
    restoreDraggedTournamentShell(draggedShell);
    placeholder.remove();

    draggedTournamentState = null;
    window.removeEventListener("pointermove", handleTournamentTabPointerMove);
    window.removeEventListener("pointerup", handleTournamentTabPointerUp);
    window.removeEventListener("pointercancel", handleTournamentTabPointerUp);

    persistTournamentTabOrder(nextOrder);
    renderTabs();
  }

  function createTournamentTabPlaceholder(draggedShell, shellBounds) {
    const placeholder = document.createElement("div");
    placeholder.className = `tab-chip-shell tab-chip-placeholder ${draggedShell.classList.contains("is-active") ? "is-active" : ""}`;
    placeholder.dataset.tabPlaceholder = draggedShell.dataset.tabShell;
    placeholder.innerHTML = `<div class="tab-chip tab-chip-placeholder-card" aria-hidden="true"></div>`;
    placeholder.style.width = `${shellBounds.width}px`;
    placeholder.style.height = `${shellBounds.height}px`;
    return placeholder;
  }

  function restoreDraggedTournamentShell(draggedShell) {
    draggedShell.classList.remove("is-dragging");
    draggedShell.style.width = "";
    draggedShell.style.height = "";
    draggedShell.style.left = "";
    draggedShell.style.top = "";
  }

  function updateDraggedTournamentPosition(pointerX) {
    if (!draggedTournamentState) {
      return;
    }

    const { draggedShell, offsetX, top } = draggedTournamentState;
    draggedShell.style.left = `${pointerX - offsetX}px`;
    draggedShell.style.top = `${top}px`;
  }

  function previewTournamentTabPlaceholder(pointerX) {
    if (!draggedTournamentState) {
      return;
    }

    const { placeholder } = draggedTournamentState;
    const tabShells = [...tabsElement.querySelectorAll("[data-tab-shell]")];
    const referenceNode = tabShells.find((shell) => {
      const bounds = shell.getBoundingClientRect();
      return pointerX < bounds.left + bounds.width / 2;
    }) || null;

    if (
      (referenceNode && placeholder.nextElementSibling === referenceNode) ||
      (!referenceNode && placeholder === tabsElement.lastElementChild)
    ) {
      return;
    }

    const previousPositions = captureTournamentTabPositions();
    tabsElement.insertBefore(placeholder, referenceNode);
    animateTournamentTabPositions(previousPositions);
  }

  function captureTournamentTabPositions() {
    const positions = new Map();
    tabsElement.querySelectorAll("[data-tab-shell], [data-tab-placeholder]").forEach((shell) => {
      positions.set(shell.dataset.tabShell || shell.dataset.tabPlaceholder, shell.getBoundingClientRect().left);
    });
    return positions;
  }

  function animateTournamentTabPositions(previousPositions) {
    tabsElement.querySelectorAll("[data-tab-shell], [data-tab-placeholder]").forEach((shell) => {
      const shellId = shell.dataset.tabShell || shell.dataset.tabPlaceholder;
      const previousLeft = previousPositions.get(shellId);
      if (previousLeft === undefined) {
        return;
      }

      const deltaX = previousLeft - shell.getBoundingClientRect().left;
      if (Math.abs(deltaX) < 1) {
        return;
      }

      shell.animate(
        [
          { transform: `translateX(${deltaX}px) scale(0.985)` },
          { transform: "translateX(0) scale(1)" }
        ],
        {
          duration: 260,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    });
  }

  function getRenderedTournamentTabOrder() {
    if (draggedTournamentState) {
      return [...tabsElement.children].map((shell) =>
        shell.dataset.tabShell || shell.dataset.tabPlaceholder
      );
    }

    return [...tabsElement.querySelectorAll("[data-tab-shell]")].map((shell) => shell.dataset.tabShell);
  }

  function autoScrollTournamentTabs(pointerX) {
    const bounds = tabsElement.getBoundingClientRect();
    const edgeThreshold = 72;

    if (pointerX < bounds.left + edgeThreshold) {
      tabsElement.scrollLeft -= Math.ceil((bounds.left + edgeThreshold - pointerX) / 8);
      return;
    }

    if (pointerX > bounds.right - edgeThreshold) {
      tabsElement.scrollLeft += Math.ceil((pointerX - (bounds.right - edgeThreshold)) / 8);
    }
  }

  function handleDeleteTournamentTab(tournamentId) {
    const tournamentIndex = workspace.tournaments.findIndex((entry) => entry.id === tournamentId);
    const tournament = workspace.tournaments[tournamentIndex];
    if (!tournament) {
      return;
    }

    if (workspace.tournaments.length <= 1) {
      showInfo("Der letzte Reiter bleibt bestehen und kann nicht gelöscht werden.");
      return;
    }

    const currentLabel = getTournamentLabel(tournament, tournamentIndex);
    const shouldDelete = window.confirm(
      `${currentLabel} wirklich als Reiter löschen?\n\n` +
        "Das entfernt diesen Reiter inklusive seiner gespeicherten Daten."
    );

    if (!shouldDelete) {
      showInfo("Der Reiter wurde nicht gelöscht.");
      return;
    }

    updateWorkspace((draft) => {
      const index = draft.tournaments.findIndex((entry) => entry.id === tournamentId);
      if (index === -1) {
        return;
      }

      const wasActive = draft.activeTournamentId === tournamentId;
      draft.tournaments.splice(index, 1);

      if (wasActive) {
        const fallbackTournament = draft.tournaments[Math.max(0, index - 1)] || draft.tournaments[0];
        draft.activeTournamentId = fallbackTournament.id;
      }
    }, "Turnier-Reiter gelöscht");

    showInfo(`${currentLabel} wurde als Reiter entfernt.`);
  }

  function handleClearCurrentTournament() {
    const currentLabel = getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const shouldClear = window.confirm(
      `${currentLabel} wirklich komplett leeren?\n\n` +
        "Dabei werden Turniername, Spieler und alle Ergebnisse im aktiven Reiter zurückgesetzt."
    );

    if (!shouldClear) {
      return;
    }

    updateActiveTournament((tournament) => {
      const id = tournament.id;
      const freshTournament = createTournamentRecord(createStateForMode(tournament.mode), id);
      Object.keys(tournament).forEach((key) => {
        delete tournament[key];
      });
      Object.assign(tournament, freshTournament);
    }, "Aktives Turnier geleert");
    showInfo(`${currentLabel} wurde geleert. Der Reiter bleibt erhalten, damit du ihn neu verwenden kannst.`);
  }

  function handleResetResults() {
    const currentLabel = getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const shouldReset = window.confirm(
      `${currentLabel}: nur die Ergebnisse leeren?\n\n` +
        "Spieler, Teamnamen, Turniername und Reitertitel bleiben erhalten."
    );

    if (!shouldReset) {
      return;
    }

    updateActiveTournament((tournament) => {
      if (tournament.mode === "team") {
        tournament.team.results = {};
        tournament.team.setScores = {};
        tournament.team.matchStatuses = {};
        tournament.team.doubleResults = {};
        tournament.team.doubleSetScores = {};
        tournament.team.doubleMatchStatuses = {};
      } else if (tournament.mode === "groupsKnockout") {
        tournament.groupsKnockout.groupResults = {};
        tournament.groupsKnockout.groupSetScores = {};
        tournament.groupsKnockout.knockoutResults = {};
        tournament.groupsKnockout.knockoutSetScores = {};
      } else {
        tournament.roundRobin.results = {};
        tournament.roundRobin.setScores = {};
        tournament.roundRobin.matchStatuses = {};
      }
      if (tournament.ttRace) {
        tournament.ttRace.rounds = [];
      }
      if (tournament.clicktt?.setScores) {
        tournament.clicktt.setScores = {};
      }
    }, "Ergebnisse gelöscht");
    showInfo("Alle eingetragenen Ergebnisse des aktiven Turniers wurden entfernt. Die Konfiguration bleibt erhalten.");
  }

  function handleDrawAction(event) {
    const action = event.currentTarget.dataset.drawAction;

    if (action === "shuffle-round-robin") {
      handleShuffleRoundRobinDraw();
      return;
    }

    if (action === "shuffle-groups-knockout") {
      handleShuffleGroupsKnockoutDraw();
    }
  }

  function handleShuffleRoundRobinDraw() {
    if (hasRoundRobinDrawStarted(activeTournament)) {
      showInfo("Jeder-gegen-jeden kann nur vor dem ersten eingetragenen Ergebnis neu ausgelost werden.");
      return;
    }

    updateActiveTournament((tournament) => {
      tournament.roundRobin = shuffleRoundRobinDraw(tournament.roundRobin);
    }, "Jeder-gegen-jeden neu ausgelost");
    showInfo("Teilnehmer wurden zufällig neu ausgelost. Der Rundenplan wurde entsprechend aktualisiert.");
  }

  function handleShuffleGroupsKnockoutDraw() {
    if (hasGroupsKnockoutDrawStarted(activeTournament)) {
      showInfo("Gruppen + KO kann nur vor dem ersten eingetragenen Gruppenergebnis neu ausgelost werden.");
      return;
    }

    updateActiveTournament((tournament) => {
      tournament.groupsKnockout = shuffleGroupsKnockoutDraw(tournament.groupsKnockout);
    }, "Gruppen + KO neu ausgelost");
    showInfo("Teilnehmer wurden zufällig neu ausgelost und neu auf die Gruppen verteilt.");
  }

  function handleLoadExample() {
    const currentLabel = getTournamentLabel(activeTournament, getActiveTournamentIndex());
    const shouldLoadExample = window.confirm(
      `${currentLabel} mit Beispieldaten fuellen?\n\n` +
        "Die aktuellen Daten in diesem Reiter werden dabei überschrieben.\n\n" +
        'Falls du fortfahren möchtest, kannst du die letzte Änderung danach mit "Zurück" wiederherstellen.'
    );

    if (!shouldLoadExample) {
      return;
    }

    const exampleState =
      activeTournament.mode === "team"
        ? exampleTeamState
        : activeTournament.mode === "groupsKnockout"
          ? exampleGroupsKnockoutState
          : exampleRoundRobinState;
    updateActiveTournament((tournament) => {
      const exampleCopy = createTournamentRecord(cloneValue(exampleState), tournament.id);
      Object.keys(tournament).forEach((key) => {
        delete tournament[key];
      });
      Object.assign(tournament, exampleCopy);
    }, "Beispieldaten geladen");
  }

  async function handleClickTtFileSelection(event) {
    const file = event.target.files?.[0];
    clickTtFileInput.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const bridge = await loadClickTtBridge();
      const imported = bridge.createTournamentStateFromClickttXml(text, {
        sourceFileName: file.name,
        importedAt: new Date().toISOString()
      });
      const starterOnlyImport = shouldUseClickTtStarterOnlyImport(imported.state);

      if (starterOnlyImport) {
        stripImportedResultsForStarterRun(imported.state);
      }

      const shouldImport = window.confirm(
        `${file.name} importieren?\n\n` +
          `${imported.state.roundRobin.playerCount} Teilnehmer aus "${imported.state.clicktt.competitionLabel}" werden in den aktiven Reiter uebernommen.` +
          (starterOnlyImport
            ? "\n\nDie XML enthaelt bereits Ergebnisse. Fuer diesen leeren TT-Race-Probelauf werden nur Teilnehmer, IDs, Vereine und TTR uebernommen."
            : "")
      );

      if (!shouldImport) {
        showInfo("click-TT Import wurde abgebrochen.");
        return;
      }

      const engine = await loadTtRaceEngine();
      imported.state.ttRace = engine.normalizeTtRaceTournament(imported.state.ttRace);
      clickTtImportDraft = null;
      updateActiveTournament((tournament) => {
        const importedRecord = createTournamentRecord(imported.state, tournament.id);
        Object.keys(tournament).forEach((key) => {
          delete tournament[key];
        });
        Object.assign(tournament, importedRecord);
      }, "click-TT XML importiert");
      showInfo(
        starterOnlyImport
          ? `${file.name} als Startliste importiert: ${imported.state.roundRobin.playerCount} Teilnehmer, keine alten Runden.`
          : `${file.name} importiert: ${imported.state.roundRobin.playerCount} Teilnehmer, click-TT IDs und TT-Race Engine sind verbunden.`
      );
    } catch (error) {
      console.error("click-TT XML konnte nicht gelesen werden.", error);
      showInfo(`Die click-TT XML-Datei konnte nicht importiert werden: ${error.message || "unbekannter Fehler"}`);
    }
  }

  function shouldUseClickTtStarterOnlyImport(importedState) {
    const isEmptyRaceStarter =
      isTtRaceTournament() &&
      (activeTournament.ttRace?.players ?? []).length === 0 &&
      (activeTournament.ttRace?.rounds ?? []).length === 0;
    const importedRoundCount = importedState?.ttRace?.rounds?.length ?? 0;
    const importedMatchCount = importedState?.clicktt?.importedMatchCount ?? 0;

    return isEmptyRaceStarter && (importedRoundCount > 0 || importedMatchCount > 0);
  }

  function stripImportedResultsForStarterRun(importedState) {
    importedState.roundRobin.results = {};
    importedState.roundRobin.setScores = {};
    importedState.roundRobin.matchStatuses = {};
    importedState.roundRobin.currentRound = 1;
    importedState.roundRobin.playerStatuses = Array.from(
      { length: importedState.roundRobin.playerCount },
      () => "active"
    );
    importedState.clicktt.importedMatchCount = 0;
    importedState.clicktt.importedPlayers = (importedState.clicktt.importedPlayers ?? []).map((player) => ({
      ...player,
      seed: null,
      placement: null,
      status: "active"
    }));
    importedState.ttRace.players = (importedState.ttRace.players ?? []).map((player) => ({
      ...player,
      seed: null,
      placement: null,
      status: "active"
    }));
    importedState.ttRace.rounds = [];
    importedState.ttRace.standings = [];
  }

  function handleRaceDayShellClick(event) {
    const roundShiftButton = event.target.closest("[data-round-shift]");
    if (roundShiftButton && raceDayShell.contains(roundShiftButton)) {
      handleRoundShift({ currentTarget: roundShiftButton });
      return;
    }

    const actionButton = event.target.closest("[data-race-action]");
    if (!actionButton || !raceDayShell.contains(actionButton)) {
      return;
    }

    handleRaceAction(actionButton);
  }

  function handleRaceAction(actionButton) {
    const action = actionButton.dataset.raceAction;
    if (action === "choose-clicktt-file") {
      clickTtFileInput.click();
      return;
    }

    if (action === "load-race-demo") {
      handleLoadRaceDayDemo();
      return;
    }

    if (action === "generate-swiss-round") {
      handleGenerateSwissRound();
      return;
    }

    if (action === "redraw-initial-round") {
      handleRedrawInitialSwissRound();
      return;
    }

    if (action === "add-tt-race-player") {
      handleAddTtRacePlayer();
      return;
    }

    if (action === "remove-tt-race-player") {
      ttRaceEditingPlayerId = null;
      handleRemoveTtRacePlayer(actionButton.dataset.playerId);
      return;
    }

    // Bearbeitet wird immer nur die angeklickte Zeile.
    if (action === "edit-tt-race-player") {
      const playerId = actionButton.dataset.playerId;
      ttRaceEditingPlayerId = ttRaceEditingPlayerId === playerId ? null : playerId;
      renderRaceDayShell();
      return;
    }

    if (action === "apply-tt-race-player") {
      ttRaceEditingPlayerId = null;
      renderRaceDayShell();
      return;
    }

    if (action === "open-output") {
      activeWorkspaceView = "output";
      saveWorkspaceView();
      renderWorkspacePanels();
      return;
    }

    if (action === "open-setup") {
      activeWorkspaceView = "input";
      saveWorkspaceView();
      renderWorkspacePanels();
      document.querySelector("#config-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "copy-clicktt-xml") {
      handleCopyClickTtXml();
      return;
    }

    if (action === "download-clicktt-xml") {
      handleDownloadClickTtXml();
    }
  }

  function handleRaceDayShellChange(event) {
    if (
      event.target.matches("[data-tt-race-player-name]") ||
      event.target.matches("[data-tt-race-player-first]") ||
      event.target.matches("[data-tt-race-player-last]") ||
      event.target.matches("[data-tt-race-player-rating]") ||
      event.target.matches("[data-tt-race-player-status]")
    ) {
      handleTtRacePlayerFieldChange(event);
      return;
    }

    if (event.target.matches("[data-race-setting]")) {
      handleRaceSettingChange(event);
      return;
    }

    if (event.target.matches("[data-clicktt-set-key]")) {
      handleClickTtSetScoreChange(event);
      return;
    }

    if (event.target.matches("[data-tt-race-sets]")) {
      handleTtRaceSetScoreChange(event);
      return;
    }

    if (event.target.matches("[data-result-key]")) {
      handleResultChange(event);
      return;
    }

    if (event.target.matches("[data-match-status-key]")) {
      handleMatchStatusChange(event);
      return;
    }

    if (event.target.matches("[data-sheet-action]")) {
      handleSheetInput(event);
    }
  }

	  function handleRaceSettingChange(event) {
	    const setting = event.target.dataset.raceSetting;

    if (setting !== "regardTtrValues") {
      return;
    }
	
	    if ((activeTournament.ttRace?.rounds?.length ?? 0) > 0) {
	      event.target.checked = getTtRaceRegardTtrValues();
	      showInfo("TTR-Auslosung kann nach erzeugter erster Runde nicht mehr geändert werden.");
	      return;
	    }
	
	    const enabled = Boolean(event.target.checked);
    updateActiveTournament((tournament) => {
      const ttRaceSeed = isTtRaceTournament(tournament)
        ? tournament.ttRace
        : createTtRaceSeedFromActiveTournament(tournament);

      tournament.ttRace = {
        ...ttRaceSeed,
        settings: {
          maxRounds: 6,
          bttvRaceRules: false,
          ...(ttRaceSeed.settings ?? {}),
          regardTtrValues: enabled
        }
      };
    }, "TT-Race Einstellung geaendert");

    showInfo(
      enabled
        ? "TTR-Werte werden bei der Auslosung beruecksichtigt."
        : "TTR-Werte werden bei der Auslosung ignoriert."
    );
  }

  async function handleGenerateSwissRound() {
    try {
      const engine = await loadTtRaceEngine();
      const seed = isTtRaceTournament()
        ? activeTournament.ttRace
        : createTtRaceSeedFromActiveTournament(activeTournament);
      const normalized = engine.normalizeTtRaceTournament(seed);
      const generationState = getTtRaceGenerationStateFromTournament(normalized);

      if (!generationState.canGenerate) {
        showInfo(generationState.reason);
        return;
      }

      const nextRound = normalized.rounds.length > 0
        ? engine.createNextSwissRound(normalized)
        : engine.createInitialSwissRound(normalized);
      const nextTournament = engine.appendSwissRound(normalized, nextRound);

      updateActiveTournament((tournament) => {
        tournament.ttRace = nextTournament;
      }, "Schweizer Runde erzeugt");
      showInfo(`Schweizer Runde ${nextRound.roundNumber} wurde erzeugt.`);
    } catch (error) {
      console.error("Schweizer Runde konnte nicht erzeugt werden.", error);
      showInfo(`Schweizer Runde konnte nicht erzeugt werden: ${error.message || "unbekannter Fehler"}`);
    }
  }

  async function handleRedrawInitialSwissRound() {
    try {
      const redrawState = getTtRaceInitialRedrawState(activeTournament.ttRace);
      if (!redrawState.canRedraw) {
        showInfo(redrawState.reason || "Die erste Runde kann nicht neu gelost werden.");
        return;
      }

      const engine = await loadTtRaceEngine();
      const normalized = engine.normalizeTtRaceTournament(activeTournament.ttRace);
      const nextTournament = engine.redrawInitialSwissRound(normalized);

      updateActiveTournament((tournament) => {
        tournament.ttRace = nextTournament;
      }, "Erste Runde neu gelost");
      showInfo("Erste Runde wurde neu gelost. Ergebnisse sind noch leer.");
    } catch (error) {
      console.error("Erste Runde konnte nicht neu gelost werden.", error);
      showInfo(`Erste Runde konnte nicht neu gelost werden: ${error.message || "unbekannter Fehler"}`);
    }
  }

  async function handleClickTtSetScoreChange(event) {
    const key = event.target.dataset.clickttSetKey;
    const reverseForDisplay = event.target.dataset.clickttSetReverse === "true";
    const rawValue = event.target.value.trim();

    try {
      const bridge = await loadClickTtBridge();
      const storedValue = reverseForDisplay ? bridge.reverseSetScoreText(rawValue) : bridge.formatSetScoreText(bridge.parseSetScoreText(rawValue));

      updateActiveTournament((tournament) => {
        tournament.clicktt = tournament.clicktt || {};
        tournament.clicktt.setScores = tournament.clicktt.setScores || {};

        if (storedValue) {
          tournament.clicktt.setScores[key] = storedValue;
        } else {
          delete tournament.clicktt.setScores[key];
        }
      }, "click-TT Satzpunkte gespeichert", { checkRoundBackups: true });
    } catch (error) {
      console.error("Satzpunkte konnten nicht gespeichert werden.", error);
      showInfo("Satzpunkte konnten nicht gespeichert werden.");
    }
  }

  function canEditTtRaceRoster() {
    return isTtRaceTournament() && (activeTournament.ttRace?.rounds?.length ?? 0) === 0;
  }

  function handleAddTtRacePlayer() {
    if (!canEditTtRaceRoster()) {
      showInfo("Teilnehmer können nach der ersten Runde nicht mehr geändert werden.");
      return;
    }

    updateActiveTournament((tournament) => {
      const players = Array.isArray(tournament.ttRace?.players) ? tournament.ttRace.players : [];
      const nextNumber = players.length + 1;
      const player = {
        id: createTtRacePlayerId(players),
        name: `Teilnehmer ${nextNumber}`,
        seed: null,
        rating: null,
        status: "active"
      };

      tournament.ttRace.players = [...players, player];
      if (tournament.clicktt?.importedPlayers) {
        tournament.clicktt.importedPlayers = [...tournament.clicktt.importedPlayers, {
          clickttId: player.id,
          name: player.name,
          seed: null,
          rating: null,
          status: "active"
        }];
      }
      if (tournament.clicktt?.playerIdByIndex) {
        tournament.clicktt.playerIdByIndex = [...tournament.clicktt.playerIdByIndex, player.id];
      }
      syncRoundRobinFromTtRacePlayers(tournament);
    }, "TT-Race Teilnehmer hinzugefügt");
  }

  function handleRemoveTtRacePlayer(playerId) {
    if (!playerId) {
      return;
    }

    if (!canEditTtRaceRoster()) {
      showInfo("Teilnehmer können nach der ersten Runde nicht mehr entfernt werden.");
      return;
    }

    updateActiveTournament((tournament) => {
      const players = Array.isArray(tournament.ttRace?.players) ? tournament.ttRace.players : [];
      tournament.ttRace.players = players.filter((player) => player.id !== playerId);
      if (tournament.clicktt?.importedPlayers) {
        tournament.clicktt.importedPlayers = tournament.clicktt.importedPlayers.filter(
          (player) => player.clickttId !== playerId && player.id !== playerId
        );
      }
      if (tournament.clicktt?.playerIdByIndex) {
        tournament.clicktt.playerIdByIndex = tournament.clicktt.playerIdByIndex.filter((id) => id !== playerId);
      }
      syncRoundRobinFromTtRacePlayers(tournament);
    }, "TT-Race Teilnehmer entfernt");
  }

  function handleTtRacePlayerFieldChange(event) {
    if (!canEditTtRaceRoster()) {
      return;
    }

    const playerId =
      event.target.dataset.ttRacePlayerName ||
      event.target.dataset.ttRacePlayerFirst ||
      event.target.dataset.ttRacePlayerLast ||
      event.target.dataset.ttRacePlayerRating ||
      event.target.dataset.ttRacePlayerStatus;

    if (!playerId) {
      return;
    }

    updateActiveTournament((tournament) => {
      const players = Array.isArray(tournament.ttRace?.players) ? tournament.ttRace.players : [];
      tournament.ttRace.players = players.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        if (event.target.matches("[data-tt-race-player-name]")) {
          return { ...player, name: event.target.value.trim() || player.name || "Teilnehmer" };
        }

        // Vor- und Nachname bleiben getrennt erhalten; der Anzeigename
        // entsteht daraus.
        if (event.target.matches("[data-tt-race-player-first]") || event.target.matches("[data-tt-race-player-last]")) {
          const current = splitParticipantName(player);
          const isFirst = event.target.matches("[data-tt-race-player-first]");
          const firstName = (isFirst ? event.target.value : current.firstName).trim();
          const lastName = (isFirst ? current.lastName : event.target.value).trim();
          const name = [firstName, lastName].filter(Boolean).join(" ");
          return { ...player, firstName, lastName, name: name || player.name || "Teilnehmer" };
        }

        if (event.target.matches("[data-tt-race-player-rating]")) {
          const rating = Number.parseInt(event.target.value, 10);
          return { ...player, rating: Number.isFinite(rating) ? rating : null };
        }

        const status = PLAYER_STATUSES[event.target.value] ? event.target.value : "active";
        return { ...player, status };
      });

      if (tournament.clicktt?.importedPlayers) {
        const playerById = new Map(tournament.ttRace.players.map((player) => [player.id, player]));
        tournament.clicktt.importedPlayers = tournament.clicktt.importedPlayers.map((importedPlayer) => {
          const player = playerById.get(importedPlayer.clickttId || importedPlayer.id);
          return player
            ? {
                ...importedPlayer,
                name: player.name,
                rating: player.rating,
                status: player.status
              }
            : importedPlayer;
        });
      }

      syncRoundRobinFromTtRacePlayers(tournament);
    }, "TT-Race Teilnehmer geändert", { trackHistory: event.type !== "input" });
  }

  function createTtRacePlayerId(players) {
    const usedIds = new Set(players.map((player) => player.id));
    let index = players.length + 1;
    let id = `local-player-${index}`;

    while (usedIds.has(id)) {
      index += 1;
      id = `local-player-${index}`;
    }

    return id;
  }

  function syncRoundRobinFromTtRacePlayers(tournament) {
    const players = Array.isArray(tournament.ttRace?.players) ? tournament.ttRace.players : [];
    tournament.roundRobin.playerCount = players.length;
    tournament.roundRobin.playerNames = players.map((player, index) => player.name || `Teilnehmer ${index + 1}`);
    tournament.roundRobin.playerStatuses = players.map((player) =>
      PLAYER_STATUSES[player.status] ? player.status : "active"
    );
    tournament.roundRobin.results = trimRoundRobinResults(tournament.roundRobin.results || {}, players.length);
    tournament.roundRobin.matchStatuses = trimRoundRobinResults(tournament.roundRobin.matchStatuses || {}, players.length);
  }

  async function handleTtRaceSetScoreChange(event) {
    await commitTtRaceSetScoreInput(event.target, { announceErrors: true });
  }

  async function handleTtRaceSetScoreInput(event) {
    await commitTtRaceSetScoreInput(event.target, { announceErrors: false });
  }

  async function commitTtRaceSetScoreInput(input, { announceErrors = true } = {}) {
    const matchId = input.dataset.ttRaceSets;
    const rawValue = input.value.trim();
    clearTtRaceSetInputError(input);

    try {
      const engine = await loadTtRaceEngine();
      const parsed = engine.parseTableTennisSetScoreText(rawValue);

      if (parsed.errors.length > 0) {
        setTtRaceSetInputError(input, parsed.errors[0]);
        if (announceErrors) {
          showInfo(parsed.errors[0]);
        }
        return;
      }

      const validation = engine.validateTableTennisSetScores(parsed.sets, {
        settings: activeTournament.ttRace?.settings,
        requireCompleteMatch: rawValue !== ""
      });

      if (!validation.valid) {
        setTtRaceSetInputError(input, validation.errors[0]);
        if (announceErrors) {
          showInfo(validation.errors[0]);
        }
        return;
      }

      const normalized = engine.normalizeTtRaceTournament(activeTournament.ttRace);
      const nextTournament = engine.recordSwissMatchResult(normalized, matchId, {
        status: parsed.sets.length > 0 ? "completed" : "scheduled",
        sets: parsed.sets
      });

      updateActiveTournament((tournament) => {
        tournament.ttRace = nextTournament;
      }, "TT-Race Ergebnis gespeichert", { checkRoundBackups: true });
    } catch (error) {
      console.error("TT-Race Ergebnis konnte nicht gespeichert werden.", error);
      setTtRaceSetInputError(input, error.message || "Ungueltige Satzpunkte.");
      if (announceErrors) {
        showInfo(`TT-Race Ergebnis konnte nicht gespeichert werden: ${error.message || "unbekannter Fehler"}`);
      }
    }
  }

  function setTtRaceSetInputError(input, message) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");

    // In der Spielzeile trägt die Rückmeldezeile unter dem Feld den Hinweis.
    const note = input.parentElement?.querySelector("[data-quick-note]");
    if (note) {
      note.textContent = message;
      note.classList.add("is-error");
      return;
    }

    const field = input.closest(".set-score-field");
    if (!field) {
      return;
    }

    let errorElement = field.querySelector(".set-score-error");
    if (!errorElement) {
      errorElement = document.createElement("span");
      errorElement.className = "set-score-error";
      field.appendChild(errorElement);
    }

    errorElement.textContent = message;
  }

  function clearTtRaceSetInputError(input) {
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");

    const note = input.parentElement?.querySelector("[data-quick-note]");
    if (note) {
      note.textContent = "";
      note.classList.remove("is-error");
    }

    input.closest(".set-score-field")?.querySelector(".set-score-error")?.remove();
  }

  function handleLoadRaceDayDemo() {
    const shouldLoadDemo = window.confirm(
      "TT-Race Demo in den aktiven Reiter laden?\n\n" +
        "Die aktuellen Daten in diesem Reiter werden überschrieben. Über Zurück kann die Änderung wiederhergestellt werden."
    );

    if (!shouldLoadDemo) {
      return;
    }

    clickTtImportDraft = {
      fileName: "bttv-tt-race-demo.xml",
      sizeKb: 18,
      detectedEntries: 12,
      loadedAt: new Date().toISOString()
    };

    updateActiveTournament((tournament) => {
      const demoCopy = createTournamentRecord(createRaceDayDemoState(), tournament.id);
      Object.keys(tournament).forEach((key) => {
        delete tournament[key];
      });
      Object.assign(tournament, demoCopy);
    }, "TT-Race Demo geladen");
    showInfo("TT-Race Demo mit 12 Teilnehmern, 6 Tischen und laufender Runde geladen.");
  }

  function createRaceDayDemoState() {
    const playerNames = [
      "Mia Keller",
      "Lukas Braun",
      "Sofia Nguyen",
      "Ben Adler",
      "Tarek Yilmaz",
      "Nora Klein",
      "Emil Hoffmann",
      "Lea Schuster",
      "Jonas Graf",
      "Mara Weber",
      "Noah Fuchs",
      "Clara Roth"
    ];
    const playerRatings = [1748, 1685, 1632, 1588, 1541, 1497, 1464, 1420, 1386, 1344, 1298, 1255];

    return {
      tabName: "TT-Race Demo",
      tournamentName: "BTTV TT-Race Abendturnier",
      mode: "roundRobin",
      matchMode: "win3",
      schedule: {
        fieldCount: 6,
        startTime: "18:30",
        matchDurationMinutes: 18,
        breakMinutes: 2,
        fieldNames: ["Tisch 1", "Tisch 2", "Tisch 3", "Tisch 4", "Tisch 5", "Tisch 6"]
      },
      roundRobin: {
        playerCount: 12,
        currentRound: 3,
        playerNames,
        playerStatuses: Array.from({ length: 12 }, () => "active"),
        results: {
          "0-1": "3:1",
          "2-3": "3:2",
          "4-5": "1:3",
          "6-7": "3:0",
          "8-9": "2:3",
          "10-11": "3:1",
          "0-2": "3:0",
          "1-3": "1:3",
          "4-6": "3:2",
          "5-7": "3:1",
          "8-10": "0:3",
          "9-11": "3:2"
        },
        matchStatuses: {}
      },
      ttRace: {
        id: "tt-race-demo",
        name: "BTTV TT-Race Abendturnier",
        settings: {
          maxRounds: 6,
          bttvRaceRules: true,
          regardTtrValues: true
        },
        players: playerNames.map((name, index) => ({
          id: `demo-player-${index + 1}`,
          name,
          seed: index + 1,
          rating: playerRatings[index],
          status: "active"
        })),
        rounds: []
      }
    };
  }

  function createTtRaceSeedFromActiveTournament(tournament) {
    const names = getRaceDayParticipants();
    const clickttIds = tournament.clicktt?.playerIdByIndex ?? [];
    const importedPlayersById = new Map(
      (tournament.clicktt?.importedPlayers ?? []).map((player) => [player.clickttId, player])
    );

    return {
      id: tournament.clicktt?.tournamentId || tournament.id || "tt-race",
      name: tournament.tournamentName || "TT-Race",
      settings: {
        maxRounds: 6,
        bttvRaceRules: false,
        regardTtrValues: true
      },
      players: names.map((name, index) => {
        const id = clickttIds[index] || `player-${index + 1}`;
        const importedPlayer = importedPlayersById.get(id);

        return {
          id,
          name,
          seed: importedPlayer?.seed ?? index + 1,
          rating: importedPlayer?.rating ?? null,
          status: importedPlayer?.status || "active"
        };
      }),
      rounds: []
    };
  }

  async function handleCopyClickTtXml() {
    if (activeTournament.clicktt?.rawXml && !clickTtBridgeModule) {
      try {
        await loadClickTtBridge();
      } catch (error) {
        console.warn("click-TT Adapter konnte nicht geladen werden.", error);
      }
    }

    const xml = buildClickTtXmlPreview();

    if (!navigator.clipboard?.writeText) {
      showInfo("Zwischenablage ist in diesem Browser nicht verfügbar. Die XML-Vorschau bleibt sichtbar.");
      return;
    }

    navigator.clipboard
      .writeText(xml)
      .then(() => showInfo("click-TT XML-Vorschau wurde in die Zwischenablage kopiert."))
      .catch((error) => {
        console.warn("XML-Vorschau konnte nicht kopiert werden.", error);
        showInfo("Die XML-Vorschau konnte nicht kopiert werden.");
      });
  }

  async function handleDownloadClickTtXml() {
    const title =
      activeTournament.tournamentName?.trim() ||
      getTournamentLabel(activeTournament, getActiveTournamentIndex());

    if (activeTournament.clicktt?.rawXml) {
      try {
        const exportState = getTtRaceFinalExportState(activeTournament.ttRace);
        if (!exportState.canExport) {
          showInfo(exportState.reason);
          return;
        }
        const bridge = await loadClickTtBridge();
        const result = bridge.exportClickttTournamentResults(activeTournament);
        downloadBlob(
          `${sanitizeFilename(title)}_clicktt_ergebnisse.xml`,
          new Blob([result.xml], { type: "application/xml;charset=utf-8" })
        );
        const warningSuffix = result.warnings.length > 0
          ? ` ${result.warnings.length} Hinweis${result.warnings.length === 1 ? "" : "e"} zur Satzpunkt-Erzeugung.`
          : "";
        showInfo(`click-TT Ergebnis-XML wurde exportiert.${warningSuffix}`);
      } catch (error) {
        console.error("click-TT Ergebnis-XML konnte nicht exportiert werden.", error);
        showInfo(`click-TT Ergebnis-XML konnte nicht exportiert werden: ${error.message || "unbekannter Fehler"}`);
      }
      return;
    }

    downloadBlob(
      `${sanitizeFilename(title)}_clicktt_ergebnisse_demo.xml`,
      new Blob([buildClickTtXmlPreview()], { type: "application/xml;charset=utf-8" })
    );
    showInfo("Demo-XML wurde heruntergeladen. Fuer einen echten click-TT Export zuerst die Portal-XML importieren.");
  }

  function handleExportCsv() {
    if (activeTournament.mode === "team") {
      exportTeamCsv(analysis);
    } else if (activeTournament.mode === "groupsKnockout") {
      exportGroupsKnockoutCsv(analysis);
    } else {
      exportRoundRobinCsv(analysis);
    }
  }

  function handleExportXlsx() {
    if (activeTournament.mode === "team") {
      exportTeamXlsx(analysis);
    } else if (activeTournament.mode === "groupsKnockout") {
      exportGroupsKnockoutXlsx(analysis);
    } else {
      exportRoundRobinXlsx(analysis);
    }
  }

  function handleExportCurrentRoundCsv() {
    const roundExport = getCurrentRoundExportData();
    if (!roundExport.round) {
      showInfo("Für die aktuelle Runde sind keine Daten verfügbar.");
      return;
    }

    if (activeTournament.mode === "team") {
      exportTeamRoundCsv(roundExport.analysis, roundExport.round, roundExport.currentRoundNumber, roundExport.totalRounds);
    } else if (activeTournament.mode === "groupsKnockout") {
      exportGroupsKnockoutRoundCsv(roundExport.analysis, roundExport.round, roundExport.currentRoundNumber, roundExport.totalRounds);
    } else {
      exportRoundRobinRoundCsv(roundExport.analysis, roundExport.round, roundExport.currentRoundNumber, roundExport.totalRounds);
    }
  }

  function handleExportCurrentRoundXlsx() {
    const roundExport = getCurrentRoundExportData();
    if (!roundExport.round) {
      showInfo("Für die aktuelle Runde sind keine Daten verfügbar.");
      return;
    }

    if (activeTournament.mode === "team") {
      exportTeamRoundXlsx(roundExport.analysis, roundExport.round, roundExport.currentRoundNumber, roundExport.totalRounds);
    } else if (activeTournament.mode === "groupsKnockout") {
      exportGroupsKnockoutRoundXlsx(roundExport.analysis, roundExport.round, roundExport.currentRoundNumber, roundExport.totalRounds);
    } else {
      exportRoundRobinRoundXlsx(roundExport.analysis, roundExport.round, roundExport.currentRoundNumber, roundExport.totalRounds);
    }
  }

  function handlePrintDocument() {
    preparePrintDocument();
    window.print();
  }

  function preparePrintDocument() {
    if (!printDocument) {
      return;
    }

    const printMode = printDocumentSelect?.value || "schedule";
    printDocument.innerHTML = renderPrintDocument(printMode);
    document.body.classList.add("is-printing-document");
  }

  function cleanupPrintDocument() {
    document.body.classList.remove("is-printing-document");
  }

  function renderPrintDocument(printMode) {
    switch (printMode) {
      case "resultSlips":
        return renderPrintShell("Leere Ergebniszettel", renderPrintResultSlips());
      case "resultMatrix":
        return renderPrintShell("Ergebnismatrix", renderPrintResultMatrix());
      case "ranking":
        return renderPrintShell("Rangliste", renderPrintRanking());
      case "winners":
        return renderPrintShell("Siegerliste", renderPrintWinners());
      case "certificate":
        return renderPrintCertificates();
      case "schedule":
      default:
        return renderPrintShell("Spielplan", renderPrintSchedule());
    }
  }

  function renderPrintShell(documentTitle, content) {
    return `
      <article class="print-document-sheet">
        <header class="print-document-header">
          <div>
            <p class="eyebrow">Turnierblatt</p>
            <h1>${escapeHtml(getPrintTournamentTitle())}</h1>
          </div>
          <div class="print-document-meta">
            <strong>${escapeHtml(documentTitle)}</strong>
            <span>${escapeHtml(analysis.matchModeLabel)}</span>
            <span>${escapeHtml(formatPrintDate(new Date()))}</span>
          </div>
        </header>
        ${content}
      </article>
    `;
  }

  function renderPrintSchedule() {
    if (analysis.schedule) {
      return renderPrintTimedSchedule();
    }

    if (activeTournament.mode === "groupsKnockout") {
      return `
        ${renderPrintRoundGroup("Spielplan Gruppenphase", analysis.groupRoundSchedule || [], "Alle geplanten Gruppenspiele.", false)}
        ${
          analysis.knockoutRounds?.length > 0
            ? renderPrintRoundGroup("Spielplan KO-Runde", analysis.knockoutRounds, "Alle gesetzten KO-Begegnungen.", false)
            : ""
        }
      `;
    }

    if (activeTournament.mode === "team") {
      return `
        ${renderPrintRoundGroup("Spielplan Einzel", analysis.rounds, "Alle geplanten Einzelbegegnungen.", false)}
        ${
          analysis.doubleRounds.length > 0
            ? renderPrintRoundGroup("Spielplan Doppel", analysis.doubleRounds, "Alle geplanten Doppelbegegnungen.", false)
            : ""
        }
      `;
    }

    return renderPrintRoundGroup(
      "Spielplan",
      analysis.rounds,
      "Alle Runden des Jeder-gegen-jeden-Turniers.",
      false
    );
  }

  function renderPrintTimedSchedule() {
    const schedule = analysis.schedule;
    if (!schedule || schedule.matches.length === 0) {
      return renderPrintEmptyState("Spielplan", "Für dieses Turnier sind noch keine Spiele im Zeitplan.");
    }

    const rows = schedule.matches.map((match) => [
      "          <tr>",
      "            <td>" + escapeHtml(match.plannedTime) + "</td>",
      "            <td>" + escapeHtml(match.fieldName) + "</td>",
      "            <td>" + escapeHtml(match.roundLabel) + "</td>",
      "            <td>" + escapeHtml(match.matchLabel) + "</td>",
      "            <td>" + escapeHtml(match.status) + "</td>",
      "          </tr>"
    ].join("")).join("");

    return [
      "      <section class=\"print-page print-round-group print-schedule-page\">",
      renderPrintPageHeader(
        "Spielplan",
        "Start " + schedule.startTime + " · Ende ca. " + schedule.endTime + " · " + schedule.config.fieldCount + " Tisch" + (schedule.config.fieldCount === 1 ? "" : "e")
      ),
      "        <table class=\"stats-table schedule-table print-schedule-table\">",
      "          <thead><tr><th>Uhrzeit</th><th>Tisch</th><th>Runde</th><th>Begegnung</th><th>Status</th></tr></thead>",
      "          <tbody>",
      rows,
      "          </tbody>",
      "        </table>",
      "      </section>"
    ].join("");
  }
  function renderPrintResultSlips() {
    if (activeTournament.mode === "groupsKnockout") {
      return `
        ${renderPrintRoundGroup("Ergebniszettel Gruppenphase", analysis.groupRoundSchedule || [], "Zum Ausfüllen während der Gruppenspiele.", true)}
        ${
          analysis.knockoutRounds?.length > 0
            ? renderPrintRoundGroup("Ergebniszettel KO-Runde", analysis.knockoutRounds, "Zum Ausfüllen während der KO-Runde.", true)
            : ""
        }
      `;
    }

    if (activeTournament.mode === "team") {
      return `
        ${renderPrintRoundGroup("Ergebniszettel Einzel", analysis.rounds, "Zum Ausfüllen während der Einzelrunden.", true)}
        ${
          analysis.doubleRounds.length > 0
            ? renderPrintRoundGroup("Ergebniszettel Doppel", analysis.doubleRounds, "Zum Ausfüllen während der Doppelrunden.", true)
            : ""
        }
      `;
    }

    return renderPrintRoundGroup(
      "Ergebniszettel",
      analysis.rounds,
      "Zum Ausfüllen während der Runden.",
      true
    );
  }

  function renderPrintResultMatrix() {
    if (isTtRaceTournament()) {
      return renderPrintEmptyState(
        "Ergebnismatrix",
        "Für TT-Race gibt es keine Vollmatrix. Nutze hier Spielplan oder Rangliste."
      );
    }

    if (activeTournament.mode === "groupsKnockout") {
      return renderPrintGroupsResultMatrix();
    }

    if (activeTournament.mode === "team") {
      return renderPrintTeamResultMatrix();
    }

    return renderPrintRoundRobinResultMatrix();
  }

  function renderPrintRoundRobinResultMatrix() {
    return `
      <section class="print-page">
        ${renderPrintPageHeader("Ergebnismatrix", "Aktueller Stand aller Jeder-gegen-jeden-Begegnungen.")}
        <div class="table-wrapper print-table-wrapper">
          <table class="stats-table print-result-matrix-table has-summary">
            ${renderPrintMatrixColGroup(analysis.players.length, true)}
            <thead>
              <tr>
                <th>Spieler</th>
                ${renderPrintMatrixColumnHeaders(analysis.players.length)}
                <th>Sätze</th>
                <th>Platz</th>
              </tr>
            </thead>
            <tbody>
              ${analysis.players.map((player, rowIndex) => `
                <tr>
                  ${renderPrintMatrixPlayerHeading(player, rowIndex)}
                  ${analysis.players.map((_, columnIndex) => renderPrintRoundRobinMatrixCell(rowIndex, columnIndex)).join("")}
                  ${renderPrintRoundRobinMatrixSummaryCells(rowIndex)}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ${renderPrintCompactRoundOverview(
          "Rundenübersicht",
          analysis.rounds,
          "Alle Einzelrunden ohne Uhrzeit und Tisch."
        )}
      </section>
    `;
  }

  function renderPrintMatrixColGroup(entryCount, includeSummary = false) {
    return `
      <colgroup>
        <col class="print-result-matrix-name-col" />
        ${Array.from({ length: entryCount }, () => '<col class="print-result-matrix-score-col" />').join("")}
        ${includeSummary ? '<col class="print-result-matrix-summary-col" /><col class="print-result-matrix-summary-col" />' : ""}
      </colgroup>
    `;
  }

  function renderPrintMatrixColumnHeaders(entryCount) {
    return Array.from(
      { length: entryCount },
      (_, index) => `<th class="print-result-matrix-number-heading">${index + 1}</th>`
    ).join("");
  }

  function renderPrintMatrixPlayerHeading(player, index) {
    return `
      <th class="print-result-matrix-player-heading">
        <span class="print-matrix-player-number">${index + 1}</span>
        <span>${escapeHtml(player)}</span>
      </th>
    `;
  }

  function renderPrintRoundRobinMatrixCell(rowIndex, columnIndex) {
    if (rowIndex === columnIndex) {
      return '<td class="diagonal-cell">X</td>';
    }

    const isMirrored = rowIndex > columnIndex;
    const key = isMirrored ? `${columnIndex}-${rowIndex}` : `${rowIndex}-${columnIndex}`;
    const result = analysis.results?.[key] || "";
    const setScore = activeTournament.roundRobin?.setScores?.[key] || "";
    return renderPrintStaticMatrixScoreCell(
      isMirrored && result ? reverseScore(result) : result,
      isMirrored && setScore ? reverseNormalSetScoreText(setScore) : setScore
    );
  }

  function renderPrintRoundRobinMatrixSummaryCells(rowIndex) {
    const standing = getRoundRobinStandingForPlayer(rowIndex);

    if (!standing) {
      return '<td class="print-result-matrix-summary-cell">-</td><td class="print-result-matrix-summary-cell">-</td>';
    }

    return `
      <td class="print-result-matrix-summary-cell">
        <strong>${standing.setsWon}:${standing.setsLost}</strong>
        <small>Diff. ${formatSignedValue(standing.setDiff)}</small>
      </td>
      <td class="print-result-matrix-summary-cell">
        <strong>${standing.place}.</strong>
        ${standing.sharedPlace ? "<small>geteilt</small>" : ""}
      </td>
    `;
  }

  function renderPrintTeamResultMatrix() {
    return `
      <section class="print-page">
        ${renderPrintPageHeader("Einzelmatrix", `${analysis.teamAName} stehen in den Zeilen, ${analysis.teamBName} in den Spalten.`)}
        <div class="table-wrapper print-table-wrapper">
          <table class="stats-table print-result-matrix-table">
            ${renderPrintMatrixColGroup(analysis.teamBPlayers.length)}
            <thead>
              <tr>
                <th>${escapeHtml(analysis.teamAName)} / ${escapeHtml(analysis.teamBName)}</th>
                ${renderPrintMatrixColumnHeaders(analysis.teamBPlayers.length)}
              </tr>
            </thead>
            <tbody>
              ${analysis.teamAPlayers.map((player, rowIndex) => `
                <tr>
                  ${renderPrintMatrixPlayerHeading(player, rowIndex)}
                  ${analysis.teamBPlayers.map((_, columnIndex) => {
                    const key = `${rowIndex}-${columnIndex}`;
                    return renderPrintStaticMatrixScoreCell(
                      activeTournament.team?.results?.[key] || "",
                      activeTournament.team?.setScores?.[key] || ""
                    );
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ${renderPrintCompactRoundOverview(
          "Einzelrunden",
          analysis.rounds,
          "Alle Einzelrunden ohne Uhrzeit und Tisch."
        )}
      </section>
      ${
        analysis.doubleRounds?.length > 0
          ? renderPrintCompactRoundOverview(
              "Doppelrunden",
              analysis.doubleRounds,
              "Alle Doppelrunden ohne Uhrzeit und Tisch.",
              "double"
            )
          : ""
      }
    `;
  }

  function renderPrintGroupsResultMatrix() {
    return `
      <section class="print-page">
        ${renderPrintPageHeader("Gruppen-Ergebnismatrix", "Aktueller Stand der Gruppenphase.")}
        <div class="print-group-ranking-stack">
          ${(analysis.groups || []).map((group) => `
            <article class="print-round-card">
              <div class="print-round-card-header">
                <div>
                  <p>${escapeHtml(getPrintTournamentTitle())}</p>
                  <h3>${escapeHtml(group.name)}</h3>
                </div>
                <span>${group.completedMatches}/${group.totalMatches} fertig</span>
              </div>
              <div class="table-wrapper print-table-wrapper">
                <table class="stats-table print-result-matrix-table">
                  ${renderPrintMatrixColGroup(group.players.length)}
                  <thead>
                    <tr>
                      <th>Teilnehmer</th>
                      ${renderPrintMatrixColumnHeaders(group.players.length)}
                    </tr>
                  </thead>
                  <tbody>
                    ${group.players.map((player, rowIndex) => `
                      <tr>
                        ${renderPrintMatrixPlayerHeading(player.name, rowIndex)}
                        ${group.players.map((_, columnIndex) => renderPrintGroupMatrixCell(group, rowIndex, columnIndex)).join("")}
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </article>
          `).join("")}
        </div>
        ${renderPrintCompactRoundOverview(
          "Gruppenrunden",
          analysis.groupRoundSchedule || [],
          "Alle Gruppenrunden ohne Uhrzeit und Tisch.",
          "group"
        )}
      </section>
      ${
        analysis.knockoutRounds?.length > 0
          ? renderPrintCompactRoundOverview(
              "KO-Runden",
              analysis.knockoutRounds,
              "Alle KO-Runden ohne Uhrzeit und Tisch.",
              "knockout"
            )
          : ""
      }
    `;
  }

  function renderPrintGroupMatrixCell(group, rowIndex, columnIndex) {
    if (rowIndex === columnIndex) {
      return '<td class="diagonal-cell">X</td>';
    }

    const isMirrored = rowIndex > columnIndex;
    const key = isMirrored
      ? `group-${group.groupIndex}-${columnIndex}-${rowIndex}`
      : `group-${group.groupIndex}-${rowIndex}-${columnIndex}`;
    const result = activeTournament.groupsKnockout?.groupResults?.[key] || "";
    const setScore = activeTournament.groupsKnockout?.groupSetScores?.[key] || "";
    return renderPrintStaticMatrixScoreCell(
      isMirrored && result ? reverseScore(result) : result,
      isMirrored && setScore ? reverseNormalSetScoreText(setScore) : setScore
    );
  }

  function renderPrintStaticMatrixScoreCell(result, setScore) {
    return `
      <td>
        <strong>${escapeHtml(result || "-")}</strong>
        ${setScore ? `<small>${escapeHtml(setScore)}</small>` : ""}
      </td>
    `;
  }

  function renderPrintCompactRoundOverview(title, rounds, subtitle, resultScope = "") {
    if (!Array.isArray(rounds) || rounds.length === 0) {
      return "";
    }

    return `
      <section class="print-compact-round-section">
        <header>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(subtitle)}</p>
        </header>
        <div class="print-compact-round-grid">
          ${rounds.map((round) => renderPrintCompactRoundCard(round, resultScope)).join("")}
        </div>
      </section>
    `;
  }

  function renderPrintCompactRoundCard(round, resultScope = "") {
    const byePlayers = getRoundByePlayers(round);
    const roundTitle = round.roundName || `${round.roundNumber}. Runde`;

    return `
      <article class="print-compact-round-card">
        <h4>${escapeHtml(roundTitle)}</h4>
        <table class="print-compact-round-table">
          <tbody>
            ${(round.pairings || [])
              .map((pairing) => renderPrintCompactRoundRow(pairing, resultScope))
              .join("")}
            ${byePlayers.map((player) => renderPrintCompactByeRow(player)).join("")}
          </tbody>
        </table>
      </article>
    `;
  }

  function renderPrintCompactRoundRow(pairing, resultScope = "") {
    const setScore = pairing.matchKey
      ? getNormalSetScoreValue(activeTournament, resultScope, pairing.matchKey)
      : "";
    const displaySetScore = pairing.displayReversed && setScore
      ? reverseNormalSetScoreText(setScore)
      : setScore;
    const result = pairing.score || (
      pairing.matchStatus && pairing.matchStatus !== "normal"
        ? pairing.matchStatusLabel
        : "offen"
    );

    return `
      <tr>
        <td>${pairing.contextLabel ? `${escapeHtml(pairing.contextLabel)}: ` : ""}${escapeHtml(pairing.playerA || "")} - ${escapeHtml(pairing.playerB || "")}</td>
        <td>
          <strong>${escapeHtml(result)}</strong>
          ${displaySetScore ? `<small>${escapeHtml(displaySetScore)}</small>` : ""}
        </td>
      </tr>
    `;
  }

  function renderPrintCompactByeRow(player) {
    return `
      <tr class="print-bye-row">
        <td>${renderByePlayerName(player)} spielfrei</td>
        <td><strong>Pause</strong></td>
      </tr>
    `;
  }

  function renderPrintRoundGroup(title, rounds, subtitle, emptyScores) {
    if (!rounds.length) {
      return renderPrintEmptyState(title, "Für dieses Dokument sind keine Runden verfügbar.");
    }

    return `
      <section class="print-page print-round-group">
        ${renderPrintPageHeader(title, subtitle)}
        <div class="print-round-grid">
          ${rounds.map((round) => renderPrintRoundCard(round, emptyScores)).join("")}
        </div>
      </section>
    `;
  }

  function renderPrintRoundCard(round, emptyScores) {
    const byePlayers = getRoundByePlayers(round);
    const status = getRoundStatus(round);

    return `
      <article class="print-round-card">
        <div class="print-round-card-header">
          <div>
            <p>${escapeHtml(getPrintTournamentTitle())}</p>
            <h3>${round.roundNumber}. Runde</h3>
          </div>
          ${emptyScores ? "" : `<span>${escapeHtml(status.label)}</span>`}
        </div>
        <table class="print-match-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Begegnung</th>
              <th>${emptyScores ? "Ergebnis" : "Stand"}</th>
              ${emptyScores ? "<th>Notiz / Unterschrift</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${(round.pairings || [])
              .map((pairing, index) => renderPrintMatchRow(pairing, index, emptyScores))
              .join("")}
            ${byePlayers.map((player) => renderPrintByeRow(player, emptyScores)).join("")}
          </tbody>
        </table>
      </article>
    `;
  }

  function renderPrintMatchRow(pairing, index, emptyScores) {
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(pairing.playerA)} - ${escapeHtml(pairing.playerB)}</td>
        <td>
          ${
            emptyScores
              ? '<span class="print-score-box" aria-hidden="true"></span>'
              : escapeHtml(pairing.score || "offen")
          }
        </td>
        ${emptyScores ? '<td><span class="print-note-line" aria-hidden="true"></span></td>' : ""}
      </tr>
    `;
  }

  function renderPrintByeRow(player, emptyScores) {
    return `
      <tr class="print-bye-row">
        <td>-</td>
        <td>${renderByePlayerName(player)} spielfrei</td>
        <td>Pause</td>
        ${emptyScores ? "<td></td>" : ""}
      </tr>
    `;
  }

  function renderPrintRanking() {
    if (activeTournament.mode === "groupsKnockout") {
      return `
        <section class="print-page">
          ${renderPrintPageHeader("Gruppen-Ranglisten", "Aktueller Stand je Gruppe.")}
          <div class="print-group-ranking-stack">
            ${(analysis.groups || []).map((group) => `
              <article class="print-round-card">
                <div class="print-round-card-header">
                  <div>
                    <p>${escapeHtml(getPrintTournamentTitle())}</p>
                    <h3>${escapeHtml(group.name)}</h3>
                  </div>
                </div>
                <div class="table-wrapper print-table-wrapper">
                  ${renderGroupRankingTable(group.ranking)}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
        ${analysis.finalStandings?.length > 0 ? `
          <section class="print-page">
            ${renderPrintPageHeader("Finalstand", "Endplatzierung aus der KO-Runde.")}
            <div class="table-wrapper print-table-wrapper">
              ${renderFinalStandingsTable(analysis.finalStandings)}
            </div>
          </section>
        ` : ""}
      `;
    }

    if (activeTournament.mode === "team") {
      return `
        <section class="print-page">
          ${renderPrintPageHeader("Teamwertung", "Zusammenfassung der Team-Ergebnisse.")}
          ${renderPrintTeamSummaryTable()}
        </section>
        <section class="print-page">
          ${renderPrintPageHeader("Spieler-Rangliste", "Einzel- und Doppelwertung der Spieler.")}
          <div class="table-wrapper print-table-wrapper">
            ${renderTeamRankingTable(analysis.playerRanking)}
          </div>
        </section>
      `;
    }

    return `
      <section class="print-page">
        ${renderPrintPageHeader("Rangliste", "Aktueller Stand der Spielerwertung.")}
        <div class="table-wrapper print-table-wrapper">
          ${renderRoundRobinRankingTable(analysis.ranking)}
        </div>
      </section>
    `;
  }

  function renderPrintTeamSummaryTable() {
    const rows = [
      ["Gewonnene Spiele", analysis.teamSummary.teamA.matchesWon, analysis.teamSummary.teamB.matchesWon],
      ["Unentschiedene Spiele", analysis.teamSummary.teamA.matchesDrawn, analysis.teamSummary.teamB.matchesDrawn],
      ["Verlorene Spiele", analysis.teamSummary.teamA.matchesLost, analysis.teamSummary.teamB.matchesLost],
      ["Saetze +", analysis.teamSummary.teamA.setsWon, analysis.teamSummary.teamB.setsWon],
      ["Saetze -", analysis.teamSummary.teamA.setsLost, analysis.teamSummary.teamB.setsLost],
      ["Differenz", analysis.teamSummary.teamA.setDiff, analysis.teamSummary.teamB.setDiff]
    ];

    if (analysis.teamSummary.hasDoubles) {
      rows.splice(
        3,
        0,
        ["Gewonnene Einzel", analysis.teamSummary.teamA.singlesWon, analysis.teamSummary.teamB.singlesWon],
        ["Gewonnene Doppel", analysis.teamSummary.teamA.doublesWon, analysis.teamSummary.teamB.doublesWon]
      );
    }

    return `
      <div class="table-wrapper print-table-wrapper">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Wertung</th>
              <th>${escapeHtml(analysis.teamAName)}</th>
              <th>${escapeHtml(analysis.teamBName)}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                ([label, teamAValue, teamBValue]) => `
                  <tr>
                    <td>${escapeHtml(label)}</td>
                    <td>${teamAValue}</td>
                    <td>${teamBValue}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPrintWinners() {
    if (activeTournament.mode === "groupsKnockout") {
      return `
        <section class="print-page">
          ${renderPrintPageHeader("Siegerliste", "Finale Platzierungen der Gruppen- und KO-Wertung.")}
          <div class="print-winner-grid">
            ${renderPrintWinnerCard("Turniersieger", getPrintChampionName())}
          </div>
          ${analysis.finalStandings?.length > 0 ? renderFinalStandingsTable(analysis.finalStandings.filter((player) => player.place <= 3)) : ""}
        </section>
      `;
    }

    if (activeTournament.mode === "team") {
      return `
        <section class="print-page">
          ${renderPrintPageHeader("Siegerliste Teamwertung", "Gewinner nach Gesamtwertung, Sätzen und Spielen.")}
          <div class="print-winner-grid">
            ${renderPrintWinnerCard("Gesamtsieger", analysis.teamSummary.winner)}
            ${renderPrintWinnerCard("Nach Sätzen", analysis.teamSummary.bySets.winner)}
            ${renderPrintWinnerCard("Nach Spielen", analysis.teamSummary.byMatches.winner)}
          </div>
        </section>
        <section class="print-page">
          ${renderPrintPageHeader("Siegerliste Spieler", "Podestplätze der Spielerwertung.")}
          ${renderPrintPodiumTable(analysis.playerRanking)}
        </section>
      `;
    }

    return `
      <section class="print-page">
        ${renderPrintPageHeader("Siegerliste", "Podestplätze der Spielerwertung.")}
        ${renderPrintPodiumTable(analysis.ranking)}
      </section>
    `;
  }

  function renderPrintWinnerCard(label, winner) {
    return `
      <article class="print-winner-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(winner)}</strong>
      </article>
    `;
  }

  function renderPrintPodiumTable(ranking) {
    const podiumRows = getPrintPodiumRows(ranking);

    if (!podiumRows.length) {
      return renderPrintEmptyState("Siegerliste", "Noch keine Rangliste verfügbar.");
    }

    return `
      <div class="table-wrapper print-table-wrapper">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Platz</th>
              <th>Name</th>
              <th>Bilanz</th>
              <th>Saetze</th>
              <th>Differenz</th>
            </tr>
          </thead>
          <tbody>
            ${podiumRows
              .map(
                (player) => `
                  <tr class="${placeClass(player.place)} ${player.sharedPlace ? "is-tied" : ""}">
                    <td>${escapeHtml(formatPrintPlace(player))}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${getPrintPlayerBalance(player)}</td>
                    <td>${player.setsWon}/${player.setsLost}</td>
                    <td>${player.setDiff}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPrintCertificates() {
    const certificateEntries = getPrintCertificateEntries();

    if (!certificateEntries.length) {
      return renderPrintShell(
        "Urkunde / Siegerblatt",
        renderPrintEmptyState("Urkunde / Siegerblatt", "Noch keine Platzierungen verfügbar.")
      );
    }

    return `
      <article class="print-document-sheet print-certificate-document">
        ${certificateEntries.map((entry) => renderPrintCertificate(entry)).join("")}
      </article>
    `;
  }

  function renderPrintCertificate(entry) {
    return `
      <section class="print-certificate-page">
        <div class="print-certificate-frame">
          <p class="eyebrow">Turnierblatt</p>
          <h1>Urkunde</h1>
          <p class="print-certificate-tournament">${escapeHtml(getPrintTournamentTitle())}</p>
          <div class="print-certificate-placement">${escapeHtml(entry.placeLabel)}</div>
          <strong>${escapeHtml(entry.name)}</strong>
          <p>${escapeHtml(entry.context)}</p>
          <footer>
            <span>Datum: ${escapeHtml(formatPrintDate(new Date()))}</span>
            <span>Unterschrift</span>
          </footer>
        </div>
      </section>
    `;
  }

  function getPrintCertificateEntries() {
    if (activeTournament.mode === "groupsKnockout") {
      return (analysis.finalStandings || [])
        .filter((player) => player.place <= 3)
        .map((player) => ({
          placeLabel: `${player.place}. Platz`,
          name: player.name,
          context: "Gruppen- und KO-Wertung"
        }));
    }

    if (activeTournament.mode === "team") {
      const entries = [];
      if (analysis.teamSummary.winner && analysis.teamSummary.winner !== "Unentschieden") {
        entries.push({
          placeLabel: "1. Platz Teamwertung",
          name: analysis.teamSummary.winner,
          context: "Siegerteam"
        });
      }

      return [
        ...entries,
        ...getPrintPodiumRows(analysis.playerRanking).map((player) => ({
          placeLabel: formatPrintPlace(player),
          name: player.name,
          context: `Spielerwertung - ${player.team}`
        }))
      ];
    }

    return getPrintPodiumRows(analysis.ranking).map((player) => ({
      placeLabel: formatPrintPlace(player),
      name: player.name,
      context: "Spielerwertung"
    }));
  }

  function getPrintPodiumRows(ranking) {
    return ranking.filter((player) => player.place <= 3);
  }

  function getPrintPlayerBalance(player) {
    if (activeTournament.mode === "groupsKnockout" && player.seedLabel) {
      return player.seedLabel;
    }

    if (isFixedSetMatchMode(analysis.matchMode)) {
      return "-";
    }

    if (activeTournament.mode === "team") {
      return `${player.matchesWon}/${player.matchesLost}`;
    }

    return `${player.wins}/${player.losses}`;
  }

  function getPrintChampionName() {
    if (!analysis.champion) {
      return "Noch offen";
    }

    return typeof analysis.champion === "string" ? analysis.champion : analysis.champion.name;
  }

  function formatPrintPlace(player) {
    return `${player.place}.${player.sharedPlace ? " geteilt" : ""}`;
  }

  function renderPrintPageHeader(title, subtitle) {
    return `
      <header class="print-page-header">
        <div>
          <p class="eyebrow">${escapeHtml(getPrintTournamentTitle())}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p>${escapeHtml(subtitle)}</p>
      </header>
    `;
  }

  function renderPrintEmptyState(title, message) {
    return `
      <section class="print-page">
        ${renderPrintPageHeader(title, message)}
      </section>
    `;
  }

  function getPrintTournamentTitle() {
    return (
      analysis.tournamentName ||
      activeTournament.tournamentName?.trim() ||
      getTournamentLabel(activeTournament, getActiveTournamentIndex())
    );
  }

  function formatPrintDate(date) {
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  }

  function handleParticipantImportTextInput(event) {
    const targetKey = event.target.dataset.importText;
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    if (!draft) {
      return;
    }

    draft.text = event.target.value;
    const parsed = parseParticipantImportText(draft.text);
    if (isTeamImportTarget(targetKey) && parsed.teamName && !draft.teamName.trim()) {
      draft.teamName = parsed.teamName;
    }
    refreshParticipantImportPreview(targetKey);
  }

  async function handleParticipantImportFileSelection(event) {
    const targetKey = event.target.dataset.importFile;
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!draft || !file) {
      return;
    }

    try {
      draft.text = await file.text();
      draft.fileName = file.name;
      const parsed = parseParticipantImportText(draft.text);
      if (isTeamImportTarget(targetKey) && parsed.teamName) {
        draft.teamName = parsed.teamName;
      }

      const panel = configDetails.querySelector('[data-import-panel="' + targetKey + '"]');
      const textarea = panel?.querySelector('[data-import-text="' + targetKey + '"]');
      const teamNameInput = panel?.querySelector('[data-import-team-name="' + targetKey + '"]');
      if (textarea) {
        textarea.value = draft.text;
      }
      if (teamNameInput) {
        teamNameInput.value = draft.teamName;
      }
      refreshParticipantImportPreview(targetKey);
      showInfo(file.name + " wurde geladen. Prüfe die Vorschau und übernimm die Teilnehmer danach.");
    } catch (error) {
      console.error("Teilnehmerdatei konnte nicht gelesen werden.", error);
      showInfo("Die Datei konnte nicht gelesen werden. Bitte eine CSV- oder Textdatei wählen.");
    }
  }

  function handleParticipantImportTeamNameInput(event) {
    const targetKey = event.target.dataset.importTeamName;
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    if (!draft) {
      return;
    }

    draft.teamName = event.target.value;
    refreshParticipantImportPreview(targetKey);
  }

  function handleParticipantImportDuplicateOption(event) {
    const targetKey = event.target.dataset.importNumberDuplicates;
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    if (!draft) {
      return;
    }

    draft.numberDuplicates = event.target.checked;
    refreshParticipantImportPreview(targetKey);
  }

  function handleClearParticipantImport(event) {
    const targetKey = event.currentTarget.dataset.importClear;
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey];
    if (!draft) {
      return;
    }

    Object.assign(draft, createParticipantImportTargetDraft());
    renderConfig();
  }

  function handleApplyParticipantImport(event) {
    const targetKey = event.currentTarget.dataset.importApply;
    const preview = getParticipantImportPreview(targetKey);

    if (preview.applyNames.length === 0) {
      showInfo("Bitte zuerst Namen einfügen oder eine CSV-Datei laden.");
      return;
    }

    if (activeTournamentHasStoredResults()) {
      const shouldContinue = window.confirm(
        "Im aktiven Turnier sind bereits Ergebnisse eingetragen.\n\n" +
          "Beim Teilnehmer-Import werden diese Ergebnisse gelöscht, damit keine alten Resultate falschen Namen zugeordnet werden. Fortfahren?"
      );

      if (!shouldContinue) {
        showInfo("Import abgebrochen. Die vorhandenen Ergebnisse bleiben erhalten.");
        return;
      }
    }

    const importedNames = preview.applyNames;
    updateActiveTournament((tournament) => {
      if (targetKey === "roundRobin") {
        const count = clampCount(importedNames.length);
        tournament.roundRobin.playerCount = count;
        tournament.roundRobin.playerNames = ensureLength(importedNames.slice(0, count), count, "Spieler");
        tournament.roundRobin.playerStatuses = ensureLength([], count, "active");
        tournament.roundRobin.currentRound = clampPositiveInteger(
          tournament.roundRobin.currentRound,
          1,
          getRoundRobinRoundCount(count)
        );
        tournament.roundRobin.results = {};
        tournament.roundRobin.setScores = {};
        tournament.roundRobin.matchStatuses = {};
        return;
      }

      const count = clampCount(importedNames.length);
      if (targetKey === "teamA") {
        tournament.team.teamACount = count;
        tournament.team.teamAPlayers = ensureLength(importedNames.slice(0, count), count, "Spieler A");
        tournament.team.teamAPlayerStatuses = ensureLength([], count, "active");
        if (preview.teamName) {
          tournament.team.teamAName = preview.teamName;
        }
      }

      if (targetKey === "teamB") {
        tournament.team.teamBCount = count;
        tournament.team.teamBPlayers = ensureLength(importedNames.slice(0, count), count, "Spieler B");
        tournament.team.teamBPlayerStatuses = ensureLength([], count, "active");
        if (preview.teamName) {
          tournament.team.teamBName = preview.teamName;
        }
      }

      tournament.team.results = {};
      tournament.team.setScores = {};
      tournament.team.matchStatuses = {};
      tournament.team.doubleResults = {};
      tournament.team.doubleSetScores = {};
      tournament.team.doubleMatchStatuses = {};
      tournament.team.doubleRoundStates = [];
      tournament.team.currentRound = clampPositiveInteger(
        tournament.team.currentRound,
        1,
        getTeamRoundCount(tournament.team.teamACount, tournament.team.teamBCount)
      );
      tournament.team.currentDoubleRound = 1;
    }, "Teilnehmer importiert");

    showInfo(preview.applyNames.length + " Teilnehmer wurden übernommen.");
  }

  function handleConfigInput(event) {
    const action = event.target.dataset.action;
    if (!action) {
      return;
    }

    const duplicateError = validateUniquePlayerNameChange(action, event.target);
    if (duplicateError) {
      renderConfig();
      showInfo(duplicateError);
      return;
    }

    let feedbackMessage = "";
    updateActiveTournament((tournament) => {
      switch (action) {
        case "tournamentName":
          tournament.tournamentName = event.target.value;
          tournament.tabName = event.target.value;
          break;
        case "roundRobinCount": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextCount = clampCount(event.target.value);
          tournament.roundRobin.playerCount = nextCount;
          tournament.roundRobin.playerStatuses = ensureLength(
            tournament.roundRobin.playerStatuses,
            nextCount,
            "active"
          );
          tournament.roundRobin.currentRound = clampPositiveInteger(
            tournament.roundRobin.currentRound,
            1,
            getRoundRobinRoundCount(nextCount)
          );
          tournament.roundRobin.results = trimRoundRobinResults(tournament.roundRobin.results || {}, nextCount);
          tournament.roundRobin.setScores = trimRoundRobinResults(tournament.roundRobin.setScores || {}, nextCount);
          tournament.roundRobin.matchStatuses = trimRoundRobinResults(tournament.roundRobin.matchStatuses || {}, nextCount);
          if (rawValue !== nextCount) {
            feedbackMessage = "Die Teilnehmerzahl wurde auf den erlaubten Bereich von 2 bis 100 gesetzt.";
          }
          break;
        }
        case "groupsKnockoutCount": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextCount = clampCount(event.target.value, 4, 100);
          tournament.groupsKnockout.playerCount = nextCount;
          tournament.groupsKnockout.playerNames = ensureLength(
            tournament.groupsKnockout.playerNames,
            nextCount,
            "Spieler"
          );
          tournament.groupsKnockout.groupCount = clampPositiveInteger(
            tournament.groupsKnockout.groupCount,
            2,
            Math.max(2, Math.floor(nextCount / 2))
          );
          tournament.groupsKnockout.qualifiersPerGroup = clampPositiveInteger(
            tournament.groupsKnockout.qualifiersPerGroup,
            1,
            Math.max(1, Math.floor(nextCount / tournament.groupsKnockout.groupCount))
          );
          tournament.groupsKnockout.currentGroupRound = clampPositiveInteger(
            tournament.groupsKnockout.currentGroupRound,
            1,
            getGroupsKnockoutGroupRoundCount(nextCount, tournament.groupsKnockout.groupCount)
          );
          tournament.groupsKnockout.currentKnockoutRound = 1;
          tournament.groupsKnockout.groupResults = {};
          tournament.groupsKnockout.groupSetScores = {};
          tournament.groupsKnockout.knockoutResults = {};
          tournament.groupsKnockout.knockoutSetScores = {};
          if (rawValue !== nextCount) {
            feedbackMessage = "Die Teilnehmerzahl wurde auf den erlaubten Bereich von 4 bis 100 gesetzt.";
          }
          break;
        }
        case "groupsKnockoutGroupCount": {
          const maxGroups = Math.max(2, Math.floor(tournament.groupsKnockout.playerCount / 2));
          const nextCount = clampPositiveInteger(event.target.value, 2, maxGroups);
          tournament.groupsKnockout.groupCount = nextCount;
          tournament.groupsKnockout.qualifiersPerGroup = clampPositiveInteger(
            tournament.groupsKnockout.qualifiersPerGroup,
            1,
            Math.max(1, Math.floor(tournament.groupsKnockout.playerCount / nextCount))
          );
          tournament.groupsKnockout.currentGroupRound = clampPositiveInteger(
            tournament.groupsKnockout.currentGroupRound,
            1,
            getGroupsKnockoutGroupRoundCount(tournament.groupsKnockout.playerCount, nextCount)
          );
          tournament.groupsKnockout.currentKnockoutRound = 1;
          tournament.groupsKnockout.groupResults = {};
          tournament.groupsKnockout.groupSetScores = {};
          tournament.groupsKnockout.knockoutResults = {};
          tournament.groupsKnockout.knockoutSetScores = {};
          break;
        }
        case "groupsKnockoutQualifiers": {
          const maxQualifiers = Math.max(
            1,
            Math.floor(tournament.groupsKnockout.playerCount / tournament.groupsKnockout.groupCount)
          );
          tournament.groupsKnockout.qualifiersPerGroup = clampPositiveInteger(
            event.target.value,
            1,
            maxQualifiers
          );
          tournament.groupsKnockout.currentKnockoutRound = 1;
          tournament.groupsKnockout.knockoutResults = {};
          tournament.groupsKnockout.knockoutSetScores = {};
          break;
        }
        case "groupsKnockoutPlacement":
          // Segmentschalter liefert einen Wert, die frühere Checkbox checked.
          tournament.groupsKnockout.placementMatchesEnabled =
            event.target.type === "checkbox" ? Boolean(event.target.checked) : event.target.value === "yes";
          break;
        case "groupsKnockoutName":
          tournament.groupsKnockout.playerNames[Number(event.target.dataset.index)] = event.target.value;
          if (!event.target.value.trim()) {
            feedbackMessage = "Ein leerer Name wurde automatisch durch einen Platzhalter ersetzt.";
          }
          break;
        case "matchMode":
          tournament.matchMode = event.target.value;
          tournament.roundRobin.setScores = {};
          tournament.team.setScores = {};
          tournament.team.doubleSetScores = {};
          tournament.groupsKnockout.groupSetScores = {};
          tournament.groupsKnockout.knockoutSetScores = {};
          break;
        case "scheduleFieldCount": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextCount = clampPositiveInteger(event.target.value, 1, 20);
          tournament.schedule.fieldCount = nextCount;
          tournament.schedule.fieldNames = ensureLength(
            tournament.schedule.fieldNames,
            nextCount,
            "Tisch"
          );
          if (rawValue !== nextCount) {
            feedbackMessage = "Die Tischanzahl wurde auf den erlaubten Bereich von 1 bis 20 gesetzt.";
          }
          break;
        }
        case "scheduleStartTime":
          tournament.schedule.startTime = event.target.value;
          break;
        case "scheduleMatchDuration": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextDuration = clampPositiveInteger(event.target.value, 1, 240);
          tournament.schedule.matchDurationMinutes = nextDuration;
          if (rawValue !== nextDuration) {
            feedbackMessage = "Die Spieldauer wurde auf den erlaubten Bereich von 1 bis 240 Minuten gesetzt.";
          }
          break;
        }
        case "scheduleBreak": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextBreak = clampPositiveInteger(event.target.value, 0, 120);
          tournament.schedule.breakMinutes = nextBreak;
          if (rawValue !== nextBreak) {
            feedbackMessage = "Der Puffer wurde auf den erlaubten Bereich von 0 bis 120 Minuten gesetzt.";
          }
          break;
        }
        case "scheduleFieldName":
          tournament.schedule.fieldNames[Number(event.target.dataset.index)] = event.target.value;
          if (!event.target.value.trim()) {
            feedbackMessage = "Ein leerer Tischname wurde automatisch durch einen Platzhalter ersetzt.";
          }
          break;
        case "scoringWinPoints":
          tournament.scoring.winPoints = event.target.value;
          break;
        case "scoringDrawPoints":
          tournament.scoring.drawPoints = event.target.value;
          break;
        case "scoringLossPoints":
          tournament.scoring.lossPoints = event.target.value;
          break;
        case "scoringTieBreak":
          setTieBreakCriterion(tournament.scoring, Number(event.target.dataset.index), event.target.value);
          break;
        case "roundRobinName":
          tournament.roundRobin.playerNames[Number(event.target.dataset.index)] = event.target.value;
          if (!event.target.value.trim()) {
            feedbackMessage = "Ein leerer Name wurde automatisch durch einen Platzhalter ersetzt.";
          }
          break;
        case "roundRobinStatus":
          tournament.roundRobin.playerStatuses[Number(event.target.dataset.index)] = event.target.value;
          break;
        case "teamAName":
          tournament.team.teamAName = event.target.value;
          break;
        case "teamBName":
          tournament.team.teamBName = event.target.value;
          break;
        case "teamACount": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextCount = clampCount(event.target.value);
          tournament.team.teamACount = nextCount;
          tournament.team.teamAPlayers = ensureLength(
            tournament.team.teamAPlayers,
            nextCount,
            "Spieler A"
          );
          tournament.team.teamAPlayerStatuses = ensureLength(
            tournament.team.teamAPlayerStatuses,
            nextCount,
            "active"
          );
          tournament.team.results = trimTeamResults(
            tournament.team.results,
            tournament.team.teamACount,
            tournament.team.teamBCount
          );
          tournament.team.setScores = trimTeamResults(
            tournament.team.setScores || {},
            tournament.team.teamACount,
            tournament.team.teamBCount
          );
          tournament.team.matchStatuses = trimTeamResults(
            tournament.team.matchStatuses,
            tournament.team.teamACount,
            tournament.team.teamBCount
          );
          tournament.team.currentRound = clampPositiveInteger(
            tournament.team.currentRound,
            1,
            getTeamRoundCount(tournament.team.teamACount, tournament.team.teamBCount)
          );
          if (rawValue !== nextCount) {
            feedbackMessage = "Die Teamgröße von Team A wurde auf den erlaubten Bereich von 2 bis 100 gesetzt.";
          }
          break;
        }
        case "teamBCount": {
          const rawValue = Number.parseInt(event.target.value, 10);
          const nextCount = clampCount(event.target.value);
          tournament.team.teamBCount = nextCount;
          tournament.team.teamBPlayers = ensureLength(
            tournament.team.teamBPlayers,
            nextCount,
            "Spieler B"
          );
          tournament.team.teamBPlayerStatuses = ensureLength(
            tournament.team.teamBPlayerStatuses,
            nextCount,
            "active"
          );
          tournament.team.results = trimTeamResults(
            tournament.team.results,
            tournament.team.teamACount,
            tournament.team.teamBCount
          );
          tournament.team.setScores = trimTeamResults(
            tournament.team.setScores || {},
            tournament.team.teamACount,
            tournament.team.teamBCount
          );
          tournament.team.matchStatuses = trimTeamResults(
            tournament.team.matchStatuses,
            tournament.team.teamACount,
            tournament.team.teamBCount
          );
          tournament.team.currentRound = clampPositiveInteger(
            tournament.team.currentRound,
            1,
            getTeamRoundCount(tournament.team.teamACount, tournament.team.teamBCount)
          );
          if (rawValue !== nextCount) {
            feedbackMessage = "Die Teamgröße von Team B wurde auf den erlaubten Bereich von 2 bis 100 gesetzt.";
          }
          break;
        }
        case "teamAPlayer":
          tournament.team.teamAPlayers[Number(event.target.dataset.index)] = event.target.value;
          if (!event.target.value.trim()) {
            feedbackMessage = "Ein leerer Name in Team A wurde automatisch durch einen Platzhalter ersetzt.";
          }
          break;
        case "teamAPlayerStatus":
          tournament.team.teamAPlayerStatuses[Number(event.target.dataset.index)] = event.target.value;
          break;
        case "teamBPlayer":
          tournament.team.teamBPlayers[Number(event.target.dataset.index)] = event.target.value;
          if (!event.target.value.trim()) {
            feedbackMessage = "Ein leerer Name in Team B wurde automatisch durch einen Platzhalter ersetzt.";
          }
          break;
        case "teamBPlayerStatus":
          tournament.team.teamBPlayerStatuses[Number(event.target.dataset.index)] = event.target.value;
          break;
        case "doubleTeamAPlayer1":
        case "doubleTeamAPlayer2":
        case "doubleTeamBPlayer1":
        case "doubleTeamBPlayer2": {
          const entry = tournament.team.doubles.find(
            (doubleEntry) => doubleEntry.id === event.target.dataset.doubleId
          );
          if (entry) {
            const field =
              action === "doubleTeamAPlayer1"
                ? "teamAPlayer1"
                : action === "doubleTeamAPlayer2"
                  ? "teamAPlayer2"
                  : action === "doubleTeamBPlayer1"
                    ? "teamBPlayer1"
                    : "teamBPlayer2";
            entry[field] = event.target.value;
          }
          break;
        }
        default:
          break;
      }
    }, "Konfiguration gespeichert");

    if (feedbackMessage) {
      showInfo(feedbackMessage);
    }
  }

  function getMatchSetRequirement(matchMode) {
    const modeId = MATCH_MODES[matchMode] ? matchMode : "win3";
    if (modeId.startsWith("fixed")) {
      return {
        type: "fixed",
        totalSets: clampPositiveInteger(modeId.slice(5), 1, 9)
      };
    }
    return {
      type: "winning",
      setsToWin: clampPositiveInteger(modeId.slice(3), 1, 9)
    };
  }

  function expandShortSetScoreToken(token) {
    const match = String(token).trim().match(/^([+-]?)(\d+)$/);
    if (!match) {
      return null;
    }

    const sign = match[1];
    const loserScore = Number(match[2]);
    const winnerScore = loserScore >= 10 ? loserScore + 2 : 11;
    return sign === "-" ? [loserScore, winnerScore] : [winnerScore, loserScore];
  }

  function parseNormalSetScoreText(value) {
    const text = String(value ?? "").trim();
    const errors = [];
    const sets = [];

    if (!text) {
      return { sets, errors };
    }

    const tokenPattern = /(\d+\s*[:-]\s*\d+|[+-]?\d+)/g;
    let cursor = 0;
    let match = tokenPattern.exec(text);

    while (match) {
      const separator = text.slice(cursor, match.index);
      if ((cursor > 0 && !separator) || (separator && !/^[\s,;|/]+$/.test(separator))) {
        errors.push(NORMAL_SET_SCORE_INPUT_HINT);
        break;
      }

      const token = match[0].trim();
      const scoreMatch = token.match(/^(\d+)\s*[:-]\s*(\d+)$/);
      const parsedSet = scoreMatch
        ? [Number(scoreMatch[1]), Number(scoreMatch[2])]
        : expandShortSetScoreToken(token);

      if (!parsedSet) {
        errors.push(NORMAL_SET_SCORE_INPUT_HINT);
        break;
      }

      sets.push({ a: parsedSet[0], b: parsedSet[1] });
      cursor = tokenPattern.lastIndex;
      match = tokenPattern.exec(text);
    }

    const tail = text.slice(cursor);
    if (tail && !/^[\s,;|/]+$/.test(tail)) {
      errors.push(NORMAL_SET_SCORE_INPUT_HINT);
    }

    if (sets.length === 0 && errors.length === 0) {
      errors.push("Bitte mindestens einen Satz als 11:7 oder kurz 7 eingeben.");
    }

    return { sets, errors: [...new Set(errors)] };
  }

  function validateNormalSingleSet(set, setNumber) {
    const errors = [];
    const left = set.a;
    const right = set.b;
    const winnerScore = Math.max(left, right);
    const loserScore = Math.min(left, right);

    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0) {
      errors.push(`Satz ${setNumber}: Nur ganze, positive Punktzahlen sind erlaubt.`);
      return errors;
    }

    if (left === right) {
      errors.push(`Satz ${setNumber}: Ein Satz darf nicht unentschieden enden.`);
      return errors;
    }

    if (winnerScore < 11) {
      errors.push(`Satz ${setNumber}: Ein Satz endet frühestens bei 11 Punkten.`);
    }

    if (winnerScore - loserScore < 2) {
      errors.push(`Satz ${setNumber}: Ein Satz muss mit mindestens zwei Punkten Abstand enden.`);
    }

    if (winnerScore > 11 && loserScore !== winnerScore - 2) {
      errors.push(`Satz ${setNumber}: ${left}:${right} ist kein gültiger Satz. Ab 12 Punkten sind nur 12:10, 13:11 usw. erlaubt.`);
    }

    return errors;
  }

  function deriveMatchScoreFromSetScoreText(value, matchMode, options = {}) {
    const parsed = parseNormalSetScoreText(value);
    const errors = [...parsed.errors];
    const requirement = getMatchSetRequirement(matchMode);
    let leftSets = 0;
    let rightSets = 0;
    let matchEndedAfterSet = 0;

    parsed.sets.forEach((set, index) => {
      const setNumber = index + 1;
      if (matchEndedAfterSet > 0 && requirement.type === "winning") {
        errors.push(`Nach Satz ${matchEndedAfterSet} war das Match bereits entschieden.`);
        return;
      }

      errors.push(...validateNormalSingleSet(set, setNumber));
      if (set.a > set.b) {
        leftSets += 1;
      } else if (set.b > set.a) {
        rightSets += 1;
      }

      if (
        requirement.type === "winning" &&
        (leftSets === requirement.setsToWin || rightSets === requirement.setsToWin)
      ) {
        matchEndedAfterSet = setNumber;
      }
    });

    if (requirement.type === "winning") {
      const maxSets = requirement.setsToWin * 2 - 1;
      if (parsed.sets.length > maxSets) {
        errors.push(`Ein Match auf ${requirement.setsToWin} Gewinnsätze hat maximal ${maxSets} Sätze.`);
      }
      if (leftSets !== requirement.setsToWin && rightSets !== requirement.setsToWin) {
        errors.push(`Bitte das komplette Match bis ${requirement.setsToWin} Gewinnsätze eingeben.`);
      }
    } else if (parsed.sets.length !== requirement.totalSets) {
      errors.push(`Bitte genau ${requirement.totalSets} Sätze eingeben.`);
    }

    const matchScore = `${leftSets}:${rightSets}`;
    if (options.disallowDraw && leftSets === rightSets) {
      errors.push("KO-Spiele dürfen nicht unentschieden enden.");
    }
    if (!isScoreCompatibleWithMode(matchScore, matchMode)) {
      errors.push(`Das berechnete Ergebnis ${matchScore} passt nicht zum gewählten Spielmodus.`);
    }

    return {
      valid: errors.length === 0,
      errors: [...new Set(errors)],
      matchScore,
      normalizedText: formatNormalSetScoreText(parsed.sets)
    };
  }

  function formatNormalSetScoreText(sets) {
    return (sets || []).map((set) => `${set.a}:${set.b}`).join(", ");
  }

  function reverseNormalSetScoreText(value) {
    const parsed = parseNormalSetScoreText(value);
    if (parsed.errors.length > 0) {
      return value || "";
    }
    return formatNormalSetScoreText(parsed.sets.map((set) => ({ a: set.b, b: set.a })));
  }

  function getNormalSetScorePlaceholder() {
    const requirement = getMatchSetRequirement(activeTournament.matchMode);
    if (requirement.type === "fixed") {
      return requirement.totalSets === 3 ? "7, -9, 8" : "7, -9";
    }
    return "7, 9, 5";
  }

  function getNormalSetScoreValue(tournament, resultScope, key) {
    return getNormalSetScoreMap(tournament, resultScope)?.[key] || "";
  }

  function getNormalSetScoreMap(tournament, resultScope) {
    if (!tournament) {
      return {};
    }

    if (tournament.mode === "team") {
      return resultScope === "double"
        ? tournament.team.doubleSetScores || {}
        : tournament.team.setScores || {};
    }

    if (tournament.mode === "groupsKnockout") {
      return resultScope === "knockout"
        ? tournament.groupsKnockout.knockoutSetScores || {}
        : tournament.groupsKnockout.groupSetScores || {};
    }

    return tournament.roundRobin.setScores || {};
  }

  function ensureNormalSetScoreMap(tournament, resultScope) {
    if (tournament.mode === "team") {
      if (resultScope === "double") {
        tournament.team.doubleSetScores = tournament.team.doubleSetScores || {};
        return tournament.team.doubleSetScores;
      }
      tournament.team.setScores = tournament.team.setScores || {};
      return tournament.team.setScores;
    }

    if (tournament.mode === "groupsKnockout") {
      if (resultScope === "knockout") {
        tournament.groupsKnockout.knockoutSetScores = tournament.groupsKnockout.knockoutSetScores || {};
        return tournament.groupsKnockout.knockoutSetScores;
      }
      tournament.groupsKnockout.groupSetScores = tournament.groupsKnockout.groupSetScores || {};
      return tournament.groupsKnockout.groupSetScores;
    }

    tournament.roundRobin.setScores = tournament.roundRobin.setScores || {};
    return tournament.roundRobin.setScores;
  }

  function getResultMapForScope(tournament, resultScope) {
    if (tournament.mode === "team") {
      return resultScope === "double" ? tournament.team.doubleResults : tournament.team.results;
    }

    if (tournament.mode === "groupsKnockout") {
      return resultScope === "knockout"
        ? tournament.groupsKnockout.knockoutResults
        : tournament.groupsKnockout.groupResults;
    }

    return tournament.roundRobin.results;
  }

  function getStatusMapForScope(tournament, resultScope) {
    if (tournament.mode === "team") {
      return resultScope === "double" ? tournament.team.doubleMatchStatuses : tournament.team.matchStatuses;
    }

    if (tournament.mode === "roundRobin") {
      return tournament.roundRobin.matchStatuses;
    }

    return null;
  }

  function deleteNormalSetScore(tournament, resultScope, key) {
    const setScores = ensureNormalSetScoreMap(tournament, resultScope);
    delete setScores[key];
  }

  function handleNormalSetScoreInput(event) {
    event.target.setCustomValidity("");
    const parsed = parseNormalSetScoreText(event.target.value);
    const errors = [...parsed.errors];

    parsed.sets.forEach((set, index) => {
      errors.push(...validateNormalSingleSet(set, index + 1));
    });

    if (errors.length > 0) {
      event.target.setCustomValidity([...new Set(errors)][0]);
    }
  }

  function handleNormalSetScoreChange(event) {
    const key = event.target.dataset.normalSetKey;
    const resultScope = event.target.dataset.normalSetScope || "";
    const reverseForDisplay = event.target.dataset.normalSetReverse === "true";
    const rawValue = event.target.value.trim();
    event.target.setCustomValidity("");

    if (!key) {
      return;
    }

    if (!rawValue) {
      updateActiveTournament((tournament) => {
        deleteNormalSetScore(tournament, resultScope, key);
      }, "Satzpunkte gelöscht", { checkRoundBackups: true });
      return;
    }

    const parsed = deriveMatchScoreFromSetScoreText(rawValue, activeTournament.matchMode, {
      disallowDraw: resultScope === "knockout"
    });

    if (!parsed.valid) {
      const message = parsed.errors[0] || NORMAL_SET_SCORE_INPUT_HINT;
      event.target.setCustomValidity(message);
      event.target.reportValidity?.();
      showInfo(message);
      return;
    }

    const storedSetScore = reverseForDisplay
      ? reverseNormalSetScoreText(parsed.normalizedText)
      : parsed.normalizedText;
    const storedMatchScore = reverseForDisplay ? reverseScore(parsed.matchScore) : parsed.matchScore;

    updateActiveTournament((tournament) => {
      const setScores = ensureNormalSetScoreMap(tournament, resultScope);
      const results = getResultMapForScope(tournament, resultScope);
      const statuses = getStatusMapForScope(tournament, resultScope);

      setScores[key] = storedSetScore;
      results[key] = storedMatchScore;
      if (statuses) {
        delete statuses[key];
      }
    }, "Satzpunkte gespeichert", { checkRoundBackups: true });

    showInfo(`Satzpunkte gespeichert. Ergebnis wurde automatisch auf ${parsed.matchScore} gesetzt.`);
  }

  function handleResultChange(event) {
    const key = event.target.dataset.resultKey;
    const reverseForDisplay = event.target.dataset.resultReverse === "true";
    const resultScope = event.target.dataset.resultScope;
    const value = reverseForDisplay && event.target.value ? reverseScore(event.target.value) : event.target.value;

    updateActiveTournament((tournament) => {
      const results = getResultMapForScope(tournament, resultScope);
      deleteNormalSetScore(tournament, resultScope, key);
      if (value) {
        results[key] = value;
      } else {
        delete results[key];
      }
    }, "Ergebnis gespeichert", { checkRoundBackups: true });
  }

  function handleMatchStatusChange(event) {
    const key = event.target.dataset.matchStatusKey;
    const reverseForDisplay = event.target.dataset.matchStatusReverse === "true";
    const resultScope = event.target.dataset.matchStatusScope;
    const status = MATCH_STATUSES[event.target.value] ? event.target.value : "normal";

    updateActiveTournament((tournament) => {
      const statusMap = getStatusMapForScope(tournament, resultScope);
      const results = getResultMapForScope(tournament, resultScope);
      deleteNormalSetScore(tournament, resultScope, key);

      if (status === "normal") {
        delete statusMap[key];
      } else {
        statusMap[key] = status;
      }

      if ((status === "walkover" || status === "retired") && !results[key]) {
        const defaultScore = getDefaultWinScore(tournament.matchMode);
        results[key] = reverseForDisplay ? reverseScore(defaultScore) : defaultScore;
      }
    }, "Sonderstatus gespeichert", { checkRoundBackups: true });
  }

  function handleAddDouble() {
    updateActiveTournament((tournament) => {
      tournament.team.doubles.push({
        id: createDoubleId(),
        teamAPlayer1: "",
        teamAPlayer2: "",
        teamBPlayer1: "",
        teamBPlayer2: ""
      });
      tournament.team.currentDoubleRound = 1;
      tournament.team.doubleRoundStates = [];
      tournament.team.doubleResults = {};
      tournament.team.doubleSetScores = {};
      tournament.team.doubleMatchStatuses = {};
    }, "Doppel hinzugefügt");
  }

  function handleRemoveDouble(event) {
    const doubleId = event.currentTarget.dataset.doubleId;
    if (!doubleId) {
      return;
    }

    updateActiveTournament((tournament) => {
      tournament.team.doubles = tournament.team.doubles.filter((entry) => entry.id !== doubleId);
      tournament.team.currentDoubleRound = 1;
      tournament.team.doubleRoundStates = [];
      tournament.team.doubleResults = {};
      tournament.team.doubleSetScores = {};
      tournament.team.doubleMatchStatuses = {};
    }, "Doppel entfernt");
  }

  function setTieBreakCriterion(scoring, index, nextCriterion) {
    const currentScoring = normalizeScoringRules(scoring);
    const order = [...currentScoring.tieBreakOrder];
    const safeIndex = Number.isInteger(index)
      ? Math.max(0, Math.min(order.length - 1, index))
      : 0;
    const existingIndex = order.indexOf(nextCriterion);

    if (existingIndex !== -1 && existingIndex !== safeIndex) {
      order[existingIndex] = order[safeIndex];
    }

    order[safeIndex] = nextCriterion;
    scoring.tieBreakOrder = order;
  }

  function handleSheetInput(event) {
    const action = event.target.dataset.sheetAction;
    if (!action) {
      return;
    }

    if (action === "scheduleEnabled") {
      updateActiveTournament((tournament) => {
        tournament.schedule.enabled = Boolean(event.target.checked);
      }, event.target.checked ? "Spielplan aktiviert" : "Spielplan deaktiviert");
      return;
    }

    if (action === "scheduleFieldCount") {
      updateActiveTournament((tournament) => {
        const nextCount = clampPositiveInteger(event.target.value, 1, 20);
        tournament.schedule.fieldCount = nextCount;
        tournament.schedule.fieldNames = ensureLength(
          tournament.schedule.fieldNames,
          nextCount,
          "Tisch"
        );
      }, "Spielplan-Tische geändert");
      return;
    }

    if (action === "scheduleStartTime") {
      updateActiveTournament((tournament) => {
        tournament.schedule.startTime = event.target.value;
      }, "Spielplan-Startzeit geändert");
      return;
    }

    if (action === "scheduleMatchDuration") {
      updateActiveTournament((tournament) => {
        tournament.schedule.matchDurationMinutes = clampPositiveInteger(event.target.value, 1, 240);
      }, "Spielplan-Spieldauer geändert");
      return;
    }

    if (action === "scheduleBreak") {
      updateActiveTournament((tournament) => {
        tournament.schedule.breakMinutes = clampPositiveInteger(event.target.value, 0, 120);
      }, "Spielplan-Puffer geändert");
      return;
    }

    if (action === "scheduleFieldName") {
      updateActiveTournament((tournament) => {
        tournament.schedule.fieldNames[Number(event.target.dataset.index)] = event.target.value;
      }, "Spielplan-Tischname geändert");
      return;
    }

    if (action === "roundRobinCurrentRound") {
      updateActiveTournament((tournament) => {
        tournament.roundRobin.currentRound = clampPositiveInteger(
          event.target.value,
          1,
          getRoundRobinRoundCount(tournament.roundRobin.playerCount)
        );
      }, "Aktuelle Runde geändert", { trackHistory: false });
      return;
    }

    if (action === "teamCurrentRound") {
      updateActiveTournament((tournament) => {
        tournament.team.currentRound = clampPositiveInteger(
          event.target.value,
          1,
          getTeamRoundCount(tournament.team.teamACount, tournament.team.teamBCount)
        );
      }, "Teamrunde geändert", { trackHistory: false });
      return;
    }

    if (action === "groupsCurrentRound") {
      updateActiveTournament((tournament) => {
        tournament.groupsKnockout.currentGroupRound = clampPositiveInteger(
          event.target.value,
          1,
          analysis.groupRoundSchedule.length
        );
      }, "Gruppenrunde geändert", { trackHistory: false });
      return;
    }

    if (action === "knockoutCurrentRound") {
      updateActiveTournament((tournament) => {
        tournament.groupsKnockout.currentKnockoutRound = clampPositiveInteger(
          event.target.value,
          1,
          Math.max(1, analysis.knockoutRounds.length)
        );
      }, "KO-Runde geändert", { trackHistory: false });
      return;
    }

    if (action === "doubleCurrentRound") {
      updateActiveTournament((tournament) => {
        tournament.team.currentDoubleRound = clampPositiveInteger(
          event.target.value,
          1,
          Math.max(1, tournament.team.doubles.length)
        );
      }, "Doppelrunde geändert", { trackHistory: false });
      return;
    }

    if (action === "doubleRoundManual") {
      updateActiveTournament((tournament) => {
        const roundNumber = tournament.team.currentDoubleRound;
        const sourceRound = analysis.doubleRounds.find((entry) => entry.roundNumber === roundNumber);
        const roundState = ensureDoubleRoundState(tournament.team, roundNumber, sourceRound);
        roundState.manual = Boolean(event.target.checked);
      }, "Doppelrunde umgestellt", { trackHistory: false });
      return;
    }

    if (action === "doubleRoundPairTeamA" || action === "doubleRoundPairTeamB") {
      updateActiveTournament((tournament) => {
        const pairingId = event.target.dataset.doublePairingId;
        const roundNumber = tournament.team.currentDoubleRound;
        const sourceRound = analysis.doubleRounds.find((entry) => entry.roundNumber === roundNumber);
        const roundState = ensureDoubleRoundState(tournament.team, roundNumber, sourceRound);
        const pairing = roundState.matchups.find((entry) => entry.id === pairingId);
        if (!pairing) {
          return;
        }

        roundState.manual = true;

        if (action === "doubleRoundPairTeamA") {
          pairing.teamADoubleId = event.target.value;
        } else {
          pairing.teamBDoubleId = event.target.value;
        }
      }, "Doppel-Paarung geändert");
    }
  }

  function handlePlayerStatsFontSizeAdjust(event) {
    const step = Number(event.currentTarget.dataset.fontSizeStep);
    if (!Number.isFinite(step) || step === 0) {
      return;
    }

    const currentIndex = PLAYER_STATS_FONT_SIZES.indexOf(playerStatsFontSize);
    const nextIndex = Math.min(
      PLAYER_STATS_FONT_SIZES.length - 1,
      Math.max(0, currentIndex + step)
    );

    if (nextIndex === currentIndex) {
      applyPlayerStatsFontSizeUI();
      return;
    }

    playerStatsFontSize = PLAYER_STATS_FONT_SIZES[nextIndex];
    savePlayerStatsFontSize();
    applyPlayerStatsFontSizeUI();
  }

  function handleRoundShift(event) {
    const delta = Number.parseInt(event.currentTarget.dataset.roundShift, 10);
    const target = event.currentTarget.dataset.targetRound;

    if (target === "roundRobin") {
      updateActiveTournament((tournament) => {
        tournament.roundRobin.currentRound = clampPositiveInteger(
          tournament.roundRobin.currentRound + delta,
          1,
          getRoundRobinRoundCount(tournament.roundRobin.playerCount)
        );
      }, "Aktuelle Runde geändert", { trackHistory: false });
      return;
    }

    if (target === "team") {
      updateActiveTournament((tournament) => {
        tournament.team.currentRound = clampPositiveInteger(
          tournament.team.currentRound + delta,
          1,
          getTeamRoundCount(tournament.team.teamACount, tournament.team.teamBCount)
        );
      }, "Teamrunde geändert", { trackHistory: false });
      return;
    }

    if (target === "groupStage") {
      updateActiveTournament((tournament) => {
        tournament.groupsKnockout.currentGroupRound = clampPositiveInteger(
          tournament.groupsKnockout.currentGroupRound + delta,
          1,
          analysis.groupRoundSchedule.length
        );
      }, "Gruppenrunde geändert", { trackHistory: false });
      return;
    }

    if (target === "knockout") {
      updateActiveTournament((tournament) => {
        tournament.groupsKnockout.currentKnockoutRound = clampPositiveInteger(
          tournament.groupsKnockout.currentKnockoutRound + delta,
          1,
          Math.max(1, analysis.knockoutRounds.length)
        );
      }, "KO-Runde geändert", { trackHistory: false });
      return;
    }

    if (target === "double") {
      updateActiveTournament((tournament) => {
        tournament.team.currentDoubleRound = clampPositiveInteger(
          tournament.team.currentDoubleRound + delta,
          1,
          Math.max(1, tournament.team.doubles.length)
        );
      }, "Doppelrunde geändert", { trackHistory: false });
    }
  }


  function getParticipantImportSettings(targetKey) {
    if (targetKey === "teamA") {
      return {
        description: "Namen für Team A einfügen oder als CSV laden.",
        textareaLabel: "Team-A-Teilnehmer einfügen",
        placeholder: "Teamname: Team Rot\nAnna\nBen\nCara",
        hasTeamName: true,
        teamNamePlaceholder: activeTournament.team.teamAName || "Team A"
      };
    }

    if (targetKey === "teamB") {
      return {
        description: "Namen für Team B einfügen oder als CSV laden.",
        textareaLabel: "Team-B-Teilnehmer einfügen",
        placeholder: "Teamname: Team Blau\nDina\nEmil\nFinn",
        hasTeamName: true,
        teamNamePlaceholder: activeTournament.team.teamBName || "Team B"
      };
    }

    return {
      description: "Kopiere Namen aus Excel, Numbers oder einer Textliste. Trennzeichen wie Zeilenumbruch, Semikolon, Komma und Tab werden erkannt.",
      textareaLabel: "Namen eintragen — ein Name pro Zeile",
      placeholder: "Tobi\nMia\nLukas Berger\nSofia\nTarek",
      hasTeamName: false,
      teamNamePlaceholder: ""
    };
  }

  function createParticipantImportTargetDraft() {
    return {
      text: "",
      teamName: "",
      numberDuplicates: false,
      fileName: ""
    };
  }

  function getParticipantImportDraft(tournamentId) {
    if (!participantImportDrafts.has(tournamentId)) {
      participantImportDrafts.set(tournamentId, {
        roundRobin: createParticipantImportTargetDraft(),
        teamA: createParticipantImportTargetDraft(),
        teamB: createParticipantImportTargetDraft()
      });
    }

    return participantImportDrafts.get(tournamentId);
  }

  function getParticipantImportPreview(targetKey) {
    const draft = getParticipantImportDraft(activeTournament.id)[targetKey] || createParticipantImportTargetDraft();
    const parsed = parseParticipantImportText(draft.text);
    const comparisonNames = getParticipantImportComparisonNames(targetKey);
    const duplicateKeys = getDuplicateNameKeys([...parsed.names, ...comparisonNames]);
    const displayNames = parsed.names.map((name) => ({
      name,
      isDuplicate: duplicateKeys.has(normalizeNameKey(name))
    }));
    const nextNames = draft.numberDuplicates
      ? numberDuplicateNames(parsed.names, comparisonNames)
      : parsed.names;
    const maxCount = nextNames.length > 0 ? clampCount(nextNames.length) : 0;
    const applyNames = nextNames.slice(0, maxCount);

    return {
      hasInput: draft.text.trim().length > 0,
      names: parsed.names,
      displayNames,
      applyNames,
      duplicateCount: displayNames.filter((entry) => entry.isDuplicate).length,
      ignoredCount: Math.max(0, nextNames.length - applyNames.length),
      teamName: (draft.teamName.trim() || parsed.teamName).trim()
    };
  }

  function refreshParticipantImportPreview(targetKey) {
    const panel = configDetails.querySelector('[data-import-panel="' + targetKey + '"]');
    if (!panel) {
      return;
    }

    const preview = getParticipantImportPreview(targetKey);
    const previewElement = panel.querySelector('[data-import-preview="' + targetKey + '"]');
    const applyButton = panel.querySelector('[data-import-apply="' + targetKey + '"]');
    const teamNameInput = panel.querySelector('[data-import-team-name="' + targetKey + '"]');
    const countHeading = panel.querySelector("[data-import-count]");

    if (previewElement) {
      // Beim Tippen zeigt die rechte Spalte die erkannten Namen, sonst die
      // bereits übernommene Startliste.
      const rows = preview.hasInput
        ? preview.displayNames.map((entry, index) => ({ name: preview.applyNames[index] || entry.name, index }))
        : getEntryRoster(targetKey).map((name, index) => ({ name, index }));
      previewElement.innerHTML = renderEntryRows(rows, targetKey, preview.hasInput);

      previewElement.querySelectorAll("[data-entry-remove]").forEach((button) => {
        button.addEventListener("click", () =>
          handleRemoveEntry(button.dataset.entryRemove, Number(button.dataset.index))
        );
      });
      previewElement.querySelectorAll("[data-draft-remove]").forEach((button) => {
        button.addEventListener("click", () =>
          handleRemoveDraftLine(button.dataset.draftRemove, Number(button.dataset.index))
        );
      });
    }
    if (countHeading) {
      countHeading.textContent = preview.hasInput
        ? formatImportCountHeading(preview.applyNames.length)
        : `Startliste · ${getEntryRoster(targetKey).length} Teilnehmer`;
    }

    const hint = panel.querySelector("[data-import-hint]");
    if (hint) {
      hint.textContent = preview.hasInput
        ? "Danach folgt die Auslosung der ersten Runde."
        : "Namen eintragen, dann übernehmen.";
    }
    if (applyButton) {
      applyButton.disabled = preview.applyNames.length === 0;
    }
    if (teamNameInput && !teamNameInput.value && preview.teamName) {
      teamNameInput.value = preview.teamName;
    }
  }

  function parseParticipantImportText(rawText) {
    const rows = parseDelimitedRows(rawText);
    const contentRows = [];
    let teamName = "";

    rows.forEach((row) => {
      const detectedTeamName = getTeamNameFromImportRow(row);
      if (detectedTeamName) {
        if (!teamName) {
          teamName = detectedTeamName;
        }
        return;
      }
      contentRows.push(row);
    });

    const headerNameColumn = getHeaderNameColumn(contentRows[0]);
    if (headerNameColumn >= 0) {
      const dataRows = contentRows.slice(1);
      const names = dataRows.map((row) => row[headerNameColumn] || "");
      const headerTeamName = getSingleColumnImportValue(
        dataRows,
        getHeaderTeamColumn(contentRows[0])
      );
      return { names: cleanImportedNames(names), teamName: teamName || headerTeamName };
    }

    const repeatedTeamColumn = getRepeatedTeamColumnImport(contentRows);
    if (repeatedTeamColumn) {
      return {
        names: cleanImportedNames(repeatedTeamColumn.names),
        teamName: teamName || repeatedTeamColumn.teamName
      };
    }

    return {
      names: cleanImportedNames(contentRows.flatMap((row) => row)),
      teamName
    };
  }

  function parseDelimitedRows(rawText) {
    const rows = [[]];
    let currentValue = "";
    let isQuoted = false;
    const text = String(rawText || "");

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const nextCharacter = text[index + 1];

      if (isQuoted) {
        if (character === '"' && nextCharacter === '"') {
          currentValue += '"';
          index += 1;
        } else if (character === '"') {
          isQuoted = false;
        } else {
          currentValue += character;
        }
        continue;
      }

      if (character === '"') {
        isQuoted = true;
        continue;
      }

      if ([",", ";", "\t"].includes(character)) {
        rows[rows.length - 1].push(currentValue.trim());
        currentValue = "";
        continue;
      }

      if (character === "\n" || character === "\r") {
        rows[rows.length - 1].push(currentValue.trim());
        currentValue = "";
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }
        rows.push([]);
        continue;
      }

      currentValue += character;
    }

    rows[rows.length - 1].push(currentValue.trim());
    return rows.filter((row) => row.some((cell) => cell.trim()));
  }

  function getTeamNameFromImportRow(row) {
    if (!Array.isArray(row) || row.length === 0) {
      return "";
    }

    if (row.length === 1) {
      const match = row[0].match(/^(?:team(?:\s+[ab])?|teamname|mannschaft|gruppe)\s*[:=-]\s*(.+)$/i);
      return match?.[1]?.trim() || "";
    }

    const label = normalizeNameKey(row[0]);
    if (["teamname", "mannschaft", "gruppe"].includes(label) && row[1]) {
      return row[1].trim();
    }

    return "";
  }

  function getHeaderNameColumn(row) {
    if (!Array.isArray(row)) {
      return -1;
    }

    return row.findIndex((cell) => /^(name|spieler|spielername|teilnehmer|person)$/i.test(cell.trim()));
  }

  function getHeaderTeamColumn(row) {
    if (!Array.isArray(row)) {
      return -1;
    }

    return row.findIndex((cell) => /^(team|teamname|mannschaft|gruppe)$/i.test(cell.trim()));
  }

  function getSingleColumnImportValue(rows, columnIndex) {
    if (columnIndex < 0) {
      return "";
    }

    const values = rows.map((row) => row[columnIndex]?.trim()).filter(Boolean);
    if (values.length === 0) {
      return "";
    }

    const firstValue = values[0];
    return values.every((value) => normalizeNameKey(value) === normalizeNameKey(firstValue))
      ? firstValue
      : "";
  }

  function getRepeatedTeamColumnImport(rows) {
    const candidateRows = rows.filter((row) => row.length >= 2 && row[0]?.trim() && row[1]?.trim());
    if (candidateRows.length < 2) {
      return null;
    }

    const teamName = candidateRows[0][0].trim();
    const normalizedTeamName = normalizeNameKey(teamName);
    const hasSingleTeamColumn = candidateRows.every(
      (row) => normalizeNameKey(row[0]) === normalizedTeamName
    );

    if (!hasSingleTeamColumn || getHeaderNameColumn(candidateRows[0]) >= 0) {
      return null;
    }

    return {
      teamName,
      names: candidateRows.map((row) => row[1])
    };
  }

  function cleanImportedNames(names) {
    return names.map((name) => String(name || "").trim()).filter(Boolean);
  }

  function getParticipantImportComparisonNames(targetKey) {
    if (targetKey === "teamA") {
      return ensureLength(
        activeTournament.team.teamBPlayers,
        activeTournament.team.teamBCount,
        "Spieler B"
      );
    }

    if (targetKey === "teamB") {
      return ensureLength(
        activeTournament.team.teamAPlayers,
        activeTournament.team.teamACount,
        "Spieler A"
      );
    }

    return [];
  }

  function getDuplicateNameKeys(names) {
    const counts = new Map();
    names.forEach((name) => {
      const key = normalizeNameKey(name);
      if (!key) {
        return;
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }

  function numberDuplicateNames(names, reservedNames = []) {
    const usedCounts = new Map();
    reservedNames.forEach((name) => {
      const key = normalizeNameKey(name);
      if (key) {
        usedCounts.set(key, (usedCounts.get(key) || 0) + 1);
      }
    });

    return names.map((name) => {
      const baseName = name.trim();
      let candidateName = baseName;
      let candidateKey = normalizeNameKey(candidateName);
      let nextIndex = usedCounts.get(candidateKey) || 0;

      while (candidateKey && usedCounts.has(candidateKey)) {
        nextIndex += 1;
        candidateName = baseName + " (" + nextIndex + ")";
        candidateKey = normalizeNameKey(candidateName);
      }

      if (candidateKey) {
        usedCounts.set(candidateKey, 1);
      }
      return candidateName;
    });
  }

  function normalizeNameKey(name) {
    return String(name || "").trim().toLocaleLowerCase("de-DE");
  }

  function isTeamImportTarget(targetKey) {
    return targetKey === "teamA" || targetKey === "teamB";
  }

  function hasEnteredValues(values, ignoredValues = []) {
    const ignored = new Set(ignoredValues);
    return Object.values(values || {}).some((value) => {
      if (value === undefined || value === null || value === "") {
        return false;
      }
      return !ignored.has(value);
    });
  }

  function hasRoundRobinDrawStarted(tournament) {
    return (
      hasEnteredValues(tournament?.roundRobin?.results) ||
      hasEnteredValues(tournament?.roundRobin?.setScores) ||
      hasEnteredValues(tournament?.roundRobin?.matchStatuses, ["normal"]) ||
      (tournament?.ttRace?.rounds?.length ?? 0) > 0 ||
      hasEnteredValues(tournament?.clicktt?.setScores)
    );
  }

  function hasGroupsKnockoutDrawStarted(tournament) {
    return (
      hasEnteredValues(tournament?.groupsKnockout?.groupResults) ||
      hasEnteredValues(tournament?.groupsKnockout?.groupSetScores) ||
      hasEnteredValues(tournament?.groupsKnockout?.knockoutSetScores) ||
      hasEnteredValues(tournament?.groupsKnockout?.knockoutResults)
    );
  }

  function activeTournamentHasStoredResults() {
    if (activeTournament.mode === "team") {
      return (
        hasEnteredValues(activeTournament.team.results) ||
        hasEnteredValues(activeTournament.team.setScores) ||
        hasEnteredValues(activeTournament.team.matchStatuses, ["normal"]) ||
        hasEnteredValues(activeTournament.team.doubleResults) ||
        hasEnteredValues(activeTournament.team.doubleSetScores) ||
        hasEnteredValues(activeTournament.team.doubleMatchStatuses, ["normal"])
      );
    }

    if (activeTournament.mode === "groupsKnockout") {
      return hasGroupsKnockoutDrawStarted(activeTournament);
    }

    return hasRoundRobinDrawStarted(activeTournament);
  }

  function trimRoundRobinResults(results, count) {
    const trimmed = {};
    Object.entries(results).forEach(([key, value]) => {
      const [row, column] = key.split("-").map(Number);
      if (row < count && column < count) {
        trimmed[key] = value;
      }
    });
    return trimmed;
  }

  function trimTeamResults(results, teamACount, teamBCount) {
    const trimmed = {};
    Object.entries(results).forEach(([key, value]) => {
      const [row, column] = key.split("-").map(Number);
      if (row < teamACount && column < teamBCount) {
        trimmed[key] = value;
      }
    });
    return trimmed;
  }

  function ensureLength(list, count, fallbackLabel) {
    return Array.from({ length: count }, (_, index) => list?.[index] || `${fallbackLabel} ${index + 1}`);
  }

  function ensureDoubleRoundState(teamState, roundNumber, fallbackRound = null) {
    if (!Array.isArray(teamState.doubleRoundStates)) {
      teamState.doubleRoundStates = [];
    }

    let roundState = teamState.doubleRoundStates.find((entry) => entry.roundNumber === roundNumber);
    if (!roundState) {
      roundState = {
        roundNumber,
        manual: false,
        matchups: []
      };
      teamState.doubleRoundStates.push(roundState);
    }

    if (!Array.isArray(roundState.matchups)) {
      roundState.matchups = [];
    }

    if (roundState.matchups.length === 0 && Array.isArray(fallbackRound?.pairings)) {
      roundState.matchups = fallbackRound.pairings.map((entry) => ({
        id: entry.id,
        teamADoubleId: entry.teamADoubleId || "",
        teamBDoubleId: entry.teamBDoubleId || ""
      }));
    }

    return roundState;
  }

  function getCurrentRoundExportData() {
    if (activeTournament.mode === "team") {
      if (activeTournament.mode === "groupsKnockout") {
      const totalRounds = analysis.groupRoundSchedule.length;
      const currentRoundNumber = getCurrentGroupsRoundNumber(totalRounds);
      return {
        analysis,
        round: analysis.groupRoundSchedule[currentRoundNumber - 1],
        currentRoundNumber,
        totalRounds
      };
    }

    const totalRounds = analysis.rounds.length;
      const currentRoundNumber = getCurrentTeamRoundNumber(totalRounds);
      return {
        analysis,
        round: analysis.rounds[currentRoundNumber - 1],
        currentRoundNumber,
        totalRounds
      };
    }

    const totalRounds = analysis.rounds.length;
    const currentRoundNumber = getCurrentRoundNumber(totalRounds);
    return {
      analysis,
      round: analysis.rounds[currentRoundNumber - 1],
      currentRoundNumber,
      totalRounds
    };
  }

  function getRoundStatus(round) {
    const matches = Array.isArray(round?.matches) ? round.matches : null;
    const totalMatches = matches ? matches.length : round?.pairings?.length ?? 0;
    const completedMatches = matches
      ? matches.filter((match) => isTtRaceMatchComplete(match)).length
      : round?.pairings?.filter(
          (pairing) => pairing.score || (pairing.matchStatus && pairing.matchStatus !== "normal")
        ).length ?? 0;
    const isComplete = totalMatches > 0 && completedMatches === totalMatches;

    if (isComplete) {
      return {
        isComplete: true,
        className: "is-complete",
        label: "Fertig",
        completedMatches,
        totalMatches
      };
    }

    if (completedMatches > 0) {
      return {
        isComplete: false,
        className: "is-progress",
        label: `${completedMatches}/${totalMatches} fertig`,
        completedMatches,
        totalMatches
      };
    }

    return {
      isComplete: false,
      className: "is-pending",
      label: "Offen",
      completedMatches,
      totalMatches
    };
  }

  function renderProgressSummary(rounds, currentRoundNumber, completedMatches, totalMatches, matchLabel) {
    const currentRound = rounds[currentRoundNumber - 1];
    const roundStatus = getRoundStatus(currentRound);

    return `
      <div class="progress-strip">
        <span class="progress-pill">Runde ${currentRoundNumber} von ${rounds.length}</span>
        <span class="progress-pill">${completedMatches} von ${totalMatches} ${escapeHtml(matchLabel)} eingetragen</span>
        <span class="progress-pill ${roundStatus.className}">
          Aktuelle Runde: ${escapeHtml(roundStatus.label)}
        </span>
      </div>
    `;
  }

  function renderHistoryControls() {
    return `
      <div class="section-heading-actions" aria-label="Änderungen im aktiven Reiter">
        <button class="history-tool-button" type="button" data-history-action="undo" aria-label="Zurück" title="Zurück">
          Zurück
        </button>
        <button class="history-tool-button" type="button" data-history-action="redo" aria-label="Vor" title="Vor">
          Vor
        </button>
      </div>
    `;
  }

  function findDuplicateNames(names) {
    const seen = new Map();

    for (const rawName of names) {
      const trimmedName = rawName.trim();
      if (!trimmedName) {
        continue;
      }

      const normalizedName = trimmedName.toLocaleLowerCase("de-DE");
      if (seen.has(normalizedName)) {
        return trimmedName;
      }

      seen.set(normalizedName, trimmedName);
    }

    return "";
  }

  function validateUniquePlayerNameChange(action, target) {
    const nextValue = target.value;
    const index = Number(target.dataset.index);

    if (action === "roundRobinName") {
      const candidateNames = ensureLength(
        activeTournament.roundRobin.playerNames,
        activeTournament.roundRobin.playerCount,
        "Spieler"
      );
      candidateNames[index] = nextValue;
      const duplicateName = findDuplicateNames(candidateNames);
      return duplicateName
        ? `Der Spielername "${duplicateName}" ist in diesem Reiter bereits vergeben.`
        : "";
    }

    if (action === "groupsKnockoutName") {
      const candidateNames = ensureLength(
        activeTournament.groupsKnockout.playerNames,
        activeTournament.groupsKnockout.playerCount,
        "Spieler"
      );
      candidateNames[index] = nextValue;
      const duplicateName = findDuplicateNames(candidateNames);
      return duplicateName
        ? `Der Teilnehmername "${duplicateName}" ist in diesem Reiter bereits vergeben.`
        : "";
    }

    if (action === "teamAPlayer" || action === "teamBPlayer") {
      const teamANames = ensureLength(
        activeTournament.team.teamAPlayers,
        activeTournament.team.teamACount,
        "Spieler A"
      );
      const teamBNames = ensureLength(
        activeTournament.team.teamBPlayers,
        activeTournament.team.teamBCount,
        "Spieler B"
      );

      if (action === "teamAPlayer") {
        teamANames[index] = nextValue;
      } else {
        teamBNames[index] = nextValue;
      }

      const duplicateName = findDuplicateNames([...teamANames, ...teamBNames]);
      return duplicateName
        ? `Der Spielername "${duplicateName}" ist in diesem Reiter bereits vergeben.`
        : "";
    }

    return "";
  }

  function getActiveTournamentIndex() {
    return workspace.tournaments.findIndex((entry) => entry.id === workspace.activeTournamentId);
  }

  function getTournamentLabel(tournament, index) {
    return tournament.tabName?.trim() || tournament.tournamentName?.trim() || `Turnier ${index + 1}`;
  }

  function getCurrentRoundNumber(totalRounds) {
    return clampPositiveInteger(activeTournament.roundRobin.currentRound, 1, Math.max(1, totalRounds));
  }

  function getCurrentTeamRoundNumber(totalRounds) {
    return clampPositiveInteger(activeTournament.team.currentRound, 1, Math.max(1, totalRounds));
  }

  function getCurrentDoubleRoundNumber(totalRounds) {
    return clampPositiveInteger(activeTournament.team.currentDoubleRound, 1, Math.max(1, totalRounds));
  }

  function getCurrentGroupsRoundNumber(totalRounds) {
    return clampPositiveInteger(
      activeTournament.groupsKnockout.currentGroupRound,
      1,
      Math.max(1, totalRounds)
    );
  }

  function getCurrentKnockoutRoundNumber(totalRounds) {
    return clampPositiveInteger(
      activeTournament.groupsKnockout.currentKnockoutRound,
      1,
      Math.max(1, totalRounds)
    );
  }

  function renderTabToolIcon(kind) {
    if (kind === "drag") {
      return `
        <svg class="tab-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M9 6h.01" />
          <path d="M9 12h.01" />
          <path d="M9 18h.01" />
          <path d="M15 6h.01" />
          <path d="M15 12h.01" />
          <path d="M15 18h.01" />
        </svg>
      `;
    }

    if (kind === "rename") {
      return `
        <svg class="tab-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      `;
    }

    return `
      <svg class="tab-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12" />
        <path d="M18 6L6 18" />
      </svg>
    `;
  }

  function showInfo(message) {
    if (infoMessageTimeoutId) {
      window.clearTimeout(infoMessageTimeoutId);
      infoMessageTimeoutId = null;
    }

    messageArea.innerHTML = `<div class="message info">${escapeHtml(message)}</div>`;

    infoMessageTimeoutId = window.setTimeout(() => {
      messageArea.innerHTML = "";
      infoMessageTimeoutId = null;
    }, INFO_MESSAGE_DURATION_MS);
  }

  function placeClass(place) {
    if (place === 1) {
      return "place-first";
    }
    if (place === 2) {
      return "place-second";
    }
    if (place === 3) {
      return "place-third";
    }
    return "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
