onkyo.js
========

[![NPM](https://nodei.co/npm/onkyo.js.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/onkyo.js/)

[![NPM](https://nodei.co/npm-dl/onkyo.js.png)](https://nodei.co/npm/onkyo.js/)

Onkyo Receiver controller module.

Basic features already works, but currently only very limited remote-functions are implemented. Implementation state is more like proof-of-concept.

Tested with TX-NR809

## Changes log:

* v0.4.0 - refactored to using ES6 class
* v0.3.2 - added additional sources (#4)
* v0.3.1 - option for custom port
* v0.3.0 - Allow direct Onkyo IP address instead of discover
* v0.2.7 - fork merge
* v0.1.1 - original

## API

```
let onkyo = Onkyo.init(<option>)
```

### options (object)
* `logger` (optional, e.g wiston instance)
* `destinationPort` (optional, default 60128)
* `broadcastPort` (optional, default 60128)
* `ip` (optional - could be used when Onkyo has static network configuration)
* `port` (optional, default 60128)

### Events:
* `unregonizeMsg`
* `disconnect`
* `error`
* `detected`
* `msg`

## Example:
```
let Onkyo = require('onkyo.js'); //when installed via npm
let onkyo = new Onkyo({ip: '192.168.0.3'});
onkyo.on('error' error => { console.log(error); });
onkyo.connect();
onkyo.pwrOn();      //pwr on
onkyo.unMute();     //volume 4
onkyo.sendCommand('AUDIO', 'Volume Up');
onkyo.sendCommand("SOURCE_SELECT", "FM");
setTimeout( onkyo.pwrOff, 10000);
```
