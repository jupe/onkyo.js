/**
*
* options:
*   logger (e.g wiston)
*   destinationPort || 60128
*   broadcastPort || 60128
*   ip (optional)
*   port (optional)
*
* Events:
*   -warning
*   -connected
*   -disconnect
*   -error
*   -msg
* */

// native modules
const net = require('net');
const {EventEmitter} = require('events');
// 3rd party modules
const _ = require('lodash');
const invariant = require('invariant');
const Promise = require('bluebird');

// application
const defautLogger = require('./logger');
const OnkyoError = require('./OnkyoError');
const OnkyoCmds = require('./onkyo.commands.js');

const DEFAULT_PORT = 60128;


class Onkyo extends EventEmitter {
  constructor(options) {
    super();
    this.logger = _.get(options, 'logger', defautLogger);
    this.device = {
      name: _.get(options, 'name', 'onkyo'),
      address: _.get(options, 'address', _.get(options, 'ip')),
      port: _.get(options, 'port', DEFAULT_PORT),
      info: _.get(options, 'info')
    };
    this._client = null;
    this._buffer = Buffer.from('');
    this.deviceState = {};
    this.logger.debug(`Onkyo ${this.name} constructed`);
    this.validate();
    // apis is list of dictionaries: {title, group, api, func}
    // title is human readable text and api is
    // callable function name in instance and func is related function pointer
    this.apis = this._generateApis();
  }
  _generateApis() {
    const groups = OnkyoCmds.getGroups();
    const apis = [];
    const generateFuncName = (group, title) =>
      _.camelCase(`${group}`) + _.camelCase(`a${title}`).substr(1);
    _.each(groups, (group) => {
      const cmds = OnkyoCmds[group];
      _.each(cmds, (cmd, title) => {
        const api = generateFuncName(group, title);
        const f = () => this.sendCommand(group, title);
        _.set(this, api, f);
        apis.push({
          title,
          group,
          api,
          func: this[api].bind(this)
        });
      });
    });
    apis.push({
      title: 'power Toggle',
      group: 'POWER',
      api: 'pwrToggle',
      func: this.pwrToggle.bind(this)
    });
    apis.push({
      title: 'mute Toggle',
      group: 'AUDIO',
      api: 'muteToggle',
      func: this.muteToggle.bind(this)
    });
    return apis;
  }
  validate() {
    invariant(_.isString(this.name), 'name should be an string');
    invariant(_.isInteger(this.port), 'port should be an integer');
    invariant(
      _.isString(this.address),
      'address should be an string or undefined'
    );
    invariant(_.isObject(this.logger), 'logger should be an object');
  }

