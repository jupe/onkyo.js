const Promise = require('bluebird');
const {Onkyo, Discover} = require('../lib');

const onkyo = new Onkyo({ip: '192.168.0.9'});
onkyo.on("error", console.log);
onkyo.on("connected", console.log);
onkyo.pwrOn()
  .then(() => Promise.delay(500))
  .then(() => onkyo.volUp())
  .then(() => Promise.delay(500))
  .then(() => onkyo.volDown())

  .then(() => Promise.delay(500))
  //.then(() => onkyo.mute())

  .then(() => Promise.delay(500))
  .then(() => onkyo.unMute())

  //.then(() => onkyo.setSource("VIDEO2"))
  //.then(() => onkyo.pwrOff())

  .then(() => onkyo.close())
  .then(process.exit);
return;
