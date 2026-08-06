(function () {
  const { getMatchStatusLabel, getPlayerStatusLabel, reverseScore } = window.TournamentLogic;

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sanitizeSheetName(name) {
    return name.replace(/[\\/*?:\[\]]/g, "").slice(0, 31) || "Tabelle";
  }

  function sanitizeFilename(name) {
    return (name || "turnier").replaceAll(" ", "_");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[";,\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function buildCsvContent(rows) {
    return `\uFEFF${rows.map((row) => row.map(csvEscape).join(";")).join("\n")}`;
  }

  function xmlEscape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function columnLabel(index) {
    let value = index + 1;
    let label = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function buildSheetXml(rows) {
    const xmlRows = rows
      .map((row, rowIndex) => {
        const cells = row
          .map((cell, columnIndex) => {
            if (cell === null || cell === undefined || cell === "") {
              return "";
            }

            const reference = `${columnLabel(columnIndex)}${rowIndex + 1}`;
            if (typeof cell === "number") {
              return `<c r="${reference}"><v>${cell}</v></c>`;
            }

            return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
          })
          .join("");
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${xmlRows}</sheetData>
</worksheet>`;
  }

  function createCrcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  }

  const CRC_TABLE = createCrcTable();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
  }

  function concatenateChunks(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.length;
    });
    return merged;
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value, true);
  }

  function buildStoredZip(files) {
    const encoder = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    const { dosDate, dosTime } = dosDateTime();

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = file.data instanceof Uint8Array ? file.data : encoder.encode(file.data);
      const fileCrc = crc32(dataBytes);

      const localHeader = new ArrayBuffer(30 + nameBytes.length);
      const localView = new DataView(localHeader);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, dosTime);
      writeUint16(localView, 12, dosDate);
      writeUint32(localView, 14, fileCrc);
      writeUint32(localView, 18, dataBytes.length);
      writeUint32(localView, 22, dataBytes.length);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      new Uint8Array(localHeader, 30).set(nameBytes);

      localChunks.push(new Uint8Array(localHeader), dataBytes);

      const centralHeader = new ArrayBuffer(46 + nameBytes.length);
      const centralView = new DataView(centralHeader);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, 20);
      writeUint16(centralView, 6, 20);
      writeUint16(centralView, 8, 0);
      writeUint16(centralView, 10, 0);
      writeUint16(centralView, 12, dosTime);
      writeUint16(centralView, 14, dosDate);
      writeUint32(centralView, 16, fileCrc);
      writeUint32(centralView, 20, dataBytes.length);
      writeUint32(centralView, 24, dataBytes.length);
      writeUint16(centralView, 28, nameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, 0);
      writeUint32(centralView, 38, 0);
      writeUint32(centralView, 42, offset);
      new Uint8Array(centralHeader, 46).set(nameBytes);
      centralChunks.push(new Uint8Array(centralHeader));

      offset += 30 + nameBytes.length + dataBytes.length;
    });

    const centralDirectory = concatenateChunks(centralChunks);
    const endRecord = new ArrayBuffer(22);
    const endView = new DataView(endRecord);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, files.length);
    writeUint16(endView, 10, files.length);
    writeUint32(endView, 12, centralDirectory.length);
    writeUint32(endView, 16, offset);
    writeUint16(endView, 20, 0);

    return new Blob([...localChunks, centralDirectory, new Uint8Array(endRecord)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function buildWorkbookXml(sheets) {
    const sheetEntries = sheets
      .map(
        (sheet, index) =>
          `<sheet name="${xmlEscape(sanitizeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetEntries}</sheets>
</workbook>`;
  }

  function buildWorkbookRelsXml(sheets) {
    const entries = sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${entries}
</Relationships>`;
  }

  function buildRootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  }

  function buildContentTypesXml(sheets) {
    const overrides = sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${overrides}
</Types>`;
  }

  function buildXlsxBlob(sheets) {
    const files = [
      { name: "[Content_Types].xml", data: buildContentTypesXml(sheets) },
      { name: "_rels/.rels", data: buildRootRelsXml() },
      { name: "xl/workbook.xml", data: buildWorkbookXml(sheets) },
      { name: "xl/_rels/workbook.xml.rels", data: buildWorkbookRelsXml(sheets) }
    ];

    sheets.forEach((sheet, index) => {
      files.push({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        data: buildSheetXml(sheet.rows)
      });
    });

    return buildStoredZip(files);
  }

  function getRoundByePlayers(round) {
    if (Array.isArray(round?.byePlayers)) {
      return round.byePlayers;
    }
    return round?.byePlayer ? [round.byePlayer] : [];
  }

  function getByePlayerName(player) {
    return typeof player === "string" ? player : player?.name || "";
  }

  function getExportMatchStatusLabel(entry) {
    return entry?.matchStatusLabel || getMatchStatusLabel(entry?.matchStatus || "normal");
  }

  function getExportPlayerStatusLabel(player) {
    return player?.statusLabel || getPlayerStatusLabel(player?.status || "active");
  }

  function buildRoundRows(round) {
    return [
      ["Spieler A", "Spieler B", "Ergebnis", "Sonderstatus", "Status"],
      ...round.pairings.map((pairing) => [
        pairing.playerA,
        pairing.playerB,
        pairing.score || "",
        getExportMatchStatusLabel(pairing),
        pairing.score || (pairing.matchStatus && pairing.matchStatus !== "normal") ? "fertig" : "offen"
      ]),
      ...getRoundByePlayers(round).map((player) => [getByePlayerName(player), "spielfrei", "", "", "Pause"])
    ];
  }

  function buildScoringRows(analysis) {
    const description = analysis.scoringDescription || {
      points: "Standardwertung",
      tieBreak: "Standardreihenfolge",
      fallback: "Alphabetisch nur als technischer Anzeige-Fallback"
    };

    return [
      ["Wertung"],
      ["Punkte", description.points],
      ["Tie-Break", description.tieBreak],
      ["Fallback", description.fallback]
    ];
  }

  function buildScheduleRows(analysis) {
    if (!analysis.schedule) {
      return [];
    }

    return [
      ["Uhrzeit", "Feld/Tisch", "Runde", "Begegnung", "Status"],
      ...analysis.schedule.matches.map((match) => [
        match.plannedTime,
        match.fieldName,
        match.roundLabel,
        match.matchLabel,
        match.status
      ])
    ];
  }

  function buildScheduleCsvSection(analysis) {
    const rows = buildScheduleRows(analysis);
    return rows.length > 0 ? [[], ["Spielplan"], ...rows] : [];
  }

  function buildScheduleSheet(analysis) {
    const rows = buildScheduleRows(analysis);
    return rows.length > 0 ? [{ name: "Spielplan", rows }] : [];
  }

  function exportRoundRobinCsv(analysis) {
    const rankingRows = [
      ["Platz", "Spieler", "Teilnehmerstatus", "Siege", "Niederlagen", "Satzgewinn", "Satzverlust", "Differenz"],
      ...analysis.ranking.map((player) => [
        player.place,
        player.name,
        getExportPlayerStatusLabel(player),
        player.wins,
        player.losses,
        player.setsWon,
        player.setsLost,
        player.setDiff
      ])
    ];

    const matchRows = [
      ["Spieler A", "Spieler B", "Ergebnis", "Sonderstatus"],
      ...analysis.matches.map((match) => [match.playerA, match.playerB, match.score, getExportMatchStatusLabel(match)])
    ];

    const csv = buildCsvContent([
      [analysis.tournamentName],
      ...buildScoringRows(analysis),
      [],
      ["Rangliste"],
      ...rankingRows,
      [],
      ["Begegnungen"],
      ...matchRows,
      ...buildScheduleCsvSection(analysis)
    ]);

    downloadBlob(`${sanitizeFilename(analysis.tournamentName)}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }

  function exportTeamCsv(analysis) {
    const hasDoubles = analysis.teamSummary.hasDoubles;
    const playerRows = [
      hasDoubles
        ? [
            "Platz",
            "Spieler",
            "Team",
            "Gewonnene Spiele",
            "Gewonnene Einzel",
            "Gewonnene Doppel",
            "Verlorene Spiele",
            "Satzgewinn",
            "Satzverlust",
            "Differenz"
          ]
        : [
            "Platz",
            "Spieler",
            "Team",
            "Gewonnene Einzel",
            "Verlorene Einzel",
            "Satzgewinn",
            "Satzverlust",
            "Differenz"
          ],
      ...analysis.playerRanking.map((player) =>
        hasDoubles
          ? [
              player.place,
              player.name,
              player.team,
              player.matchesWon,
              player.singlesWon,
              player.doublesWon,
              player.matchesLost,
              player.setsWon,
              player.setsLost,
              player.setDiff
            ]
          : [
              player.place,
              player.name,
              player.team,
              player.singlesWon,
              player.singlesLost,
              player.setsWon,
              player.setsLost,
              player.setDiff
            ]
      )
    ];

    const matchRows = [
      [analysis.teamAName, analysis.teamBName, "Ergebnis", "Sonderstatus"],
      ...analysis.matches.map((match) => [match.teamAPlayer, match.teamBPlayer, match.score, getExportMatchStatusLabel(match)])
    ];
    const doubleRows = [
      ["Doppel", analysis.teamAName, analysis.teamBName, "Ergebnis", "Sonderstatus"],
      ...analysis.doubleRounds.flatMap((round) =>
        round.pairings.map((entry) => [
          `Runde ${round.roundNumber} / Doppel ${entry.pairingNumber}`,
          entry.teamALabel,
          entry.teamBLabel,
          entry.score,
          getExportMatchStatusLabel(entry)
        ])
      )
    ];

    const csv = buildCsvContent([
      [analysis.tournamentName],
      ...buildScoringRows(analysis),
      [],
      ["Teamzusammenfassung"],
      hasDoubles
        ? [
            "Team",
            "Gewonnene Spiele",
            "Gewonnene Einzel",
            "Gewonnene Doppel",
            "Verlorene Spiele",
            "Satzgewinn",
            "Satzverlust",
            "Differenz"
          ]
        : ["Team", "Gewonnene Einzel", "Verlorene Einzel", "Satzgewinn", "Satzverlust", "Differenz"],
      [
        analysis.teamAName,
        ...(hasDoubles
          ? [
              analysis.teamSummary.teamA.matchesWon,
              analysis.teamSummary.teamA.singlesWon,
              analysis.teamSummary.teamA.doublesWon,
              analysis.teamSummary.teamA.matchesLost,
              analysis.teamSummary.teamA.setsWon,
              analysis.teamSummary.teamA.setsLost,
              analysis.teamSummary.teamA.setDiff
            ]
          : [
              analysis.teamSummary.teamA.singlesWon,
              analysis.teamSummary.teamA.singlesLost,
              analysis.teamSummary.teamA.setsWon,
              analysis.teamSummary.teamA.setsLost,
              analysis.teamSummary.teamA.setDiff
            ])
      ],
      [
        analysis.teamBName,
        ...(hasDoubles
          ? [
              analysis.teamSummary.teamB.matchesWon,
              analysis.teamSummary.teamB.singlesWon,
              analysis.teamSummary.teamB.doublesWon,
              analysis.teamSummary.teamB.matchesLost,
              analysis.teamSummary.teamB.setsWon,
              analysis.teamSummary.teamB.setsLost,
              analysis.teamSummary.teamB.setDiff
            ]
          : [
              analysis.teamSummary.teamB.singlesWon,
              analysis.teamSummary.teamB.singlesLost,
              analysis.teamSummary.teamB.setsWon,
              analysis.teamSummary.teamB.setsLost,
              analysis.teamSummary.teamB.setDiff
            ])
      ],
      [],
      ["Spieler-Ranking"],
      ...playerRows,
      [],
      ["Einzel"],
      ...matchRows,
      ...(analysis.doubles.length > 0 ? [[], ["Doppel"], ...doubleRows] : []),
      ...buildScheduleCsvSection(analysis)
    ]);

    downloadBlob(`${sanitizeFilename(analysis.tournamentName || "teamturnier")}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }

  function exportRoundRobinRoundCsv(analysis, round, currentRoundNumber, totalRounds) {
    const csv = buildCsvContent([
      [analysis.tournamentName],
      [`Runde ${currentRoundNumber} von ${totalRounds}`],
      ...buildScoringRows(analysis),
      [],
      ...buildRoundRows(round)
    ]);

    downloadBlob(
      `${sanitizeFilename(analysis.tournamentName)}_runde_${currentRoundNumber}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
  }

  function exportTeamRoundCsv(analysis, round, currentRoundNumber, totalRounds) {
    const csv = buildCsvContent([
      [analysis.tournamentName],
      [`Runde ${currentRoundNumber} von ${totalRounds}`],
      ...buildScoringRows(analysis),
      [],
      ...buildRoundRows(round)
    ]);

    downloadBlob(
      `${sanitizeFilename(analysis.tournamentName || "teamturnier")}_runde_${currentRoundNumber}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
  }

  function exportRoundRobinXlsx(analysis) {
    const matrixRows = [["Spieler", ...analysis.players]];
    analysis.players.forEach((player, rowIndex) => {
      const row = [player];
      analysis.players.forEach((_, columnIndex) => {
        if (rowIndex === columnIndex) {
          row.push("X");
        } else if (rowIndex < columnIndex) {
          row.push(analysis.results[`${rowIndex}-${columnIndex}`] || "");
        } else {
          row.push(reverseScore(analysis.results[`${columnIndex}-${rowIndex}`]) || "");
        }
      });
      matrixRows.push(row);
    });

    const rankingRows = [
      ["Platz", "Spieler", "Teilnehmerstatus", "Siege", "Niederlagen", "Satzgewinn", "Satzverlust", "Differenz"],
      ...analysis.ranking.map((player) => [
        player.place,
        player.name,
        getExportPlayerStatusLabel(player),
        player.wins,
        player.losses,
        player.setsWon,
        player.setsLost,
        player.setDiff
      ])
    ];

    const matchRows = [
      ["Spieler A", "Spieler B", "Ergebnis", "Sonderstatus"],
      ...analysis.matches.map((match) => [
        match.playerA,
        match.playerB,
        match.score,
        getExportMatchStatusLabel(match)
      ])
    ];

    const workbook = buildXlsxBlob([
      { name: "Wertung", rows: buildScoringRows(analysis) },
      { name: "Raster", rows: matrixRows },
      { name: "Rangliste", rows: rankingRows },
      { name: "Begegnungen", rows: matchRows },
      ...buildScheduleSheet(analysis)
    ]);

    downloadBlob(`${sanitizeFilename(analysis.tournamentName)}.xlsx`, workbook);
  }

  function exportTeamXlsx(analysis) {
    const hasDoubles = analysis.teamSummary.hasDoubles;
    const matrixRows = [[analysis.teamAName + " vs. " + analysis.teamBName, ...analysis.teamBPlayers]];
    analysis.teamAPlayers.forEach((player, rowIndex) => {
      const row = [player];
      analysis.teamBPlayers.forEach((_, columnIndex) => {
        row.push(analysis.results[`${rowIndex}-${columnIndex}`] || "");
      });
      matrixRows.push(row);
    });

    const playerRows = [
      hasDoubles
        ? [
            "Platz",
            "Spieler",
            "Team",
            "Gewonnene Spiele",
            "Gewonnene Einzel",
            "Gewonnene Doppel",
            "Verlorene Spiele",
            "Satzgewinn",
            "Satzverlust",
            "Differenz"
          ]
        : [
            "Platz",
            "Spieler",
            "Team",
            "Gewonnene Einzel",
            "Verlorene Einzel",
            "Satzgewinn",
            "Satzverlust",
            "Differenz"
          ],
      ...analysis.playerRanking.map((player) =>
        hasDoubles
          ? [
              player.place,
              player.name,
              player.team,
              player.matchesWon,
              player.singlesWon,
              player.doublesWon,
              player.matchesLost,
              player.setsWon,
              player.setsLost,
              player.setDiff
            ]
          : [
              player.place,
              player.name,
              player.team,
              player.singlesWon,
              player.singlesLost,
              player.setsWon,
              player.setsLost,
              player.setDiff
            ]
      )
    ];

    const teamRows = [
      hasDoubles
        ? [
            "Team",
            "Gewonnene Spiele",
            "Gewonnene Einzel",
            "Gewonnene Doppel",
            "Verlorene Spiele",
            "Satzgewinn",
            "Satzverlust",
            "Differenz"
          ]
        : ["Team", "Gewonnene Einzel", "Verlorene Einzel", "Satzgewinn", "Satzverlust", "Differenz"],
      [
        analysis.teamAName,
        ...(hasDoubles
          ? [
              analysis.teamSummary.teamA.matchesWon,
              analysis.teamSummary.teamA.singlesWon,
              analysis.teamSummary.teamA.doublesWon,
              analysis.teamSummary.teamA.matchesLost,
              analysis.teamSummary.teamA.setsWon,
              analysis.teamSummary.teamA.setsLost,
              analysis.teamSummary.teamA.setDiff
            ]
          : [
              analysis.teamSummary.teamA.singlesWon,
              analysis.teamSummary.teamA.singlesLost,
              analysis.teamSummary.teamA.setsWon,
              analysis.teamSummary.teamA.setsLost,
              analysis.teamSummary.teamA.setDiff
            ])
      ],
      [
        analysis.teamBName,
        ...(hasDoubles
          ? [
              analysis.teamSummary.teamB.matchesWon,
              analysis.teamSummary.teamB.singlesWon,
              analysis.teamSummary.teamB.doublesWon,
              analysis.teamSummary.teamB.matchesLost,
              analysis.teamSummary.teamB.setsWon,
              analysis.teamSummary.teamB.setsLost,
              analysis.teamSummary.teamB.setDiff
            ]
          : [
              analysis.teamSummary.teamB.singlesWon,
              analysis.teamSummary.teamB.singlesLost,
              analysis.teamSummary.teamB.setsWon,
              analysis.teamSummary.teamB.setsLost,
              analysis.teamSummary.teamB.setDiff
            ])
      ]
    ];
    const doubleRows = [
      ["Doppel", analysis.teamAName, analysis.teamBName, "Ergebnis", "Sonderstatus"],
      ...analysis.doubleRounds.flatMap((round) =>
        round.pairings.map((entry) => [
          `Runde ${round.roundNumber} / Doppel ${entry.pairingNumber}`,
          entry.teamALabel,
          entry.teamBLabel,
          entry.score,
          getExportMatchStatusLabel(entry)
        ])
      )
    ];

    const matchRows = [
      [analysis.teamAName, analysis.teamBName, "Ergebnis", "Sonderstatus"],
      ...analysis.matches.map((match) => [
        match.teamAPlayer,
        match.teamBPlayer,
        match.score,
        getExportMatchStatusLabel(match)
      ])
    ];

    const workbook = buildXlsxBlob([
      { name: "Wertung", rows: buildScoringRows(analysis) },
      { name: "Einzelmatrix", rows: matrixRows },
      { name: "Einzel", rows: matchRows },
      { name: "Spieler-Ranking", rows: playerRows },
      { name: "Teamwertung", rows: teamRows },
      ...(analysis.doubles.length > 0 ? [{ name: "Doppel", rows: doubleRows }] : []),
      ...buildScheduleSheet(analysis)
    ]);

    downloadBlob(`${sanitizeFilename(analysis.tournamentName || "teamturnier")}.xlsx`, workbook);
  }

  function exportRoundRobinRoundXlsx(analysis, round, currentRoundNumber, totalRounds) {
    const workbook = buildXlsxBlob([
      {
        name: `Runde ${currentRoundNumber}`,
        rows: [
          [analysis.tournamentName],
          [`Runde ${currentRoundNumber} von ${totalRounds}`],
          ...buildScoringRows(analysis),
          [],
          ...buildRoundRows(round)
        ]
      }
    ]);

    downloadBlob(`${sanitizeFilename(analysis.tournamentName)}_runde_${currentRoundNumber}.xlsx`, workbook);
  }

  function exportTeamRoundXlsx(analysis, round, currentRoundNumber, totalRounds) {
    const workbook = buildXlsxBlob([
      {
        name: `Runde ${currentRoundNumber}`,
        rows: [
          [analysis.tournamentName],
          [`Runde ${currentRoundNumber} von ${totalRounds}`],
          ...buildScoringRows(analysis),
          [],
          ...buildRoundRows(round)
        ]
      }
    ]);

    downloadBlob(
      `${sanitizeFilename(analysis.tournamentName || "teamturnier")}_runde_${currentRoundNumber}.xlsx`,
      workbook
    );
  }

  function buildGroupsKnockoutRows(analysis) {
    const rows = [
      [analysis.tournamentName],
      ...buildScoringRows(analysis),
      [],
      ["Status", analysis.status.label],
      ["Gruppen", analysis.groupCount],
      ["Qualifikanten je Gruppe", analysis.qualifiersPerGroup],
      []
    ];

    analysis.groups.forEach((group) => {
      rows.push([group.name], ["Teilnehmer", ...group.players.map((player) => player.name)]);
      rows.push(["Gruppenergebnisse"], ["Spieler A", "Spieler B", "Ergebnis", "Sonderstatus"]);
      group.matches.forEach((match) => {
        rows.push([match.playerA, match.playerB, match.score || ""]);
      });
      rows.push(["Gruppenrangliste"], ["Platz", "Teilnehmer", "Siege", "Niederlagen", "Satzgewinn", "Satzverlust", "Differenz", "KO"]);
      group.ranking.forEach((player) => {
        rows.push([
          player.place,
          player.name,
          player.wins,
          player.losses,
          player.setsWon,
          player.setsLost,
          player.setDiff,
          player.isQualified ? "qualifiziert" : ""
        ]);
      });
      rows.push([]);
    });

    rows.push(["KO-Spiele"], ["Runde", "Spiel", "Teilnehmer A", "Teilnehmer B", "Ergebnis", "Sieger"]);
    analysis.knockoutRounds.forEach((round) => {
      round.pairings.forEach((match) => {
        rows.push([
          round.roundName,
          match.matchNumber,
          match.playerA,
          match.playerB,
          match.isBye ? "Freilos" : match.score || "",
          match.winner?.name || ""
        ]);
      });
    });
    analysis.placementMatches.forEach((match) => {
      rows.push([
        match.roundName,
        match.matchNumber,
        match.playerA,
        match.playerB,
        match.score || "",
        match.winner?.name || ""
      ]);
    });

    if (analysis.finalStandings.length > 0) {
      rows.push([], ["Finalstand"], ["Platz", "Teilnehmer", "Qualifikation"]);
      analysis.finalStandings.forEach((player) => {
        rows.push([player.place, player.name, player.seedLabel || player.groupName || ""]);
      });
    }

    return rows;
  }

  function exportGroupsKnockoutCsv(analysis) {
    const csv = buildCsvContent(buildGroupsKnockoutRows(analysis));
    downloadBlob(
      `${sanitizeFilename(analysis.tournamentName || "gruppen_ko")}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
  }

  function exportGroupsKnockoutXlsx(analysis) {
    const groupSheets = analysis.groups.map((group) => ({
      name: group.name,
      rows: [
        [group.name],
        [],
        ["Gruppenergebnisse"],
        ["Spieler A", "Spieler B", "Ergebnis", "Sonderstatus"],
        ...group.matches.map((match) => [match.playerA, match.playerB, match.score || ""]),
        [],
        ["Rangliste"],
        ["Platz", "Teilnehmer", "Siege", "Niederlagen", "Satzgewinn", "Satzverlust", "Differenz", "KO"],
        ...group.ranking.map((player) => [
          player.place,
          player.name,
          player.wins,
          player.losses,
          player.setsWon,
          player.setsLost,
          player.setDiff,
          player.isQualified ? "qualifiziert" : ""
        ])
      ]
    }));
    const knockoutRows = [
      [analysis.tournamentName],
      ["Status", analysis.status.label],
      [],
      ["Runde", "Spiel", "Teilnehmer A", "Teilnehmer B", "Ergebnis", "Sieger"],
      ...analysis.knockoutRounds.flatMap((round) =>
        round.pairings.map((match) => [
          round.roundName,
          match.matchNumber,
          match.playerA,
          match.playerB,
          match.isBye ? "Freilos" : match.score || "",
          match.winner?.name || ""
        ])
      ),
      ...analysis.placementMatches.map((match) => [
        match.roundName,
        match.matchNumber,
        match.playerA,
        match.playerB,
        match.score || "",
        match.winner?.name || ""
      ])
    ];

    const workbook = buildXlsxBlob([
      ...groupSheets,
      { name: "KO-Spiele", rows: knockoutRows },
      ...(analysis.finalStandings.length > 0
        ? [{
            name: "Finalstand",
            rows: [
              ["Platz", "Teilnehmer", "Qualifikation"],
              ...analysis.finalStandings.map((player) => [
                player.place,
                player.name,
                player.seedLabel || player.groupName || ""
              ])
            ]
          }]
        : [])
    ]);

    downloadBlob(`${sanitizeFilename(analysis.tournamentName || "gruppen_ko")}.xlsx`, workbook);
  }

  function exportGroupsKnockoutRoundCsv(analysis, round, currentRoundNumber, totalRounds) {
    const csv = buildCsvContent([
      [analysis.tournamentName],
      [`Gruppenrunde ${currentRoundNumber} von ${totalRounds}`],
      [],
      ...buildRoundRows(round)
    ]);

    downloadBlob(
      `${sanitizeFilename(analysis.tournamentName || "gruppen_ko")}_gruppenrunde_${currentRoundNumber}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
  }

  function exportGroupsKnockoutRoundXlsx(analysis, round, currentRoundNumber, totalRounds) {
    const workbook = buildXlsxBlob([
      {
        name: `Gruppenrunde ${currentRoundNumber}`,
        rows: [
          [analysis.tournamentName],
          [`Gruppenrunde ${currentRoundNumber} von ${totalRounds}`],
          [],
          ...buildRoundRows(round)
        ]
      }
    ]);

    downloadBlob(
      `${sanitizeFilename(analysis.tournamentName || "gruppen_ko")}_gruppenrunde_${currentRoundNumber}.xlsx`,
      workbook
    );
  }

  window.TournamentExport = {
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
  };
})();
