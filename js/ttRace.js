const TT_RACE_TYPE = "ttRaceSwiss";

const PLAYER_STATUS_ORDER = ["active", "missing", "withdrawn", "retired"];
const MATCH_STATUS_ORDER = ["scheduled", "completed", "walkover", "retired", "void"];

const DEFAULT_SWISS_SETTINGS = Object.freeze({
  winPoints: 1,
  drawPoints: 0.5,
  lossPoints: 0,
  byePoints: 1,
  maxRounds: 6,
  bttvRaceRules: false,
  regardTtrValues: true,
  initialDrawSeed: "",
  carryWithdrawnPlayers: false,
  walkoverSetsToWin: 3,
  walkoverSetScore: [11, 0]
});

const TABLE_TENNIS_SET_TARGET_POINTS = 11;
const TABLE_TENNIS_MIN_WIN_MARGIN = 2;
const TABLE_TENNIS_DEUCE_LOSER_POINTS =
  TABLE_TENNIS_SET_TARGET_POINTS - TABLE_TENNIS_MIN_WIN_MARGIN + 1;
const TABLE_TENNIS_SET_SCORE_INPUT_HINT =
  "Bitte Satzpunkte als 11:7, 9:11 oder kurz 7, -9 eingeben.";
const REMATCH_COST = 1_000_000_000_000_000;
const REPEAT_BYE_COST = 1_000_000_000_000_000;
const WITHDRAWN_PAIR_COST = 1_000_000;
const SCORE_LEVEL_COST_BASE = 100;
const MAX_EXACT_PAIRING_PLAYERS = 20;
const MAX_PAIRING_SEARCH_NODES = 100_000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value, fallback = "") {
  const text =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
  return text || fallback;
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }
  return number;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    return fallback;
  }
  return number;
}

