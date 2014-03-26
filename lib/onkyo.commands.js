// Power
var POWER = {
  "Power ON": "PWR01",
  "Power OFF": "PWR00",
  "Power STATUS": "PWRQSTN" };

// Audio
var AUDIO =
  {"Mute": "AMT01",
  "UnMute": "AMT00",
  "Volume Up": "MVLUP",
  "Volume Down": "MVLDOWN",
  "Volume Up1": "MVLUP1",
  "Volume Down1": "MVLDOWN1",
  "Volume": "MVLQSTN"
  };

// Source Select
var SOURCE_SELECT =
  {"VIDEO1": "SLI00",
  "VIDEO2": "SLI01",
  "GAME": "SLI02",
  "AUX": "SLI03",
  "VIDEO5": "SLI04",
  "PC": "SLI05",
  "VIDEO6": "SLI05",
  "VIDEO7": "SLI06",
  "BD/DVD": "SLI10",
  "TAPE1": "SLI20",
  "TAPE2": "SLI21",
  "PHONO": "SLI22",
  "CD": "SLI23",
  "FM": "SLI24",
  "AM": "SLI25",
  "TUNER": "SLI26",
  "MUSICSERVER": "SLI27",
  "INTERNETRADIO": "SLI28",
  "USB": "SLI29",
  "MULTICH": "SLI30",
  "XM": "SLI31",
  "SIRIUS": "SLI32",
  "Selector Position Wrap-Around Up": "SLIUP",
  "Selector Position Wrap-Around Down": "SLIDOWN"};

// Speaker AB Control
var SPEAKER_AB_CONTROL =
  {"Speaker A Off": "SPA00",
  "Speaker A On": "SPA01",
  "Speaker B Off": "SPB00",
  "Speaker B On": "SPB01"};

// Sound modes
var SOUND_MODES =
  {"STEREO": "LMD00",
  "DIRECT": "LMD01",
  "SURROUND": "LMD02",
  "FILM": "LMD03",
  "THX": "LMD04",
  "ACTION": "LMD05",
  "MUSICAL": "LMD06",
  "MONO MOVIE": "LMD07",
  "ORCHESTRA": "LMD08",
  "UNPLUGGED": "LMD09",
  "STUDIO-MIX": "LMD0A",
  "TV LOGIC": "LMD0B",
  "ALL CH STEREO": "LMD0C",
  "THEATER-DIMENSIONAL": "LMD0D",
  "ENHANCED 7/ENHANCE": "LMD0E",
  "MONO": "LMD0F",
  "PURE AUDIO": "LMD11",
  "MULTIPLEX": "LMD12",
  "FULL MONO": "LMD13",
  "DOLBY VIRTUAL": "LMD14",
  "5.1ch Surround": "LMD40",
  "Straight Decode*1": "LMD40",
  "Dolby EX/DTS ES": "LMD41",
  "Dolby EX*2": "LMD41",
  "THX Cinema": "LMD42",
  "THX Surround EX": "LMD43",
  "U2/S2 Cinema/Cinema2": "LMD50",
  "MusicMode": "LMD51",
  "Games Mode": "LMD52",
  "PLII/PLIIx Movie": "LMD80",
  "PLII/PLIIx Music": "LMD81",
  "Neo6 Cinema": "LMD82",
  "Neo6 Music": "LMD83",
  "PLII/PLIIx THX Cinema": "LMD84",
  "Neo6 THX Cinema": "LMD85",
  "PLII/PLIIx Game": "LMD86",
  "Neural Surr*3": "LMD87",
  "Neural THX": "LMD88",
  "PLII THX Games": "LMD89",
  "Neo6 THX Games": "LMD8A",
  "Listening Mode Wrap-Around Up": "LMDUP",
  "Listening Mode Wrap-Around Down": "LMDDOWN"};

var getGroups = function()
{
  var groups = [
    'POWER',
    'AUDIO',
    'SOURCE_SELECT',
    'SOUND_MODES',
    'SPEAKER_AB_CONTROL'];
  return groups;
}
var getGroupCommands = function(group)
{
  return Object.keys(module.exports[group]);
}
module.exports = {
  DISCOVER: '!xECNQSTN',
  POWER: POWER,
  AUDIO: AUDIO,
  SOURCE_SELECT: SOURCE_SELECT,
  SOUND_MODES: SOUND_MODES,
  SPEAKER_AB_CONTROL: SPEAKER_AB_CONTROL,
  getGroups: getGroups,
  getGroupCommands: getGroupCommands
}