  get name() { return this.device.name; }
  get port() { return this.device.port; }
  get model() { return _.get(this.device, 'info.modelName'); }
  get address() { return this.device.address; }
  toString() {
    return `${this.name} ${this.address}:${this.port}`;
  }
  /**
   * Just for backward compatibility reason
   * @param {object} opts options for Onkyo constructor
   * @return {Onkyo} returns Onkyo instance
   */
  static init(opts) {
    return new Onkyo(opts);
  }
  getDeviceState() {
    return Promise.all([
      this.pwrState(),
      this.sourceState(),
      this.volumeState(),
      this.muteState(),
      this.soundModeState()
    ])
      .then(() => Promise.resolve(this.deviceState));
  }
  static createEiscpBuffer(data) {
    const iscpMsg = Buffer.from(`${data}\x0d`);
    const header = Buffer.from([
      73, 83, 67, 80, // magic
      0, 0, 0, 0, // header size
      0, 0, 0, 0, // data size
      1, // version
      0, 0, 0 // reserved
    ]);
    // write header size
    header.writeUInt32BE(16, 4);
    // write data size to eISCP header
    header.writeUInt32BE(iscpMsg.length, 8);
    return Buffer.concat([header, iscpMsg]);
  }
  _parseMsg(lookup) {
    const group = lookup.slice(0, 3);
    const command = lookup.slice(3);
    if (!_.isString(command)) {
      return Promise.reject(new OnkyoError(`cant parse command: ${lookup}`));
    }
    if (command === 'N/A' && group !== 'LMD') { // Sound Mode can be N/A when the receiver is off
      const error = new OnkyoError(`Onkyo does not support ${group} command`);
      return Promise.reject(error);
    }
    this.logger.debug(`msg: ${lookup}`);
    switch (group) {
      case ('TUN'): {
        const TUN = Onkyo._parseMhz(command);
        this.deviceState.TUN = TUN;
        this.logger.debug(`Tuner: ${TUN}`);
        return Promise.resolve({group, data: {TUN}});
      }
      case ('SPA'):
      case ('SPB'): {
        const state = Onkyo._GetKeyByValue('SPEAKER_AB_CONTROL', lookup);
        this.deviceState[group] = state;
        this.logger.debug(`Speaker state: ${state}`);
        return Promise.resolve({group, data: {[group]: state}});
      }
      case 'ZVL':
      case 'VL3':
      case 'MVL': {
        const MVL = Onkyo._parseInt(command, 16);
        this.deviceState.MVL = MVL;
        this.logger.debug(`masterVolume: ${MVL}`);
        return Promise.resolve({group, data: {MVL}});
      }
      case 'CTL': {
        const CTL = Onkyo._parseInt(command, 16);
        this.deviceState.CTL = CTL;
        this.logger.debug(`centerVolume: ${CTL}`);
        return Promise.resolve({group, data: {CTL}});
      }
      case 'ZPW':
      case 'PW3':
      case 'PWR': {
        const PWR = Onkyo._parseBool(command);
        this.deviceState.PWR = PWR; // power state
        this.logger.debug(`Power: ${PWR}`);
        return Promise.resolve({group, data: {PWR}});
      }
      case 'ZMT':
      case 'MT3':
      case 'AMT': {
        const AMT = Onkyo._parseBool(command);
        this.deviceState.AMT = AMT; // mute
        this.logger.debug(`Mute: ${AMT}`);
        return Promise.resolve({group, data: {AMT}});
      }
      case 'DIM': {
        const DIM = Onkyo._GetKeyByValue('DIMMER', lookup);
        return Promise.resolve({group, data: {DIM}});
      }
      case 'RAS': {
        const RAS = Onkyo._GetKeyByValue('CINEMA_FILTER', lookup);
        return Promise.resolve({group, data: {RAS}});
      }
      case 'LMD': {
        const LMD = Onkyo._GetKeyByValue('SOUND_MODE', lookup);
        this.deviceState.LMD = LMD;
        this.logger.debug(`sound mode Set: ${LMD}`);
        return Promise.resolve({group, data: {LMD}});
      }
      case 'SLI': {
        const SLI = Onkyo._GetKeyByValue('SOURCE_SELECT', lookup);
        this.logger.debug(`Source Set: ${SLI}`);
        this.deviceState.SLI = SLI;
        return Promise.resolve({group, data: {SLI}});
      }
      case 'SLZ': {
        const SLI = Onkyo._GetKeyByValue('ZONE2_SOURCE_SELECT', lookup);
        this.logger.debug(`Source Set: ${SLI}`);
        this.deviceState.SLI = SLI;
        return Promise.resolve({group, data: {SLI}});
      }
      case 'SL3': {
        const SLI = Onkyo._GetKeyByValue('ZONE3_SOURCE_SELECT', lookup);
        this.logger.debug(`Source Set: ${SLI}`);
        this.deviceState.SLI = SLI;
        return Promise.resolve({group, data: {SLI}});
      }
      case 'FLD': { // FL Display Information
        const FLD = Onkyo._parseFLD(lookup);
        return Promise.resolve({group, data: {FLD}});
      }
      case ('NJA'): { // NET/USB List Album Art
        const NJA = Onkyo._parseNJA(lookup);
        return Promise.resolve({group, data: {NJA}});
      }
      case ('NLS'): { // NET/USB List Info
        const NLS = Onkyo._parseNLS(lookup);
        return Promise.resolve({group, data: {NLS}});
      }
      case ('NLT'): { // NET/USB List Title Info
        const NLS = Onkyo._parseNLT(lookup);
        return Promise.resolve({group, data: {NLS}});
      }
      case ('NTM'): { // NET/USB List Time Info
        const NTM = Onkyo._parseNTM(lookup);
        return Promise.resolve({group, data: {NTM}});
      }
      default:
        break;
    }
    const error = new OnkyoError(`Unknown data: ${encodeURIComponent(lookup)}`);
    return Promise.reject(error);
  }
  static _parseFLD(value) {
    return {fld: value.replace('FLD', '')};
  }
  static _parseNTM(value) {
    const time = value.replace('NTM', '').split('/');
    return {elapsedTime: time[0], maxTrackTime: time[1]};
  }
  static _parseNJA(value) {
    const albumArtURL = value.substring(value.indexOf('http'));
    return {albumArt: albumArtURL};
  }
  static _parseNLS(value) {
    /*
    // NET/USB List Info
    // "tlpnnnnnnnnnn"
    t ->Information Type (A : ASCII letter, C : Cursor Info, U : Unicode letter)
    when t = A,
      l ->Line Info (0-9 : 1st to 10th Line)
      nnnnnnnnn:Listed data (variable-length, 64 ASCII letters max)
        when AVR is not displayed NET/USB List(Keyboard,Menu,Popup…), "nnnnnnnnn" is "See TV".
      p ->Property
             - : no
             0 : Playing, A : Artist, B : Album, F : Folder, M : Music, P : Playlist, S : Search
             a : Account, b : Playlist-C, c : Starred, d : Unstarred, e : What's New
    when t = C,
      l ->Cursor Position (0-9 : 1st to 10th Line, - : No Cursor)
      p ->Update Type (P : Page Infomation Update ( Page Clear or Disable List Info) , C : Cursor Position Update)
    when t = U, (for Network Control Only)
      l ->Line Info (0-9 : 1st to 10th Line)
      nnnnnnnnn:Listed data (variable-length, 64 Unicode letters [UTF-8 encoded] max)
        when AVR is not displayed NET/USB List(Keyboard,Menu,Popup…), "nnnnnnnnn" is "See TV".
      p ->Property
         - : no
         0 : Playing, A : Artist, B : Album, F : Folder, M : Music, P : Playlist, S : Search
         a : Account, b : Playlist-C, c : Starred, d : Unstarred, e : What's New
      */
    const properties = {
      '-': 'no',
      0: 'Playing',
      A: 'Artist',
      B: 'Album',
      F: 'Folder',
      M: 'Music',
      P: 'Playlist',
      S: 'Search',
      a: 'Account',
      b: 'Playlist-C',
      c: 'Starred',
      d: 'Unstarred',
      e: 'What\'s New'
    };
    switch (value[3]) {
      case ('A'): {
        const l = parseInt(`${value[4]}`, 10) + 1;
        const p = _.get(properties, value[5], 'unknown');
        const text = value.slice(6);
        return {l, p, text};
      }
      case ('C'): {
        const l = value[4] === '-' ?
          'No Cursor' :
          parseInt(`${value[4]}`, 10) + 1;
        const updateTypes = {
          P: 'Page Infomation Update ( Page Clear or Disable List Info)',
          C: 'Cursor Position Update'
        };
        const p = _.get(updateTypes, value[5], 'unknown');
        return {l, p};
      }
      case ('U'): {
        const l = parseInt(`${value[4]}`, 10) + 1;
        const p = _.get(properties, value[5], 'unknown');
        const text = value.slice(6);
        return {l, p, text};
      }
      default: {
        break;
      }
    }
    throw new OnkyoError(`unknown NLS t: ${value[3]}`);
  }
  static _parseNLT(value) {
    /* NET/USB List Title Info
    "xxuycccciiiillsraabbssnnn...nnn"
    xx : Service Type
     00 : Music Server (DLNA), 01 : Favorite, 02 : vTuner, 03 : SiriusXM, 04 : Pandora, 05 : Rhapsody, 06 : Last.fm,
     07 : Napster, 08 : Slacker, 09 : Mediafly, 0A : Spotify, 0B : AUPEO!, 0C : radiko, 0D : e-onkyo,
     0E : TuneIn Radio, 0F : MP3tunes, 10 : Simfy, 11:Home Media, 12:Deezer, 13:iHeartRadio,
     18:Airplay, 19:TIDAL, 1A:onkyo music,
     F0 : USB/USB(Front) F1 : USB(Rear), F2 : Internet Radio, F3 : NET, FF : None
    u : UI Type
     0 : List, 1 : Menu, 2 : Playback, 3 : Popup, 4 : Keyboard, "5" : Menu List
    y : Layer Info
     0 : NET TOP, 1 : Service Top,DLNA/USB/iPod Top, 2 : under 2nd Layer
    cccc : Current Cursor Position (HEX 4 letters)
    iiii : Number of List Items (HEX 4 letters)
    ll : Number of Layer(HEX 2 letters)
    s : Start Flag
     0 : Not First, 1 : First
    r : Reserved (1 leters, don't care)
    aa : Icon on Left of Title Bar
     00 : Internet Radio, 01 : Server, 02 : USB, 03 : iPod, 04 : DLNA, 05 : WiFi, 06 : Favorite
     10 : Account(Spotify), 11 : Album(Spotify), 12 : Playlist(Spotify), 13 : Playlist-C(Spotify)
     14 : Starred(Spotify), 15 : What's New(Spotify), 16 : Track(Spotify), 17 : Artist(Spotify)
     18 : Play(Spotify), 19 : Search(Spotify), 1A : Folder(Spotify)
     FF : None
    bb : Icon on Right of Title Bar
     00 : Muisc Server (DLNA), 01 : Favorite, 02 : vTuner, 03 : SiriusXM, 04 : Pandora, 05 : Rhapsody, 06 : Last.fm,
     07 : Napster, 08 : Slacker, 09 : Mediafly, 0A : Spotify, 0B : AUPEO!, 0C : radiko, 0D : e-onkyo,
     0E : TuneIn Radio, 0F : MP3tunes, 10 : Simfy, 11:Home Media, 12:Deezer, 13:iHeartRadio,
     18:Airplay, 19:TIDAL, 1A:onkyo music,
    F0:USB/USB(Front), F1:USB(Rear),
     FF : None
    ss : Status Info
     00 : None, 01 : Connecting, 02 : Acquiring License, 03 : Buffering
     04 : Cannot Play, 05 : Searching, 06 : Profile update, 07 : Operation disabled
     08 : Server Start-up, 09 : Song rated as Favorite, 0A : Song banned from station,
     0B : Authentication Failed, 0C : Spotify Paused(max 1 device), 0D : Track Not Available, 0E : Cannot Skip
    nnn...nnn : Character of Title Bar (variable-length, 64 Unicode letters [UTF-8 encoded] max)
    */
    const obj = {};
    const serviceTypes = {
      '00': 'Music Server (DLNA)',
      '01': 'Favorite',
      '02': 'vTuner',
      '03': 'SiriusXM',
      '04': 'Pandora',
      '05': 'Rhapsody',
      '06': 'Last.fm',
      '07': 'Napster',
      '08': 'Slacker',
      '09': 'Mediafly',
      '0A': 'Spotify',
      '0B': 'AUPEO!',
      '0C': 'radiko',
      '0D': 'e-onkyo',
      '0E': 'TuneIn Radio',
      '0F': 'MP3tunes',
      10: 'Simfy',
      11: 'Home Media',
      12: 'Deezer',
      13: 'iHeartRadio',
      18: 'Airplay',
      19: 'TIDAL',
      '1A': 'onkyo music',
      F0: 'USB/USB(Front)',
      F1: 'USB(Rear)',
      F2: 'Internet Radio',
      F3: 'NET',
      FF: 'None'
    };
    const serviceType = value.slice(0, 2);
    obj.serviceType = _.get(serviceTypes, value.slice(0, 2), serviceType);
    const statusInfos = {
      '00': 'None',
      '01': 'Connecting',
      '02': 'Acquiring License',
      '03': 'Buffering',
      '04': 'Cannot Play',
      '05': 'Searching',
      '06': 'Profile update',
      '07': 'Operation disabled',
      '08': 'Server Start-up',
      '09': 'Song rated as Favorite',
      '0A': 'Song banned from station',
      '0B': 'Authentication Failed',
      '0C': 'Spotify Paused(max 1 device)',
      '0D': 'Track Not Available',
      '0E': 'Cannot Skip'
    };
    const statusInfo = value.slice(20, 2);
    obj.statusInfo = _.get(statusInfos, statusInfo, statusInfo);
    // @TODO implement rest of parsers..
    return obj;
  }
  static _parseMhz(value) {
    let obj = value.match(/^([0-9]{5})$/);
    if (obj) {
      [, obj] = obj;
      obj = `${obj.slice(0, 3)}.${obj.slice(3)} MHz`;
      while (obj.startsWith('0')) {
        obj = obj.slice(1);
      }
      return obj;
    }
    throw new OnkyoError(`Invalid value for Mhz: ${value}`);
  }
  static _parseInt(value, radix = 10) {
    const num = parseInt(value, radix);
    if (_.isNaN(num)) {
      throw new OnkyoError(`Invalid value for int: ${value}`);
    }
    return num;
  }
  static _parseBool(value) {
    switch (value) {
      case ('00'): return false;
      case ('01'): return true;
      default:
        throw new OnkyoError(`Invalid value for bool: ${value}`);
    }
  }
  /**
   * Internal get key by value from Array
   * @param {String} group group name
   * @param {String} value lookup value
   * @return {String} key
   * @throws OnkyoError when value not found
   */
  static _GetKeyByValue(group, value) {
    const list = OnkyoCmds[group];
    if (!list) {
      throw new OnkyoError(`Unrecognised group: ${group}`);
    }
    const key = _.invert(list)[value];
    if (key) {
      return key;
    }
    throw new OnkyoError(`Unrecognised key: ${value}`);
  }
  _parseClientPacket(eiscpData, eiscpPacketExtract = Onkyo.eiscpPacketExtract) {
    this.logger.debug(`RX: ${encodeURIComponent(eiscpData)}`);
    Promise
      .try(() => eiscpPacketExtract(eiscpData))
      .then(msg => this._parseMsg(msg))
      .then(({group, data}) => {
        this.logger.debug('received: ', group, data);
        this.emit(group, data);
      })
      // .catch((OnkyoErrorNA)
      .catch((error) => {
        this.logger.error(`${error}`);
        const errMsg = `RX: unknown event: ${error}`;
        this.emit('error', errMsg);
      });
  }
  _sendISCPpacket(packet) {
    if (!this._client) { throw Error('Client is not connected'); }
    this.logger.debug(`TX: ${encodeURIComponent(packet)}`);
    this._client.write(packet);
  }
  static eiscpPacketExtract(packet) {
    /*
      Exracts message from eISCP packet
      Strip first 18 bytes and last 3 since that's only the header and end characters
    */
    let ok = false;
    let data = packet.toString('ascii', 18, packet.length);
    const ends = () =>
      data.endsWith('\x00') ||
      data.endsWith('\x0a') ||
      data.endsWith('\x0d') ||
      data.endsWith('\x1a');
    while (ends()) {
      ok = true;
      data = data.substr(0, data.length - 1);
    }
    if (!ok) {
      throw new OnkyoError(`eiscp packet malformed: ${encodeURIComponent(packet)}`);
    }
    return data;
  }