function booleanSetting(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "ja"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "nein"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeEnum(value, allowed, fallback, aliases = {}) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const normalized = aliases[raw] ?? raw;
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizePlayerStatus(status) {
  return normalizeEnum(status, PLAYER_STATUS_ORDER, "active", {
    checkedin: "active",
    present: "active",
    absent: "missing",
    inactive: "withdrawn",
    dropped: "withdrawn",
    scratch: "withdrawn"
  });
}

function normalizeMatchStatus(status, fallback = "scheduled") {
  return normalizeEnum(status, MATCH_STATUS_ORDER, fallback, {
    open: "scheduled",
    pending: "scheduled",
    played: "completed",
    done: "completed",
    complete: "completed",
    wo: "walkover",
    "w/o": "walkover",
    w_o: "walkover",
    kampflos: "walkover",
    withdrawn: "walkover",
    aufgabe: "retired",
    ret: "retired",
    retiredwon: "retired",
    invalid: "void",
    cancelled: "void"
  });
}

function normalizeSwissSettings(settings = {}) {
  const raw = isPlainObject(settings) ? settings : {};
  const walkoverSetScore = Array.isArray(raw.walkoverSetScore)
    ? raw.walkoverSetScore
    : DEFAULT_SWISS_SETTINGS.walkoverSetScore;
  const walkoverWinnerScore = nonNegativeInteger(
    walkoverSetScore[0],
    DEFAULT_SWISS_SETTINGS.walkoverSetScore[0]
  );
  const walkoverLoserScore = nonNegativeInteger(
    walkoverSetScore[1],
    DEFAULT_SWISS_SETTINGS.walkoverSetScore[1]
  );

  return {
    winPoints: finiteNumber(raw.winPoints, DEFAULT_SWISS_SETTINGS.winPoints),
    drawPoints: finiteNumber(raw.drawPoints, DEFAULT_SWISS_SETTINGS.drawPoints),
    lossPoints: finiteNumber(raw.lossPoints, DEFAULT_SWISS_SETTINGS.lossPoints),
    byePoints: finiteNumber(raw.byePoints, DEFAULT_SWISS_SETTINGS.byePoints),
    maxRounds: positiveInteger(raw.maxRounds, DEFAULT_SWISS_SETTINGS.maxRounds),
    bttvRaceRules: booleanSetting(raw.bttvRaceRules, DEFAULT_SWISS_SETTINGS.bttvRaceRules),
    regardTtrValues: booleanSetting(raw.regardTtrValues, DEFAULT_SWISS_SETTINGS.regardTtrValues),
    initialDrawSeed: cleanString(
      raw.initialDrawSeed ?? raw.firstRoundDrawSeed ?? raw.drawSeed,
      DEFAULT_SWISS_SETTINGS.initialDrawSeed
    ),
    carryWithdrawnPlayers: booleanSetting(
      raw.carryWithdrawnPlayers,
      DEFAULT_SWISS_SETTINGS.carryWithdrawnPlayers
    ),
    walkoverSetsToWin: positiveInteger(
      raw.walkoverSetsToWin,
      DEFAULT_SWISS_SETTINGS.walkoverSetsToWin
    ),
    walkoverSetScore: [walkoverWinnerScore, walkoverLoserScore]
  };
}

function uniqueId(baseId, usedIds, fallback) {
  const cleaned = cleanString(baseId, fallback);
  let candidate = cleaned || fallback;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${cleaned || fallback}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function normalizePlayers(source) {
  const rawPlayers = Array.isArray(source?.players)
    ? source.players
    : Array.isArray(source?.playerNames)
      ? source.playerNames
      : [];
  const usedIds = new Set();

  return rawPlayers.map((rawPlayer, index) => {
    const data = isPlainObject(rawPlayer) ? rawPlayer : { name: rawPlayer };
    const name = cleanString(data.name, `Spieler ${index + 1}`);
    const id = uniqueId(data.id, usedIds, `p${index + 1}`);
    const seed = positiveInteger(data.seed, null);
    const rating = finiteNumber(data.rating, null);
    const clubName = cleanString(data.clubName ?? data.club ?? data["club-name"] ?? data.clubname);
    const clubNr = cleanString(
      data.clubNr ?? data.clubNumber ?? data.clubId ?? data["club-nr"] ?? data.clubnr
    );
    const withdrawnRoundNumber = positiveInteger(
      data.withdrawnRoundNumber ?? data.givenUpRound ?? data.givenUpRnd,
      null
    );

    return {
      id,
      name,
      seed,
      rating,
      clubName,
      clubNr,
      status: normalizePlayerStatus(data.status),
      withdrawnRoundNumber,
      initialOrder: index + 1
    };
  });
}

function createPlayerLookup(players) {
  const byId = new Map();
  const byName = new Map();

  players.forEach((player) => {
    byId.set(player.id, player);
    byName.set(player.name, player);
  });

  return { byId, byName };
}

function resolvePlayerId(value, lookup) {
  if (isPlainObject(value)) {
    return resolvePlayerId(value.id ?? value.name, lookup);
  }

  const key = cleanString(value);
  if (!key) {
    return "";
  }

  if (lookup.byId.has(key)) {
    return key;
  }

  return lookup.byName.get(key)?.id ?? "";
}

function normalizeSetScore(rawSet) {
  if (Array.isArray(rawSet)) {
    if (rawSet.length < 2) {
      return null;
    }

    return {
      a: nonNegativeInteger(rawSet[0], 0),
      b: nonNegativeInteger(rawSet[1], 0)
    };
  }

  if (isPlainObject(rawSet)) {
    const left = rawSet.a ?? rawSet.playerA ?? rawSet.left ?? rawSet.home;
    const right = rawSet.b ?? rawSet.playerB ?? rawSet.right ?? rawSet.away;

    if (left === undefined || right === undefined) {
      return null;
    }

    return {
      a: nonNegativeInteger(left, 0),
      b: nonNegativeInteger(right, 0)
    };
  }

  if (typeof rawSet === "string") {
    const match = rawSet.trim().match(/^(\d+)\s*[:-]\s*(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      a: nonNegativeInteger(match[1], 0),
      b: nonNegativeInteger(match[2], 0)
    };
  }

  return null;
}

function normalizeSetScores(rawSets) {
  const sets = Array.isArray(rawSets) ? rawSets : [];
  return sets.map(normalizeSetScore).filter(Boolean);
}

function normalizeSetScorePairs(rawSets) {
  const raw = Array.isArray(rawSets) ? rawSets : [];
  return raw.map(normalizeSetScore).filter(Boolean);
}

function expandShortSetScoreToken(token) {
  const match = String(token ?? "").trim().match(/^([+-]?)(\d+)$/);
  if (!match) {
    return null;
  }

  const sign = match[1];
  const loserScore = Number(match[2]);
  const winnerScore =
    loserScore >= TABLE_TENNIS_DEUCE_LOSER_POINTS
      ? loserScore + TABLE_TENNIS_MIN_WIN_MARGIN
      : TABLE_TENNIS_SET_TARGET_POINTS;

  return sign === "-" ? [loserScore, winnerScore] : [winnerScore, loserScore];
}

export function parseTableTennisSetScoreText(value) {
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
      errors.push(TABLE_TENNIS_SET_SCORE_INPUT_HINT);
      break;
    }

    const token = match[0].trim();
    const scoreMatch = token.match(/^(\d+)\s*[:-]\s*(\d+)$/);
    const parsedSet = scoreMatch
      ? [Number(scoreMatch[1]), Number(scoreMatch[2])]
      : expandShortSetScoreToken(token);

    if (!parsedSet) {
      errors.push(TABLE_TENNIS_SET_SCORE_INPUT_HINT);
      break;
    }

    sets.push(parsedSet);
    cursor = tokenPattern.lastIndex;
    match = tokenPattern.exec(text);
  }

  const tail = text.slice(cursor);
  if (tail && !/^[\s,;|/]+$/.test(tail)) {
    errors.push(TABLE_TENNIS_SET_SCORE_INPUT_HINT);
  }

  if (sets.length === 0 && errors.length === 0) {
    errors.push("Bitte mindestens einen Satz als 11:7 oder kurz 7 eingeben.");
  }

  return { sets, errors: [...new Set(errors)] };
}

function validateTableTennisSingleSet(set, setNumber) {
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

  if (winnerScore < TABLE_TENNIS_SET_TARGET_POINTS) {
    errors.push(`Satz ${setNumber}: Ein Satz endet fruehestens bei 11 Punkten.`);
  }

  if (winnerScore - loserScore < TABLE_TENNIS_MIN_WIN_MARGIN) {
    errors.push(`Satz ${setNumber}: Ein Satz muss mit mindestens zwei Punkten Abstand enden.`);
  }

  if (
    winnerScore > TABLE_TENNIS_SET_TARGET_POINTS &&
    loserScore !== winnerScore - TABLE_TENNIS_MIN_WIN_MARGIN
  ) {
    errors.push(
      `Satz ${setNumber}: Nach 10:10 endet der Satz genau mit zwei Punkten Abstand, z. B. 12:10.`
    );
  }

  return errors;
}

export function validateTableTennisSetScores(rawSets, options = {}) {
  const sets = normalizeSetScorePairs(rawSets);
  const rawCount = Array.isArray(rawSets) ? rawSets.length : 0;
  const settings = normalizeSwissSettings(options.settings ?? options);
  const setsToWin = positiveInteger(options.setsToWin, settings.walkoverSetsToWin);
  const requireCompleteMatch = options.requireCompleteMatch !== false;
  const maxSets = setsToWin * 2 - 1;
  const errors = [];
  let leftSets = 0;
  let rightSets = 0;
  let matchEndedAfterSet = 0;

  if (sets.length !== rawCount) {
    errors.push("Mindestens ein Satz konnte nicht gelesen werden.");
  }

  if (sets.length > maxSets) {
    errors.push(`Ein Match auf ${setsToWin} Gewinnsaetze hat maximal ${maxSets} Saetze.`);
  }

  sets.forEach((set, index) => {
    const setNumber = index + 1;

    if (matchEndedAfterSet > 0) {
      errors.push(`Nach Satz ${matchEndedAfterSet} war das Match bereits entschieden.`);
      return;
    }

    errors.push(...validateTableTennisSingleSet(set, setNumber));

    if (set.a > set.b) {
      leftSets += 1;
    } else if (set.b > set.a) {
      rightSets += 1;
    }

    if (leftSets === setsToWin || rightSets === setsToWin) {
      matchEndedAfterSet = setNumber;
    }
  });

  const isComplete = leftSets === setsToWin || rightSets === setsToWin;

  if (leftSets > setsToWin || rightSets > setsToWin) {
    errors.push(`Ein Spieler kann nicht mehr als ${setsToWin} Saetze gewinnen.`);
  }

  if (leftSets === setsToWin && rightSets === setsToWin) {
    errors.push("Beide Spieler koennen nicht gleichzeitig das Match gewinnen.");
  }

  if (requireCompleteMatch && sets.length === 0) {
    errors.push("Bitte Satzpunkte fuer das komplette Match eingeben.");
  } else if (sets.length > 0 && requireCompleteMatch && !isComplete) {
    errors.push(`Bitte das komplette Match bis ${setsToWin} Gewinnsaetze eingeben.`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    sets,
    setScore: { a: leftSets, b: rightSets },
    isComplete
  };
}

function normalizeSetSummary(value) {
  if (isPlainObject(value)) {
    const a = value.a ?? value.playerA ?? value.left ?? value.home;
    const b = value.b ?? value.playerB ?? value.right ?? value.away;
    if (a === undefined || b === undefined) {
      return null;
    }

    return {
      a: nonNegativeInteger(a, 0),
      b: nonNegativeInteger(b, 0)
    };
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d+)\s*[:-]\s*(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    a: nonNegativeInteger(match[1], 0),
    b: nonNegativeInteger(match[2], 0)
  };
}

function countSetsFromBallScores(sets) {
  return sets.reduce(
    (summary, set) => {
      if (set.a > set.b) {
        summary.a += 1;
      } else if (set.b > set.a) {
        summary.b += 1;
      }

      return summary;
    },
    { a: 0, b: 0 }
  );
}

function sumBallScores(sets) {
  return sets.reduce(
    (summary, set) => ({
      a: summary.a + set.a,
      b: summary.b + set.b
    }),
    { a: 0, b: 0 }
  );
}

function inferWinnerId(playerAId, playerBId, sets, setScore, explicitWinnerId) {
  if (explicitWinnerId === playerAId || explicitWinnerId === playerBId) {
    return explicitWinnerId;
  }

  const summary = sets.length > 0 ? countSetsFromBallScores(sets) : setScore;
  if (!summary || summary.a === summary.b) {
    return "";
  }

  return summary.a > summary.b ? playerAId : playerBId;
}

function inferWinnerFromRetirement(playerAId, playerBId, retiredPlayerId, winnerId) {
  if (winnerId) {
    return winnerId;
  }

  if (retiredPlayerId === playerAId) {
    return playerBId;
  }

  if (retiredPlayerId === playerBId) {
    return playerAId;
  }

  return "";
}

function createDefaultSetsForWinner(playerAId, playerBId, winnerId, settings) {
  if (winnerId !== playerAId && winnerId !== playerBId) {
    return [];
  }

  const [winnerScore, loserScore] = settings.walkoverSetScore;
  return Array.from({ length: settings.walkoverSetsToWin }, () =>
    winnerId === playerAId
      ? { a: winnerScore, b: loserScore }
      : { a: loserScore, b: winnerScore }
  );
}

function normalizeMatch(rawMatch, roundNumber, matchIndex, lookup, settings) {
  const raw = isPlainObject(rawMatch) ? rawMatch : {};
  const playerAId = resolvePlayerId(raw.playerAId ?? raw.playerA, lookup);
  const playerBId = resolvePlayerId(raw.playerBId ?? raw.playerB, lookup);
  const result = isPlainObject(raw.result) ? raw.result : {};
  let sets = normalizeSetScores(raw.sets ?? result.sets);
  const setScore = normalizeSetSummary(raw.setScore ?? raw.score ?? result.score);
  const retiredPlayerId = resolvePlayerId(raw.retiredPlayerId ?? result.retiredPlayerId, lookup);
  const rawWinnerId = resolvePlayerId(raw.winnerId ?? result.winnerId, lookup);
  const explicitStatus = raw.status ?? result.status;
  const fallbackStatus = rawWinnerId || sets.length > 0 || setScore ? "completed" : "scheduled";
  const status = normalizeMatchStatus(explicitStatus, fallbackStatus);
  let winnerId = status === "retired"
    ? inferWinnerFromRetirement(playerAId, playerBId, retiredPlayerId, rawWinnerId)
    : rawWinnerId;

  winnerId = inferWinnerId(playerAId, playerBId, sets, setScore, winnerId);

  if ((status === "walkover" || status === "retired") && sets.length === 0 && !setScore) {
    sets = createDefaultSetsForWinner(playerAId, playerBId, winnerId, settings);
  }

  return {
    id: cleanString(raw.id, `r${roundNumber}-m${matchIndex + 1}`),
    roundNumber,
    table: positiveInteger(raw.table, matchIndex + 1),
    clickttNr: positiveInteger(raw.clickttNr ?? raw.nr, matchIndex + 1),
    playerAId,
    playerBId,
    status,
    winnerId,
    retiredPlayerId,
    sets,
    setScore: sets.length > 0 ? null : setScore
  };
}

function normalizeBye(rawBye, roundNumber, byeIndex, lookup, settings) {
  const raw = isPlainObject(rawBye) ? rawBye : { playerId: rawBye };
  const playerId = resolvePlayerId(raw.playerId ?? raw.player, lookup);

  if (!playerId) {
    return null;
  }

  return {
    id: cleanString(raw.id, `r${roundNumber}-bye-${byeIndex + 1}`),
    roundNumber,
    playerId,
    points: finiteNumber(raw.points, settings.byePoints),
    reason: cleanString(raw.reason, "bye")
  };
}

function normalizeRound(rawRound, roundIndex, lookup, settings) {
  const raw = isPlainObject(rawRound) ? rawRound : {};
  const roundNumber = positiveInteger(raw.roundNumber, roundIndex + 1);
  const matches = Array.isArray(raw.matches)
    ? raw.matches.map((match, index) => normalizeMatch(match, roundNumber, index, lookup, settings))
    : [];
  const byes = Array.isArray(raw.byes)
    ? raw.byes
        .map((bye, index) => normalizeBye(bye, roundNumber, index, lookup, settings))
        .filter(Boolean)
    : [];

  return {
    id: cleanString(raw.id, `r${roundNumber}`),
    roundNumber,
    groupLabel: cleanString(raw.groupLabel),
    drawSeed: cleanString(raw.drawSeed ?? raw.initialDrawSeed),
    matches,
    byes
  };
}

function normalizeTournamentCore(rawTournament = {}) {
  const raw = isPlainObject(rawTournament) ? rawTournament : { players: rawTournament };
  const settings = normalizeSwissSettings(raw.settings ?? raw.scoring);
  const players = normalizePlayers(raw);
  const lookup = createPlayerLookup(players);
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.map((round, index) => normalizeRound(round, index, lookup, settings))
    : [];

  return {
    id: cleanString(raw.id, "tt-race"),
    type: TT_RACE_TYPE,
    name: cleanString(raw.name ?? raw.tournamentName, "TT-Race"),
    settings,
    players,
    rounds
  };
}

function createInitialPlayerStats(player) {
  return {
    playerId: player.id,
    id: player.id,
    name: player.name,
    status: player.status,
    seed: player.seed,
    rating: player.rating,
    withdrawnRoundNumber: player.withdrawnRoundNumber,
    initialOrder: player.initialOrder,
    matchPoints: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    played: 0,
    byes: 0,
    setsWon: 0,
    setsLost: 0,
    setDiff: 0,
    ballsWon: 0,
    ballsLost: 0,
    ballDiff: 0,
    buchholz: 0,
    buchholzByes: 0,
    opponentsScore: 0,
    opponentIds: [],
    headToHeadWins: {}
  };
}

function hasPlayerInRound(round, playerId) {
  return (
    round.matches.some((match) => match.playerAId === playerId || match.playerBId === playerId) ||
    round.byes.some((bye) => bye.playerId === playerId)
  );
}

function countMissedRoundsAfterWithdrawal(tournament, playerId, withdrawnRoundNumber) {
  if (!withdrawnRoundNumber) {
    return 0;
  }

  return tournament.rounds.filter(
    (round) => round.roundNumber > withdrawnRoundNumber && !hasPlayerInRound(round, playerId)
  ).length;
}

function addSetAndBallStats(stats, setsWon, setsLost, ballsWon, ballsLost) {
  stats.setsWon += setsWon;
  stats.setsLost += setsLost;
  stats.setDiff = stats.setsWon - stats.setsLost;
  stats.ballsWon += ballsWon;
  stats.ballsLost += ballsLost;
  stats.ballDiff = stats.ballsWon - stats.ballsLost;
}

function getMatchSummary(match) {
  const setSummary = match.sets.length > 0 ? countSetsFromBallScores(match.sets) : match.setScore;
  const ballSummary = match.sets.length > 0 ? sumBallScores(match.sets) : { a: 0, b: 0 };
  const winnerId = inferWinnerId(
    match.playerAId,
    match.playerBId,
    match.sets,
    match.setScore,
    match.winnerId
  );

  return {
    setSummary,
    ballSummary,
    winnerId
  };
}

function shouldCountMatch(match) {
  return (
    match.playerAId &&
    match.playerBId &&
    match.status !== "scheduled" &&
    match.status !== "void" &&
    Boolean(match.winnerId || match.sets.length > 0 || match.setScore)
  );
}

export function isSwissMatchComplete(match) {
  return (
    Boolean(match?.playerAId) &&
    Boolean(match?.playerBId) &&
    Boolean(match?.status) &&
    !["scheduled", "void"].includes(match.status) &&
    Boolean(match.winnerId || match.sets?.length > 0 || match.setScore)
  );
}

export function isSwissRoundComplete(round) {
  const matches = Array.isArray(round?.matches) ? round.matches : [];
  return matches.every((match) => isSwissMatchComplete(match));
}

function calculateStandings(tournament) {
  const settings = tournament.settings;
  const standingsById = new Map(
    tournament.players.map((player) => [player.id, createInitialPlayerStats(player)])
  );

  tournament.rounds.forEach((round) => {
    round.byes.forEach((bye) => {
      const stats = standingsById.get(bye.playerId);
      if (!stats) {
        return;
      }

      stats.matchPoints += bye.points;
      stats.byes += 1;
      if (bye.points > settings.lossPoints) {
        stats.wins += 1;
        stats.buchholzByes += 1;
      }
    });

    round.matches.forEach((match) => {
      if (!shouldCountMatch(match)) {
        return;
      }

      const playerA = standingsById.get(match.playerAId);
      const playerB = standingsById.get(match.playerBId);
      if (!playerA || !playerB) {
        return;
      }

      const summary = getMatchSummary(match);
      const setsA = summary.setSummary?.a ?? 0;
      const setsB = summary.setSummary?.b ?? 0;
      const ballsA = summary.ballSummary.a;
      const ballsB = summary.ballSummary.b;

      playerA.played += 1;
      playerB.played += 1;
      playerA.opponentIds.push(playerB.id);
      playerB.opponentIds.push(playerA.id);
      addSetAndBallStats(playerA, setsA, setsB, ballsA, ballsB);
      addSetAndBallStats(playerB, setsB, setsA, ballsB, ballsA);
      playerA.headToHeadWins[playerB.id] ??= 0;
      playerB.headToHeadWins[playerA.id] ??= 0;

      if (summary.winnerId === playerA.id) {
        playerA.wins += 1;
        playerB.losses += 1;
        playerA.matchPoints += settings.winPoints;
        playerB.matchPoints += settings.lossPoints;
        playerA.headToHeadWins[playerB.id] += 1;
      } else if (summary.winnerId === playerB.id) {
        playerB.wins += 1;
        playerA.losses += 1;
        playerB.matchPoints += settings.winPoints;
        playerA.matchPoints += settings.lossPoints;
        playerB.headToHeadWins[playerA.id] += 1;
      } else {
        playerA.draws += 1;
        playerB.draws += 1;
        playerA.matchPoints += settings.drawPoints;
        playerB.matchPoints += settings.drawPoints;
      }
    });
  });

  const standings = [...standingsById.values()];
  const activeScores = standings
    .filter((stats) => stats.status === "active")
    .map((stats) => stats.matchPoints);
  const lastActiveScore = activeScores.length > 0 ? Math.min(...activeScores) : 0;

  standings.forEach((stats) => {
    if (stats.status === "withdrawn" && stats.withdrawnRoundNumber) {
      const missedRounds = countMissedRoundsAfterWithdrawal(
        tournament,
        stats.playerId,
        stats.withdrawnRoundNumber
      );
      stats.losses += missedRounds;
      stats.played += missedRounds;
    }

    stats.buchholz = stats.opponentIds.reduce(
      (total, opponentId) => total + (standingsById.get(opponentId)?.matchPoints ?? 0),
      0
    ) + stats.buchholzByes * lastActiveScore;
    stats.opponentsScore = stats.buchholz;
  });

  const sortedStandings = sortSwissStandings(standings, settings);
  sortedStandings.forEach((stats, index) => {
    stats.rank = index + 1;
  });

  return sortedStandings.map(toPublicStanding);
}

function compareNullableSeed(leftSeed, rightSeed) {
  const left = leftSeed ?? Number.MAX_SAFE_INTEGER;
  const right = rightSeed ?? Number.MAX_SAFE_INTEGER;
  return left - right;
}

function compareNullableRating(leftRating, rightRating) {
  const leftHasRating = Number.isFinite(leftRating);
  const rightHasRating = Number.isFinite(rightRating);

  if (leftHasRating && rightHasRating) {
    return rightRating - leftRating;
  }

  if (leftHasRating) {
    return -1;
  }

  if (rightHasRating) {
    return 1;
  }

  return 0;
}

function compareNullableRatingLowerFirst(leftRating, rightRating) {
  const leftHasRating = Number.isFinite(leftRating);
  const rightHasRating = Number.isFinite(rightRating);

  if (leftHasRating && rightHasRating) {
    return leftRating - rightRating;
  }

  if (leftHasRating) {
    return -1;
  }

  if (rightHasRating) {
    return 1;
  }

  return 0;
}

function comparePrimaryStandings(left, right) {
  return (
    right.matchPoints - left.matchPoints ||
    right.wins - left.wins ||
    right.buchholz - left.buchholz
  );
}

function compareDirectComparison(left, right) {
  const leftWins = left.headToHeadWins?.[right.playerId] ?? 0;
  const rightWins = right.headToHeadWins?.[left.playerId] ?? 0;
  return rightWins - leftWins;
}

function compareStableStandingFallback(left, right, settings) {
  const ttrFallback = settings.regardTtrValues ? compareNullableRatingLowerFirst(left.rating, right.rating) : 0;

  return (
    ttrFallback ||
    compareNullableSeed(left.seed, right.seed) ||
    left.name.localeCompare(right.name, "de") ||
    left.initialOrder - right.initialOrder
  );
}

function hasSamePrimaryTieBreak(left, right) {
  return (
    left.matchPoints === right.matchPoints &&
    left.wins === right.wins &&
    left.buchholz === right.buchholz
  );
}

function sortSwissStandings(standings, settings) {
  const sorted = [...standings].sort(
    (left, right) => comparePrimaryStandings(left, right) || compareStableStandingFallback(left, right, settings)
  );
  const resolved = [];
  let index = 0;

  while (index < sorted.length) {
    const group = [sorted[index]];
    index += 1;

    while (index < sorted.length && hasSamePrimaryTieBreak(group[0], sorted[index])) {
      group.push(sorted[index]);
      index += 1;
    }

    if (group.length === 2) {
      group.sort(
        (left, right) =>
          compareDirectComparison(left, right) || compareStableStandingFallback(left, right, settings)
      );
    } else {
      group.sort((left, right) => compareStableStandingFallback(left, right, settings));
    }

    resolved.push(...group);
  }

  return resolved;
}

function toPublicStanding(stats) {
  const { buchholzByes, headToHeadWins, ...publicStats } = stats;
  return publicStats;
}

function sortPlayersForInitialRound(players, settings) {
  return [...players].sort(
    (left, right) =>
      (settings.regardTtrValues ? compareNullableRating(left.rating, right.rating) : 0) ||
      compareNullableSeed(left.seed, right.seed) ||
      left.name.localeCompare(right.name, "de") ||
      left.initialOrder - right.initialOrder
  );
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? "");

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seedValue) {
  let state = hashString(seedValue) || 1;

  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedValue) {
  const random = createSeededRandom(seedValue);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function createDrawTieBreak(drawSeed, scope, ...parts) {
  const seed = cleanString(drawSeed);
  if (!seed) {
    return 0;
  }

  return hashString([seed, scope, ...parts].join("\u001f"));
}

function createPairTieBreak(drawSeed, playerAId, playerBId) {
  const pairIds = [playerAId, playerBId].sort();
  return createDrawTieBreak(drawSeed, "pair", pairIds[0], pairIds[1]);
}

function createRandomDrawSeed() {
  const bytes = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return `draw-${Date.now().toString(36)}-${[...bytes]
      .map((value) => value.toString(36).padStart(7, "0"))
      .join("")}`;
  }

  return `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 16)}`;
}

function resolveInitialDrawSeed(tournament) {
  return cleanString(tournament.settings.initialDrawSeed) || createRandomDrawSeed();
}

function createBttvInitialPairs(sortedPlayers, tournament) {
  const slotCount = sortedPlayers.length + (sortedPlayers.length % 2);
  const seededCount = slotCount / 2;
  const seededPlayers = sortedPlayers.slice(0, seededCount);
  const drawPool = sortedPlayers.slice(seededCount);
  const drawSeed = resolveInitialDrawSeed(tournament);
  const shuffledDraw = seededShuffle(drawPool, drawSeed);
  const slots = Array(slotCount).fill("");
  let byePlayerId = "";

  seededPlayers.forEach((seededPlayer, index) => {
    slots[index * 2] = seededPlayer.id;
  });
  shuffledDraw.forEach((drawPlayer, index) => {
    slots[index * 2 + 1] = drawPlayer.id;
  });

  const pairs = [];
  for (let index = 0; index < slots.length; index += 2) {
    const playerAId = slots[index];
    const playerBId = slots[index + 1];

    if (playerAId && playerBId) {
      pairs.push([playerAId, playerBId]);
    } else if (playerAId || playerBId) {
      byePlayerId = playerAId || playerBId;
    }
  }

  return { pairs, byePlayerId, drawSeed };
}

function createStandardInitialPairs(sortedPlayers) {
  let players = sortedPlayers;
  let byePlayerId = "";

  if (players.length % 2 === 1) {
    const byePlayer = players[players.length - 1];
    byePlayerId = byePlayer?.id ?? "";
    players = players.slice(0, -1);
  }

  const half = Math.ceil(players.length / 2);
  const left = players.slice(0, half);
  const right = players.slice(half);
  const pairs = left.map((player, index) => [player.id, right[index]?.id]).filter((pair) => pair[1]);

  return { pairs, byePlayerId, drawSeed: "" };
}

function createMatch(roundNumber, index, playerAId, playerBId) {
  return {
    id: `r${roundNumber}-m${index + 1}`,
    roundNumber,
    table: index + 1,
    playerAId,
    playerBId,
    status: "scheduled",
    winnerId: "",
    retiredPlayerId: "",
    sets: [],
    setScore: null
  };
}

function createBye(roundNumber, playerId, settings) {
  return {
    id: `r${roundNumber}-bye-1`,
    roundNumber,
    playerId,
    points: settings.byePoints,
    reason: "odd-player-count"
  };
}

function buildRound(roundNumber, pairs, byePlayerId, settings, options = {}) {
  const drawSeed = cleanString(options.drawSeed);

  return {
    id: `r${roundNumber}`,
    roundNumber,
    groupLabel: settings.bttvRaceRules ? `Schweizer System (Runde ${roundNumber})` : "",
    ...(drawSeed ? { drawSeed } : {}),
    matches: pairs.map(([playerAId, playerBId], index) =>
      createMatch(roundNumber, index, playerAId, playerBId)
    ),
    byes: byePlayerId ? [createBye(roundNumber, byePlayerId, settings)] : []
  };
}

function activePlayers(players) {
  return players.filter((player) => player.status === "active");
}

function activeStandings(standings) {
  return standings.filter((standing) => standing.status === "active");
}

function pairableStandings(standings, settings) {
  return standings.filter(
    (standing) =>
      standing.status === "active" ||
      (settings.carryWithdrawnPlayers && standing.status === "withdrawn")
  );
}

function assertBttvRaceSwissFieldSize(settings, activePlayerCount) {
  if (!settings.bttvRaceRules) {
    return;
  }

  if (activePlayerCount >= 9 && activePlayerCount <= 16) {
    return;
  }

  if (activePlayerCount === 7 || activePlayerCount === 8) {
    throw new Error("Bei 7 oder 8 aktiven Teilnehmern wird ein BTTV TT-Race im System Jeder gegen jeden gespielt.");
  }

  throw new Error("BTTV TT-Race im Schweizer System benoetigt 9 bis 16 aktive Teilnehmer.");
}

function countByes(tournament) {
  const byeCounts = new Map(tournament.players.map((player) => [player.id, 0]));

  tournament.rounds.forEach((round) => {
    round.byes.forEach((bye) => {
      byeCounts.set(bye.playerId, (byeCounts.get(bye.playerId) ?? 0) + 1);
    });
  });

  return byeCounts;
}

function createOpponentMap(tournament) {
  const opponentMap = new Map(tournament.players.map((player) => [player.id, new Set()]));

  tournament.rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (!match.playerAId || !match.playerBId || match.status === "void") {
        return;
      }

      opponentMap.get(match.playerAId)?.add(match.playerBId);
      opponentMap.get(match.playerBId)?.add(match.playerAId);
    });
  });

  return opponentMap;
}

