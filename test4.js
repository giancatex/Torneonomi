const data = require('./test2_output.json');
const counts = {};
data.forEach(r => {
  const rd = parseInt(r.matchId.split('-')[0].replace('R', ''), 10);
  counts[rd] = (counts[rd] || 0) + 1;
});
console.log(counts);
