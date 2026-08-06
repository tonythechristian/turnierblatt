(function () {
  const MODES = {
    roundRobin: {
      id: "roundRobin",
      label: "Jeder-gegen-jeden",
      description: "Klassische Matrix für Einzelturniere mit automatischer Rangliste."
    },
    team: {
      id: "team",
      label: "Teamwettbewerb",
      description: "Teams beliebiger Größe gegeneinander, inklusive Einzel- und Teamauswertung."
    },
    groupsKnockout: {
      id: "groupsKnockout",
      label: "Gruppen + KO",
      description: "Gruppenphase mit automatischer KO-Runde aus den besten Teilnehmern."
    }
  };

  function createWinningMatchMode(targetWins) {
    const scores = [];

    for (let loserSets = 0; loserSets < targetWins; loserSets += 1) {
      scores.push(`${targetWins}:${loserSets}`);
    }

    for (let winnerSets = targetWins - 1; winnerSets >= 0; winnerSets -= 1) {
      scores.push(`${winnerSets}:${targetWins}`);
    }

    return {
      id: `win${targetWins}`,
      label: `${targetWins} Gewinn${targetWins === 1 ? "satz" : "sätze"}`,
      scores
    };
  }

  function createFixedSetMatchMode(totalSets) {
    const scores = [];

    for (let leftSets = totalSets; leftSets >= 0; leftSets -= 1) {
      scores.push(`${leftSets}:${totalSets - leftSets}`);
    }

    return {
      id: `fixed${totalSets}`,
      label: `Immer ${totalSets} ${totalSets === 1 ? "Satz" : "Sätze"}`,
      scores
    };
  }

  const MATCH_MODE_ORDER = [
    "win1",
    "win2",
    "win3",
    "win4",
    "win5",
    "fixed2",
    "fixed3",
    "fixed4",
    "fixed5"
  ];
  const MATCH_MODES = Object.fromEntries(
    [
      createWinningMatchMode(1),
      createWinningMatchMode(2),
      createWinningMatchMode(3),
      createWinningMatchMode(4),
      createWinningMatchMode(5),
      createFixedSetMatchMode(2),
      createFixedSetMatchMode(3),
      createFixedSetMatchMode(4),
      createFixedSetMatchMode(5)
    ].map((mode) => [mode.id, mode])
  );
  const VALID_SCORES = [...new Set(MATCH_MODE_ORDER.flatMap((modeId) => MATCH_MODES[modeId].scores))];
  const VALID_SCORE_SET = new Set(VALID_SCORES);
  const DEFAULT_TIE_BREAK_ORDER = ["matchPoints", "setDiff", "setsWon", "directComparison"];
  const TIE_BREAK_CRITERIA = {
    matchPoints: {
      id: "matchPoints",
      label: "Siege/Punkte"
    },
    setDiff: {
      id: "setDiff",
      label: "Satzdifferenz"
    },
    setsWon: {
      id: "setsWon",
      label: "Gewonnene Sätze"
    },
    directComparison: {
      id: "directComparison",
      label: "Direkter Vergleich"
    }
  };
  const PLAYER_STATUSES = {
    active: { id: "active", label: "Aktiv" },
    missing: { id: "missing", label: "Fehlt / nicht eingecheckt" },
    withdrawn: { id: "withdrawn", label: "Zurueckgezogen" }
  };
  const PLAYER_STATUS_ORDER = ["active", "missing", "withdrawn"];
  const MATCH_STATUSES = {
    normal: { id: "normal", label: "Normal gespielt", affectsRanking: true },
    walkover: { id: "walkover", label: "Walkover / Sieg kampflos", affectsRanking: true },
    retired: { id: "retired", label: "Aufgabe", affectsRanking: true },
    void: { id: "void", label: "Nicht gewertet", affectsRanking: false }
  };
  const MATCH_STATUS_ORDER = ["normal", "walkover", "retired", "void"];

  function hashString(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seedValue) {
    let state = hashString(seedValue) || 1;
    return function seededRandom() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 4294967296);
    };
  }

  function createSystemRandom() {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      return function cryptoRandom() {
        const bytes = new Uint32Array(1);
        globalThis.crypto.getRandomValues(bytes);
        return bytes[0] / 4294967296;
      };
    }
    return Math.random;
  }

  function hasSameOrder(left, right) {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
  }

  function rotateByRandomOffset(items, random) {
    if (items.length < 2) {
      return items;
    }
    const offset = 1 + Math.floor(random() * (items.length - 1));
    return [...items.slice(offset), ...items.slice(0, offset)];
  }

  function shuffleList(items, options = {}) {
    const random = options.seed ? createSeededRandom(options.seed) : createSystemRandom();
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    if (options.avoidSameOrder && hasSameOrder(shuffled, items)) {
      return rotateByRandomOffset(shuffled, random);
    }

    return shuffled;
  }

  function createDefaultScoringRules() {
    return {
      winPoints: 1,
      drawPoints: 0,
      lossPoints: 0,
      tieBreakOrder: [...DEFAULT_TIE_BREAK_ORDER]
    };
  }

  function createDefaultState() {
    return {
      tabName: "",
      tournamentName: "",
      matchMode: "win3",
      mode: "roundRobin",
      schedule: {
        enabled: false,
        fieldCount: 2,
        startTime: "09:00",
        matchDurationMinutes: 20,
        breakMinutes: 5,
        fieldNames: ["Tisch 1", "Tisch 2"]
      },
      scoring: createDefaultScoringRules(),
      roundRobin: {
        playerCount: 4,
        playerNames: Array.from({ length: 4 }, (_, index) => `Spieler ${index + 1}`),
        playerStatuses: Array.from({ length: 4 }, () => "active"),
        currentRound: 1,
        results: {},
        setScores: {},
        matchStatuses: {}
      },
      team: {
        teamAName: "Team A",
        teamBName: "Team B",
        teamACount: 4,
        teamBCount: 4,
        teamAPlayers: Array.from({ length: 4 }, (_, index) => `Spieler A${index + 1}`),
        teamBPlayers: Array.from({ length: 4 }, (_, index) => `Spieler B${index + 1}`),
        teamAPlayerStatuses: Array.from({ length: 4 }, () => "active"),
        teamBPlayerStatuses: Array.from({ length: 4 }, () => "active"),
        doubles: [],
        currentDoubleRound: 1,
        doubleRoundStates: [],
        currentRound: 1,
        results: {},
        setScores: {},
        matchStatuses: {},
        doubleResults: {},
        doubleSetScores: {},
        doubleMatchStatuses: {}
      },
      groupsKnockout: {
        playerCount: 8,
        groupCount: 2,
        qualifiersPerGroup: 2,
        placementMatchesEnabled: true,
        playerNames: Array.from({ length: 8 }, (_, index) => `Spieler ${index + 1}`),
        currentGroupRound: 1,
        currentKnockoutRound: 1,
        groupResults: {},
        groupSetScores: {},
        knockoutSetScores: {},
        knockoutResults: {}
      }
    };
  }

  function normalizeState(rawState) {
    const defaultState = createDefaultState();
    const merged = {
      ...defaultState,
      ...rawState,
      schedule: {
        ...defaultState.schedule,
        ...(rawState?.schedule ?? {})
      },
      scoring: normalizeScoringRules(rawState && rawState.scoring),
      roundRobin: {
        ...defaultState.roundRobin,
        ...(rawState?.roundRobin ?? {})
      },
      team: {
        ...defaultState.team,
        ...(rawState?.team ?? {})
      },
      groupsKnockout: {
        ...defaultState.groupsKnockout,
        ...(rawState?.groupsKnockout ?? {})
      }
    };

    merged.mode =
      merged.mode === "team"
        ? "team"
        : merged.mode === "groupsKnockout"
          ? "groupsKnockout"
          : "roundRobin";
    merged.matchMode = normalizeMatchMode(merged.matchMode);
    merged.schedule = normalizeScheduleConfig(merged.schedule);
    merged.roundRobin.playerCount = clampCount(merged.roundRobin.playerCount);
    merged.roundRobin.currentRound = clampPositiveInteger(
      merged.roundRobin.currentRound,
      1,
      getRoundRobinRoundCount(merged.roundRobin.playerCount)
    );
    merged.roundRobin.playerNames = normalizeRoundRobinNames(
      merged.roundRobin.playerNames,
      merged.roundRobin.playerCount,
      merged.roundRobin.results,
      merged.roundRobin.matchStatuses
    );
    merged.roundRobin.playerStatuses = normalizePlayerStatuses(
      merged.roundRobin.playerStatuses,
      merged.roundRobin.playerNames.length
    );
    merged.roundRobin.results = filterStoredRoundRobinResults(
      merged.roundRobin.results,
      merged.roundRobin.playerCount,
      merged.roundRobin.playerNames,
      merged.roundRobin.matchStatuses
    );
    merged.roundRobin.setScores = filterStoredRoundRobinSetScores(
      merged.roundRobin.setScores,
      merged.roundRobin.playerCount,
      merged.roundRobin.playerNames,
      merged.roundRobin.results,
      merged.roundRobin.matchStatuses
    );
    merged.roundRobin.matchStatuses = filterStoredRoundRobinMatchStatuses(
      merged.roundRobin.matchStatuses,
      merged.roundRobin.playerCount,
      merged.roundRobin.playerNames,
      merged.roundRobin.results
    );

    merged.team.teamACount = clampCount(merged.team.teamACount);
    merged.team.teamBCount = clampCount(merged.team.teamBCount);
    merged.team.currentRound = clampPositiveInteger(
      merged.team.currentRound,
      1,
      getTeamRoundCount(merged.team.teamACount, merged.team.teamBCount)
    );
    merged.team.teamAName = merged.team.teamAName?.trim() || "Team A";
    merged.team.teamBName = merged.team.teamBName?.trim() || "Team B";
    merged.team.teamAPlayers = normalizeNames(
      merged.team.teamAPlayers,
      merged.team.teamACount,
      "Spieler A"
    );
    merged.team.teamBPlayers = normalizeNames(
      merged.team.teamBPlayers,
      merged.team.teamBCount,
      "Spieler B"
    );
    merged.team.teamAPlayerStatuses = normalizePlayerStatuses(
      merged.team.teamAPlayerStatuses,
      merged.team.teamACount
    );
    merged.team.teamBPlayerStatuses = normalizePlayerStatuses(
      merged.team.teamBPlayerStatuses,
      merged.team.teamBCount
    );
    merged.team.doubles = normalizeTeamDoubles(merged.team.doubles);
    merged.team.currentDoubleRound = clampPositiveInteger(
      merged.team.currentDoubleRound,
      1,
      Math.max(1, getDoubleRoundCount(merged.team.doubles.length))
    );
    merged.team.doubleRoundStates = normalizeDoubleRoundStates(
      merged.team.doubleRoundStates,
      merged.team.doubles,
      merged.team.doubleResults,
      rawState?.team?.doubleMatchups
    );
    merged.team.results = filterTeamResults(
      merged.team.results,
      merged.team.teamACount,
      merged.team.teamBCount
    );
    merged.team.setScores = filterTeamSetScores(
      merged.team.setScores,
      merged.team.teamACount,
      merged.team.teamBCount
    );
    merged.team.matchStatuses = filterTeamMatchStatuses(
      merged.team.matchStatuses,
      merged.team.teamACount,
      merged.team.teamBCount
    );
    merged.team.doubleResults = filterDoubleResults(
      merged.team.doubleResults,
      merged.team.doubleRoundStates.flatMap((round) => round.matchups)
    );
    merged.team.doubleSetScores = filterDoubleSetScores(
      merged.team.doubleSetScores,
      merged.team.doubleRoundStates.flatMap((round) => round.matchups)
    );
    merged.team.doubleMatchStatuses = filterDoubleMatchStatuses(
      merged.team.doubleMatchStatuses,
      merged.team.doubleRoundStates.flatMap((round) => round.matchups)
    );

    merged.groupsKnockout.playerCount = clampCount(merged.groupsKnockout.playerCount, 4, 100);
    merged.groupsKnockout.groupCount = normalizeGroupCount(
      merged.groupsKnockout.groupCount,
      merged.groupsKnockout.playerCount
    );
    merged.groupsKnockout.qualifiersPerGroup = normalizeQualifiersPerGroup(
      merged.groupsKnockout.qualifiersPerGroup,
      merged.groupsKnockout.playerCount,
      merged.groupsKnockout.groupCount
    );
    merged.groupsKnockout.placementMatchesEnabled = Boolean(
      merged.groupsKnockout.placementMatchesEnabled
    );
    merged.groupsKnockout.playerNames = normalizeGroupKnockoutNames(
      merged.groupsKnockout.playerNames,
      merged.groupsKnockout.playerCount,
      merged.groupsKnockout.groupResults
    );
    merged.groupsKnockout.currentGroupRound = clampPositiveInteger(
      merged.groupsKnockout.currentGroupRound,
      1,
      getGroupsKnockoutGroupRoundCount(
        merged.groupsKnockout.playerCount,
        merged.groupsKnockout.groupCount
      )
    );
    merged.groupsKnockout.currentKnockoutRound = clampPositiveInteger(
      merged.groupsKnockout.currentKnockoutRound,
      1,
      getGroupsKnockoutKnockoutRoundCount(
        merged.groupsKnockout.groupCount,
        merged.groupsKnockout.qualifiersPerGroup
      )
    );
    merged.groupsKnockout.groupResults = filterGroupResults(
      merged.groupsKnockout.groupResults,
      merged.groupsKnockout.playerCount,
      merged.groupsKnockout.groupCount
    );
    merged.groupsKnockout.groupSetScores = filterGroupSetScores(
      merged.groupsKnockout.groupSetScores,
      merged.groupsKnockout.playerCount,
      merged.groupsKnockout.groupCount
    );
    merged.groupsKnockout.knockoutResults = filterKnockoutResults(
      merged.groupsKnockout.knockoutResults
    );
    merged.groupsKnockout.knockoutSetScores = filterKnockoutSetScores(
      merged.groupsKnockout.knockoutSetScores
    );
    merged.tabName = merged.tabName?.trim() || "";
    merged.tournamentName = merged.tournamentName?.trim() || "";

    return merged;
  }

  function normalizeScoringRules(rawRules) {
    const defaults = createDefaultScoringRules();
    const allowedCriteria = new Set(DEFAULT_TIE_BREAK_ORDER);
    const incomingOrder = Array.isArray(rawRules && rawRules.tieBreakOrder)
      ? rawRules.tieBreakOrder
      : [];
    const cleanOrder = incomingOrder.filter(
      (criterion, index, list) =>
        allowedCriteria.has(criterion) && list.indexOf(criterion) === index
    );

    return {
      winPoints: normalizePointValue(rawRules && rawRules.winPoints, defaults.winPoints),
      drawPoints: normalizePointValue(rawRules && rawRules.drawPoints, defaults.drawPoints),
      lossPoints: normalizePointValue(rawRules && rawRules.lossPoints, defaults.lossPoints),
      tieBreakOrder: [
        ...cleanOrder,
        ...DEFAULT_TIE_BREAK_ORDER.filter((criterion) => !cleanOrder.includes(criterion))
      ]
    };
  }

  function normalizePointValue(value, fallback) {
    const numeric = Number.parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      return fallback;
    }

    return Math.min(99, Math.max(-99, numeric));
  }

  function normalizeMatchMode(modeId) {
    const migratedModeId =
      modeId === "bestOf3"
        ? "win2"
        : modeId === "bestOf5"
          ? "win3"
          : modeId === "bestOf7"
            ? "win4"
            : modeId;

    return MATCH_MODES[migratedModeId] ? migratedModeId : "win3";
  }

  function isWinningMatchMode(modeId) {
    return normalizeMatchMode(modeId).startsWith("win");
  }

  function isFixedSetMatchMode(modeId) {
    return normalizeMatchMode(modeId).startsWith("fixed");
  }

  function getValidScoresForMode(modeId) {
    return MATCH_MODES[normalizeMatchMode(modeId)].scores;
  }

  function matchModeAllowsDraw(modeId) {
    return getValidScoresForMode(modeId).some((score) => {
      const parsed = parseScore(score);
      return parsed && parsed.left === parsed.right;
    });
  }

  function isScoreCompatibleWithMode(score, modeId) {
    return getValidScoresForMode(modeId).includes(score);
  }

  function isValidScore(value) {
    return VALID_SCORE_SET.has(value);
  }

  function getDefaultWinScore(modeId) {
    return getValidScoresForMode(modeId).find((score) => {
      const [left, right] = score.split(":").map(Number);
      return left > right;
    }) || getValidScoresForMode(modeId)[0] || "";
  }

  function resolveEffectiveScore(score, matchStatus, modeId) {
    const status = normalizeMatchStatus(matchStatus);
    if (!doesMatchStatusAffectRanking(status)) {
      return "";
    }

    if (isValidScore(score)) {
      return score;
    }

    return status === "walkover" || status === "retired" ? getDefaultWinScore(modeId) : "";
  }

  function reverseScore(score) {
    if (!isValidScore(score)) {
      return "";
    }

    const [left, right] = score.split(":");
    return `${right}:${left}`;
  }

  function clampCount(value, min = 2, max = 100) {
    const numeric = Number.parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      return min;
    }

    return Math.min(max, Math.max(min, numeric));
  }

  function clampPositiveInteger(value, min = 1, max = 999) {
    const numeric = Number.parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  function normalizeTimeValue(value, fallback = "09:00") {
    const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/);
    if (match === null) {
      return fallback;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return fallback;
    }

    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }

  function normalizeFieldNames(fieldNames, fieldCount) {
    return Array.from({ length: fieldCount }, (_, index) => {
      const value = fieldNames?.[index]?.trim();
      return value || "Tisch " + (index + 1);
    });
  }

  function normalizeScheduleConfig(config = {}) {
    const enabled = Boolean(config.enabled);
    const fieldCount = clampPositiveInteger(config.fieldCount, 1, 20);
    const matchDurationMinutes = clampPositiveInteger(config.matchDurationMinutes, 1, 240);
    const breakMinutes = clampPositiveInteger(config.breakMinutes, 0, 120);

    return {
      enabled,
      fieldCount,
      startTime: normalizeTimeValue(config.startTime),
      matchDurationMinutes,
      breakMinutes,
      fieldNames: normalizeFieldNames(config.fieldNames, fieldCount)
    };
  }

  function parseTimeToMinutes(value) {
    const normalized = normalizeTimeValue(value);
    const [hours, minutes] = normalized.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function formatMinutesAsTime(totalMinutes) {
    const minutesInDay = 24 * 60;
    const dayOffset = Math.floor(totalMinutes / minutesInDay);
    const minutesOfDay = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
    const hours = Math.floor(minutesOfDay / 60);
    const minutes = minutesOfDay % 60;
    const time = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");

    return dayOffset > 0 ? time + " +" + dayOffset : time;
  }

  function getRoundRobinRoundCount(playerCount) {
    const count = clampCount(playerCount);
    return count % 2 === 0 ? count - 1 : count;
  }

  function getTeamRoundCount(teamACount, teamBCount) {
    return Math.max(clampCount(teamACount), clampCount(teamBCount));
  }

  function getDoubleRoundCount(doubleCount) {
    return Math.max(0, doubleCount);
  }

  function normalizeNames(values, count, fallbackLabel) {
    return Array.from({ length: count }, (_, index) => {
      const value = values?.[index]?.trim();
      return value || `${fallbackLabel} ${index + 1}`;
    });
  }

  function normalizePlayerStatus(status) {
    return PLAYER_STATUSES[status] ? status : "active";
  }

  function normalizePlayerStatuses(values, count) {
    return Array.from({ length: count }, (_, index) => normalizePlayerStatus(values?.[index]));
  }

  function getPlayerStatusLabel(status) {
    return PLAYER_STATUSES[normalizePlayerStatus(status)].label;
  }

  function normalizeMatchStatus(status) {
    return MATCH_STATUSES[status] ? status : "normal";
  }

  function getMatchStatusLabel(status) {
    return MATCH_STATUSES[normalizeMatchStatus(status)].label;
  }

  function doesMatchStatusAffectRanking(status) {
    return MATCH_STATUSES[normalizeMatchStatus(status)].affectsRanking;
  }

  function getHighestRoundRobinPlayerIndex(results) {
    let highestIndex = -1;

    Object.keys(results ?? {}).forEach((key) => {
      const [left, right] = key.split("-").map(Number);
      if (Number.isInteger(left) && left >= 0) {
        highestIndex = Math.max(highestIndex, left);
      }
      if (Number.isInteger(right) && right >= 0) {
        highestIndex = Math.max(highestIndex, right);
      }
    });

    return highestIndex;
  }

  function getStoredRoundRobinCount(playerCount, playerNames, results, matchStatuses = {}) {
    const highestStoredIndex = Math.max(
      getHighestRoundRobinPlayerIndex(results),
      getHighestRoundRobinPlayerIndex(matchStatuses)
    );
    const highestRequiredCount = Math.max(
      clampCount(playerCount),
      Array.isArray(playerNames) ? playerNames.length : 0,
      highestStoredIndex + 1
    );

    return clampCount(highestRequiredCount);
  }

  function normalizeRoundRobinNames(playerNames, playerCount, results, matchStatuses = {}) {
    return normalizeNames(
      playerNames,
      getStoredRoundRobinCount(playerCount, playerNames, results, matchStatuses),
      "Spieler"
    );
  }


  function normalizeGroupCount(value, playerCount) {
    const count = clampCount(playerCount, 4, 100);
    const maxGroups = Math.max(2, Math.min(8, Math.floor(count / 2)));
    return clampPositiveInteger(value, 2, maxGroups);
  }

  function normalizeQualifiersPerGroup(value, playerCount, groupCount) {
    const groups = normalizeGroupCount(groupCount, playerCount);
    const smallestGroupSize = Math.floor(clampCount(playerCount, 4, 100) / groups);
    return clampPositiveInteger(value, 1, Math.max(1, smallestGroupSize));
  }

  function getGroupLabel(groupIndex) {
    return `Gruppe ${String.fromCharCode(65 + groupIndex)}`;
  }

  function getGroupResultKey(groupIndex, leftIndex, rightIndex) {
    return `group-${groupIndex}-${leftIndex}-${rightIndex}`;
  }

  function getStoredGroupKnockoutPlayerCount(playerCount, playerNames, groupResults) {
    let highestIndex = -1;
    Object.keys(groupResults ?? {}).forEach((key) => {
      const [, groupIndexText, leftText, rightText] = key.match(/^group-(\d+)-(\d+)-(\d+)$/) ?? [];
      const groupIndex = Number(groupIndexText);
      const left = Number(leftText);
      const right = Number(rightText);
      if (Number.isInteger(groupIndex) && Number.isInteger(left) && Number.isInteger(right)) {
        highestIndex = Math.max(highestIndex, left, right);
      }
    });

    return clampCount(
      Math.max(
        clampCount(playerCount, 4, 100),
        Array.isArray(playerNames) ? playerNames.length : 0,
        highestIndex + 1
      ),
      4,
      20
    );
  }

  function normalizeGroupKnockoutNames(playerNames, playerCount, groupResults) {
    return normalizeNames(
      playerNames,
      getStoredGroupKnockoutPlayerCount(playerCount, playerNames, groupResults),
      "Spieler"
    );
  }

  function distributePlayersToGroups(playerNames, playerCount, groupCount) {
    const players = normalizeNames(playerNames, playerCount, "Spieler").map((name, index) => ({
      index,
      name
    }));
    const groups = Array.from({ length: groupCount }, (_, groupIndex) => ({
      id: `group-${groupIndex}`,
      groupIndex,
      name: getGroupLabel(groupIndex),
      players: []
    }));

    players.forEach((player, index) => {
      const targetGroup = groups[index % groupCount];
      targetGroup.players.push({
        ...player,
        localIndex: targetGroup.players.length,
        groupIndex: targetGroup.groupIndex,
        groupName: targetGroup.name
      });
    });

    return groups;
  }

  function getGroupsKnockoutGroupRoundCount(playerCount, groupCount) {
    const groups = distributePlayersToGroups(
      Array.from({ length: clampCount(playerCount, 4, 100) }, (_, index) => `Spieler ${index + 1}`),
      clampCount(playerCount, 4, 100),
      normalizeGroupCount(groupCount, playerCount)
    );
    return Math.max(1, ...groups.map((group) => getRoundRobinRoundCount(group.players.length)));
  }

  function getGroupsKnockoutKnockoutRoundCount(groupCount, qualifiersPerGroup) {
    const qualifierCount = Math.max(2, normalizeGroupCount(groupCount, 8) * clampPositiveInteger(qualifiersPerGroup, 1, 20));
    return Math.max(1, Math.ceil(Math.log2(nextPowerOfTwo(qualifierCount))));
  }

  function filterGroupResults(results, playerCount, groupCount) {
    const cleaned = {};
    const groups = distributePlayersToGroups(
      Array.from({ length: clampCount(playerCount, 4, 100) }, (_, index) => `Spieler ${index + 1}`),
      clampCount(playerCount, 4, 100),
      normalizeGroupCount(groupCount, playerCount)
    );

    Object.entries(results ?? {}).forEach(([key, value]) => {
      const [, groupText, leftText, rightText] = key.match(/^group-(\d+)-(\d+)-(\d+)$/) ?? [];
      const groupIndex = Number(groupText);
      const left = Number(leftText);
      const right = Number(rightText);
      const group = groups[groupIndex];
      if (
        group &&
        Number.isInteger(left) &&
        Number.isInteger(right) &&
        left >= 0 &&
        right >= 0 &&
        left < right &&
        right < group.players.length &&
        isValidScore(value)
      ) {
        cleaned[key] = value;
      }
    });

    return cleaned;
  }

  function filterGroupSetScores(setScores, playerCount, groupCount) {
    const validResultKeys = filterGroupResults(
      Object.fromEntries(
        Object.keys(setScores ?? {}).map((key) => [key, getDefaultWinScore("win3")])
      ),
      playerCount,
      groupCount
    );
    return filterTextMapByKeys(setScores, new Set(Object.keys(validResultKeys)));
  }

  function filterKnockoutResults(results) {
    const cleaned = {};
    Object.entries(results ?? {}).forEach(([key, value]) => {
      if (/^(ko-r\d+-m\d+|ko-third-place)$/.test(key) && isValidScore(value)) {
        cleaned[key] = value;
      }
    });
    return cleaned;
  }

  function filterKnockoutSetScores(setScores) {
    const validResultKeys = filterKnockoutResults(
      Object.fromEntries(
        Object.keys(setScores ?? {}).map((key) => [key, getDefaultWinScore("win3")])
      )
    );
    return filterTextMapByKeys(setScores, new Set(Object.keys(validResultKeys)));
  }

  function nextPowerOfTwo(value) {
    let size = 1;
    while (size < value) {
      size *= 2;
    }
    return size;
  }

  function filterRoundRobinResults(results, playerCount) {
    return filterRoundRobinResultsByLimit(results, clampCount(playerCount));
  }

  function filterStoredRoundRobinResults(results, playerCount, playerNames, matchStatuses = {}) {
    return filterRoundRobinResultsByLimit(
      results,
      getStoredRoundRobinCount(playerCount, playerNames, results, matchStatuses)
    );
  }

  function filterStoredRoundRobinSetScores(setScores, playerCount, playerNames, results = {}, matchStatuses = {}) {
    return filterRoundRobinSetScoresByLimit(
      setScores,
      getStoredRoundRobinCount(playerCount, playerNames, results, matchStatuses)
    );
  }

  function filterRoundRobinSetScoresByLimit(setScores, upperBound) {
    const validResultKeys = filterRoundRobinResultsByLimit(
      Object.fromEntries(
        Object.keys(setScores ?? {}).map((key) => [key, getDefaultWinScore("win3")])
      ),
      upperBound
    );
    return filterTextMapByKeys(setScores, new Set(Object.keys(validResultKeys)));
  }

  function filterRoundRobinResultsByLimit(results, upperBound) {
    const cleaned = {};
    Object.entries(results ?? {}).forEach(([key, value]) => {
      const [left, right] = key.split("-").map(Number);
      if (
        Number.isInteger(left) &&
        Number.isInteger(right) &&
        left >= 0 &&
        right >= 0 &&
        left < right &&
        right < upperBound &&
        isValidScore(value)
      ) {
        cleaned[key] = value;
      }
    });
    return cleaned;
  }

  function filterRoundRobinMatchStatuses(statuses, playerCount) {
    return filterRoundRobinMatchStatusesByLimit(statuses, clampCount(playerCount));
  }

  function filterStoredRoundRobinMatchStatuses(statuses, playerCount, playerNames, results = {}) {
    return filterRoundRobinMatchStatusesByLimit(
      statuses,
      getStoredRoundRobinCount(playerCount, playerNames, results, statuses)
    );
  }

  function filterRoundRobinMatchStatusesByLimit(statuses, upperBound) {
    const cleaned = {};
    Object.entries(statuses ?? {}).forEach(([key, value]) => {
      const [left, right] = key.split("-").map(Number);
      const status = normalizeMatchStatus(value);
      if (
        status !== "normal" &&
        Number.isInteger(left) &&
        Number.isInteger(right) &&
        left >= 0 &&
        right >= 0 &&
        left < right &&
        right < upperBound
      ) {
        cleaned[key] = status;
      }
    });
    return cleaned;
  }

  function filterTeamResults(results, teamACount, teamBCount) {
    const cleaned = {};
    Object.entries(results ?? {}).forEach(([key, value]) => {
      const [row, column] = key.split("-").map(Number);
      if (
        Number.isInteger(row) &&
        Number.isInteger(column) &&
        row >= 0 &&
        column >= 0 &&
        row < teamACount &&
        column < teamBCount &&
        isValidScore(value)
      ) {
        cleaned[key] = value;
      }
    });
    return cleaned;
  }

  function filterTeamSetScores(setScores, teamACount, teamBCount) {
    const validResultKeys = filterTeamResults(
      Object.fromEntries(
        Object.keys(setScores ?? {}).map((key) => [key, getDefaultWinScore("win3")])
      ),
      teamACount,
      teamBCount
    );
    return filterTextMapByKeys(setScores, new Set(Object.keys(validResultKeys)));
  }

  function filterTeamMatchStatuses(statuses, teamACount, teamBCount) {
    const cleaned = {};
    Object.entries(statuses ?? {}).forEach(([key, value]) => {
      const [row, column] = key.split("-").map(Number);
      const status = normalizeMatchStatus(value);
      if (
        status !== "normal" &&
        Number.isInteger(row) &&
        Number.isInteger(column) &&
        row >= 0 &&
        column >= 0 &&
        row < teamACount &&
        column < teamBCount
      ) {
        cleaned[key] = status;
      }
    });
    return cleaned;
  }

  function normalizeTeamDoubles(doubles) {
    const usedIds = new Set();

    return Array.from(doubles ?? []).map((entry, index) => {
      const preferredId = entry?.id?.trim() || `doppel-${index + 1}`;
      let nextId = preferredId;
      let suffix = 2;

      while (usedIds.has(nextId)) {
        nextId = `${preferredId}-${suffix}`;
        suffix += 1;
      }

      usedIds.add(nextId);

      return {
        id: nextId,
        teamAPlayer1: entry?.teamAPlayer1?.trim() || "",
        teamAPlayer2: entry?.teamAPlayer2?.trim() || "",
        teamBPlayer1: entry?.teamBPlayer1?.trim() || "",
        teamBPlayer2: entry?.teamBPlayer2?.trim() || ""
      };
    });
  }

  function filterDoubleResults(results, doubles) {
    const cleaned = {};
    const validIds = new Set((doubles ?? []).map((entry) => entry.id));

    Object.entries(results ?? {}).forEach(([key, value]) => {
      if (validIds.has(key) && isValidScore(value)) {
        cleaned[key] = value;
      }
    });

    return cleaned;
  }

  function filterDoubleSetScores(setScores, doubles) {
    const validIds = new Set((doubles ?? []).map((entry) => entry.id));
    return filterTextMapByKeys(setScores, validIds);
  }

  function filterTextMapByKeys(values, validKeys) {
    const cleaned = {};
    Object.entries(values ?? {}).forEach(([key, value]) => {
      const text = typeof value === "string" ? value.trim() : "";
      if (validKeys.has(key) && text) {
        cleaned[key] = text;
      }
    });
    return cleaned;
  }

  function filterDoubleMatchStatuses(statuses, doubles) {
    const cleaned = {};
    const validIds = new Set((doubles ?? []).map((entry) => entry.id));

    Object.entries(statuses ?? {}).forEach(([key, value]) => {
      const status = normalizeMatchStatus(value);
      if (validIds.has(key) && status !== "normal") {
        cleaned[key] = status;
      }
    });

    return cleaned;
  }

  function generateDoubleRoundPlan(doubles, legacyMatchups = []) {
    const entries = Array.from(doubles ?? []);
    const totalRounds = getDoubleRoundCount(entries.length);

    return Array.from({ length: totalRounds }, (_, roundIndex) => ({
      roundNumber: roundIndex + 1,
      matchups: entries.map((entry, matchIndex) => {
        const teamADouble = entries[matchIndex];
        const teamBDouble = entries[(matchIndex + roundIndex) % entries.length];
        const legacyEntry = roundIndex === 0 ? legacyMatchups?.[matchIndex] : null;

        return {
          id: legacyEntry?.id?.trim() || `double-round-${roundIndex + 1}-match-${matchIndex + 1}`,
          teamADoubleId: teamADouble?.id || "",
          teamBDoubleId: teamBDouble?.id || ""
        };
      })
    }));
  }

  function normalizeDoubleRoundStates(
    roundStates,
    doubles,
    doubleResults = {},
    legacyMatchups = []
  ) {
    const entries = Array.from(doubles ?? []);
    const validIds = new Set(entries.map((entry) => entry.id));
    const incoming = Array.from(roundStates ?? []);
    const defaultRounds = generateDoubleRoundPlan(entries, legacyMatchups);

    return defaultRounds.map((round) => {
      const storedRound = incoming.find((entry) => entry?.roundNumber === round.roundNumber) ?? {};
      const isLegacyManualRound =
        round.roundNumber === 1 &&
        !storedRound?.matchups &&
        Array.isArray(legacyMatchups) &&
        legacyMatchups.length > 0;
      const isManual = Boolean(storedRound?.manual || isLegacyManualRound);
      const storedMatchups = isManual ? (isLegacyManualRound ? legacyMatchups : storedRound?.matchups) : null;

      return {
        roundNumber: round.roundNumber,
        manual: isManual,
        matchups: round.matchups.map((defaultMatchup, matchIndex) => {
          const current = storedMatchups?.[matchIndex] ?? {};
          const hasStoredTeamA = Object.prototype.hasOwnProperty.call(current, "teamADoubleId");
          const hasStoredTeamB = Object.prototype.hasOwnProperty.call(current, "teamBDoubleId");

          return {
            id: defaultMatchup.id,
            teamADoubleId:
              isManual && hasStoredTeamA
                ? validIds.has(current.teamADoubleId)
                  ? current.teamADoubleId
                  : ""
                : validIds.has(current?.teamADoubleId)
                  ? current.teamADoubleId
                  : defaultMatchup.teamADoubleId,
            teamBDoubleId:
              isManual && hasStoredTeamB
                ? validIds.has(current.teamBDoubleId)
                  ? current.teamBDoubleId
                  : ""
                : validIds.has(current?.teamBDoubleId)
                  ? current.teamBDoubleId
                  : defaultMatchup.teamBDoubleId
          };
        })
      };
    });
  }

  function isCompleteDouble(entry) {
    return Boolean(
      entry?.teamAPlayer1 &&
        entry?.teamAPlayer2 &&
        entry?.teamBPlayer1 &&
        entry?.teamBPlayer2
    );
  }

  function parseScore(score) {
    if (!isValidScore(score)) {
      return null;
    }

    const [left, right] = score.split(":").map(Number);
    return { left, right };
  }

  function createStatLine(name, extra = {}) {
    return {
      name,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0,
      setDiff: 0,
      matchesWon: 0,
      matchesDrawn: 0,
      matchesLost: 0,
      singlesWon: 0,
      singlesDrawn: 0,
      singlesLost: 0,
      doublesWon: 0,
      doublesDrawn: 0,
      doublesLost: 0,
      ...extra
    };
  }

  function resolveTeamWinner(teamAValue, teamBValue, teamAName, teamBName) {
    if (teamAValue > teamBValue) {
      return teamAName;
    }
    if (teamBValue > teamAValue) {
      return teamBName;
    }
    return "Unentschieden";
  }

  function assignPlacements(items, areEquivalent) {
    let currentPlace = 1;

    return items
      .map((item, index) => {
        if (index === 0) {
          return { ...item, place: currentPlace, sharedPlace: false };
        }

        const previous = items[index - 1];
        if (areEquivalent(item, previous)) {
          return { ...item, place: currentPlace, sharedPlace: true };
        }

        currentPlace = index + 1;
        return { ...item, place: currentPlace, sharedPlace: false };
      })
      .map((item, index, array) => {
        const next = array[index + 1];
        if (next && next.place === item.place) {
          return { ...item, sharedPlace: true };
        }
        return item;
      });
  }

  function compareScoringCriterion(left, right, criterion) {
    if (criterion === "matchPoints") {
      return (
        right.points - left.points ||
        right.wins - left.wins ||
        right.draws - left.draws ||
        right.matchesWon - left.matchesWon ||
        right.matchesDrawn - left.matchesDrawn
      );
    }

    if (criterion === "setDiff") {
      return right.setDiff - left.setDiff;
    }

    if (criterion === "setsWon") {
      return right.setsWon - left.setsWon;
    }

    return 0;
  }

  function getScoringCriterionValue(player, criterion) {
    if (criterion === "matchPoints") {
      return [
        player.points,
        player.wins,
        player.draws,
        player.matchesWon,
        player.matchesDrawn
      ].join(":");
    }

    if (criterion === "setDiff") {
      return String(player.setDiff);
    }

    if (criterion === "setsWon") {
      return String(player.setsWon);
    }

    return "";
  }

  function compareDirectMatch(left, right, matches) {
    const key =
      left.playerIndex < right.playerIndex
        ? `${left.playerIndex}-${right.playerIndex}`
        : `${right.playerIndex}-${left.playerIndex}`;
    const directMatch = matches.find((match) => match.key === key);

    if (!directMatch || directMatch.winnerIndex === null) {
      return 0;
    }

    return directMatch.winnerIndex === left.playerIndex ? -1 : 1;
  }

  function buildHeadToHeadStats(group, matches, scoring) {
    const groupIndexes = new Set(group.map((player) => player.playerIndex));
    const headToHeadStats = new Map(
      group.map((player) => [
        player.playerIndex,
        {
          points: 0,
          wins: 0,
          draws: 0,
          setDiff: 0,
          setsWon: 0
        }
      ])
    );

    matches.forEach((match) => {
      if (!groupIndexes.has(match.playerAIndex) || !groupIndexes.has(match.playerBIndex)) {
        return;
      }

      const parsed = parseScore(match.score);
      if (!parsed) {
        return;
      }

      const leftStats = headToHeadStats.get(match.playerAIndex);
      const rightStats = headToHeadStats.get(match.playerBIndex);
      leftStats.setsWon += parsed.left;
      rightStats.setsWon += parsed.right;
      leftStats.setDiff += parsed.left - parsed.right;
      rightStats.setDiff += parsed.right - parsed.left;

      if (parsed.left > parsed.right) {
        leftStats.wins += 1;
        leftStats.points += scoring.winPoints;
        rightStats.points += scoring.lossPoints;
      } else if (parsed.right > parsed.left) {
        rightStats.wins += 1;
        rightStats.points += scoring.winPoints;
        leftStats.points += scoring.lossPoints;
      } else {
        leftStats.draws += 1;
        rightStats.draws += 1;
        leftStats.points += scoring.drawPoints;
        rightStats.points += scoring.drawPoints;
      }
    });

    return headToHeadStats;
  }

  function getHeadToHeadTieKey(player, headToHeadStats) {
    const stats = headToHeadStats.get(player.playerIndex);
    return [stats.points, stats.wins, stats.draws, stats.setDiff, stats.setsWon].join(":");
  }

  function compareHeadToHeadStats(left, right, headToHeadStats) {
    const leftStats = headToHeadStats.get(left.playerIndex);
    const rightStats = headToHeadStats.get(right.playerIndex);

    return (
      rightStats.points - leftStats.points ||
      rightStats.wins - leftStats.wins ||
      rightStats.draws - leftStats.draws ||
      rightStats.setDiff - leftStats.setDiff ||
      rightStats.setsWon - leftStats.setsWon
    );
  }

  function resolveRoundRobinRankingGroup(group, criteria, criterionIndex, matches, scoring) {
    if (group.length <= 1) {
      return group.map((player) => ({ ...player, tieResolved: false, unresolvedTieMarker: "" }));
    }

    if (criterionIndex >= criteria.length) {
      const marker = `tie-${criterionIndex}-${group.map((player) => player.playerIndex).join("-")}`;
      return [...group]
        .sort((left, right) => left.name.localeCompare(right.name, "de"))
        .map((player) => ({ ...player, tieResolved: false, unresolvedTieMarker: marker }));
    }

    const criterion = criteria[criterionIndex];

    if (criterion === "directComparison") {
      if (group.length === 2) {
        const comparison = compareDirectMatch(group[0], group[1], matches);
        if (comparison !== 0) {
          return [...group]
            .sort((left, right) => compareDirectMatch(left, right, matches))
            .map((player) => ({ ...player, tieResolved: true, unresolvedTieMarker: "" }));
        }
      } else {
        const headToHeadStats = buildHeadToHeadStats(group, matches, scoring);
        const sortedGroup = [...group].sort((left, right) =>
          compareHeadToHeadStats(left, right, headToHeadStats)
        );
        const resolved = [];

        for (let index = 0; index < sortedGroup.length; ) {
          const tieKey = getHeadToHeadTieKey(sortedGroup[index], headToHeadStats);
          const nextGroup = [];
          let cursor = index;

          while (
            cursor < sortedGroup.length &&
            getHeadToHeadTieKey(sortedGroup[cursor], headToHeadStats) === tieKey
          ) {
            nextGroup.push(sortedGroup[cursor]);
            cursor += 1;
          }

          resolved.push(
            ...resolveRoundRobinRankingGroup(
              nextGroup,
              criteria,
              criterionIndex + 1,
              matches,
              scoring
            ).map((player) => ({
              ...player,
              tieResolved: nextGroup.length === 1 || player.tieResolved
            }))
          );
          index = cursor;
        }

        return resolved;
      }

      return resolveRoundRobinRankingGroup(group, criteria, criterionIndex + 1, matches, scoring);
    }

    const sortedGroup = [...group].sort((left, right) =>
      compareScoringCriterion(left, right, criterion)
    );
    const resolved = [];

    for (let index = 0; index < sortedGroup.length; ) {
      const tieKey = getScoringCriterionValue(sortedGroup[index], criterion);
      const nextGroup = [];
      let cursor = index;

      while (
        cursor < sortedGroup.length &&
        getScoringCriterionValue(sortedGroup[cursor], criterion) === tieKey
      ) {
        nextGroup.push(sortedGroup[cursor]);
        cursor += 1;
      }

      resolved.push(
        ...resolveRoundRobinRankingGroup(nextGroup, criteria, criterionIndex + 1, matches, scoring)
      );
      index = cursor;
    }

    return resolved;
  }

  function rankRoundRobinPlayers(stats, matches, scoring) {
    const resolvedOrder = resolveRoundRobinRankingGroup(
      stats.map((line, index) => ({
        ...line,
        playerIndex: index,
        matchesWon: line.wins,
        matchesDrawn: line.draws
      })),
      scoring.tieBreakOrder,
      0,
      matches,
      scoring
    );

    return assignPlacements(
      resolvedOrder,
      (left, right) =>
        Boolean(left.unresolvedTieMarker) &&
        left.unresolvedTieMarker === right.unresolvedTieMarker
    );
  }

  function compareTeamPlayers(left, right, scoring) {
    const criterionComparison = scoring.tieBreakOrder.reduce(
      (comparison, criterion) =>
        comparison || (criterion === "directComparison" ? 0 : compareScoringCriterion(left, right, criterion)),
      0
    );

    return criterionComparison || left.name.localeCompare(right.name, "de");
  }

  function areTeamPlayersEquivalent(left, right, scoring) {
    return scoring.tieBreakOrder.every(
      (criterion) =>
        criterion === "directComparison" ||
        getScoringCriterionValue(left, criterion) === getScoringCriterionValue(right, criterion)
    );
  }

  function applyPoints(leftStats, rightStats, parsed, scoring) {
    if (parsed.left > parsed.right) {
      leftStats.points += scoring.winPoints;
      rightStats.points += scoring.lossPoints;
    } else if (parsed.right > parsed.left) {
      rightStats.points += scoring.winPoints;
      leftStats.points += scoring.lossPoints;
    } else {
      leftStats.points += scoring.drawPoints;
      rightStats.points += scoring.drawPoints;
    }
  }

  function getOutcomePoints(ownValue, opponentValue, scoring) {
    if (ownValue > opponentValue) {
      return scoring.winPoints;
    }
    if (ownValue < opponentValue) {
      return scoring.lossPoints;
    }
    return scoring.drawPoints;
  }

  function isDefaultScoringRules(scoring) {
    const normalized = normalizeScoringRules(scoring);
    const defaults = createDefaultScoringRules();
    return (
      normalized.winPoints === defaults.winPoints &&
      normalized.drawPoints === defaults.drawPoints &&
      normalized.lossPoints === defaults.lossPoints &&
      JSON.stringify(normalized.tieBreakOrder) === JSON.stringify(defaults.tieBreakOrder)
    );
  }

  function describeScoringRules(scoring) {
    const normalized = normalizeScoringRules(scoring);
    return {
      points: `Sieg ${normalized.winPoints}, Unentschieden ${normalized.drawPoints}, Niederlage ${normalized.lossPoints}`,
      tieBreak: normalized.tieBreakOrder.map((criterion) => TIE_BREAK_CRITERIA[criterion].label).join(" > "),
      fallback: "Alphabetisch nur als technischer Anzeige-Fallback",
      isDefault: isDefaultScoringRules(normalized)
    };
  }

  function analyzeRoundRobin(roundRobinState) {
    const matchMode = normalizeMatchMode(roundRobinState.matchMode);
    const scoring = normalizeScoringRules(roundRobinState.scoring);
    const playerCount = clampCount(roundRobinState.playerCount);
    const players = normalizeNames(roundRobinState.playerNames, playerCount, "Spieler");
    const playerStatuses = normalizePlayerStatuses(roundRobinState.playerStatuses, playerCount);
    const stats = players.map((name, index) =>
      createStatLine(name, {
        sourceIndex: index,
        status: playerStatuses[index],
        statusLabel: getPlayerStatusLabel(playerStatuses[index])
      })
    );
    const matches = [];
    const results = filterRoundRobinResults(roundRobinState.results, playerCount);
    const matchStatuses = filterRoundRobinMatchStatuses(
      roundRobinState.matchStatuses,
      playerCount
    );
    let modeMismatchCount = 0;

    for (let row = 0; row < playerCount; row += 1) {
      for (let column = row + 1; column < playerCount; column += 1) {
        const key = `${row}-${column}`;
        const score = results[key] || "";
        const matchStatus = matchStatuses[key] || "normal";
        const matchStatusLabel = getMatchStatusLabel(matchStatus);
        const effectiveScore = resolveEffectiveScore(score, matchStatus, matchMode);
        const parsed = parseScore(effectiveScore);
        if (!parsed) {
          if (matchStatus !== "normal") {
            matches.push({
              key,
              playerAIndex: row,
              playerBIndex: column,
              playerA: players[row],
              playerB: players[column],
              score,
              effectiveScore,
              matchStatus,
              matchStatusLabel,
              affectsRanking: false,
              winnerIndex: null
            });
          }
          continue;
        }
        if (score && !isScoreCompatibleWithMode(score, matchMode)) {
          modeMismatchCount += 1;
        }

        const leftStats = stats[row];
        const rightStats = stats[column];
        leftStats.setsWon += parsed.left;
        leftStats.setsLost += parsed.right;
        rightStats.setsWon += parsed.right;
        rightStats.setsLost += parsed.left;
        leftStats.setDiff = leftStats.setsWon - leftStats.setsLost;
        rightStats.setDiff = rightStats.setsWon - rightStats.setsLost;

        if (parsed.left > parsed.right) {
          leftStats.wins += 1;
          rightStats.losses += 1;
        } else if (parsed.right > parsed.left) {
          rightStats.wins += 1;
          leftStats.losses += 1;
        } else {
          leftStats.draws += 1;
          rightStats.draws += 1;
        }
        applyPoints(leftStats, rightStats, parsed, scoring);

        matches.push({
          key,
          playerAIndex: row,
          playerBIndex: column,
          playerA: players[row],
          playerB: players[column],
          score: score || effectiveScore,
          effectiveScore,
          matchStatus,
          matchStatusLabel,
          affectsRanking: doesMatchStatusAffectRanking(matchStatus),
          winnerIndex: parsed.left > parsed.right ? row : parsed.right > parsed.left ? column : null
        });
      }
    }

    stats.forEach((line) => {
      line.setDiff = line.setsWon - line.setsLost;
    });

    const ranking = rankRoundRobinPlayers(stats, matches, scoring);

    const completedMatches = matches.length;
    const totalMatches = (playerCount * (playerCount - 1)) / 2;

    return {
      mode: "roundRobin",
      tournamentName: roundRobinState.tournamentName?.trim() || "Jeder-gegen-jeden",
      matchMode,
      matchModeLabel: MATCH_MODES[matchMode].label,
      scoring,
      scoringDescription: describeScoringRules(scoring),
      modeMismatchCount,
      players,
      playerStatuses,
      stats,
      results,
      matchStatuses,
      matches,
      rounds: generateRoundRobinRounds(players, results, matchStatuses, matchMode, playerStatuses),
      ranking,
      completedMatches,
      totalMatches,
      completionRate: totalMatches === 0 ? 0 : Math.round((completedMatches / totalMatches) * 100)
    };
  }

  function generateRoundRobinRounds(
    players,
    results = {},
    matchStatuses = {},
    matchMode = "win3",
    playerStatuses = []
  ) {
    const normalizedPlayers = players.map((name, index) => ({
      index,
      name,
      status: normalizePlayerStatus(playerStatuses[index]),
      statusLabel: getPlayerStatusLabel(playerStatuses[index])
    }));
    const rotation = [...normalizedPlayers];
    const needsBye = rotation.length % 2 === 1;

    if (needsBye) {
      rotation.push(null);
    }

    const totalRounds = Math.max(0, rotation.length - 1);
    const rounds = [];

    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
      const pairings = [];
      let byePlayer = null;

      for (let pairIndex = 0; pairIndex < rotation.length / 2; pairIndex += 1) {
        const left = rotation[pairIndex];
        const right = rotation[rotation.length - 1 - pairIndex];

        if (!left || !right) {
          const playerWithBye = left || right;
          if (playerWithBye) {
            byePlayer = {
              name: playerWithBye.name,
              status: playerWithBye.status,
              statusLabel: playerWithBye.statusLabel
            };
          }
          continue;
        }

        const playerA = pairIndex === 0 && roundIndex % 2 === 1 ? right : left;
        const playerB = pairIndex === 0 && roundIndex % 2 === 1 ? left : right;
        const matchKey =
          playerA.index < playerB.index
            ? `${playerA.index}-${playerB.index}`
            : `${playerB.index}-${playerA.index}`;
        const storedScore = results[matchKey] || "";
        const matchStatus = matchStatuses[matchKey] || "normal";
        const effectiveScore = resolveEffectiveScore(storedScore, matchStatus, matchMode);
        const displayReversed = playerA.index > playerB.index;
        const displayedScore = displayReversed && effectiveScore
          ? reverseScore(effectiveScore)
          : effectiveScore;

        pairings.push({
          playerA: playerA.name,
          playerB: playerB.name,
          playerAStatus: playerA.status,
          playerBStatus: playerB.status,
          playerAStatusLabel: playerA.statusLabel,
          playerBStatusLabel: playerB.statusLabel,
          matchKey,
          score: displayedScore,
          rawScore: storedScore,
          matchStatus,
          matchStatusLabel: getMatchStatusLabel(matchStatus),
          affectsRanking: doesMatchStatusAffectRanking(matchStatus),
          displayReversed
        });
      }

      rounds.push({
        roundNumber: roundIndex + 1,
        pairings,
        byePlayer
      });

      rotation.splice(1, 0, rotation.pop());
    }

    return rounds;
  }

  function generateTeamRounds(
    teamAPlayers,
    teamBPlayers,
    results = {},
    matchStatuses = {},
    matchMode = "win3",
    teamAPlayerStatuses = [],
    teamBPlayerStatuses = []
  ) {
    const teamAEntries = teamAPlayers.map((name, index) => ({
      index,
      name,
      status: normalizePlayerStatus(teamAPlayerStatuses[index]),
      statusLabel: getPlayerStatusLabel(teamAPlayerStatuses[index])
    }));
    const teamBEntries = teamBPlayers.map((name, index) => ({
      index,
      name,
      status: normalizePlayerStatus(teamBPlayerStatuses[index]),
      statusLabel: getPlayerStatusLabel(teamBPlayerStatuses[index])
    }));
    const totalRounds = Math.max(teamAEntries.length, teamBEntries.length);
    const rounds = [];

    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
      const pairings = [];
      const usedTeamA = new Set();
      const usedTeamB = new Set();

      if (teamAEntries.length <= teamBEntries.length) {
        teamAEntries.forEach((playerA, playerIndex) => {
          const playerB = teamBEntries[(playerIndex + roundIndex) % teamBEntries.length];
          const matchKey = `${playerA.index}-${playerB.index}`;
          const matchStatus = matchStatuses[matchKey] || "normal";
          usedTeamA.add(playerA.index);
          usedTeamB.add(playerB.index);

          pairings.push({
            playerA: playerA.name,
            playerB: playerB.name,
            playerAStatus: playerA.status,
            playerBStatus: playerB.status,
            playerAStatusLabel: playerA.statusLabel,
            playerBStatusLabel: playerB.statusLabel,
            matchKey,
            score: resolveEffectiveScore(results[matchKey] || "", matchStatus, matchMode),
            rawScore: results[matchKey] || "",
            matchStatus,
            matchStatusLabel: getMatchStatusLabel(matchStatus),
            affectsRanking: doesMatchStatusAffectRanking(matchStatus),
            displayReversed: false
          });
        });
      } else {
        teamBEntries.forEach((playerB, playerIndex) => {
          const playerA = teamAEntries[(playerIndex + roundIndex) % teamAEntries.length];
          const matchKey = `${playerA.index}-${playerB.index}`;
          const matchStatus = matchStatuses[matchKey] || "normal";
          usedTeamA.add(playerA.index);
          usedTeamB.add(playerB.index);

          pairings.push({
            playerA: playerA.name,
            playerB: playerB.name,
            playerAStatus: playerA.status,
            playerBStatus: playerB.status,
            playerAStatusLabel: playerA.statusLabel,
            playerBStatusLabel: playerB.statusLabel,
            matchKey,
            score: resolveEffectiveScore(results[matchKey] || "", matchStatus, matchMode),
            rawScore: results[matchKey] || "",
            matchStatus,
            matchStatusLabel: getMatchStatusLabel(matchStatus),
            affectsRanking: doesMatchStatusAffectRanking(matchStatus),
            displayReversed: false
          });
        });
      }

      const byePlayers = [
        ...teamAEntries
          .filter((player) => !usedTeamA.has(player.index))
          .map((player) => ({
            name: player.name,
            status: player.status,
            statusLabel: player.statusLabel
          })),
        ...teamBEntries
          .filter((player) => !usedTeamB.has(player.index))
          .map((player) => ({
            name: player.name,
            status: player.status,
            statusLabel: player.statusLabel
          }))
      ];

      rounds.push({
        roundNumber: roundIndex + 1,
        pairings,
        byePlayers
      });
    }

    return rounds;
  }

  function analyzeTeamCompetition(teamState) {
    const matchMode = normalizeMatchMode(teamState.matchMode);
    const scoring = normalizeScoringRules(teamState.scoring);
    const teamAName = teamState.teamAName?.trim() || "Team A";
    const teamBName = teamState.teamBName?.trim() || "Team B";
    const teamACount = clampCount(teamState.teamACount);
    const teamBCount = clampCount(teamState.teamBCount);
    const teamAPlayers = normalizeNames(teamState.teamAPlayers, teamACount, "Spieler");
    const teamBPlayers = normalizeNames(teamState.teamBPlayers, teamBCount, "Spieler");
    const teamAPlayerStatuses = normalizePlayerStatuses(teamState.teamAPlayerStatuses, teamACount);
    const teamBPlayerStatuses = normalizePlayerStatuses(teamState.teamBPlayerStatuses, teamBCount);
    const results = filterTeamResults(teamState.results, teamACount, teamBCount);
    const matchStatuses = filterTeamMatchStatuses(
      teamState.matchStatuses,
      teamACount,
      teamBCount
    );
    const doubles = normalizeTeamDoubles(teamState.doubles).map((entry, index) => {
      const teamAPlayers = [entry.teamAPlayer1, entry.teamAPlayer2].filter(Boolean);
      const teamBPlayers = [entry.teamBPlayer1, entry.teamBPlayer2].filter(Boolean);

      return {
        ...entry,
        order: index + 1,
        teamAPlayers,
        teamBPlayers,
        teamALabel: teamAPlayers.join(" / "),
        teamBLabel: teamBPlayers.join(" / "),
        isComplete: isCompleteDouble(entry)
      };
    });
    const normalizedDoubleRoundStates = normalizeDoubleRoundStates(
      teamState.doubleRoundStates,
      doubles,
      teamState.doubleResults,
      teamState.doubleMatchups
    );
    const doubleResults = filterDoubleResults(
      teamState.doubleResults,
      normalizedDoubleRoundStates.flatMap((round) => round.matchups)
    );
    const doubleMatchStatuses = filterDoubleMatchStatuses(
      teamState.doubleMatchStatuses,
      normalizedDoubleRoundStates.flatMap((round) => round.matchups)
    );
    const doubleLookup = new Map(doubles.map((entry) => [entry.id, entry]));
    const doubleRounds = normalizedDoubleRoundStates.map((round) => ({
      roundNumber: round.roundNumber,
      manual: round.manual,
      pairings: round.matchups.map((entry, index) => {
        const teamADouble = doubleLookup.get(entry.teamADoubleId) || null;
        const teamBDouble = doubleLookup.get(entry.teamBDoubleId) || null;

        return {
          ...entry,
          manual: round.manual,
          pairingNumber: index + 1,
          score: resolveEffectiveScore(
            doubleResults[entry.id] || "",
            doubleMatchStatuses[entry.id] || "normal",
            matchMode
          ),
          rawScore: doubleResults[entry.id] || "",
          matchStatus: doubleMatchStatuses[entry.id] || "normal",
          matchStatusLabel: getMatchStatusLabel(doubleMatchStatuses[entry.id] || "normal"),
          affectsRanking: doesMatchStatusAffectRanking(doubleMatchStatuses[entry.id] || "normal"),
          teamADouble,
          teamBDouble,
          teamAPlayers: teamADouble?.teamAPlayers ?? [],
          teamBPlayers: teamBDouble?.teamBPlayers ?? [],
          teamALabel: teamADouble?.teamALabel ?? "Doppel wählen",
          teamBLabel: teamBDouble?.teamBLabel ?? "Doppel wählen",
          playerA: teamADouble?.teamALabel ?? "Doppel wählen",
          playerB: teamBDouble?.teamBLabel ?? "Doppel wählen",
          isComplete: Boolean(teamADouble?.isComplete && teamBDouble?.isComplete)
        };
      })
    }));
    const rounds = generateTeamRounds(
      teamAPlayers,
      teamBPlayers,
      results,
      matchStatuses,
      matchMode,
      teamAPlayerStatuses,
      teamBPlayerStatuses
    );

    const teamAStats = teamAPlayers.map((name, index) =>
      createStatLine(name, {
        team: teamAName,
        status: teamAPlayerStatuses[index],
        statusLabel: getPlayerStatusLabel(teamAPlayerStatuses[index])
      })
    );
    const teamBStats = teamBPlayers.map((name, index) =>
      createStatLine(name, {
        team: teamBName,
        status: teamBPlayerStatuses[index],
        statusLabel: getPlayerStatusLabel(teamBPlayerStatuses[index])
      })
    );
    const extraTeamAStats = new Map();
    const extraTeamBStats = new Map();
    const matches = [];
    const teamSummary = {
      teamAName,
      teamBName,
      teamA: {
        singlesWon: 0,
        singlesDrawn: 0,
        singlesLost: 0,
        doublesWon: 0,
        doublesDrawn: 0,
        doublesLost: 0,
        matchesWon: 0,
        matchesDrawn: 0,
        matchesLost: 0,
        setsWon: 0,
        setsLost: 0
      },
      teamB: {
        singlesWon: 0,
        singlesDrawn: 0,
        singlesLost: 0,
        doublesWon: 0,
        doublesDrawn: 0,
        doublesLost: 0,
        matchesWon: 0,
        matchesDrawn: 0,
        matchesLost: 0,
        setsWon: 0,
        setsLost: 0
      }
    };
    let modeMismatchCount = 0;

    function resolveTeamStatLine(teamStats, extraStats, name, teamName) {
      const namedPlayer = teamStats.find((player) => player.name === name);
      if (namedPlayer) {
        return namedPlayer;
      }

      if (!extraStats.has(name)) {
        extraStats.set(name, createStatLine(name, { team: teamName }));
      }

      return extraStats.get(name);
    }

    function applySetStats(leftStats, rightStats, parsed) {
      leftStats.setsWon += parsed.left;
      leftStats.setsLost += parsed.right;
      rightStats.setsWon += parsed.right;
      rightStats.setsLost += parsed.left;
      leftStats.setDiff = leftStats.setsWon - leftStats.setsLost;
      rightStats.setDiff = rightStats.setsWon - rightStats.setsLost;
    }

    function applyTeamOutcome(leftStats, rightStats, leftSummary, rightSummary, parsed, matchType) {
      leftSummary.matchesWon += parsed.left > parsed.right ? 1 : 0;
      leftSummary.matchesDrawn += parsed.left === parsed.right ? 1 : 0;
      leftSummary.matchesLost += parsed.left < parsed.right ? 1 : 0;
      rightSummary.matchesWon += parsed.right > parsed.left ? 1 : 0;
      rightSummary.matchesDrawn += parsed.left === parsed.right ? 1 : 0;
      rightSummary.matchesLost += parsed.right < parsed.left ? 1 : 0;

      if (matchType === "double") {
        leftSummary.doublesWon += parsed.left > parsed.right ? 1 : 0;
        leftSummary.doublesDrawn += parsed.left === parsed.right ? 1 : 0;
        leftSummary.doublesLost += parsed.left < parsed.right ? 1 : 0;
        rightSummary.doublesWon += parsed.right > parsed.left ? 1 : 0;
        rightSummary.doublesDrawn += parsed.left === parsed.right ? 1 : 0;
        rightSummary.doublesLost += parsed.right < parsed.left ? 1 : 0;
      } else {
        leftSummary.singlesWon += parsed.left > parsed.right ? 1 : 0;
        leftSummary.singlesDrawn += parsed.left === parsed.right ? 1 : 0;
        leftSummary.singlesLost += parsed.left < parsed.right ? 1 : 0;
        rightSummary.singlesWon += parsed.right > parsed.left ? 1 : 0;
        rightSummary.singlesDrawn += parsed.left === parsed.right ? 1 : 0;
        rightSummary.singlesLost += parsed.right < parsed.left ? 1 : 0;
      }

      const leftPlayers = [...new Set(leftStats)];
      const rightPlayers = [...new Set(rightStats)];

      leftPlayers.forEach((player) => {
        player.matchesWon += parsed.left > parsed.right ? 1 : 0;
        player.matchesDrawn += parsed.left === parsed.right ? 1 : 0;
        player.matchesLost += parsed.left < parsed.right ? 1 : 0;
        if (matchType === "double") {
          player.doublesWon += parsed.left > parsed.right ? 1 : 0;
          player.doublesDrawn += parsed.left === parsed.right ? 1 : 0;
          player.doublesLost += parsed.left < parsed.right ? 1 : 0;
        } else {
          player.singlesWon += parsed.left > parsed.right ? 1 : 0;
          player.singlesDrawn += parsed.left === parsed.right ? 1 : 0;
          player.singlesLost += parsed.left < parsed.right ? 1 : 0;
        }
      });

      rightPlayers.forEach((player) => {
        player.matchesWon += parsed.right > parsed.left ? 1 : 0;
        player.matchesDrawn += parsed.left === parsed.right ? 1 : 0;
        player.matchesLost += parsed.right < parsed.left ? 1 : 0;
        if (matchType === "double") {
          player.doublesWon += parsed.right > parsed.left ? 1 : 0;
          player.doublesDrawn += parsed.left === parsed.right ? 1 : 0;
          player.doublesLost += parsed.right < parsed.left ? 1 : 0;
        } else {
          player.singlesWon += parsed.right > parsed.left ? 1 : 0;
          player.singlesDrawn += parsed.left === parsed.right ? 1 : 0;
          player.singlesLost += parsed.right < parsed.left ? 1 : 0;
        }
      });

      const leftPoints = getOutcomePoints(parsed.left, parsed.right, scoring);
      const rightPoints = getOutcomePoints(parsed.right, parsed.left, scoring);
      leftPlayers.forEach((player) => {
        player.points += leftPoints;
      });
      rightPlayers.forEach((player) => {
        player.points += rightPoints;
      });
    }

    for (let row = 0; row < teamACount; row += 1) {
      for (let column = 0; column < teamBCount; column += 1) {
        const key = `${row}-${column}`;
        const score = results[key] || "";
        const matchStatus = matchStatuses[key] || "normal";
        const matchStatusLabel = getMatchStatusLabel(matchStatus);
        const effectiveScore = resolveEffectiveScore(score, matchStatus, matchMode);
        const parsed = parseScore(effectiveScore);
        if (!parsed) {
          if (matchStatus !== "normal") {
            matches.push({
              key,
              teamAPlayer: teamAPlayers[row],
              teamBPlayer: teamBPlayers[column],
              teamAIndex: row,
              teamBIndex: column,
              score,
              effectiveScore,
              matchStatus,
              matchStatusLabel,
              affectsRanking: false,
              winnerTeam: null
            });
          }
          continue;
        }
        if (score && !isScoreCompatibleWithMode(score, matchMode)) {
          modeMismatchCount += 1;
        }

        const leftStats = teamAStats[row];
        const rightStats = teamBStats[column];
        applySetStats(leftStats, rightStats, parsed);
        teamSummary.teamA.setsWon += parsed.left;
        teamSummary.teamA.setsLost += parsed.right;
        teamSummary.teamB.setsWon += parsed.right;
        teamSummary.teamB.setsLost += parsed.left;
        applyTeamOutcome(
          [leftStats],
          [rightStats],
          teamSummary.teamA,
          teamSummary.teamB,
          parsed,
          "single"
        );

        matches.push({
          key,
          teamAPlayer: teamAPlayers[row],
          teamBPlayer: teamBPlayers[column],
          teamAIndex: row,
          teamBIndex: column,
          score: score || effectiveScore,
          effectiveScore,
          matchStatus,
          matchStatusLabel,
          affectsRanking: doesMatchStatusAffectRanking(matchStatus),
          winnerTeam:
            parsed.left > parsed.right ? teamAName : parsed.right > parsed.left ? teamBName : null
        });
      }
    }

    doubleRounds.forEach((round) => {
      round.pairings.forEach((entry) => {
        const parsed = parseScore(entry.score);
        if (!parsed || !entry.isComplete || !entry.affectsRanking) {
          return;
        }
        if (entry.rawScore && !isScoreCompatibleWithMode(entry.rawScore, matchMode)) {
          modeMismatchCount += 1;
        }

        const leftPlayers = entry.teamAPlayers.map((name) =>
          resolveTeamStatLine(teamAStats, extraTeamAStats, name, teamAName)
        );
        const rightPlayers = entry.teamBPlayers.map((name) =>
          resolveTeamStatLine(teamBStats, extraTeamBStats, name, teamBName)
        );

        leftPlayers.forEach((player) => {
          player.setsWon += parsed.left;
          player.setsLost += parsed.right;
          player.setDiff = player.setsWon - player.setsLost;
        });
        rightPlayers.forEach((player) => {
          player.setsWon += parsed.right;
          player.setsLost += parsed.left;
          player.setDiff = player.setsWon - player.setsLost;
        });
        teamSummary.teamA.setsWon += parsed.left;
        teamSummary.teamA.setsLost += parsed.right;
        teamSummary.teamB.setsWon += parsed.right;
        teamSummary.teamB.setsLost += parsed.left;
        applyTeamOutcome(
          leftPlayers,
          rightPlayers,
          teamSummary.teamA,
          teamSummary.teamB,
          parsed,
          "double"
        );
      });
    });

    const allTeamAStats = [...teamAStats, ...extraTeamAStats.values()];
    const allTeamBStats = [...teamBStats, ...extraTeamBStats.values()];

    [...allTeamAStats, ...allTeamBStats].forEach((line) => {
      line.setDiff = line.setsWon - line.setsLost;
    });

    const playerRanking = assignPlacements(
      [...allTeamAStats, ...allTeamBStats].sort((left, right) =>
        compareTeamPlayers(left, right, scoring)
      ),
      (left, right) => areTeamPlayersEquivalent(left, right, scoring)
    );

    teamSummary.teamA.setDiff = teamSummary.teamA.setsWon - teamSummary.teamA.setsLost;
    teamSummary.teamB.setDiff = teamSummary.teamB.setsWon - teamSummary.teamB.setsLost;
    teamSummary.bySingles = {
      winner: resolveTeamWinner(
        teamSummary.teamA.singlesWon,
        teamSummary.teamB.singlesWon,
        teamAName,
        teamBName
      ),
      teamAValue: teamSummary.teamA.singlesWon,
      teamBValue: teamSummary.teamB.singlesWon
    };
    teamSummary.bySets = {
      winner: resolveTeamWinner(
        teamSummary.teamA.setsWon,
        teamSummary.teamB.setsWon,
        teamAName,
        teamBName
      ),
      teamAValue: teamSummary.teamA.setsWon,
      teamBValue: teamSummary.teamB.setsWon
    };
    teamSummary.byMatches = {
      winner: resolveTeamWinner(
        teamSummary.teamA.matchesWon,
        teamSummary.teamB.matchesWon,
        teamAName,
        teamBName
      ),
      teamAValue: teamSummary.teamA.matchesWon,
      teamBValue: teamSummary.teamB.matchesWon
    };
    teamSummary.hasDoubles = doubles.length > 0;

    const teamComparison =
      teamSummary.teamA.matchesWon - teamSummary.teamB.matchesWon ||
      teamSummary.teamA.setDiff - teamSummary.teamB.setDiff;

    teamSummary.winner =
      teamComparison > 0 ? teamAName : teamComparison < 0 ? teamBName : "Unentschieden";

    const totalMatches = teamACount * teamBCount;
    const completedMatches = matches.length;
    const totalDoubles = doubleRounds.reduce((sum, round) => sum + round.pairings.length, 0);
    const completedDoubles = doubleRounds.reduce(
      (sum, round) =>
        sum +
        round.pairings.filter(
          (entry) => entry.isComplete && (entry.score || (entry.matchStatus && entry.matchStatus !== "normal"))
        ).length,
      0
    );
    const completedDoubleRounds = doubleRounds.filter((round) => getRoundCompletion(round)).length;

    return {
      mode: "team",
      tournamentName: teamState.tournamentName?.trim() || "Teamwettbewerb",
      matchMode,
      matchModeLabel: MATCH_MODES[matchMode].label,
      scoring,
      scoringDescription: describeScoringRules(scoring),
      modeMismatchCount,
      teamAName,
      teamBName,
      teamAPlayers,
      teamBPlayers,
      teamAPlayerStatuses,
      teamBPlayerStatuses,
      teamAStats,
      teamBStats,
      doubles,
      doubleRounds,
      doubleResults,
      doubleMatchStatuses,
      results,
      matchStatuses,
      matches,
      rounds,
      playerRanking,
      teamSummary,
      completedSingles: completedMatches,
      totalSingles: totalMatches,
      completedDoubles,
      totalDoubles,
      completedDoubleRounds,
      completedMatches: completedMatches + completedDoubles,
      totalMatches: totalMatches + totalDoubles,
      completionRate:
        totalMatches + totalDoubles === 0
          ? 0
          : Math.round(((completedMatches + completedDoubles) / (totalMatches + totalDoubles)) * 100)
    };
  }


  function analyzeGroupsKnockout(groupsState) {
    const matchMode = normalizeMatchMode(groupsState.matchMode);
    const scoring = normalizeScoringRules(groupsState.scoring);
    const playerCount = clampCount(groupsState.playerCount, 4, 100);
    const groupCount = normalizeGroupCount(groupsState.groupCount, playerCount);
    const qualifiersPerGroup = normalizeQualifiersPerGroup(
      groupsState.qualifiersPerGroup,
      playerCount,
      groupCount
    );
    const players = normalizeNames(groupsState.playerNames, playerCount, "Spieler");
    const groups = distributePlayersToGroups(players, playerCount, groupCount);
    const groupResults = filterGroupResults(groupsState.groupResults, playerCount, groupCount);
    const knockoutResults = filterKnockoutResults(groupsState.knockoutResults);
    const groupAnalyses = groups.map((group) => analyzeGroupStageGroup(
      group,
      groupResults,
      matchMode,
      qualifiersPerGroup,
      scoring
    ));
    const groupStageComplete = groupAnalyses.every(
      (group) => group.completedMatches === group.totalMatches
    );
    const qualifiers = groupStageComplete
      ? groupAnalyses.flatMap((group) => group.qualifiers)
      : [];
    const knockout = groupStageComplete
      ? buildKnockoutBracket(qualifiers, knockoutResults, Boolean(groupsState.placementMatchesEnabled))
      : createEmptyKnockoutBracket(Boolean(groupsState.placementMatchesEnabled));
    const groupRoundSchedule = buildGroupRoundSchedule(groupAnalyses);
    const totalGroupMatches = groupAnalyses.reduce((sum, group) => sum + group.totalMatches, 0);
    const completedGroupMatches = groupAnalyses.reduce(
      (sum, group) => sum + group.completedMatches,
      0
    );
    const completedKnockoutMatches = knockout.scheduledMatches.filter((match) => match.winner).length;
    const totalKnockoutMatches = knockout.scheduledMatches.length;
    const status = resolveGroupsKnockoutStatus(
      groupStageComplete,
      completedKnockoutMatches,
      knockout.isComplete
    );
    const modeMismatchCount =
      groupAnalyses.reduce((sum, group) => sum + group.modeMismatchCount, 0) +
      knockout.playableMatches.filter(
        (match) => match.score && !isScoreCompatibleWithMode(match.score, matchMode)
      ).length;

    return {
      mode: "groupsKnockout",
      tournamentName: groupsState.tournamentName?.trim() || "Gruppen + KO",
      matchMode,
      matchModeLabel: MATCH_MODES[matchMode].label,
      scoring,
      scoringDescription: describeScoringRules(scoring),
      modeMismatchCount,
      playerCount,
      groupCount,
      qualifiersPerGroup,
      placementMatchesEnabled: Boolean(groupsState.placementMatchesEnabled),
      players,
      groups: groupAnalyses,
      groupResults,
      groupRoundSchedule,
      groupStageComplete,
      qualifiers,
      knockoutResults,
      knockoutRounds: knockout.rounds,
      placementMatches: knockout.placementMatches,
      knockoutMatches: knockout.matches,
      finalStandings: knockout.finalStandings,
      champion: knockout.champion,
      status,
      completedGroupMatches,
      totalGroupMatches,
      completedKnockoutMatches,
      totalKnockoutMatches,
      completedMatches: completedGroupMatches + completedKnockoutMatches,
      totalMatches: totalGroupMatches + totalKnockoutMatches,
      completionRate:
        totalGroupMatches + totalKnockoutMatches === 0
          ? 0
          : Math.round(((completedGroupMatches + completedKnockoutMatches) / (totalGroupMatches + totalKnockoutMatches)) * 100)
    };
  }

  function shuffleRoundRobinDraw(roundRobinState = {}, options = {}) {
    const playerCount = clampCount(roundRobinState.playerCount);
    const playerNames = normalizeRoundRobinNames(
      roundRobinState.playerNames,
      playerCount,
      roundRobinState.results,
      roundRobinState.matchStatuses
    );
    const playerStatuses = normalizePlayerStatuses(roundRobinState.playerStatuses, playerNames.length);
    const entries = playerNames.map((name, index) => ({
      name,
      status: playerStatuses[index]
    }));
    const shuffledEntries = shuffleList(entries, {
      seed: options.seed,
      avoidSameOrder: options.avoidSameOrder !== false
    });

    return {
      ...roundRobinState,
      playerCount,
      playerNames: shuffledEntries.map((entry) => entry.name),
      playerStatuses: shuffledEntries.map((entry) => entry.status),
      currentRound: 1,
      results: {},
      setScores: {},
      matchStatuses: {}
    };
  }

  function shuffleGroupsKnockoutDraw(groupsState = {}, options = {}) {
    const playerCount = clampCount(groupsState.playerCount, 4, 100);
    const groupCount = normalizeGroupCount(groupsState.groupCount, playerCount);
    const qualifiersPerGroup = normalizeQualifiersPerGroup(
      groupsState.qualifiersPerGroup,
      playerCount,
      groupCount
    );
    const playerNames = normalizeGroupKnockoutNames(
      groupsState.playerNames,
      playerCount,
      groupsState.groupResults
    );

    return {
      ...groupsState,
      playerCount,
      groupCount,
      qualifiersPerGroup,
      playerNames: shuffleList(playerNames, {
        seed: options.seed,
        avoidSameOrder: options.avoidSameOrder !== false
      }),
      currentGroupRound: 1,
      currentKnockoutRound: 1,
      groupResults: {},
      groupSetScores: {},
      knockoutSetScores: {},
      knockoutResults: {}
    };
  }

  function analyzeGroupStageGroup(group, groupResults, matchMode, qualifiersPerGroup, scoring) {
    const localResults = {};
    Object.entries(groupResults).forEach(([key, value]) => {
      const [, groupText, leftText, rightText] = key.match(/^group-(\d+)-(\d+)-(\d+)$/) ?? [];
      if (Number(groupText) === group.groupIndex) {
        localResults[`${leftText}-${rightText}`] = value;
      }
    });

    const localAnalysis = analyzeRoundRobin({
      tournamentName: group.name,
      matchMode,
      scoring,
      playerCount: group.players.length,
      playerNames: group.players.map((player) => player.name),
      results: localResults
    });
    const ranking = localAnalysis.ranking.map((player, index) => {
      const groupPlayer = group.players[player.playerIndex];
      return {
        ...player,
        playerIndex: groupPlayer.index,
        localIndex: player.playerIndex,
        groupIndex: group.groupIndex,
        groupName: group.name,
        seedLabel: `${group.name} #${index + 1}`,
        qualificationRank: index + 1,
        isQualified: index < qualifiersPerGroup
      };
    });
    const rounds = localAnalysis.rounds.map((round) => ({
      ...round,
      groupIndex: group.groupIndex,
      groupName: group.name,
      pairings: round.pairings.map((pairing) => ({
        ...pairing,
        groupIndex: group.groupIndex,
        groupName: group.name,
        contextLabel: group.name,
        matchKey: getGroupResultKey(group.groupIndex, ...pairing.matchKey.split("-").map(Number))
      }))
    }));
    const matches = localAnalysis.matches.map((match) => ({
      ...match,
      key: getGroupResultKey(group.groupIndex, match.playerAIndex, match.playerBIndex),
      groupIndex: group.groupIndex,
      groupName: group.name,
      playerAIndex: group.players[match.playerAIndex].index,
      playerBIndex: group.players[match.playerBIndex].index,
      localPlayerAIndex: match.playerAIndex,
      localPlayerBIndex: match.playerBIndex
    }));

    return {
      ...group,
      results: localResults,
      rounds,
      ranking,
      qualifiers: ranking.filter((player) => player.isQualified),
      matches,
      completedMatches: localAnalysis.completedMatches,
      totalMatches: localAnalysis.totalMatches,
      modeMismatchCount: localAnalysis.modeMismatchCount
    };
  }

  function buildGroupRoundSchedule(groups) {
    const totalRounds = Math.max(1, ...groups.map((group) => group.rounds.length));
    return Array.from({ length: totalRounds }, (_, roundIndex) => ({
      roundNumber: roundIndex + 1,
      pairings: groups.flatMap((group) => group.rounds[roundIndex]?.pairings ?? []),
      byePlayers: groups.flatMap((group) =>
        getRoundByePlayers(group.rounds[roundIndex]).map((player) => `${group.name}: ${player}`)
      )
    }));
  }

  function getRoundByePlayers(round) {
    if (Array.isArray(round?.byePlayers)) {
      return round.byePlayers;
    }
    return round?.byePlayer ? [round.byePlayer] : [];
  }

  function createEmptyKnockoutBracket(placementMatchesEnabled) {
    return {
      rounds: [],
      placementMatches: [],
      matches: [],
      playableMatches: [],
      scheduledMatches: [],
      finalStandings: [],
      champion: null,
      isComplete: false,
      placementMatchesEnabled
    };
  }

  function buildKnockoutBracket(qualifiers, knockoutResults, placementMatchesEnabled) {
    const seededQualifiers = qualifiers
      .map((player, index) => ({ ...player, seed: index + 1 }))
      .sort((left, right) =>
        left.qualificationRank - right.qualificationRank ||
        left.groupIndex - right.groupIndex ||
        left.name.localeCompare(right.name, "de")
      )
      .map((player, index) => ({ ...player, seed: index + 1 }));
    const bracketSize = nextPowerOfTwo(Math.max(2, seededQualifiers.length));
    const paddedSeeds = [
      ...seededQualifiers,
      ...Array.from({ length: bracketSize - seededQualifiers.length }, () => null)
    ];
    let sources = [];

    for (let index = 0; index < bracketSize / 2; index += 1) {
      sources.push(
        createKnockoutSource(paddedSeeds[index]),
        createKnockoutSource(paddedSeeds[bracketSize - 1 - index])
      );
    }

    const rounds = [];
    let roundIndex = 1;
    while (sources.length > 1) {
      const matchCount = sources.length / 2;
      const round = {
        roundNumber: roundIndex,
        roundName: getKnockoutRoundName(matchCount),
        pairings: []
      };

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
        const match = createKnockoutMatch(
          roundIndex,
          matchIndex + 1,
          round.roundName,
          sources[matchIndex * 2],
          sources[matchIndex * 2 + 1],
          knockoutResults
        );
        round.pairings.push(match);
      }

      rounds.push(round);
      sources = round.pairings.map((match) => ({
        participant: match.winner,
        placeholder: match.winner ? "" : `Sieger ${match.shortLabel}`
      }));
      roundIndex += 1;
    }

    const matches = rounds.flatMap((round) => round.pairings);
    const semifinalRound = rounds.length >= 2 ? rounds[rounds.length - 2] : null;
    const placementMatches = buildPlacementMatches(
      semifinalRound,
      knockoutResults,
      placementMatchesEnabled
    );
    const allMatches = [...matches, ...placementMatches];
    const playableMatches = allMatches.filter((match) => match.isPlayable);
    const scheduledMatches = allMatches.filter((match) => !match.isBye);
    const finalMatch = rounds.at(-1)?.pairings?.[0] ?? null;
    const champion = finalMatch?.winner ?? null;
    const isPlacementRequired = placementMatchesEnabled && Boolean(placementMatches[0]);
    const isComplete = Boolean(champion) && (!isPlacementRequired || Boolean(placementMatches[0].winner));

    return {
      rounds,
      placementMatches,
      matches,
      playableMatches,
      scheduledMatches,
      finalStandings: buildFinalStandings(seededQualifiers, matches, placementMatches, isComplete),
      champion,
      isComplete,
      placementMatchesEnabled
    };
  }

  function createKnockoutSource(participant) {
    return { participant, placeholder: participant ? "" : "Freilos" };
  }

  function getKnockoutRoundName(matchCount) {
    if (matchCount === 1) {
      return "Finale";
    }
    if (matchCount === 2) {
      return "Halbfinale";
    }
    if (matchCount === 4) {
      return "Viertelfinale";
    }
    return "KO-Runde";
  }

  function createKnockoutMatch(roundNumber, matchNumber, roundName, sourceA, sourceB, results) {
    const id = `ko-r${roundNumber}-m${matchNumber}`;
    const participantA = sourceA?.participant ?? null;
    const participantB = sourceB?.participant ?? null;
    const waitsForA = Boolean(sourceA?.placeholder && sourceA.placeholder !== "Freilos" && !participantA);
    const waitsForB = Boolean(sourceB?.placeholder && sourceB.placeholder !== "Freilos" && !participantB);
    const isBye = Boolean((participantA && !participantB && !waitsForB) || (!participantA && participantB && !waitsForA));
    const isReady = Boolean(participantA && participantB);
    const score = isReady ? results[id] || "" : "";
    const parsed = parseScore(score);
    const winner = isBye
      ? participantA || participantB
      : parsed && parsed.left !== parsed.right
        ? parsed.left > parsed.right
          ? participantA
          : participantB
        : null;
    const loser = parsed && parsed.left !== parsed.right
      ? parsed.left > parsed.right
        ? participantB
        : participantA
      : null;

    return {
      id,
      shortLabel: `R${roundNumber}/S${matchNumber}`,
      roundNumber,
      roundName,
      matchNumber,
      participantA,
      participantB,
      playerA: participantA?.name || sourceA?.placeholder || "offen",
      playerB: participantB?.name || sourceB?.placeholder || "offen",
      score,
      winner,
      loser,
      isBye,
      isReady,
      isPlayable: isReady && !isBye,
      isComplete: isBye || Boolean(winner),
      displayReversed: false
    };
  }

  function buildPlacementMatches(semifinalRound, knockoutResults, placementMatchesEnabled) {
    if (!placementMatchesEnabled || !semifinalRound || semifinalRound.pairings.length !== 2) {
      return [];
    }

    const [firstSemifinal, secondSemifinal] = semifinalRound.pairings;
    return [
      createPlacementMatch(
        firstSemifinal.loser,
        secondSemifinal.loser,
        firstSemifinal.loser ? "" : "Verlierer Halbfinale 1",
        secondSemifinal.loser ? "" : "Verlierer Halbfinale 2",
        knockoutResults
      )
    ];
  }

  function createPlacementMatch(participantA, participantB, placeholderA, placeholderB, results) {
    const id = "ko-third-place";
    const isReady = Boolean(participantA && participantB);
    const score = isReady ? results[id] || "" : "";
    const parsed = parseScore(score);
    const winner = parsed && parsed.left !== parsed.right
      ? parsed.left > parsed.right
        ? participantA
        : participantB
      : null;
    const loser = parsed && parsed.left !== parsed.right
      ? parsed.left > parsed.right
        ? participantB
        : participantA
      : null;

    return {
      id,
      shortLabel: "Platz 3",
      roundNumber: 99,
      roundName: "Platzierungsspiel",
      matchNumber: 1,
      participantA,
      participantB,
      playerA: participantA?.name || placeholderA || "offen",
      playerB: participantB?.name || placeholderB || "offen",
      score,
      winner,
      loser,
      isBye: false,
      isReady,
      isPlayable: isReady,
      isComplete: Boolean(winner),
      displayReversed: false
    };
  }

  function buildFinalStandings(qualifiers, matches, placementMatches, isComplete) {
    if (!isComplete) {
      return [];
    }

    const standings = [];
    const usedPlayers = new Set();
    const finalMatch = matches.at(-1) ?? null;
    const thirdPlaceMatch = placementMatches[0] ?? null;

    function addStanding(player, place) {
      if (!player || usedPlayers.has(player.playerIndex)) {
        return;
      }
      usedPlayers.add(player.playerIndex);
      standings.push({ ...player, place });
    }

    addStanding(finalMatch?.winner, 1);
    addStanding(finalMatch?.loser, 2);

    if (thirdPlaceMatch?.winner) {
      addStanding(thirdPlaceMatch.winner, 3);
      addStanding(thirdPlaceMatch.loser, 4);
    }

    const loserRecords = matches
      .filter((match) => match.loser)
      .map((match) => ({ player: match.loser, roundNumber: match.roundNumber }));
    loserRecords
      .sort((left, right) =>
        right.roundNumber - left.roundNumber ||
        left.player.seed - right.player.seed ||
        left.player.name.localeCompare(right.player.name, "de")
      )
      .forEach((entry) => {
        const nextPlace = standings.length + 1;
        addStanding(entry.player, nextPlace);
      });

    qualifiers
      .sort((left, right) => left.seed - right.seed)
      .forEach((player) => addStanding(player, standings.length + 1));

    return standings;
  }

  function resolveGroupsKnockoutStatus(groupStageComplete, completedKnockoutMatches, knockoutComplete) {
    if (!groupStageComplete) {
      return {
        id: "groupStageRunning",
        label: "Gruppenphase läuft",
        detail: "KO-Runde entsteht nach Abschluss aller Gruppenspiele."
      };
    }

    if (knockoutComplete) {
      return {
        id: "completed",
        label: "Turnier abgeschlossen",
        detail: "Alle entscheidenden KO-Spiele sind eingetragen."
      };
    }

    if (completedKnockoutMatches > 0) {
      return {
        id: "knockoutRunning",
        label: "KO-Runde läuft",
        detail: "Gruppenphase vollständig, KO-Spiele laufen."
      };
    }

    return {
      id: "knockoutReady",
      label: "KO-Runde bereit",
      detail: "Gruppenphase vollständig, die Qualifikanten stehen fest."
    };
  }

  function getRoundCompletion(round) {
    const pairings = round?.pairings ?? [];
    return pairings.length > 0 &&
      pairings.every((entry) => entry.score || (entry.matchStatus && entry.matchStatus !== "normal"));
  }

  function uniqueNames(names) {
    return [...new Set((names ?? []).map((name) => name?.trim()).filter(Boolean))];
  }

  function collectScheduleMatches(analysis) {
    const singleLabel = analysis.mode === "team" ? "Einzel" : "Spiel";
    const matches = (analysis.rounds ?? []).flatMap((round) =>
      (round.pairings ?? []).map((pairing, index) => ({
        id: analysis.mode + "-round-" + round.roundNumber + "-" + (pairing.matchKey || index + 1),
        roundNumber: round.roundNumber,
        roundLabel: "Runde " + round.roundNumber,
        matchType: singleLabel,
        matchLabel: pairing.playerA + " - " + pairing.playerB,
        players: uniqueNames([pairing.playerA, pairing.playerB]),
        score: pairing.score || "",
        status: pairing.score ? "gespielt" : "offen"
      }))
    );

    if (analysis.mode !== "team") {
      return matches;
    }

    return [
      ...matches,
      ...(analysis.doubleRounds ?? []).flatMap((round) =>
        (round.pairings ?? []).map((pairing) => ({
          id: "team-double-" + pairing.id,
          roundNumber: round.roundNumber,
          roundLabel: "Doppelrunde " + round.roundNumber,
          matchType: "Doppel",
          matchLabel: pairing.teamALabel + " - " + pairing.teamBLabel,
          players: uniqueNames([...(pairing.teamAPlayers ?? []), ...(pairing.teamBPlayers ?? [])]),
          score: pairing.score || "",
          status: pairing.score ? "gespielt" : "offen"
        }))
      )
    ];
  }

  function buildMatchSchedule(analysis, config = {}) {
    const scheduleConfig = normalizeScheduleConfig(config);
    const startMinutes = parseTimeToMinutes(scheduleConfig.startTime);
    const slotLength = scheduleConfig.matchDurationMinutes + scheduleConfig.breakMinutes;
    const fields = scheduleConfig.fieldNames.map((name, index) => ({
      index,
      name,
      availableAt: startMinutes
    }));
    const playerAvailability = new Map();
    const matches = collectScheduleMatches(analysis).map((match, index) => {
      const earliestPlayerStart = match.players.reduce(
        (earliest, player) => Math.max(earliest, playerAvailability.get(player) ?? startMinutes),
        startMinutes
      );
      const selectedField = fields.reduce((bestField, field) => {
        const bestStart = Math.max(bestField.availableAt, earliestPlayerStart);
        const fieldStart = Math.max(field.availableAt, earliestPlayerStart);
        if (fieldStart < bestStart) {
          return field;
        }
        if (fieldStart === bestStart && field.index < bestField.index) {
          return field;
        }
        return bestField;
      }, fields[0]);
      const plannedStartMinutes = Math.max(selectedField.availableAt, earliestPlayerStart);
      const plannedEndMinutes = plannedStartMinutes + scheduleConfig.matchDurationMinutes;
      const blockedUntil = plannedStartMinutes + slotLength;

      selectedField.availableAt = blockedUntil;
      match.players.forEach((player) => {
        playerAvailability.set(player, blockedUntil);
      });

      return {
        ...match,
        sequenceNumber: index + 1,
        fieldIndex: selectedField.index,
        fieldName: selectedField.name,
        plannedStartMinutes,
        plannedEndMinutes,
        plannedTime: formatMinutesAsTime(plannedStartMinutes),
        plannedEndTime: formatMinutesAsTime(plannedEndMinutes)
      };
    });

    const endMinutes =
      matches.length === 0
        ? startMinutes
        : Math.max(...matches.map((match) => match.plannedEndMinutes));

    return {
      config: scheduleConfig,
      matches,
      totalMatches: matches.length,
      completedMatches: matches.filter((match) => match.status === "gespielt").length,
      startTime: formatMinutesAsTime(startMinutes),
      endTime: formatMinutesAsTime(endMinutes)
    };
  }

  function buildSummaryBanner(analysis) {
    if (analysis.mode === "roundRobin") {
      const leader = analysis.ranking[0];
      const leaders = analysis.ranking.filter((player) => player.place === 1);
      return {
        title: analysis.tournamentName,
        subtitle: `${analysis.completedMatches} von ${analysis.totalMatches} Begegnungen eingetragen`,
        accent:
          analysis.completedMatches > 0 && leader
            ? leaders.length > 1
              ? `${formatPlayerNameList(leaders.map((player) => player.name))} teilen Platz 1 mit ${leader.wins} Sieg${leader.wins === 1 ? "" : "en"}`
              : `${leader.name} führt mit ${leader.wins} Sieg${leader.wins === 1 ? "" : "en"}`
            : "Noch keine Ergebnisse eingetragen"
      };
    }

    if (analysis.mode === "groupsKnockout") {
      return {
        title: analysis.tournamentName,
        subtitle: `${analysis.completedGroupMatches} von ${analysis.totalGroupMatches} Gruppenspielen eingetragen`,
        accent: analysis.champion
          ? `${analysis.champion.name} gewinnt das Turnier`
          : analysis.status.label
      };
    }

    const { teamSummary } = analysis;
    const setsWinner = teamSummary.bySets.winner;
    const matchesWinner = teamSummary.byMatches.winner;
    const setText =
      setsWinner === "Unentschieden" ? "Nach Sätzen Gleichstand" : `Nach Sätzen ${setsWinner} vorne`;
    const matchesText =
      matchesWinner === "Unentschieden"
        ? "nach Spielen Gleichstand"
        : `nach Spielen ${matchesWinner} vorne`;

    return {
      title: analysis.tournamentName,
      subtitle: `${analysis.completedMatches} von ${analysis.totalMatches} Begegnungen eingetragen`,
      accent: `${setText}, ${matchesText}`
    };
  }

  function formatPlayerNameList(names) {
    const cleanNames = names.map((name) => String(name || "").trim()).filter(Boolean);

    if (cleanNames.length <= 2) {
      return cleanNames.join(" und ");
    }

    return `${cleanNames.slice(0, -1).join(", ")} und ${cleanNames[cleanNames.length - 1]}`;
  }

  window.TournamentLogic = {
    MODES,
    MATCH_MODES,
    MATCH_MODE_ORDER,
    TIE_BREAK_CRITERIA,
    DEFAULT_TIE_BREAK_ORDER,
    MATCH_STATUSES,
    MATCH_STATUS_ORDER,
    PLAYER_STATUSES,
    PLAYER_STATUS_ORDER,
    VALID_SCORES,
    buildSummaryBanner,
    buildMatchSchedule,
    clampCount,
    clampPositiveInteger,
    createDefaultState,
    createDefaultScoringRules,
    describeScoringRules,
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
    generateRoundRobinRounds,
    generateTeamRounds,
    getRoundRobinRoundCount,
    getTeamRoundCount,
    getGroupsKnockoutGroupRoundCount,
    getGroupsKnockoutKnockoutRoundCount,
    normalizeState,
    normalizeScheduleConfig,
    reverseScore
  };
})();