function hasPlayed(opponentMap, playerAId, playerBId) {
  return opponentMap.get(playerAId)?.has(playerBId) ?? false;
}

function createPairingContext(tournament, standings, drawSeed = "") {
  const standingsById = new Map(standings.map((standing) => [standing.playerId, standing]));
  const rankIndexById = new Map(standings.map((standing, index) => [standing.playerId, index]));
  const scoreById = new Map(standings.map((standing) => [standing.playerId, standing.matchPoints]));
  const statusById = new Map(standings.map((standing) => [standing.playerId, standing.status]));

  return {
    opponentMap: createOpponentMap(tournament),
    scoreById,
    scoreWeightById: createScoreWeightById(scoreById),
    rankIndexById,
    standingsById,
    statusById,
    drawSeed: cleanString(drawSeed)
  };
}

function createScoreWeightById(scoreById) {
  const orderedScores = [...new Set([...scoreById.values()])].sort((left, right) => right - left);
  const weightByScore = new Map(
    orderedScores.map((score, index) => [
      score,
      SCORE_LEVEL_COST_BASE ** (orderedScores.length - index - 1)
    ])
  );

  return new Map([...scoreById.entries()].map(([playerId, score]) => [playerId, weightByScore.get(score) ?? 1]));
}

function getPairCost(playerAId, playerBId, context) {
  const scoreGap = Math.abs((context.scoreById.get(playerAId) ?? 0) - (context.scoreById.get(playerBId) ?? 0));
  const rankGap = Math.abs(
    (context.rankIndexById.get(playerAId) ?? 0) - (context.rankIndexById.get(playerBId) ?? 0)
  );
  const rematchCost = hasPlayed(context.opponentMap, playerAId, playerBId) ? REMATCH_COST : 0;
  const scoreWeight =
    (context.scoreWeightById.get(playerAId) ?? 1) + (context.scoreWeightById.get(playerBId) ?? 1);
  const withdrawnPairCost =
    context.statusById.get(playerAId) === "withdrawn" && context.statusById.get(playerBId) === "withdrawn"
      ? WITHDRAWN_PAIR_COST
      : 0;

  return rematchCost + withdrawnPairCost + scoreGap * scoreWeight + rankGap;
}

