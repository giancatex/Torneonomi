fetch("https://script.google.com/macros/s/AKfycbweY7bw4op6aM2Xh7RHmFu01w0SE_cPH0m_1uVqtFXeEyksjuahXdP3Fwk0Y3FA81Tw/exec?action=getFase4State&gender=maschile")
  .then(r => r.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(e => console.error(e));
