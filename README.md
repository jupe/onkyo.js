onkyo.js
========

[![CircleCI](https://circleci.com/gh/jupe/onkyo.js/tree/master.svg?style=svg)](https://circleci.com/gh/jupe/onkyo.js/tree/master)
[![NPM](https://img.shields.io/npm/dm/onkyo.js.svg?style=flat)](https://nodei.co/npm/onkyo.js/)
[![dependencies Status](https://david-dm.org/jupe/onkyo.js/status.svg)](https://david-dm.org/jupe/onkyo.js)
[![Coverage Status](https://coveralls.io/repos/github/jupe/onkyo.js/badge.svg)](https://coveralls.io/github/jupe/onkyo.js)
[![Greenkeeper](https://img.shields.io/badge/dependencies-monitored-green.svg)](https://greenkeeper.io)

[![NPM](https://nodei.co/npm/onkyo.js.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/onkyo.js/)

<!--[![NPM](https://nodei.co/npm-dl/onkyo.js.png)](https://nodei.co/npm/onkyo.js/)-->

Promise based library and cli to control Onkyo & Pioneer AV-receivers via EISCMP protocol.

Tested with TX-NR809

## Changes log:

See releases [here](https://github.com/jupe/onkyo.js/releases)

## CLI

**NOTE:** To use cli it's recommend to install library globally (`npm i -g onkyo.js`).
Otherwise you can start cli by calling `./cli.js` in project root folder.

```
$ onkyo.js

Keys
1 - set FM
2 - set CBL/SAT
3 - set BD/DVD
5 - set CD
6 - set NET
+ - volUp
- - volDown
p - pwrToggle
c - set ÇD
s - set Stereo
d - set direct
t - set Thx
m - toggle Mute
ctrl+c - Exit
```

## Example:

discover first Onkyo/Pioneer receiver and use it
```
const {OnkyoDiscover} = require('onkyo.js');
OnkyoDiscover.DiscoverFirst()
  .then((onkyo) => {
      return onkyo.powerOn();
  });
```

use Onkyo by it's address
```
const {Onkyo} = require('onkyo.js');
const onkyo = Onkyo({address: '192.168.0.100'});
onkyo.powerOn();
```

## API

### new OnkyoDiscover({options})
options:
* `logger` (optional, e.g wiston instance)
* `broadcastPort` (optional)
* `broadcastAddress` (optional)

API's
* `discover`
* `discoverFirst`
  or `OnkyoDiscover.DiscoverFirst()` without instance
* `close`
* `listen`

OnkyoDiscover instance inherits EventEmitter and trigger following events:

* `detected`
* `error`

### new Onkyo({options})
options:
* `logger` (optional, e.g wiston instance)
* `name` (optional)
* `address` / `ip`
* `port` (optional, default 60128)

Onkyo instance inherits EventEmitter and trigger following events:
* `connected`
  When connection is established
* `disconnect`
  When connection is lost
* `error`
  When something wrong happens or received message that library cannot handle

e.g.
```
const {OnkyoCmds, Onkyo} = require('onkyo.js');
const onkyo = new Onkyo({ip: '196.168.0.10'});
```

Sending pre-defined commands:
```
onkyo.sendCommand(<group>, <command>);
```
Where `group` is one of string from `OnkyoCmds.getGroups()` and
`command` is one of string from `OnkyoCmds.getGroupCommands(group)` .

Sending raw command:
```
onkyo.sendRawCommand(<data>)
```

Basic API:
```
// power
<Promise> onkyo.isOn(<zone>)              // resolves true if powers on
<Promise> onkyo.isOff(<zone>)             // resolves true if powers off
<Promise> onkyo.pwrToggle(<zone>)         // toggle power, resolves when ready
<Promise> onkyo.pwrOn(<zone>)             // power on, resolves when ready
<Promise> onkyo.pwrOff(<zone>)            // power off, resolves when ready

// volume
<Promise> onkyo.volUp(<zone>)             // volume +1, resolves when ready
<Promise> onkyo.volDown(<zone>)           // volume -1, resolves when ready
<Promise> onkyo.setVolume(<volume>, <zone>) // volume between 0-100, resolves when ready
<Promise> onkyo.getVolume(<zone>)         // resolves current volume

// mute
<Promise> onkyo.mute(<zone>)              // mute, resolves when ready
<Promise> onkyo.unMute(<zone>)            // unmute, resolves when ready
<Promise> onkyo.getMute(<zone>)           // resolves true if mute is on

// source/input
<Promise> onkyo.getSource(<zone>)         // resolves current source/input
<Promise> onkyo.setSource(<source>, <zone>) // source selection, resolves when ready

// sound mode
<Promise> onkyo.getSoundMode(<zone>)         // resolves current sound mode
<Promise> onkyo.setSoundMode(<mode>, <zone>) // sound mode selection, resolves when ready

// remote control keys
<Promise> onkyo.sendRemoteKey(<key>)  // possible values: MENU, UP, DOWN, LEFT, RIGHT, ENTER, EXIT, VIDEO, AUDIO, HOME 

```
\* `<zone>` is optional and by default control main zone, for other zones add `"zone2"`or `"zone3"`.

Onkyo instance generates public API's based on [onkyo.commands.js](lib/onkyo.commands.js) -file and contains following Promise API's:

```
powerOn()
powerOff()
powerStatus()
audioMute()
audioUnMute()
audioVolumeUp()
audioVolumeDown()
audioVolumeUp1()
audioVolumeDown1()
audioStatusVol()
audioStatusMute()
cinemaFilterOff()
cinemaFilterOn()
cinemaFilterUp()
dimmerBright()
dimmerDim()
dimmerDark()
dimmerShutOff()
dimmerBrightLedOff()
sourceSelectVideo1()
sourceSelectVideo2()
sourceSelectCblSat()
sourceSelectGame()
sourceSelectAux()
sourceSelectVideo5()
sourceSelectPc()
sourceSelectVideo6()
sourceSelectVideo7()
sourceSelectBdDvd()
sourceSelectStream()
sourceSelectTape1()
sourceSelectTape2()
sourceSelectPhono()
sourceSelectCd()
sourceSelectFm()
sourceSelectAm()
sourceSelectTuner()
sourceSelectMusicserver()
sourceSelectInternetradio()
sourceSelectUsb()
sourceSelectUsbRear()
sourceSelectUsbC()
sourceSelectAirplay()
sourceSelectBt()
sourceSelectMultich()
sourceSelectXm()
sourceSelectSirius()
sourceSelectNet()
sourceSelectSelectorPositionWrapAroundUp()
sourceSelectSelectorPositionWrapAroundDown()
sourceSelectStatus()
soundModeStereo()
soundModeDirect()
soundModeSurround()
soundModeFilm()
soundModeThx()
soundModeAction()
soundModeMusical()
soundModeMonoMovie()
soundModeOrchestra()
soundModeUnplugged()
soundModeStudioMix()
soundModeTvLogic()
soundModeAllChStereo()
soundModeTheaterDimensional()
soundModeEnhanced7Enhance()
soundModeMono()
soundModePureAudio()
soundModeMultiplex()
soundModeFullMono()
soundModeDolbyVirtual()
soundMode51ChSurround()
soundModeStraightDecode1()
soundModeDolbyExDtsEs()
soundModeDolbyEx2()
soundModeThxCinema()
soundModeThxSurroundEx()
soundModeU2S2CinemaCinema2()
soundModeMusicMode()
soundModeGamesMode()
soundModePliiPliIxMovie()
soundModePliiPliIxMusic()
soundModeNeo6Cinema()
soundModeNeo6Music()
soundModePliiPliIxThxCinema()
soundModeNeo6ThxCinema()
soundModePliiPliIxGame()
soundModeNeuralSurr3()
soundModeNeuralThx()
soundModePliiThxGames()
soundModeNeo6ThxGames()
soundModeListeningModeWrapAroundUp()
soundModeListeningModeWrapAroundDown()
soundModeStatus()
speakerAbControlSpeakerAOff()
speakerAbControlSpeakerAOn()
speakerAbControlSpeakerBOff()
speakerAbControlSpeakerBOn()
speakerAbControlStatusA()
speakerAbControlStatusB()
zone2PowerOn()
zone2PowerStandby()
zone2PowerStatus()
zone2AudioMute()
zone2AudioUnmute()
zone2AudioMuteQstn()
zone2AudioVolUp()
zone2AudioVolDown()
zone2AudioVolUp1()
zone2AudioVolDown1()
zone2AudioVolQstn()
zone2AudioStatusVol()
zone2AudioStatusMute()
zone2SourceSelectCblSat()
zone2SourceSelectGame()
zone2SourceSelectAux()
zone2SourceSelectBdDvd()
zone2SourceSelectStrmBox()
zone2SourceSelectTv()
zone2SourceSelectPhono()
zone2SourceSelectCd()
zone2SourceSelectFm()
zone2SourceSelectAm()
zone2SourceSelectTuner()
zone2SourceSelectUsbFront()
zone2SourceSelectNet()
zone2SourceSelectUsbRear()
zone2SourceSelectBt()
zone2SourceSelectHdmi5()
zone2SourceSelectQstn()
zone2SourceSelectUp()
zone2SourceSelectDown()
zone2SourceSelectStatus()
zone2NetPlay()
zone2NetStop()
zone2NetPause()
zone2NetPlayPause()
zone2NetTrackUp()
zone2NetTrackDown()
zone2NetChannelUp()
zone2NetChannelDown()
zone2NetFf()
zone2NetRew()
zone2NetRepeat()
zone2NetRandom()
zone2NetRepeatShuffle()
zone2NetDisplay()
zone2NetMemory()
zone2NetRight()
zone2NetLeft()
zone2NetUp()
zone2NetDown()
zone2NetSelect()
zone2NetReturn()
zone3PowerOn()
zone3PowerStandby()
zone3PowerStatus()
zone3AudioMute()
zone3AudioUnmute()
zone3AudioMuteQstn()
zone3AudioVolUp()
zone3AudioVolDown()
zone3AudioVolUp1()
zone3AudioVolDown1()
zone3AudioVolQstn()
zone3AudioStatusVol()
zone3AudioStatusMute()
zone3SourceSelectCblSat()
zone3SourceSelectGame()
zone3SourceSelectAux()
zone3SourceSelectBdDvd()
zone3SourceSelectStrmBox()
zone3SourceSelectTv()
zone3SourceSelectPhono()
zone3SourceSelectCd()
zone3SourceSelectFm()
zone3SourceSelectAm()
zone3SourceSelectTuner()
zone3SourceSelectUsbFront()
zone3SourceSelectNet()
zone3SourceSelectUsbRear()
zone3SourceSelectBt()
zone3SourceSelectHdmi5()
zone3SourceSelectQstn()
zone3SourceSelectUp()
zone3SourceSelectDown()
zone3SourceSelectStatus()
zone3NetPlay()
zone3NetStop()
zone3NetPause()
zone3NetPlayPause()
zone3NetTrackUp()
zone3NetTrackDown()
zone3NetChannelUp()
zone3NetChannelDown()
zone3NetFf()
zone3NetRew()
zone3NetRepeat()
zone3NetRandom()
zone3NetRepeatShuffle()
zone3NetDisplay()
zone3NetMemory()
zone3NetRight()
zone3NetLeft()
zone3NetUp()
zone3NetDown()
zone3NetSelect()
zone3NetReturn()
pwrToggle()
muteToggle()
```

Note: List is generated using:
```
(new (require('onkyo.js').Onkyo)({address:'localhost'})).apis.forEach(api => console.log(api.api+'()'))
```

## LICENSE
[MIT](LICENSE)