  connect(connect = net.connect.bind(net)) {
    const host = {
      port: this.device.port,
      host: this.device.address
    };
    if (this._client) {
      return Promise.reject(new OnkyoError('Client is already connected'));
    }
    let connectedResolve;
    const connectedPromise = new Promise((resolve) => {
      connectedResolve = resolve;
    });
    return Promise.all([
      connectedPromise,
      Promise.try(() => {
        this._client = connect(host, () => {
          this.emit('connected', host);
          connectedResolve(host);
        });
        this._client.on('error', (error) => {
          this.emit('error', error);
        });
        this._client.on('data', this._onData.bind(this));
        this._client.on('end', () => {
          this.emit('disconnect');
          this._client = null;
        });
      })
        .catch((error) => {
          this.emit('disconnect');
          this._client = null;
          throw error;
        })
    ]);
  }

  disconnect() {
    if (this._client) {
      this._client.end();
      this._client = undefined;
    }
  }
  close() {
    this.disconnect();
  }
  _onData(data) {
    // add to buffer
    this._buffer = Buffer.concat([this._buffer, data]);
    // helper functions
    const beginIndex = () => this._buffer.indexOf('ISCP');
    const endIndex = () => this._buffer.indexOf('\x1a');
    const isEndChar = c => [0x0d, 0x0a, 0x1a].indexOf(c) !== -1;

    // sync if out of..
    while (this._buffer.length > 4 && beginIndex() !== 0) {
      const b = beginIndex();
      const from = b === -1 ? 4 : b;
      this.logger.warn(`data out of sync, slice from: ${from}`);
      this._buffer = this._buffer.slice(from);
    }
    while (beginIndex() === 0 && endIndex() > 0) {
      // console.log('found begin and end');
      const end = endIndex();
      const packet = this._buffer.slice(0, end + 1);
      this._buffer = this._buffer.slice(end + 1);
      this._parseClientPacket(packet);
      // ignore end chars from beginning of buffer
      while (isEndChar(this._buffer[0])) {
        this._buffer = this._buffer.slice(1);
      }
    }
  }
  _ensureConnection() {
    if (this._client) {
      return Promise.resolve();
    }
    return this.connect();
  }
  sendCommand(group, cmd) {
    return Promise.try(() => {
      const data = _.get(OnkyoCmds, `${group}.${cmd}`);
      if (!data) {
        throw new OnkyoError(`Command for '${group}:${cmd}' not defined`);
      }
      return this.sendRawCommand(data);
    })
      .catch((error) => {
        this.logger.error(error);
        this.emit('error', error);
        throw error;
      });
  }
  sendRawCommand(data) {
    const sendPromise = () => new Promise((resolve) => {
      const event = data.substr(0, 3);
      this.logger.debug(`wait for event: ${event}`);
      if (!data.match(/^!1/)) {
        // '!': start character
        // '1': Destination - Receiver
        data = `!1${data}`; // eslint-disable-line no-param-reassign
      }
      this.logger.debug(`TX-msg: ${data}`);
      const buffer = Onkyo.createEiscpBuffer(data);
      this.once(event, resolve);
      this._sendISCPpacket(buffer);
    });
    return Promise.try(() => {
      invariant(_.isString(data), 'data should be an string');
      invariant(data.length >= 3, 'data should be at least 3 characters');
    })
      .then(() => this._ensureConnection())
      .then(() => sendPromise()
        // If Receiver does not respond within 50msec,
        // the communication has failed.
        .timeout(4000, `Timeout when sending: ${data}`));
  }

