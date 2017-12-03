const Promise = require('bluebird');
const {Onkyo, Discover} = require('../lib');

const finder = new Discover();
finder.on("detected", console.log);
finder.discoverFirst()
.then((onkyo) => {
  console.log(onkyo.toString());
  process.exit();
});
