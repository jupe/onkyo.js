var Onkyo = require('../lib/onkyo');

var onkyo = new Onkyo({ip: '192.168.0.9'});
onkyo.on("error", console.log);
onkyo.on("detected", console.log);
onkyo.on("connected", console.log);
onkyo
  .PwrOn()
  .then(() => onkyo.VolUp())
  .then(() => onkyo.VolDown())
  .then(() => onkyo.SetSource("VIDEO2"))
  .then(() => onkyo.PwrOff())
  .then(() => onkyo.Close())
  .then(process.exit);

return;
console.log('Discovering device..')
onkyo.Discover()
    .then(device => {
        onkyo
          .Connect()
          .SendCommand("SOURCE_SELECT", "FM")
    });
