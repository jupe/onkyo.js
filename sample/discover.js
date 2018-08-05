const {OnkyoDiscover} = require('../lib');

const discover = new OnkyoDiscover();
discover.on('detected', (onkyo) => {
  console.log(`Detected: ${onkyo.name}`);
});
discover.discoverFirst()
  .then((onkyo) => {
    console.log(`Detected: ${onkyo.toString()}`);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => discover.close())
  .then(() => {
    discover.removeAllListeners();
  });
