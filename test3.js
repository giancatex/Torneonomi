const result = [];
const row = ["maschile", "R8-M0", 0, "M0038", "M0035", "D", "A", 2.25, 0.75, "15/07/2026"];
result.push({
  matchId: String(row[1]),
  roundIndex: parseInt(row[2], 10)
});
console.log(JSON.stringify(result));