function greedyPairing(playerIds, context) {
  const remaining = [...playerIds];
  const pairs = [];
  let cost = 0;

  while (remaining.length > 1) {
    const playerAId = remaining.shift();
    let bestIndex = 0;
    let bestCost = Infinity;
    let bestTieBreak = Infinity;

    remaining.forEach((playerBId, index) => {
      const candidateCost = getPairCost(playerAId, playerBId, context);
      const candidateTieBreak = createPairTieBreak(context.drawSeed, playerAId, playerBId);
      if (
        candidateCost < bestCost ||
        (candidateCost === bestCost && candidateTieBreak < bestTieBreak)
      ) {
        bestCost = candidateCost;
        bestTieBreak = candidateTieBreak;
        bestIndex = index;
      }
    });

    const [playerBId] = remaining.splice(bestIndex, 1);
    pairs.push([playerAId, playerBId]);
    cost += bestCost;
  }

  return { pairs, cost };
}

function exactPairing(playerIds, context) {
  let nodes = 0;
  let bestCost = Infinity;
  let bestPairs = null;

  function search(remaining, pairs, cost) {
    nodes += 1;
    if (nodes > MAX_PAIRING_SEARCH_NODES || cost >= bestCost) {
      return;
    }

    if (remaining.length === 0) {
      bestCost = cost;
      bestPairs = pairs;
      return;
    }

    const playerAId = remaining[0];
    const candidates = remaining
      .slice(1)
      .map((playerBId, index) => ({
        playerBId,
        index: index + 1,
        cost: getPairCost(playerAId, playerBId, context),
        tieBreak: createPairTieBreak(context.drawSeed, playerAId, playerBId)
      }))
      .sort((left, right) => left.cost - right.cost || left.tieBreak - right.tieBreak || left.index - right.index);

    candidates.forEach((candidate) => {
      const nextRemaining = remaining.filter(
        (playerId) => playerId !== playerAId && playerId !== candidate.playerBId
      );
      search(nextRemaining, [...pairs, [playerAId, candidate.playerBId]], cost + candidate.cost);
    });
  }

  search([...playerIds], [], 0);

  if (!bestPairs) {
    return greedyPairing(playerIds, context);
  }

  return { pairs: bestPairs, cost: bestCost };
}

