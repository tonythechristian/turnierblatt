import {
  exportCompetitionResultsXml,
  parseTournamentPortalXml,
  validateTournamentPortal
} from "./clicktt.js";
import { normalizeTtRaceTournament } from "./ttRace.js";

const DEFAULT_MATCH_MODE = "win3";
const DEFAULT_SYNTHETIC_LOSER_POINTS = 7;

export function createTournamentStateFromClickttXml(xmlText, options = {}) {
  const portal = parseTournamentPortalXml(xmlText);
  return createTournamentStateFromClickttPortal(portal, {
    ...options,
    rawXml: options.rawXml ?? xmlText
  });
}

export function createTournamentStateFromClickttPortal(portal, options = {}) {
  const competition = selectCompetition(portal, options.competitionSelector);

  if (!competition) {
    throw new Error("Die click-TT XML enthaelt keinen Wettbewerb.");
  }

  if (competition.players.length < 1) {
    throw new Error("Der gewaehlte click-TT Wettbewerb enthaelt keine Spieler.");
  }

  const tournamentAttrs = portal.tournament.attrs;
  const competitionAttrs = competition.attrs;
  const hasImportedMatches = competition.matches.length > 0;
  const matchParticipantIds = createMatchParticipantIdSet(competition.matches);
  const withdrawalRoundByPlayerId = createWithdrawalRoundByPlayerId(competition.matches);
  const players = competition.players.map((player, index) =>
    createImportedPlayer(player, index, {
      hasImportedMatches,
      matchParticipantIds,
      withdrawalRoundByPlayerId
    })
  );
  const importedAt = options.importedAt ?? new Date().toISOString();
  const validationIssues = validateTournamentPortal(portal);
  const competitionLabel = getCompetitionLabel(competition);
  const ttRacePlayers = players.map((player) => ({
    id: player.clickttId,
    name: player.name,
    seed: player.seed,
    rating: player.rating,
    status: player.status,
    withdrawnRoundNumber: player.withdrawnRoundNumber,
    placement: player.placement,
    clubName: player.clubName,
    clubNr: player.clubNr
  }));
  const ttRaceRounds = createTtRaceRoundsFromCompetitionMatches(competition, ttRacePlayers);

  return {
    state: {
      tabName: competitionLabel,
      tournamentName: portal.tournament.name || competitionLabel,
      mode: "roundRobin",
      matchMode: getMatchModeFromClickttAttrs(tournamentAttrs, competitionAttrs),
      schedule: {
        fieldCount: getPositiveInteger(tournamentAttrs["table-count"], 2),
        startTime: getStartTime(competition.startDate),
        matchDurationMinutes: 18,
        breakMinutes: 2,
        fieldNames: Array.from(
          { length: getPositiveInteger(tournamentAttrs["table-count"], 2) },
          (_, index) => `Tisch ${index + 1}`
        )
      },
      roundRobin: {
        playerCount: players.length,
        playerNames: players.map((player) => player.name),
        playerStatuses: players.map((player) => player.status),
        currentRound: 1,
        results: {},
        matchStatuses: {}
      },
      ttRace: {
        id: portal.tournament.id || "clicktt-turnier",
        name: portal.tournament.name || competitionLabel,
        settings: createTtRaceSettingsFromClicktt(tournamentAttrs, competitionAttrs),
        players: ttRacePlayers,
        rounds: ttRaceRounds
      },
      clicktt: {
        kind: "TournamentPortal",
        importedAt,
        sourceFileName: options.sourceFileName ?? "",
        rawXml: options.rawXml ?? "",
        tournamentId: portal.tournament.id,
        tournamentName: portal.tournament.name,
        competitionId: competition.id,
        competitionIndex: competition.index,
        competitionLabel,
        validationIssues,
        playerIdByIndex: players.map((player) => player.clickttId),
        importedMatchCount: competition.matches.length,
        importedPlayers: players
      }
    },
    portal,
    competition,
    validationIssues
  };
}

export function exportClickttTournamentResults(tournament, options = {}) {
  const clicktt = tournament?.clicktt;

  if (!clicktt?.rawXml) {
    throw new Error("Fuer den click-TT Export fehlt die urspruengliche XML-Datei.");
  }

  const portal = parseTournamentPortalXml(clicktt.rawXml);
  const competitionSelector = clicktt.competitionId || clicktt.competitionIndex || 0;
  const result = buildClickttMatchesFromTournament(tournament, options);

  if (result.matches.length === 0 && !options.allowEmpty) {
    throw new Error("Es gibt noch keine exportierbaren Ergebnisse.");
  }

  const exportReadiness = getTtRaceFinalExportReadiness(tournament?.ttRace, result.matches, options);
  if (!exportReadiness.ready) {
    throw new Error(exportReadiness.reason);
  }

  return {
    ...result,
    xml: exportCompetitionResultsXml(portal, competitionSelector, result.matches, {
      playerPlacements: result.playerPlacements
    })
  };
}

