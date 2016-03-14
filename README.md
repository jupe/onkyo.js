onkyo.js
========

[![NPM](https://nodei.co/npm/onkyo.js.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/onkyo.js/)

[![NPM](https://nodei.co/npm-dl/onkyo.js.png)](https://nodei.co/npm/onkyo.js/)

Onkyo Receiver controller module.

Basic features already works, but currently only very limited remote-functions are implemented. Implementation state is more like proof-of-concept.

Tested with TX-NR809

Changeslog:

* v0.3.0 - Allow direct Onkyo IP address instead of discover
* v0.2.7 - fork merge
* v0.1.1 - original

Example:
```
var Onkyo = require('../lib/onkyo');

var onkyo = Onkyo.init({ip: '192.168.0.3' });
onkyo.Connect();
onkyo.PwrOn();      //pwr on
onkyo.UnMute();     //volume 4
onkyo.SendCommand('AUDIO', 'Volume Up'); 
onkyo.SendCommand("SOURCE_SELECT", "FM");
setTimeout( onkyo.PwrOff, 10000);

```
