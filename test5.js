fetch("https://script.google.com/macros/s/AKfycbweY7bw4op6aM2Xh7RHmFu01w0SE_cPH0m_1uVqtFXeEyksjuahXdP3Fwk0Y3FA81Tw/exec?action=getDatabase&gender=maschile")
  .then(r => r.text())
  .then(data => console.log(data.substring(0, 500)))
  .catch(e => console.error(e));