  pwrToggle(zone) {
    return this.pwrState(zone)
      .then(({PWR}) => (PWR ? this.pwrOff(zone) : this.pwrOn(zone)));
  }


  pwrState(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('POWER', zone), 'STATUS');
  }
  pwrOn(zone) {
    return this.pwrState(zone)
      .then(({PWR}) => {
        if (!PWR) {
          return this.sendCommand(OnkyoCmds.getZoneCommand('POWER', zone), 'ON');
        }
        return {PWR};
      });
  }
  pwrOff(zone) {
    return this.pwrState(zone)
      .then(({PWR}) => {
        if (PWR) {
          return this.sendCommand(OnkyoCmds.getZoneCommand('POWER', zone), 'OFF');
        }
        return {PWR};
      });
  }
  isOn(zone) {
    return this.pwrState(zone)
      .then(({PWR}) => PWR);
  }
  isOff(zone) {
    return this.pwrState(zone)
      .then(({PWR}) => PWR === false);
  }
  volumeState(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'STATUS_VOL');
  }
  muteState(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'STATUS_MUTE');
  }
  sourceState(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('SOURCE_SELECT', zone), 'STATUS');
  }
  soundModeState() {
    return this.sendCommand('SOUND_MODE', 'STATUS');
  }
  muteToggle(zone) {
    return this.muteState(zone)
      .then(({AMT}) => (AMT ? this.unMute(zone) : this.mute(zone)));
  }
  mute(zone) {
    return this.pwrOn(zone)
      .then(() => this.muteState(zone))
      .then((status) => {
        if (!status.AMT) {
          return this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'MUTE');
        }
        return status;
      });
  }
  unMute(zone) {
    return this.pwrOn(zone)
      .then(() => this.muteState(zone))
      .then((status) => {
        if (status.AMT) {
          return this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'UNMUTE');
        }
        return status;
      });
  }

  volUp(zone) {
    return this.pwrOn(zone)
      .then(() => this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'VOL_UP'));
  }
  volDown(zone) {
    return this.pwrOn(zone)
      .then(() => this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'VOL_DOWN'));
  }

  getMute(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'STATUS_MUTE')
      .then(({AMT}) => AMT);
  }
  getVolume(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('AUDIO', zone), 'STATUS_VOL')
      .then(({MVL}) => MVL);
  }
  setVolume(volume, zone) {
    invariant(volume >= 0, 'volume should be 0 or above');
    const volumeHex = volume.toString(16).toUpperCase();
    const rawCommand = OnkyoCmds.getZoneCommand('MVL', zone) + volumeHex;
    return this.pwrOn(zone)
      .then(() => this.sendRawCommand(rawCommand)
        .then(vol => parseInt(vol, 16)));
  }
  getSource(zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('SOURCE_SELECT', zone), 'STATUS')
      .then(({SLI}) => SLI);
  }
  setSource(source, zone) {
    return this.sendCommand(OnkyoCmds.getZoneCommand('SOURCE_SELECT', zone), source);
  }
  getCenterVolume() {
    return this.sendCommand('AUDIO', 'STATUS_CTL')
      .then(({CTL}) => CTL);
  }
  setCenterVolume(volume) {
    invariant(_.isInteger(volume), 'volume should be an integer');
    invariant(volume >= -12 && volume <= 12, 'volume should be between -12 and 12');
    const volumeHex = ((volume > 0 ? '+' : '') + volume.toString(16).toUpperCase()).padStart(2, '0');
    return this.sendRawCommand(`CTL${volumeHex}`)
      .then(({CTL}) => CTL);
  }
  setFM(zone) {
    return this.setSource('FM', zone);
  }
  getSoundMode() {
    return this.sendCommand('SOUND_MODE', 'STATUS')
      .then(({LMD}) => LMD);
  }
  setSoundMode(mode) {
    return this.sendCommand('SOUND_MODE', mode);
  }
  sendRemoteKey(key) {
    return this.sendRawCommand(`OSD${key}`);
  }
}
Onkyo.DEFAULT_PORT = DEFAULT_PORT;
module.exports = Onkyo;
