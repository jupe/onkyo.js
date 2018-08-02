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
*   -unregonizeMsg
*   -disconnect
*   -error
*   -detected
*   -msg
* */

// native modules
const net = require('net');
const fs = require('fs');
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
    this.collectUnrecognizedToFile = false;
    this.logger = _.get(options, 'logger', defautLogger);
    this.device = {
      name: _.get(options, 'name', 'onkyo'),
      address: _.get(options, 'address', _.get(options, 'ip')),
      port: _.get(options, 'port', DEFAULT_PORT)
    };
    this._client = null;
    this.deviceState = {};
    this.logger.debug(`Onkyo ${this.name} constructed`);
    this.validate();
  }
  validate() {
    invariant(_.isString(this.name), 'name should be an string');
    invariant(_.isInteger(this.port), 'port should be an integer');
    invariant(
      _.isString(this.address) || _.isUndefined(this.address),
      'address should be an string or undefined'
    );
    invariant(_.isObject(this.logger), 'logger should be an object');
  }

  get name() { return this.device.name; }
  get port() { return this.device.port; }
  get address() { return this.device.address; }

  toString() {
    return `${this.name} ${this.address}:${this.port}`;
  }
  static init(opts) {
    return new Onkyo(opts);
  }
  getDeviceState() {
    return this.deviceState;
  }
  static createEiscpBuffer(data) {
    const iscpMsg = Buffer.from(`${data}\x0d\x0a`);
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
    this.logger.debug('msg: ', msg);
    let obj;
    const group = msg.slice(0, 3);
    let command = msg.slice(3);
    if (!_.isString(command)) {
      return Promise.reject(new Error('cant parse command'));
    }
    // eslint-disable-next-line no-control-regex
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if (!command || !command[0]) {
      return Promise.reject(new Error('command did not match'));
    }
    [command] = command;
    this.logger.debug(`RX: ${JSON.stringify({group: group, cmd: command})}`);
    switch (group) {
      case 'NLS':
        break;
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
      case 'IFA':
        return Promise.reject(new Error('IFA ?'));
      case 'SLI':
        obj = command.match(/([0-1]{2})/);
        if (obj) {
          const source = parseInt(obj[1], 10) === 1;
          this.logger.debug(`Source Set: ${source}`);
          return Promise.resolve({group, data: {source}});
        }
        break;
      default:
        break;
    }
    return Promise.reject(new Error('Unknown data'));
  }
  _parseClientData(eiscpData) {
    const msg = Onkyo.eiscpPacketExtract(eiscpData);
    this._parseMsg(msg)
      .then(({group, data}) => {
        this.logger.debug('RX: ', group, data);
        this.emit(group, data);
      })
      .catch((error) => {
        const errMsg = `RX: unknown event: ${error}`;
        this.emit('warning', errMsg);
        if (this.collectUnrecognizedToFile) {
          fs.appendFile('unknown_msgs.txt', `${errMsg}\n`, (err) => {
            this.logger.error(err);
          });
        }
      });
  }
  _sendISCPpacket(packet) {
    if (!this._client) { throw Error('Client is not connected'); }
    this.logger.debug(`Packet: ${packet}`);
    this._client.write(packet);
  }
  static eiscpPacketExtract(packet) {
    /*
      Exracts message from eISCP packet
      Strip first 18 bytes and last 3 since that's only the header and end characters
    */
    return packet.toString('ascii', 18, packet.length - 3);
  }

  connect() {
    const host = {
      port: this.device.port,
      host: this.device.address
    };
    if (this._client) {
      return Promise.reject(new OnkyoError('Client is already connected'));
    }
    return new Promise((resolve) => {
      this._client = net.connect(host, () => {
        this.emit('connected', host);
        resolve(host);
      });
      this._client.on('data', this._parseClientData.bind(this));
      this._client.on('end', () => {
        this.emit('disconnect');
        this._client = null;
      });
    });
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
    const sendPromise = () => new Promise((resolve) => {
      if (!_.has(OnkyoCmds, `${group}.${cmd}`)) {
        throw new OnkyoError('Command not supported');
      }
      let data = OnkyoCmds[group][cmd];

      this.once(data.substr(0, 3), resolve);
      if (!data.match(/^!1/)) {
        data = `!1${data}`;
      }
      this.logger.debug(`TX: ${data}`);
      const buffer = Onkyo.createEiscpBuffer(data);
      this._sendISCPpacket(buffer);
    });
    return this._ensureConnection()
      .then(() => sendPromise().timeout(4000));
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
}
Onkyo.DEFAULT_PORT = DEFAULT_PORT;
module.exports = Onkyo;