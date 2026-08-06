const SET_COUNT = 7;

const TOURNAMENT_REQUIRED_ATTRIBUTES = ["name", "start-date", "end-date", "tournament-id"];
const COMPETITION_REQUIRED_ATTRIBUTES = ["age-group", "type", "start-date"];
const PLAYER_REQUIRED_ATTRIBUTES = ["type", "id"];
const PERSON_REQUIRED_ATTRIBUTES = [
  "firstname",
  "lastname",
  "birthyear",
  "internal-nr",
  "licence-nr",
  "sex"
];
const MATCH_REQUIRED_ATTRIBUTES = [
  "player-a",
  "player-b",
  ...Array.from({ length: SET_COUNT }, (_, index) => `set-a-${index + 1}`),
  "sets-a",
  "matches-a",
  "games-a",
  ...Array.from({ length: SET_COUNT }, (_, index) => `set-b-${index + 1}`),
  "sets-b",
  "matches-b",
  "games-b"
];
const MATCH_ATTRIBUTE_ORDER = [
  "nr",
  "group",
  "scheduled",
  "player-a",
  "player-b",
  "state",
  ...Array.from({ length: SET_COUNT }, (_, index) => `set-a-${index + 1}`),
  "sets-a",
  "matches-a",
  "games-a",
  ...Array.from({ length: SET_COUNT }, (_, index) => `set-b-${index + 1}`),
  "sets-b",
  "matches-b",
  "games-b"
];