export function getTtRaceFinalExportReadiness(ttRace, matches = null, options = {}) {
  const normalizedTtRace = normalizeTtRaceTournament(ttRace ?? {});

  if (!normalizedTtRace.settings.bttvRaceRules || options.allowPartialTtRace) {
    return { ready: true, reason: "" };
  }

  const rounds = normalizedTtRace.rounds ?? [];
  const exportableMatches = Array.isArray(matches)
    ? matches.length
    : rounds.flatMap((round) => round.matches ?? []).filter(isCompleteTtRaceMatchForFinalExport).length;

  if (exportableMatches === 0) {
    return { ready: true, reason: "" };
  }

  const maxRounds = normalizedTtRace.settings.maxRounds || 6;
  if (rounds.length < maxRounds) {
    return {
      ready: false,
      reason: `Der finale click-TT Export ist erst nach ${maxRounds} vollstaendig erfassten Schweizer Runden moeglich.`
    };
  }

  const incompleteRound = rounds.find((round) =>
    (round.matches ?? []).some((match) => !isCompleteTtRaceMatchForFinalExport(match))
  );
  if (incompleteRound) {
    return {
      ready: false,
      reason: `Runde ${incompleteRound.roundNumber} ist noch nicht vollstaendig mit gueltigen Satzpunkten erfasst.`
    };
  }

  const expectedMatches = rounds.reduce((sum, round) => sum + (round.matches ?? []).length, 0);
  if (exportableMatches < expectedMatches) {
    return {
      ready: false,
      reason: "Der finale click-TT Export enthaelt noch nicht alle erzeugten Schweizer-Runden-Spiele."
    };
  }

  return { ready: true, reason: "" };
}

export function buildClickttMatchesFromTournament(tournament, options = {}) {
  if (tournament?.ttRace?.rounds?.length) {
    return buildClickttMatchesFromTtRace(tournament.ttRace, options);
  }

  return buildClickttMatchesFromRoundRobin(tournament, options);
}

export function buildClickttMatchesFromRoundRobin(tournament, options = {}) {
  const results = tournament?.roundRobin?.results ?? {};
  const statuses = tournament?.roundRobin?.matchStatuses ?? {};
  const playerIds = tournament?.clicktt?.playerIdByIndex ?? [];
  const setScores = tournament?.clicktt?.setScores ?? {};
  const matchMode = tournament?.matchMode ?? DEFAULT_MATCH_MODE;
  const warnings = [];
  const matches = [];

  Object.entries(results).forEach(([key, score]) => {
    if (!score || statuses[key] === "void") {
      return;
    }

    const [leftIndex, rightIndex] = parseMatchKey(key);
    const playerA = playerIds[leftIndex];
    const playerB = playerIds[rightIndex];

    if (!playerA || !playerB) {
      warnings.push(`Ergebnis ${key} wurde uebersprungen, weil die click-TT Spieler-ID fehlt.`);
      return;
    }

    const explicitSets = parseSetScoreText(setScores[key]);
    const synthetic = explicitSets.length === 0;
    const sets = synthetic ? createSyntheticSetsFromMatchScore(score, matchMode) : explicitSets;

    if (sets.length === 0) {
      warnings.push(`Ergebnis ${key} wurde uebersprungen, weil keine Satzpunkte vorliegen.`);
      return;
    }

    if (synthetic) {
      warnings.push(`Fuer Ergebnis ${key} wurden Satzpunkte aus dem Satzverhaeltnis ${score} geschaetzt.`);
    }

    matches.push({
      nr: matches.length + 1,
      group: options.groupLabel ?? "Ergebnisse",
      playerA,
      playerB,
      state: getRetiredState(statuses[key], score),
      sets
    });
  });

  return { matches, warnings };
}

