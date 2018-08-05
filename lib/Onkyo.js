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
    _.each(groups, (group) => {
      const cmds = OnkyoCmds[group];
      _.each(cmds, (cmd, title) => {
        const api = _.camelCase(`set${title}`);
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
      api: 'pwrToggle',
      func: this.pwrToggle.bind(this)
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
      return Promise.reject(new OnkyoError('cant parse command'));
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
        this.logger.debug(`Speaker state: ${state}`);
        this.deviceState[group] = state;
        return Promise.resolve({group, data: {[group]: state}});
      }
      case 'MVL': {
        const MVL = Onkyo._parseInt(command, 16);
        this.deviceState.MVL = MVL;
        this.logger.debug(`masterVolume: ${MVL}`);
        return Promise.resolve({group, data: {MVL}});
      }
      case 'PWR': {
        const PWR = Onkyo._parseBool(command);
        this.deviceState.PWR = PWR; // power state
        this.logger.debug(`Power: ${PWR}`);
        return Promise.resolve({group, data: {PWR}});
      }
      case 'AMT': {
        const AMT = Onkyo._parseBool(command);
        this.deviceState.AMT = AMT; // master volume
        this.logger.debug(`Mute: ${AMT}`);
        return Promise.resolve({group, data: {AMT}});
      }
      case 'LMD': {
        const LMD = Onkyo._GetKeyByValue('SOUND_MODES', lookup);
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
      default:
        break;
    }
    const error = new OnkyoError(`Unknown data: ${encodeURIComponent(lookup)}`);
    return Promise.reject(error);
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
  _parseClientData(eiscpData) {
    this.logger.debug(`RX: ${encodeURIComponent(eiscpData)}`);
    Promise
      .try(() => Onkyo.eiscpPacketExtract(eiscpData))
      .then(msg => this._parseMsg(msg))
      .then(({group, data}) => {
        this.logger.debug('received: ', group, data);
        this.emit(group, data);
      })
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
        this._client.on('data', this._parseClientData.bind(this));
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
  _ensureConnection() {
    if (this._client) {
      return Promise.resolve();
    }
    return this.connect();
  }
  sendCommand(group, cmd) {
    return Promise.try(() => {
      if (!_.has(OnkyoCmds, `${group}.${cmd}`)) {
        throw new OnkyoError(`Command for '${group}:${cmd}' not defined`);
      }
      const data = OnkyoCmds[group][cmd];
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
      invariant(_.isString(data), 'data should be an string');
      invariant(data.length >= 3, 'data should be at least 3 characters');
      const event = data.substr(0, 3);
      this.logger.debug(`wait for event: ${event}`);
      this.once(event, resolve);
      if (!data.match(/^!1/)) {
        data = `!1${data}`; // eslint-disable-line no-param-reassign
      }
      this.logger.debug(`TX-msg: ${data}`);
      const buffer = Onkyo.createEiscpBuffer(data);
      this._sendISCPpacket(buffer);
    });
    return this._ensureConnection()
      .then(() => sendPromise().timeout(4000));
  }
  pwrToggle() {
    return this.pwrState()
      .then(({PWR}) => (PWR ? this.pwrOff() : this.pwrOn()));
  }
  pwrState() {
    return this.sendCommand('POWER', 'QSTN');
  }
  pwrOn() {
    return this.pwrState()
      .then(({PWR}) => {
        if (!PWR) {
          return this.sendCommand('POWER', 'Power ON');
        }
        return {PWR};
      });
  }
  pwrOff() {
    return this.pwrState()
      .then(({PWR}) => {
        if (PWR) {
          return this.sendCommand('POWER', 'Power OFF');
        }
        return {PWR};
      });
  }
  volumeState() {
    return this.sendCommand('AUDIO', 'QSTN');
  }
  sourceState() {
    return this.sendCommand('SOURCE_SELECT', 'QSTN');
  }
  soundModeState() {
    return this.sendCommand('SOUND_MODES', 'QSTN');
  }
  muteState() {
    return this.sendCommand('AUDIO', 'QSTNM');
  }
  muteToggle() {
    return this.muteState()
      .then(({AMT}) => (AMT ? this.unMute() : this.mute()));
  }
  mute() {
    return this.muteState()
      .then((status) => {
        if (!status.AMT) {
          return this.sendCommand('AUDIO', 'Mute');
        }
        return status;
      });
  }
  unMute() {
    return this.muteState()
      .then((status) => {
        if (status.AMT) {
          return this.sendCommand('AUDIO', 'UnMute');
        }
        return status;
      });
  }
  volUp() {
    return this.sendCommand('AUDIO', 'Volume Up');
  }
  volDown() {
    return this.sendCommand('AUDIO', 'Volume Down');
  }
  setSource(source) {
    return this.sendCommand('SOURCE_SELECT', source);
  }
  setFM() {
    return this.setSource('FM');
  }
  setSoundMode(mode) {
    return this.sendCommand('SOUND_MODES', mode);
  }
}
Onkyo.DEFAULT_PORT = DEFAULT_PORT;
module.exports = Onkyo;