function pairPlayers(playerIds, tournament, standings, drawSeed = "") {
  const orderedPlayerIds = [...playerIds].sort(
    (leftId, rightId) =>
      (standings.findIndex((standing) => standing.playerId === leftId) ?? 0) -
      (standings.findIndex((standing) => standing.playerId === rightId) ?? 0)
  );
  const context = createPairingContext(tournament, standings, drawSeed);

  if (orderedPlayerIds.length <= MAX_EXACT_PAIRING_PLAYERS) {
    return exactPairing(orderedPlayerIds, context);
  }

  return greedyPairing(orderedPlayerIds, context);
}

function selectByeAndPairs(playerIds, tournament, standings, drawSeed = "") {
  if (playerIds.length % 2 === 0) {
    return {
      byePlayerId: "",
      ...pairPlayers(playerIds, tournament, standings, drawSeed)
    };
  }

  const byeCounts = countByes(tournament);
  const orderedStandings = standings.filter((standing) => playerIds.includes(standing.playerId));
  const byeCandidates = selectLowestScoreByeCandidates(orderedStandings, byeCounts);
  let best = null;

  byeCandidates.forEach((candidate) => {
    const remaining = playerIds.filter((playerId) => playerId !== candidate.playerId);
    const pairing = pairPlayers(remaining, tournament, standings, drawSeed);
    const candidateRank = orderedStandings.findIndex((standing) => standing.playerId === candidate.playerId);
    const repeatedByePenalty = (byeCounts.get(candidate.playerId) ?? 0) > 0 ? REPEAT_BYE_COST : 0;
    const highRankByePenalty = orderedStandings.length - candidateRank;
    const totalCost = pairing.cost + repeatedByePenalty + highRankByePenalty;
    const tieBreak = createDrawTieBreak(drawSeed, "bye", candidate.playerId);

    if (!best || totalCost < best.totalCost || (totalCost === best.totalCost && tieBreak < best.tieBreak)) {
      best = {
        byePlayerId: candidate.playerId,
        pairs: pairing.pairs,
        cost: pairing.cost,
        totalCost,
        tieBreak
      };
    }
  });

  return best ?? { byePlayerId: "", pairs: [], cost: 0 };
}

