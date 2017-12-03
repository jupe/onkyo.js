const Promise = require('bluebird');
const {Onkyo, Discover} = require('../lib');

/*
const finder = new Discover();
finder.discoverFirst()
.then((onkyo) => {
  console.log(onkyo.toString());
  process.exit();
});
return;
*/

const onkyo = new Onkyo({ip: '192.168.0.9'});
onkyo.on("error", console.log);
onkyo.on("detected", console.log);
onkyo.on("connected", console.log);
onkyo.pwrOn()
  .then(() => Promise.delay(2000))
  .then(() => onkyo.volUp())
  .then(() => Promise.delay(2000))
  .then(() => onkyo.volDown())
  //.then(() => onkyo.SetSource("VIDEO2"))
  //.then(() => onkyo.PwrOff())
  .then(() => onkyo.close())
  .then(process.exit);
return;
