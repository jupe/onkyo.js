onkyo.js
========

[![NPM](https://nodei.co/npm/onkyo.js.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/onkyo.js/)

[![NPM](https://nodei.co/npm-dl/onkyo.js.png)](https://nodei.co/npm/onkyo.js/)

Promise based library to control Onkyo AV-receivers via EISCMP protocol.

Tested with TX-NR809

## Changes log:

* v0.4.0 - refactored to using ES6 class **NOTE:** !BREAKING CHANGE!
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
## api

Sending pre-defined commands:
```
const OnkyoCmds = require('./onkyo.commands.js');
onkyo.sendCommand(<group>, <command>)
```
Where `group` is one of string from `OnkyoCmds.getGroups()` and
`command` is one of string from `OnkyoCmds.getGroupCommands(group)` .

Sending raw command:
```
sendRawCommand(<data>)
```

Onkyo instance generates public API's based on [onkyo.commands.js](lib/onkyo.commands.js) -file and contains following Promise API's:

```
setPowerOn()
setPowerOff()
setPowerStatus()
setMute()
setUnMute()
setVolumeUp()
setVolumeDown()
setVolumeUp1()
setVolumeDown1()
setVolume()
setVideo1()
setVideo2()
setCblSat()
setGame()
setAux()
setVideo5()
setPc()
setVideo6()
setVideo7()
setBdDvd()
setStream()
setTape1()
setTape2()
setPhono()
setCd()
setFm()
setAm()
setTuner()
setMusicserver()
setInternetradio()
setUsb()
setMultich()
setXm()
setSirius()
setNet()
setSelectorPositionWrapAroundUp()
setSelectorPositionWrapAroundDown()
setStereo()
setDirect()
setSurround()
setFilm()
setThx()
setAction()
setMusical()
setMonoMovie()
setOrchestra()
setUnplugged()
setStudioMix()
setTvLogic()
setAllChStereo()
setTheaterDimensional()
setEnhanced7Enhance()
setMono()
setPureAudio()
setMultiplex()
setFullMono()
setDolbyVirtual()
set51ChSurround()
setStraightDecode1()
setDolbyExDtsEs()
setDolbyEx2()
setThxCinema()
setThxSurroundEx()
setU2S2CinemaCinema2()
setMusicMode()
setGamesMode()
setPliiPliIxMovie()
setPliiPliIxMusic()
setNeo6Cinema()
setNeo6Music()
setPliiPliIxThxCinema()
setNeo6ThxCinema()
setPliiPliIxGame()
setNeuralSurr3()
setNeuralThx()
setPliiThxGames()
setNeo6ThxGames()
setListeningModeWrapAroundUp()
setListeningModeWrapAroundDown()
setSpeakerAOff()
setSpeakerAOn()
setSpeakerBOff()
setSpeakerBOn()
```

Note: List is generated using:
```
(new (require('onkyo.js').Onkyo)()).apis.forEach(api => console.log(api.api+'()'))
```

## LICENSE
[MIT](LICENSE)