function selectLowestScoreByeCandidates(orderedStandings, byeCounts) {
  const eligibleStandings = orderedStandings.filter((standing) => standing.status !== "withdrawn");
  const standings = eligibleStandings.length > 0 ? eligibleStandings : orderedStandings;
  const neverHadBye = standings.filter((standing) => (byeCounts.get(standing.playerId) ?? 0) === 0);
  const candidatePool = neverHadBye.length > 0 ? neverHadBye : standings;
  const lowestScore = Math.min(...candidatePool.map((standing) => standing.matchPoints));

  return candidatePool.filter((standing) => standing.matchPoints === lowestScore).reverse();
}

function markWithdrawnPairingsAsWalkovers(round, tournament) {
  const statusById = new Map(tournament.players.map((player) => [player.id, player.status]));

  return {
    ...round,
    matches: round.matches.map((match) => {
      const playerAWithdrawn = statusById.get(match.playerAId) === "withdrawn";
      const playerBWithdrawn = statusById.get(match.playerBId) === "withdrawn";

      if (!playerAWithdrawn && !playerBWithdrawn) {
        return match;
      }

      const winnerId =
        playerAWithdrawn && !playerBWithdrawn
          ? match.playerBId
          : playerBWithdrawn && !playerAWithdrawn
            ? match.playerAId
            : match.playerAId;
      const retiredPlayerId = winnerId === match.playerAId ? match.playerBId : match.playerAId;

      return {
        ...match,
        status: "walkover",
        winnerId,
        retiredPlayerId
      };
    })
  };
}

