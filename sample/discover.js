const {Discover} = require('../lib');

const discover = new Discover();
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