export function buildClickttMatchesFromTtRace(ttRace, options = {}) {
  const normalizedTtRace = normalizeTtRaceTournament(ttRace);
  const warnings = [];
  const matches = [];

  (normalizedTtRace.rounds ?? []).forEach((round) => {
    (round.matches ?? []).forEach((match, matchIndex) => {
      if (!isExportableTtRaceMatch(match)) {
        return;
      }

      const sets = normalizeSetPairs(match.sets);
      if (sets.length === 0) {
        warnings.push(`${match.id} wurde uebersprungen, weil keine Satzpunkte vorliegen.`);
        return;
      }

      matches.push({
        nr: match.clickttNr ?? matchIndex + 1,
        group: options.groupLabel ?? (round.groupLabel || `Runde ${round.roundNumber}`),
        playerA: match.playerAId,
        playerB: match.playerBId,
        state: getRetiredStateFromTtRaceMatch(match),
        sets
      });
    });
  });

  return {
    matches,
    warnings,
    playerPlacements: buildTtRacePlayerPlacements(normalizedTtRace)
  };
}

export function createTtRaceRoundsFromCompetitionMatches(competition, players) {
  const matches = Array.isArray(competition?.matches) ? competition.matches : [];
  if (matches.length === 0) {
    return [];
  }

  const activePlayerIds = new Set(
    players.filter((player) => player.status === "active").map((player) => player.id)
  );
  const inactivePlayerIds = new Set(
    players.filter((player) => player.status !== "active").map((player) => player.id)
  );
  const withdrawnRoundByPlayerId = new Map(
    players
      .filter((player) => player.status === "withdrawn" && player.withdrawnRoundNumber)
      .map((player) => [player.id, player.withdrawnRoundNumber])
  );
  const groups = [];
  const groupIndex = new Map();

  matches.forEach((match) => {
    const label = match.group || "Ergebnisse";
    if (!groupIndex.has(label)) {
      groupIndex.set(label, groups.length);
      groups.push({ label, matches: [] });
    }

    groups[groupIndex.get(label)].matches.push(match);
  });

  return groups.map((group, roundIndex) => {
    const roundNumber = getRoundNumberFromGroupLabel(group.label, roundIndex + 1);
    const pairedPlayerIds = new Set();
    const roundMatches = group.matches.map((match, matchIndex) => {
      pairedPlayerIds.add(match.playerA);
      pairedPlayerIds.add(match.playerB);

      return createTtRaceMatchFromClickttMatch(match, roundNumber, matchIndex);
    });
    const byes = createImportedRoundByes(
      activePlayerIds,
      inactivePlayerIds,
      pairedPlayerIds,
      roundNumber,
      withdrawnRoundByPlayerId
    );

    return {
      id: `r${roundNumber}`,
      roundNumber,
      groupLabel: group.label,
      matches: roundMatches,
      byes
    };
  });
}

export function parseSetScoreText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }

  const matches = [...text.matchAll(/(\d+)\s*[:-]\s*(\d+)/g)];
  if (matches.length === 0) {
    return [];
  }

  return matches.map((match) => [Number(match[1]), Number(match[2])]);
}

export function formatSetScoreText(sets) {
  return normalizeSetPairs(sets)
    .map(([left, right]) => `${left}:${right}`)
    .join(", ");
}

export function reverseSetScoreText(value) {
  return formatSetScoreText(parseSetScoreText(value).map(([left, right]) => [right, left]));
}

export function createSyntheticSetsFromMatchScore(score, matchMode = DEFAULT_MATCH_MODE) {
  const summary = parseMatchSummary(score);
  if (!summary || summary.left === summary.right) {
    return [];
  }

  const targetWins = getTargetWins(matchMode, Math.max(summary.left, summary.right));
  const leftWon = summary.left > summary.right;
  const winnerSets = leftWon ? summary.left : summary.right;
  const loserSets = leftWon ? summary.right : summary.left;
  const sets = [];

  for (let index = 0; index < winnerSets; index += 1) {
    sets.push(leftWon ? [11, DEFAULT_SYNTHETIC_LOSER_POINTS] : [DEFAULT_SYNTHETIC_LOSER_POINTS, 11]);
  }

  for (let index = 0; index < loserSets; index += 1) {
    sets.push(leftWon ? [DEFAULT_SYNTHETIC_LOSER_POINTS, 11] : [11, DEFAULT_SYNTHETIC_LOSER_POINTS]);
  }

  return sets.slice(0, Math.max(targetWins + loserSets, winnerSets + loserSets));
}

function selectCompetition(portal, selector) {
  if (typeof selector === "number") {
    return portal.competitions[selector] ?? null;
  }

  if (selector) {
    const byId = portal.competitions.find((competition) => competition.id === selector);
    if (byId) {
      return byId;
    }
  }

  return (
    portal.competitions.find((competition) => competition.type === "Einzel" && competition.players.length > 0) ||
    portal.competitions.find((competition) => competition.players.length > 0) ||
    portal.competitions[0] ||
    null
  );
}