function normalizeRoundForTournament(tournament, round) {
  const lookup = createPlayerLookup(tournament.players);
  return normalizeRound(round, (round.roundNumber ?? 1) - 1, lookup, tournament.settings);
}

export function normalizeTtRaceTournament(rawTournament = {}) {
  const tournament = normalizeTournamentCore(rawTournament);

  return {
    ...tournament,
    standings: calculateStandings(tournament)
  };
}

export function rankSwissStandings(rawTournament = {}) {
  return calculateStandings(normalizeTournamentCore(rawTournament));
}

export function auditBttvRaceClubQuota(rawTournament = {}) {
  const tournament = normalizeTournamentCore(rawTournament);
  const activeRoster = tournament.players.filter((player) => player.status === "active");
  const activeCount = activeRoster.length;
  const maxAllowedPerClub = activeCount > 0 ? Math.ceil(activeCount / 2) - 1 : 0;
  const missingPlayers = activeRoster
    .filter((player) => !player.clubNr && !player.clubName)
    .map((player) => ({
      playerId: player.id,
      name: player.name
    }));
  const clubMap = new Map();

  activeRoster.forEach((player) => {
    if (!player.clubNr && !player.clubName) {
      return;
    }

    const clubKey = player.clubNr || player.clubName;
    const normalizedKey = player.clubNr
      ? `club-nr:${player.clubNr}`
      : `club-name:${player.clubName.toLocaleLowerCase("de")}`;
    const entry =
      clubMap.get(normalizedKey) ?? {
        clubKey,
        clubName: player.clubName,
        clubNr: player.clubNr,
        count: 0,
        playerIds: [],
        playerNames: [],
        share: 0
      };

    entry.count += 1;
    entry.playerIds.push(player.id);
    entry.playerNames.push(player.name);
    entry.share = activeCount > 0 ? entry.count / activeCount : 0;
    clubMap.set(normalizedKey, entry);
  });

  const clubs = [...clubMap.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.clubName.localeCompare(right.clubName, "de") ||
      left.clubKey.localeCompare(right.clubKey, "de")
  );
  const violations = clubs.filter((club) => activeCount > 0 && club.count * 2 >= activeCount);

  return {
    ok: violations.length === 0,
    enforceable: activeCount > 0 && missingPlayers.length === 0,
    activePlayers: activeCount,
    playersWithClubInfo: activeCount - missingPlayers.length,
    maxAllowedPerClub,
    clubs,
    violations,
    missingPlayers
  };
}

export function createInitialSwissRound(rawTournament = {}) {
  const tournament = normalizeTournamentCore(rawTournament);
  const roundNumber = 1;
  const players = sortPlayersForInitialRound(activePlayers(tournament.players), tournament.settings);

  assertBttvRaceSwissFieldSize(tournament.settings, players.length);

  const selection =
    tournament.settings.bttvRaceRules && tournament.settings.regardTtrValues
      ? createBttvInitialPairs(players, tournament)
      : createStandardInitialPairs(players);

  return normalizeRoundForTournament(
    tournament,
    buildRound(roundNumber, selection.pairs, selection.byePlayerId, tournament.settings, {
      drawSeed: selection.drawSeed
    })
  );
}

