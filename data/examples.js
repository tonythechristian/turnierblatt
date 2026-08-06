(function () {
  const exampleRoundRobinState = {
    tournamentName: "Tischtennis Fruehlingsrunde",
    mode: "roundRobin",
    roundRobin: {
      playerCount: 5,
      playerNames: ["Mia", "Lukas", "Sofia", "Ben", "Tarek"],
      results: {
        "0-1": "3:1",
        "0-2": "3:2",
        "0-3": "2:3",
        "0-4": "3:0",
        "1-2": "3:2",
        "1-3": "1:3",
        "1-4": "3:0",
        "2-3": "3:2",
        "2-4": "3:1",
        "3-4": "3:0"
      }
    },
    team: {
      teamAName: "Team A",
      teamBName: "Team B",
      teamACount: 4,
      teamBCount: 4,
      teamAPlayers: ["Veronika", "Theresa", "Eva", "Noah"],
      teamBPlayers: ["Jonas", "Fabian", "Kazuto", "Samu"],
      results: {}
    }
  };

  const exampleTeamState = {
    tournamentName: "Tischtennis Vereinsduell",
    mode: "team",
    roundRobin: {
      playerCount: 4,
      playerNames: ["Spieler 1", "Spieler 2", "Spieler 3", "Spieler 4"],
      results: {}
    },
    team: {
      teamAName: "Rheinstars",
      teamBName: "Spin Club",
      teamACount: 4,
      teamBCount: 4,
      teamAPlayers: ["Veronika", "Theresa", "Eva", "Noah"],
      teamBPlayers: ["Jonas", "Fabian", "Kazuto", "Samu"],
      results: {
        "0-0": "3:1",
        "0-1": "3:2",
        "0-2": "2:3",
        "0-3": "3:0",
        "1-0": "3:1",
        "1-1": "2:3",
        "1-2": "3:1",
        "1-3": "3:2",
        "2-0": "1:3",
        "2-1": "3:1",
        "2-2": "3:2",
        "2-3": "2:3",
        "3-0": "3:0",
        "3-1": "3:1",
        "3-2": "1:3",
        "3-3": "3:2"
      }
    }
  };


  const exampleGroupsKnockoutState = {
    tournamentName: "Tischtennis Sommer-Cup",
    mode: "groupsKnockout",
    matchMode: "win3",
    groupsKnockout: {
      playerCount: 8,
      groupCount: 2,
      qualifiersPerGroup: 2,
      placementMatchesEnabled: true,
      playerNames: ["Mia", "Lukas", "Sofia", "Ben", "Tarek", "Nora", "Emil", "Lea"],
      currentGroupRound: 1,
      currentKnockoutRound: 1,
      groupResults: {
        "group-0-0-1": "2:0",
        "group-0-0-2": "2:1",
        "group-0-0-3": "2:0",
        "group-0-1-2": "1:2",
        "group-0-1-3": "2:0",
        "group-0-2-3": "2:1",
        "group-1-0-1": "2:0",
        "group-1-0-2": "2:1",
        "group-1-0-3": "2:0",
        "group-1-1-2": "0:2",
        "group-1-1-3": "2:1",
        "group-1-2-3": "2:0"
      },
      knockoutResults: {}
    }
  };

  window.TournamentExamples = {
    exampleRoundRobinState,
    exampleTeamState,
    exampleGroupsKnockoutState
  };
})();