export class ClickttValidationError extends Error {
  constructor(issues) {
    super(`click-TT XML validation failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
    this.name = "ClickttValidationError";
    this.issues = issues;
  }
}

export function parseTournamentPortalXml(xmlText) {
  const document = parseXmlDocument(xmlText);

  if (document.root.name !== "tournament") {
    throw new Error(`Expected <tournament> as XML root, got <${document.root.name}>`);
  }

  const tournamentNode = document.root;
  const tournament = {
    attrs: cloneAttributes(tournamentNode.attributes),
    id: tournamentNode.attributes["tournament-id"] ?? "",
    name: tournamentNode.attributes.name ?? "",
    startDate: tournamentNode.attributes["start-date"] ?? "",
    endDate: tournamentNode.attributes["end-date"] ?? "",
    locations: elementChildren(tournamentNode, "tournament-location").map((locationNode) => ({
      attrs: cloneAttributes(locationNode.attributes)
    })),
    competitions: []
  };

  tournament.competitions = elementChildren(tournamentNode, "competition").map((competitionNode, index) =>
    parseCompetition(competitionNode, index)
  );

  return {
    format: "TournamentPortal",
    document,
    tournament,
    competitions: tournament.competitions
  };
}

export function buildClickttMatchAttributes(match) {
  const inputAttributes = match?.attrs ?? match ?? {};
  const setPairs = normalizeInputSetPairs(match);
  const attributes = {};

  for (const name of ["nr", "group", "scheduled"]) {
    const value = inputAttributes[name] ?? match?.[name];
    if (hasValue(value)) {
      attributes[name] = String(value);
    }
  }

  const playerA = inputAttributes["player-a"] ?? match?.playerA;
  const playerB = inputAttributes["player-b"] ?? match?.playerB;
  attributes["player-a"] = hasValue(playerA) ? String(playerA) : "";
  attributes["player-b"] = hasValue(playerB) ? String(playerB) : "";

  const state = inputAttributes.state ?? match?.state;
  if (hasValue(state)) {
    attributes.state = String(state);
  }

  let setsA = 0;
  let setsB = 0;
  let gamesA = 0;
  let gamesB = 0;

  for (let index = 0; index < SET_COUNT; index += 1) {
    const pair = setPairs[index] ?? { a: 0, b: 0 };
    const pointsA = normalizeInteger(pair.a, 0);
    const pointsB = normalizeInteger(pair.b, 0);

    attributes[`set-a-${index + 1}`] = String(pointsA);
    attributes[`set-b-${index + 1}`] = String(pointsB);
    gamesA += pointsA;
    gamesB += pointsB;

    if (pointsA > pointsB) {
      setsA += 1;
    } else if (pointsB > pointsA) {
      setsB += 1;
    }
  }

  attributes["sets-a"] = String(setsA);
  attributes["sets-b"] = String(setsB);
  attributes["matches-a"] = setsA > setsB ? "1" : "0";
  attributes["matches-b"] = setsB > setsA ? "1" : "0";
  attributes["games-a"] = String(gamesA);
  attributes["games-b"] = String(gamesB);

  return orderAttributes(attributes, MATCH_ATTRIBUTE_ORDER);
}

export function exportCompetitionResultsXml(portal, competitionSelector, matches, options = {}) {
  const competitionIndex = getCompetitionIndex(portal, competitionSelector);
  const matchAttributes = matches.map((match) => buildClickttMatchAttributes(match));
  const issues = validateCompetitionResults(portal, competitionIndex, matchAttributes);

  if (issues.length > 0) {
    throw new ClickttValidationError(issues);
  }

  const document = cloneXmlDocument(portal.document);
  const tournamentNode = document.root;
  const competitionNode = elementChildren(tournamentNode, "competition")[competitionIndex];
  const matchesNode = createElement("matches", {});

  applyPlayerPlacements(competitionNode, options.playerPlacements);
  matchesNode.children = matchAttributes.map((attributes) => createElement("match", attributes));
  replaceOrInsertMatchesNode(competitionNode, matchesNode);

  return `${serializeXmlDocument(document)}\n`;
}

export function validateTournamentPortal(portalOrXml) {
  const portal = typeof portalOrXml === "string" ? parseTournamentPortalXml(portalOrXml) : portalOrXml;
  const issues = [];
  const tournamentAttrs = portal.tournament.attrs;

  requireAttributes(issues, "tournament", tournamentAttrs, TOURNAMENT_REQUIRED_ATTRIBUTES);

  if (portal.competitions.length === 0) {
    issues.push(createIssue("tournament", "missing-competition", "Tournament must contain at least one competition"));
  }

  const globalPlayerIds = new Map();

  for (const competition of portal.competitions) {
    const competitionPath = `competition[${competition.index}]`;
    requireAttributes(issues, competitionPath, competition.attrs, COMPETITION_REQUIRED_ATTRIBUTES);

    if (!competition.hasPlayersElement) {
      issues.push(createIssue(competitionPath, "missing-players", "Competition must contain a <players> element"));
    }

    if (!["Einzel", "Doppel", "Mixed", "Mannschaft"].includes(competition.type)) {
      issues.push(
        createIssue(
          competitionPath,
          "invalid-competition-type",
          `Competition type must match TournamentPortal.dtd, got "${competition.type}"`
        )
      );
    }

    for (const player of competition.players) {
      const playerPath = `${competitionPath}.player[${player.index}]`;
      requireAttributes(issues, playerPath, player.attrs, PLAYER_REQUIRED_ATTRIBUTES);

      if (!["single", "double"].includes(player.type)) {
        issues.push(
          createIssue(playerPath, "invalid-player-type", `Player type must be "single" or "double", got "${player.type}"`)
        );
      }

      if (player.id) {
        if (globalPlayerIds.has(player.id)) {
          issues.push(
            createIssue(playerPath, "duplicate-player-id", `Player id "${player.id}" is duplicated in this document`)
          );
        } else {
          globalPlayerIds.set(player.id, playerPath);
        }
      }

      if (player.persons.length === 0) {
        issues.push(createIssue(playerPath, "missing-person", "Player must contain at least one person"));
      }

      player.persons.forEach((person, personIndex) => {
        requireAttributes(issues, `${playerPath}.person[${personIndex}]`, person.attrs, PERSON_REQUIRED_ATTRIBUTES);
      });
    }

    issues.push(...validateCompetitionResults(portal, competition.index, competition.matches));
  }

  return issues;
}

export function validateCompetitionResults(portal, competitionSelector, matches) {
  const competitionIndex = getCompetitionIndex(portal, competitionSelector);
  const competition = portal.competitions[competitionIndex];
  const playerIds = new Set(competition.players.map((player) => player.id));
  const issues = [];

  matches.forEach((match, index) => {
    const attributes = getMatchAttributesForValidation(match);
    const path = `competition[${competitionIndex}].match[${index}]`;
    requireAttributes(issues, path, attributes, MATCH_REQUIRED_ATTRIBUTES);

    const playerA = attributes["player-a"];
    const playerB = attributes["player-b"];

    if (playerA && !playerIds.has(playerA)) {
      issues.push(
        createIssue(path, "unknown-player-a", `player-a "${playerA}" is not part of competition ${competitionIndex}`)
      );
    }

    if (playerB && !playerIds.has(playerB)) {
      issues.push(
        createIssue(path, "unknown-player-b", `player-b "${playerB}" is not part of competition ${competitionIndex}`)
      );
    }

    if (playerA && playerB && playerA === playerB) {
      issues.push(createIssue(path, "same-player-reference", "player-a and player-b must reference different players"));
    }

    validateMatchScoreConsistency(issues, path, attributes);
  });

  return issues;
}

function parseCompetition(competitionNode, index) {
  const playersNode = elementChildren(competitionNode, "players")[0] ?? null;
  const matchesNode = elementChildren(competitionNode, "matches")[0] ?? null;
  const attrs = cloneAttributes(competitionNode.attributes);

  return {
    index,
    attrs,
    id: attrs["competition-id"] ?? "",
    ageGroup: attrs["age-group"] ?? "",
    type: attrs.type ?? "",
    startDate: attrs["start-date"] ?? "",
    hasPlayersElement: Boolean(playersNode),
    hasMatchesElement: Boolean(matchesNode),
    players: playersNode ? elementChildren(playersNode, "player").map((playerNode, playerIndex) => parsePlayer(playerNode, playerIndex)) : [],
    matches: matchesNode ? elementChildren(matchesNode, "match").map((matchNode, matchIndex) => parseMatch(matchNode, matchIndex)) : []
  };
}

function parsePlayer(playerNode, index) {
  const attrs = cloneAttributes(playerNode.attributes);
  const persons = elementChildren(playerNode, "person").map((personNode) => {
    const personAttrs = cloneAttributes(personNode.attributes);

    return {
      attrs: personAttrs,
      firstname: personAttrs.firstname ?? "",
      lastname: personAttrs.lastname ?? "",
      birthyear: personAttrs.birthyear ?? "",
      internalNr: personAttrs["internal-nr"] ?? "",
      licenceNr: personAttrs["licence-nr"] ?? "",
      sex: personAttrs.sex ?? "",
      clubNr: personAttrs["club-nr"] ?? "",
      clubName: personAttrs["club-name"] ?? ""
    };
  });

  return {
    index,
    attrs,
    id: attrs.id ?? "",
    type: attrs.type ?? "",
    teamName: attrs["team-name"] ?? "",
    teamNr: attrs["team-nr"] ?? "",
    placement: attrs.placement ?? "",
    waitingListPlayer: attrs["waiting-list-player"] ?? "",
    persons,
    displayName: persons.map(formatPersonName).join(" / "),
    licenceNumbers: persons.map((person) => person.licenceNr),
    internalNumbers: persons.map((person) => person.internalNr)
  };
}

function parseMatch(matchNode, index) {
  const attrs = cloneAttributes(matchNode.attributes);

  return {
    index,
    attrs,
    nr: attrs.nr ?? "",
    group: attrs.group ?? "",
    scheduled: attrs.scheduled ?? "",
    playerA: attrs["player-a"] ?? "",
    playerB: attrs["player-b"] ?? "",
    state: attrs.state ?? "",
    setPoints: Array.from({ length: SET_COUNT }, (_, setIndex) => ({
      a: attrs[`set-a-${setIndex + 1}`] ?? "",
      b: attrs[`set-b-${setIndex + 1}`] ?? ""
    })),
    setsA: parseOptionalInteger(attrs["sets-a"]),
    setsB: parseOptionalInteger(attrs["sets-b"]),
    matchesA: parseOptionalInteger(attrs["matches-a"]),
    matchesB: parseOptionalInteger(attrs["matches-b"]),
    gamesA: parseOptionalInteger(attrs["games-a"]),
    gamesB: parseOptionalInteger(attrs["games-b"])
  };
}

function parseXmlDocument(xmlText) {
  const source = String(xmlText).replace(/^\uFEFF/, "");
  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/[^>]+>|<[^>]+>/gi;
  const prolog = [];
  const stack = [];
  const roots = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(source)) !== null) {
    appendText(source.slice(lastIndex, match.index), stack, roots);

    const token = match[0];

    if (token.startsWith("<!--")) {
      lastIndex = tokenPattern.lastIndex;
      continue;
    }

    if (token.startsWith("<?") || token.startsWith("<!DOCTYPE")) {
      if (stack.length > 0 || roots.length > 0) {
        throw new Error(`XML prolog entry appears after the root element: ${token.slice(0, 40)}`);
      }

      prolog.push(token);
      lastIndex = tokenPattern.lastIndex;
      continue;
    }

    if (token.startsWith("</")) {
      const closingName = token.slice(2, -1).trim();
      const node = stack.pop();

      if (!node) {
        throw new Error(`Unexpected closing tag </${closingName}>`);
      }

      if (node.name !== closingName) {
        throw new Error(`Expected closing tag </${node.name}>, got </${closingName}>`);
      }

      if (stack.length === 0) {
        roots.push(node);
      }

      lastIndex = tokenPattern.lastIndex;
      continue;
    }

    const node = parseStartTag(token);

    if (node.selfClosing) {
      delete node.selfClosing;

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      delete node.selfClosing;

      if (stack.length === 0 && roots.length > 0) {
        throw new Error(`Multiple XML root elements are not supported; found <${node.name}>`);
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      }

      stack.push(node);
    }

    lastIndex = tokenPattern.lastIndex;
  }

  appendText(source.slice(lastIndex), stack, roots);

  if (stack.length > 0) {
    throw new Error(`Unclosed XML tag <${stack[stack.length - 1].name}>`);
  }

  if (roots.length !== 1) {
    throw new Error(`Expected exactly one XML root element, found ${roots.length}`);
  }

  return {
    type: "document",
    prolog,
    root: roots[0]
  };
}

function appendText(text, stack, roots) {
  if (!text) {
    return;
  }

  if (stack.length > 0) {
    stack[stack.length - 1].children.push({ type: "text", value: decodeXml(text) });
    return;
  }

  if (text.trim() !== "" && roots.length > 0) {
    throw new Error(`Unexpected text outside XML root: ${text.trim().slice(0, 40)}`);
  }
}

function parseStartTag(token) {
  const selfClosing = /\/>$/.test(token);
  const body = token.slice(1, token.length - (selfClosing ? 2 : 1)).trim();
  const firstWhitespace = body.search(/\s/);
  const name = firstWhitespace === -1 ? body : body.slice(0, firstWhitespace);
  const attributeSource = firstWhitespace === -1 ? "" : body.slice(firstWhitespace + 1);
  const { attributes, attributeOrder } = parseAttributes(attributeSource, name);

  if (!name) {
    throw new Error(`Missing XML element name in token ${token}`);
  }

  return {
    type: "element",
    name,
    attributes,
    attributeOrder,
    children: [],
    selfClosing
  };
}

function parseAttributes(source, elementName) {
  const attributes = {};
  const attributeOrder = [];
  const attributePattern = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let lastIndex = 0;
  let match;

  while ((match = attributePattern.exec(source)) !== null) {
    const unparsed = source.slice(lastIndex, match.index).trim();

    if (unparsed) {
      throw new Error(`Could not parse attributes for <${elementName}> near "${unparsed.slice(0, 40)}"`);
    }

    const name = match[1];

    if (Object.hasOwn(attributes, name)) {
      throw new Error(`Duplicate attribute "${name}" on <${elementName}>`);
    }

    attributes[name] = decodeXml(match[3] ?? match[4] ?? "");
    attributeOrder.push(name);
    lastIndex = attributePattern.lastIndex;
  }

  const rest = source.slice(lastIndex).trim();

  if (rest) {
    throw new Error(`Could not parse attributes for <${elementName}> near "${rest.slice(0, 40)}"`);
  }

  return { attributes, attributeOrder };
}

function serializeXmlDocument(document) {
  const prolog = document.prolog.length > 0 ? document.prolog : ['<?xml version="1.0" encoding="utf-8"?>'];

  return [...prolog, serializeElement(document.root, 0)].join("\n");
}

function serializeElement(node, depth) {
  const indent = "  ".repeat(depth);
  const attributes = serializeAttributes(node);
  const meaningfulTextChildren = node.children.filter((child) => child.type === "text" && child.value.trim() !== "");
  const childElements = node.children.filter((child) => child.type === "element");

  if (childElements.length === 0 && meaningfulTextChildren.length === 0) {
    return `${indent}<${node.name}${attributes}/>`;
  }

  if (childElements.length === 0) {
    return `${indent}<${node.name}${attributes}>${meaningfulTextChildren.map((child) => escapeXmlText(child.value)).join("")}</${node.name}>`;
  }

  return [
    `${indent}<${node.name}${attributes}>`,
    ...childElements.map((child) => serializeElement(child, depth + 1)),
    `${indent}</${node.name}>`
  ].join("\n");
}

function serializeAttributes(node) {
  const orderedNames = [
    ...node.attributeOrder.filter((name) => Object.hasOwn(node.attributes, name)),
    ...Object.keys(node.attributes).filter((name) => !node.attributeOrder.includes(name))
  ];

  if (orderedNames.length === 0) {
    return "";
  }

  return ` ${orderedNames.map((name) => `${name}="${escapeXmlAttribute(node.attributes[name])}"`).join(" ")}`;
}

function createElement(name, attributes) {
  return {
    type: "element",
    name,
    attributes: cloneAttributes(attributes),
    attributeOrder: Object.keys(attributes),
    children: []
  };
}

function cloneXmlDocument(document) {
  return {
    type: "document",
    prolog: [...document.prolog],
    root: cloneXmlNode(document.root)
  };
}

function cloneXmlNode(node) {
  if (node.type === "text") {
    return { type: "text", value: node.value };
  }

  return {
    type: "element",
    name: node.name,
    attributes: cloneAttributes(node.attributes),
    attributeOrder: [...node.attributeOrder],
    children: node.children.map((child) => cloneXmlNode(child))
  };
}

function replaceOrInsertMatchesNode(competitionNode, matchesNode) {
  const existingMatchesIndex = competitionNode.children.findIndex((child) => child.type === "element" && child.name === "matches");

  if (existingMatchesIndex >= 0) {
    competitionNode.children[existingMatchesIndex] = matchesNode;
    return;
  }

  const playersIndex = competitionNode.children.findIndex((child) => child.type === "element" && child.name === "players");
  competitionNode.children.splice(playersIndex >= 0 ? playersIndex + 1 : competitionNode.children.length, 0, matchesNode);
}

function applyPlayerPlacements(competitionNode, playerPlacements) {
  const placements = normalizePlayerPlacements(playerPlacements);
  if (placements.size === 0) {
    return;
  }

  const playersNode = elementChildren(competitionNode, "players")[0];
  if (!playersNode) {
    return;
  }

  elementChildren(playersNode, "player").forEach((playerNode) => {
    const playerId = playerNode.attributes.id;
    if (!playerId) {
      return;
    }

    if (placements.has(playerId)) {
      setXmlAttribute(playerNode, "placement", String(placements.get(playerId)), "id");
      return;
    }

    removeXmlAttribute(playerNode, "placement");
  });
}

function normalizePlayerPlacements(playerPlacements) {
  if (playerPlacements instanceof Map) {
    return new Map(
      [...playerPlacements.entries()]
        .map(([playerId, placement]) => [String(playerId), normalizeInteger(placement, 0)])
        .filter(([, placement]) => placement > 0)
    );
  }

  if (Array.isArray(playerPlacements)) {
    return new Map(
      playerPlacements
        .map((entry) => [String(entry?.playerId ?? entry?.id ?? ""), normalizeInteger(entry?.placement ?? entry?.rank, 0)])
        .filter(([playerId, placement]) => playerId && placement > 0)
    );
  }

  if (playerPlacements && typeof playerPlacements === "object") {
    return new Map(
      Object.entries(playerPlacements)
        .map(([playerId, placement]) => [playerId, normalizeInteger(placement, 0)])
        .filter(([, placement]) => placement > 0)
    );
  }

  return new Map();
}

function setXmlAttribute(node, name, value, afterName = null) {
  node.attributes[name] = value;
  if (node.attributeOrder.includes(name)) {
    return;
  }

  const afterIndex = afterName ? node.attributeOrder.indexOf(afterName) : -1;
  if (afterIndex >= 0) {
    node.attributeOrder.splice(afterIndex + 1, 0, name);
  } else {
    node.attributeOrder.push(name);
  }
}

function removeXmlAttribute(node, name) {
  delete node.attributes[name];
  node.attributeOrder = node.attributeOrder.filter((attributeName) => attributeName !== name);
}

function elementChildren(node, name = null) {
  return node.children.filter((child) => child.type === "element" && (name === null || child.name === name));
}

function normalizeInputSetPairs(match) {
  const source = match?.sets ?? match?.games ?? null;

  if (source) {
    return source.map((pair) => {
      if (Array.isArray(pair)) {
        return { a: pair[0], b: pair[1] };
      }

      return {
        a: pair.a ?? pair.playerA ?? pair.pointsA,
        b: pair.b ?? pair.playerB ?? pair.pointsB
      };
    });
  }

  const attributes = match?.attrs ?? match ?? {};

  return Array.from({ length: SET_COUNT }, (_, index) => ({
    a: attributes[`set-a-${index + 1}`],
    b: attributes[`set-b-${index + 1}`]
  }));
}

function getMatchAttributesForValidation(match) {
  if (match?.attrs) {
    return cloneAttributes(match.attrs);
  }

  if (match && typeof match === "object" && ("player-a" in match || "set-a-1" in match)) {
    return cloneAttributes(match);
  }

  return buildClickttMatchAttributes(match);
}

function validateMatchScoreConsistency(issues, path, attributes) {
  const setPairs = [];
  let expectedSetsA = 0;
  let expectedSetsB = 0;
  let expectedGamesA = 0;
  let expectedGamesB = 0;
  let foundEmptySet = false;

  for (let index = 0; index < SET_COUNT; index += 1) {
    const setPath = `${path}.set[${index}]`;
    const pointsA = parseRequiredNonNegativeInteger(issues, setPath, attributes[`set-a-${index + 1}`], `set-a-${index + 1}`);
    const pointsB = parseRequiredNonNegativeInteger(issues, setPath, attributes[`set-b-${index + 1}`], `set-b-${index + 1}`);

    if (pointsA === null || pointsB === null) {
      continue;
    }

    setPairs.push({ a: pointsA, b: pointsB });
    expectedGamesA += pointsA;
    expectedGamesB += pointsB;

    const isEmptySet = pointsA === 0 && pointsB === 0;

    if (isEmptySet) {
      foundEmptySet = true;
      continue;
    }

    if (foundEmptySet) {
      issues.push(createIssue(setPath, "non-contiguous-sets", "Played sets must not appear after an empty 0:0 set"));
    }

    if (pointsA === pointsB) {
      issues.push(createIssue(setPath, "tied-set", "A played set cannot be tied"));
    } else if (pointsA > pointsB) {
      expectedSetsA += 1;
    } else {
      expectedSetsB += 1;
    }
  }

  const setsA = parseRequiredEnumInteger(issues, path, attributes["sets-a"], "sets-a", 0, SET_COUNT);
  const setsB = parseRequiredEnumInteger(issues, path, attributes["sets-b"], "sets-b", 0, SET_COUNT);
  const matchesA = parseRequiredEnumInteger(issues, path, attributes["matches-a"], "matches-a", 0, 1);
  const matchesB = parseRequiredEnumInteger(issues, path, attributes["matches-b"], "matches-b", 0, 1);
  const gamesA = parseRequiredNonNegativeInteger(issues, path, attributes["games-a"], "games-a");
  const gamesB = parseRequiredNonNegativeInteger(issues, path, attributes["games-b"], "games-b");

  if (setsA !== null && setsA !== expectedSetsA) {
    issues.push(createIssue(path, "sets-a-mismatch", `sets-a must be ${expectedSetsA}, got ${setsA}`));
  }

  if (setsB !== null && setsB !== expectedSetsB) {
    issues.push(createIssue(path, "sets-b-mismatch", `sets-b must be ${expectedSetsB}, got ${setsB}`));
  }

  if (gamesA !== null && gamesA !== expectedGamesA) {
    issues.push(createIssue(path, "games-a-mismatch", `games-a must be ${expectedGamesA}, got ${gamesA}`));
  }

  if (gamesB !== null && gamesB !== expectedGamesB) {
    issues.push(createIssue(path, "games-b-mismatch", `games-b must be ${expectedGamesB}, got ${gamesB}`));
  }

  if (matchesA !== null && matchesB !== null && matchesA === 1 && matchesB === 1) {
    issues.push(createIssue(path, "both-players-won-match", "matches-a and matches-b cannot both be 1"));
  }

  if (setsA !== null && setsB !== null && matchesA !== null && matchesB !== null) {
    const expectedMatchesA = setsA > setsB ? 1 : 0;
    const expectedMatchesB = setsB > setsA ? 1 : 0;

    if (matchesA !== expectedMatchesA) {
      issues.push(createIssue(path, "matches-a-mismatch", `matches-a must be ${expectedMatchesA}, got ${matchesA}`));
    }

    if (matchesB !== expectedMatchesB) {
      issues.push(createIssue(path, "matches-b-mismatch", `matches-b must be ${expectedMatchesB}, got ${matchesB}`));
    }

    if (setsA === setsB && setPairs.some((pair) => pair.a !== 0 || pair.b !== 0)) {
      issues.push(createIssue(path, "drawn-played-match", "A played table tennis match cannot end with equal sets"));
    }
  }
}

function getCompetitionIndex(portal, selector) {
  if (Number.isInteger(selector)) {
    if (selector >= 0 && selector < portal.competitions.length) {
      return selector;
    }

    throw new Error(`Competition index ${selector} is out of range`);
  }

  if (typeof selector === "string") {
    const index = portal.competitions.findIndex((competition) => competition.id === selector);

    if (index >= 0) {
      return index;
    }

    throw new Error(`Competition with competition-id "${selector}" was not found`);
  }

  if (selector && typeof selector === "object") {
    if (Number.isInteger(selector.index)) {
      return getCompetitionIndex(portal, selector.index);
    }

    if (selector.competitionId) {
      return getCompetitionIndex(portal, selector.competitionId);
    }
  }

  throw new Error("Competition selector must be a competition index, competition-id, or selector object");
}

function requireAttributes(issues, path, attributes, requiredNames) {
  for (const name of requiredNames) {
    if (!hasValue(attributes[name])) {
      issues.push(createIssue(path, "missing-required-attribute", `Missing required attribute "${name}"`));
    }
  }
}

function parseRequiredEnumInteger(issues, path, value, name, min, max) {
  const parsed = parseRequiredNonNegativeInteger(issues, path, value, name);

  if (parsed === null) {
    return null;
  }

  if (parsed < min || parsed > max) {
    issues.push(createIssue(path, "integer-out-of-range", `${name} must be between ${min} and ${max}, got ${parsed}`));
    return null;
  }

  return parsed;
}

function parseRequiredNonNegativeInteger(issues, path, value, name) {
  if (!hasValue(value)) {
    return null;
  }

  if (!/^\d+$/.test(String(value))) {
    issues.push(createIssue(path, "invalid-integer", `${name} must be a non-negative integer, got "${value}"`));
    return null;
  }

  return Number(value);
}

function parseOptionalInteger(value) {
  if (!hasValue(value) || !/^-?\d+$/.test(String(value))) {
    return null;
  }

  return Number(value);
}

function normalizeInteger(value, fallback) {
  if (Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return fallback;
}

function orderAttributes(attributes, order) {
  const ordered = {};

  for (const name of order) {
    if (Object.hasOwn(attributes, name)) {
      ordered[name] = attributes[name];
    }
  }

  for (const [name, value] of Object.entries(attributes)) {
    if (!Object.hasOwn(ordered, name)) {
      ordered[name] = value;
    }
  }

  return ordered;
}

function formatPersonName(person) {
  return [person.firstname, person.lastname].filter(Boolean).join(" ");
}

function createIssue(path, code, message) {
  return { path, code, message };
}

function cloneAttributes(attributes) {
  return { ...attributes };
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value) !== "";
}

function decodeXml(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity.toLowerCase().startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }

    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }

    return {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'"
    }[entity.toLowerCase()];
  });
}

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