function createTtRaceMatchFromClickttMatch(match, roundNumber, matchIndex) {
  const state = match.state || "";
  const sets = match.setPoints
    .map((set) => [Number(set.a), Number(set.b)])
    .filter(([left, right]) => left > 0 || right > 0);

  return {
    id: `r${roundNumber}-m${matchIndex + 1}`,
    roundNumber,
    table: matchIndex + 1,
    clickttNr: getPositiveInteger(match.nr, matchIndex + 1),
    playerAId: match.playerA,
    playerBId: match.playerB,
    status: state ? "retired" : sets.length > 0 || match.matchesA === 1 || match.matchesB === 1 ? "completed" : "scheduled",
    winnerId: match.matchesA === 1 ? match.playerA : match.matchesB === 1 ? match.playerB : "",
    retiredPlayerId: state === "retired-a" ? match.playerA : state === "retired-b" ? match.playerB : "",
    sets,
    setScore: null
  };
}

function getRoundNumberFromGroupLabel(label, fallback) {
  const match = String(label ?? "").match(/Runde\s+(\d+)/i);
  return match ? Number(match[1]) : fallback;
}

function createMatchParticipantIdSet(matches) {
  const participantIds = new Set();

  matches.forEach((match) => {
    if (match.playerA) {
      participantIds.add(match.playerA);
    }

    if (match.playerB) {
      participantIds.add(match.playerB);
    }
  });

  return participantIds;
}

function createWithdrawalRoundByPlayerId(matches) {
  const withdrawalRoundByPlayerId = new Map();

  matches.forEach((match) => {
    const retiredPlayerId = getRetiredPlayerIdFromClickttMatch(match);
    if (!retiredPlayerId) {
      return;
    }

    const roundNumber = getRoundNumberFromGroupLabel(match.group, null);
    if (!roundNumber) {
      return;
    }

    const previousRoundNumber = withdrawalRoundByPlayerId.get(retiredPlayerId);
    if (!previousRoundNumber || roundNumber < previousRoundNumber) {
      withdrawalRoundByPlayerId.set(retiredPlayerId, roundNumber);
    }
  });

  return withdrawalRoundByPlayerId;
}

function getRetiredPlayerIdFromClickttMatch(match) {
  if (match.state === "retired-a") {
    return match.playerA;
  }

  if (match.state === "retired-b") {
    return match.playerB;
  }

  return "";
}

function createImportedRoundByes(
  activePlayerIds,
  inactivePlayerIds,
  pairedPlayerIds,
  roundNumber,
  withdrawnRoundByPlayerId = new Map()
) {
  const activeSittingOut = [...activePlayerIds].filter((playerId) => !pairedPlayerIds.has(playerId));
  const inactiveSittingOut = [...inactivePlayerIds].filter((playerId) => {
    if (pairedPlayerIds.has(playerId)) {
      return false;
    }

    const withdrawnRoundNumber = withdrawnRoundByPlayerId.get(playerId);
    return !withdrawnRoundNumber || roundNumber <= withdrawnRoundNumber;
  });
  const hasSingleOfficialBye = activeSittingOut.length === 1;
  const activeByes = activeSittingOut.map((playerId, index) => ({
    id: `r${roundNumber}-bye-${index + 1}`,
    roundNumber,
    playerId,
    points: hasSingleOfficialBye ? 1 : 0,
    reason: hasSingleOfficialBye ? "odd-player-count" : "not-paired"
  }));
  const inactiveByes = inactiveSittingOut.map((playerId, index) => ({
    id: `r${roundNumber}-missing-${index + 1}`,
    roundNumber,
    playerId,
    points: 0,
    reason: "missing"
  }));

  return [...activeByes, ...inactiveByes];
}