export function createNextSwissRound(rawTournament = {}, options = {}) {
  const tournament = normalizeTournamentCore(rawTournament);

  if (tournament.rounds.length === 0) {
    return createInitialSwissRound(tournament);
  }

  if (tournament.rounds.length >= tournament.settings.maxRounds) {
    throw new Error(`Die maximale Rundenzahl von ${tournament.settings.maxRounds} ist erreicht.`);
  }

  const lastRound = tournament.rounds[tournament.rounds.length - 1];
  if (!isSwissRoundComplete(lastRound)) {
    throw new Error("Die aktuelle Schweizer Runde ist noch nicht vollstaendig erfasst.");
  }

  const standings = calculateStandings(tournament);
  const players = pairableStandings(standings, tournament.settings).map((standing) => standing.playerId);
  const roundNumber =
    Math.max(0, ...tournament.rounds.map((round) => positiveInteger(round.roundNumber, 0))) + 1;
  const drawSeed = cleanString(options.drawSeed) || createRandomDrawSeed();
  const selection = selectByeAndPairs(players, tournament, standings, drawSeed);
  const round = markWithdrawnPairingsAsWalkovers(
    buildRound(roundNumber, selection.pairs, selection.byePlayerId, tournament.settings, { drawSeed }),
    tournament
  );

  return normalizeRoundForTournament(tournament, round);
}

export function appendSwissRound(rawTournament = {}, round = {}) {
  const tournament = normalizeTournamentCore(rawTournament);
  const normalizedRound = normalizeRoundForTournament(tournament, round);
  const shouldStoreInitialDrawSeed =
    tournament.rounds.length === 0 &&
    normalizedRound.roundNumber === 1 &&
    normalizedRound.drawSeed &&
    !tournament.settings.initialDrawSeed;

  return normalizeTtRaceTournament({
    ...tournament,
    settings: shouldStoreInitialDrawSeed
      ? { ...tournament.settings, initialDrawSeed: normalizedRound.drawSeed }
      : tournament.settings,
    rounds: [...tournament.rounds, normalizedRound]
  });
}

function hasSwissMatchResult(match) {
  return Boolean(
    match?.winnerId ||
      match?.sets?.length > 0 ||
      match?.setScore ||
      ["completed", "walkover", "retired", "void"].includes(match?.status)
  );
}

export function canRedrawInitialSwissRound(rawTournament = {}) {
  const tournament = normalizeTournamentCore(rawTournament);
  const firstRound = tournament.rounds[0];

  if (tournament.rounds.length !== 1 || firstRound?.roundNumber !== 1) {
    return {
      canRedraw: false,
      reason: tournament.rounds.length === 0
        ? "Es wurde noch keine erste Runde erzeugt."
        : "Neu-Losen ist nur möglich, solange ausschließlich Runde 1 existiert."
    };
  }

  if (firstRound.matches.some(hasSwissMatchResult)) {
    return {
      canRedraw: false,
      reason: "Runde 1 enthält bereits Ergebnisse und kann nicht mehr neu gelost werden."
    };
  }

  return {
    canRedraw: true,
    reason: "Runde 1 enthält noch keine Ergebnisse."
  };
}

export function redrawInitialSwissRound(rawTournament = {}, options = {}) {
  const tournament = normalizeTournamentCore(rawTournament);
  const redrawState = canRedrawInitialSwissRound(tournament);

  if (!redrawState.canRedraw) {
    throw new Error(redrawState.reason);
  }

  const drawSeed = cleanString(options.drawSeed) || createRandomDrawSeed();
  const redrawBase = normalizeTtRaceTournament({
    ...tournament,
    settings: {
      ...tournament.settings,
      initialDrawSeed: drawSeed
    },
    rounds: []
  });
  const round = createInitialSwissRound(redrawBase);

  return appendSwissRound(redrawBase, round);
}

export function recordSwissMatchResult(rawTournament = {}, matchId, result = {}) {
  const tournament = normalizeTournamentCore(rawTournament);
  const rawResult = isPlainObject(result) ? result : { score: result };
  let found = false;
  const withdrawnPlayerRoundNumbers = new Map();
  const rounds = tournament.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      if (match.id !== matchId) {
        return match;
      }

      found = true;
      const hasEnteredSets = Array.isArray(rawResult.sets) ? rawResult.sets.length > 0 : Boolean(rawResult.sets);
      const status = rawResult.status
        ? normalizeMatchStatus(rawResult.status, match.status)
        : hasEnteredSets || rawResult.score || rawResult.setScore || rawResult.winnerId
          ? "completed"
          : match.status;
      const nextSets = rawResult.sets ?? match.sets;
      const hasExplicitSets = rawResult.sets !== undefined;

      if (hasExplicitSets) {
        const validation = validateTableTennisSetScores(nextSets, {
          settings: tournament.settings,
          requireCompleteMatch: status === "completed"
        });

        if (!validation.valid) {
          throw new Error(validation.errors[0] || "Ungueltige Satzpunkte.");
        }
      }

      const nextMatch = {
        ...match,
        status,
        winnerId: rawResult.winnerId ?? match.winnerId,
        retiredPlayerId: rawResult.retiredPlayerId ?? match.retiredPlayerId,
        sets: nextSets,
        setScore: rawResult.setScore ?? rawResult.score ?? match.setScore
      };
      const withdrawnPlayerId = getWithdrawnPlayerId(nextMatch);

      if (withdrawnPlayerId) {
        withdrawnPlayerRoundNumbers.set(withdrawnPlayerId, nextMatch.roundNumber);
      }

      return nextMatch;
    })
  }));

  if (!found) {
    throw new Error(`Unknown Swiss match: ${matchId}`);
  }

  return normalizeTtRaceTournament({
    ...tournament,
    players: tournament.players.map((player) => {
      const withdrawnRoundNumber = withdrawnPlayerRoundNumbers.get(player.id);
      return withdrawnRoundNumber
        ? { ...player, status: "withdrawn", withdrawnRoundNumber }
        : player;
    }),
    rounds
  });
}

function getWithdrawnPlayerId(match) {
  if (match.status === "retired" && match.retiredPlayerId) {
    return match.retiredPlayerId;
  }

  if (match.status === "walkover" && match.winnerId) {
    if (match.winnerId === match.playerAId) {
      return match.playerBId;
    }

    if (match.winnerId === match.playerBId) {
      return match.playerAId;
    }
  }

  return "";
}

export const updateSwissMatchResult = recordSwissMatchResult;

export const TtRaceEngine = {
  TT_RACE_TYPE,
  PLAYER_STATUS_ORDER,
  MATCH_STATUS_ORDER,
  DEFAULT_SWISS_SETTINGS,
  appendSwissRound,
  createInitialSwissRound,
  createNextSwissRound,
  auditBttvRaceClubQuota,
  isSwissMatchComplete,
  isSwissRoundComplete,
  normalizeTtRaceTournament,
  parseTableTennisSetScoreText,
  rankSwissStandings,
  recordSwissMatchResult,
  updateSwissMatchResult,
  validateTableTennisSetScores
};

if (typeof window !== "undefined") {
  window.TtRaceEngine = TtRaceEngine;
}

export default TtRaceEngine;
