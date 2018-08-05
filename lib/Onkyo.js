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
    return this.deviceState;
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
  _parseMsg(msg) {
    let obj;
    const group = msg.slice(0, 3);
    const command = msg.slice(3);
    if (!_.isString(command)) {
      return Promise.reject(new OnkyoError('cant parse command'));
    }
    this.logger.debug(`msg: ${group} ${escape(command)}`);
    switch (group) {
      case ('TUN'):
      case ('SPA'):
      case ('LMD'):
        return Promise.resolve({group, data: command});
      case 'MVL':
        obj = command.match(/([0-9A-F]{2})/);
        if (obj) {
          const volume = parseInt(obj[1], 16);
          this.deviceState.masterVolume = volume;
          this.logger.debug(`masterVolume: ${volume}`);
          return Promise.resolve({group, data: {volume}});
        }
        break;
      case 'PWR':
        obj = command.match(/([0-1]{2})/);
        if (obj) {
          const pwrOn = parseInt(obj[1], 10) === 1;
          this.deviceState.power = pwrOn;
          this.logger.debug(`Power: ${pwrOn}`);
          return Promise.resolve({group, data: {pwrOn}});
        }
        break;
      case 'AMT':
        obj = command.match(/([0-1]{2})/);
        if (obj) {
          const mute = parseInt(obj[1], 10) === 1;
          this.deviceState.mute = mute;
          this.logger.debug(`Mute: ${mute}`);
          return Promise.resolve({group, data: {mute}});
        }
        break;
      case 'SLI':
        obj = this._sliToText(command);
        this.logger.debug(`Source Set: ${obj}`);
        return Promise.resolve({group, data: {source: obj}});
      default:
        break;
    }
    return Promise.reject(new OnkyoError(`Unknown data: ${group}${command}`));
  }
  _sliToText(command) { // eslint-disable-line
    let source = command;
    _.each(OnkyoCmds.SOURCE_SELECT, (key, value) => {
      if (key === `SLI${command}`) {
        source = value;
      }
    });
    return source;
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
    const ends = () => data.endsWith('\x0a') || data.endsWith('\x0d') || data.endsWith('\x1a');
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
        this._client.on('data', this._parseClientData.bind(this));
        this._client.on('end', () => {
          this.emit('disconnect');
          this._client = null;
        });
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
    return this.sendCommand('POWER', 'Power STATUS')
      .then(status => (status.pwrOn ? this.pwrOff() : this.pwrOn()));
  }
  pwrOn() {
    return this.sendCommand('POWER', 'Power STATUS')
      .then((status) => {
        if (!status.pwrOn) {
          return this.sendCommand('POWER', 'Power ON');
        }
        return status;
      });
  }
  pwrOff() {
    return this.sendCommand('POWER', 'Power STATUS')
      .then((status) => {
        if (status.pwrOn) {
          return this.sendCommand('POWER', 'Power OFF');
        }
        return status;
      });
  }
  pwrState() {
    return this.sendCommand('POWER', 'Power STATUS');
  }
  mute() {
    return this.sendCommand('AUDIO', 'Mute');
  }
  unMute() {
    return this.sendCommand('AUDIO', 'UnMute');
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
    return this.sendCommand('SOURCE_SELECT', 'FM');
  }
  setSoundMode(mode) {
    return this.sendCommand('SOUND_MODES', mode);
  }
}
Onkyo.DEFAULT_PORT = DEFAULT_PORT;
module.exports = Onkyo;
