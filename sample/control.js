const fs = require('fs');
const Promise = require('bluebird');
const {OnkyoDiscover} = require('../lib');

OnkyoDiscover.DiscoverFirst()
  .then((onkyo) => {
    onkyo.on('error', (errMsg) => {
      // this generates file 'unknown_msgs.txt' if unrecognized messages
      // is received from amplifier. Please raise issues with body if file appears.
      fs.appendFile('unknown_msgs.txt', `${errMsg}\n`, (err) => {
        if (err) console.error(err);
      });
    });
    onkyo.on('connected', () => console.log('connected'));
    onkyo.getDeviceState()
      .then((state) => {
        console.log(state);
      })
      .then(() => onkyo.pwrOn())
      .then(() => Promise.delay(500))
      .then(() => onkyo.volUp())
      .then(() => Promise.delay(500))
      .then(() => onkyo.volDown())

      .then(() => Promise.delay(500))
      .then(() => onkyo.mute())

      .then(() => Promise.delay(500))
      .then(() => onkyo.unMute())

    // .then(() => onkyo.setSource("VIDEO2"))
      .then(() => onkyo.pwrOff())

      .then(() => onkyo.close())
      .then(process.exit)
      .catch((error) => {
        console.log(error);
        process.exit();
      });
  });