function createImportedPlayer(player, index, context = {}) {
  const primaryPerson = player.persons[0] ?? {};
  const rating = getPositiveInteger(primaryPerson.attrs?.ttr, null);
  const placement = getPositiveInteger(player.placement, null);
  const hasImportedMatches = Boolean(context.hasImportedMatches);
  const matchParticipantIds = context.matchParticipantIds ?? new Set();
  const withdrawalRoundByPlayerId = context.withdrawalRoundByPlayerId ?? new Map();
  const withdrawnRoundNumber = withdrawalRoundByPlayerId.get(player.id) ?? null;
  const didNotPlayImportedResult =
    hasImportedMatches && !placement && !matchParticipantIds.has(player.id);
  const status =
    player.waitingListPlayer === "true" || didNotPlayImportedResult
      ? "missing"
      : withdrawnRoundNumber
        ? "withdrawn"
        : "active";

  return {
    clickttId: player.id,
    name: player.displayName || player.id || `Spieler ${index + 1}`,
    // Getrennt aus der XML übernommen, damit die Schreibweise erhalten bleibt.
    firstName: primaryPerson.firstname ?? "",
    lastName: primaryPerson.lastname ?? "",
    seed: null,
    placement,
    rating,
    status,
    withdrawnRoundNumber,
    licenceNumbers: player.licenceNumbers,
    internalNumbers: player.internalNumbers,
    clubName: primaryPerson.clubName ?? "",
    clubNr: primaryPerson.clubNr ?? ""
  };
}

function getCompetitionLabel(competition) {
  return [competition.ageGroup, competition.type].filter(Boolean).join(" ") || "click-TT Wettbewerb";
}

function getMatchModeFromClickttAttrs(tournamentAttrs, competitionAttrs) {
  const winningSets = getPositiveInteger(
    competitionAttrs["winning-sets"] ?? tournamentAttrs["winning-sets"],
    3
  );
  return winningSets >= 1 && winningSets <= 5 ? `win${winningSets}` : DEFAULT_MATCH_MODE;
}

function createTtRaceSettingsFromClicktt(tournamentAttrs, competitionAttrs) {
  return {
    maxRounds: 6,
    bttvRaceRules: isBttvRaceTournament(tournamentAttrs, competitionAttrs),
    regardTtrValues: true
  };
}

function isBttvRaceTournament(tournamentAttrs, competitionAttrs) {
  const marker = [
    tournamentAttrs["tournament-type"],
    tournamentAttrs.name,
    competitionAttrs["tournament-type"],
    competitionAttrs.name,
    competitionAttrs["final-round-playmode"]
  ]
    .filter(Boolean)
    .join(" ");

  return /\b(BTTV|Bavarian)\b/i.test(marker) && /TT-?\s*Race|Race/i.test(marker);
}

function getStartTime(value) {
  const match = String(value ?? "").match(/\b(\d{1,2}:\d{2})\b/);
  return match ? match[1].padStart(5, "0") : "09:00";
}

function getPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parseMatchKey(key) {
  return String(key).split("-").map((part) => Number(part));
}

function parseMatchSummary(score) {
  const match = String(score ?? "").trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    left: Number(match[1]),
    right: Number(match[2])
  };
}

function getTargetWins(matchMode, fallback) {
  const match = String(matchMode ?? "").match(/^win(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

function getRetiredState(status, score) {
  if (status !== "retired") {
    return "";
  }

  const summary = parseMatchSummary(score);
  if (!summary || summary.left === summary.right) {
    return "";
  }

  return summary.left > summary.right ? "retired-b" : "retired-a";
}

function getRetiredStateFromTtRaceMatch(match) {
  if (match.status !== "retired") {
    return "";
  }

  if (match.retiredPlayerId === match.playerAId) {
    return "retired-a";
  }

  if (match.retiredPlayerId === match.playerBId) {
    return "retired-b";
  }

  return "";
}

function isExportableTtRaceMatch(match) {
  return (
    match?.playerAId &&
    match?.playerBId &&
    match.status !== "scheduled" &&
    match.status !== "void"
  );
}

function isCompleteTtRaceMatchForFinalExport(match) {
  return isExportableTtRaceMatch(match) && normalizeSetPairs(match.sets).length > 0;
}

function buildTtRacePlayerPlacements(ttRace) {
  return new Map(
    (ttRace?.standings ?? [])
      .filter(
        (standing) =>
          standing.status !== "missing" &&
          (standing.played > 0 || standing.wins > 0 || standing.losses > 0 || standing.draws > 0)
      )
      .map((standing) => [standing.playerId, standing.rank])
  );
}

function normalizeSetPairs(sets) {
  return (Array.isArray(sets) ? sets : [])
    .map((set) => {
      if (Array.isArray(set) && set.length >= 2) {
        return [Number(set[0]), Number(set[1])];
      }

      if (set && typeof set === "object") {
        return [Number(set.a), Number(set.b)];
      }

      return null;
    })
    .filter((set) => set && Number.isFinite(set[0]) && Number.isFinite(set[1]));
}
