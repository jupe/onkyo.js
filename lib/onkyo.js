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
**/

// native modules
const util = require('util');
const net = require('net')
const fs = require('fs')
const {EventEmitter} = require('events');
// 3rd party modules
const _ = require('lodash');
const Promise = require('bluebird');

// application
const defautLogger = require('./logger');
const OnkyoError = require('./OnkyoError');
const OnkyoCmds = require('./onkyo.commands.js');

const CONNECTION_TIMEOUT = 10000;
const DEFAULT_PORT = 60128;


class Onkyo extends EventEmitter
{
  constructor(options)
  {
    super();
    this.collectUnrecognizedToFile = false;
    this.logger = _.get(options, 'logger', defautLogger);
    this.device = {
        name: _.get(options, 'name', 'onkyo'),
        address: _.get(options, 'address', _.get(options, 'ip')),
        port: _.get(options, 'port', DEFAULT_PORT)
    }
    this._client = null;
    this.deviceState = {};
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
    const iscpMsg = new Buffer(data + '\x0D\x0a');
    const header = new Buffer([
        73, 83, 67, 80, // magic
        0, 0, 0, 16,    // header size
        0, 0, 0, 0,     // data size
        1,              // version
        0, 0, 0         // reserved
    ]);
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
      return Promise.reject('cant parse command');
    }
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if (!command || !command[0]) {
      return Promise.reject('command did not match')
    }
    command = command[0];
    this.logger.debug('RX: '+JSON.stringify({group: group, cmd: command}));
    switch (group) {
      case 'NLS':
        break;
      case "MVL":
        if((obj=command.match(/([0-9A-F]{2})/)))
        {
          let volume = parseInt(obj[1], 16);
          this.deviceState['masterVolume'] = volume;
          this.logger.debug(`masterVolume: ${volume}`);
          return Promise.resolve({group, data: {volume}});
        }
      case "PWR":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let pwrOn = parseInt(obj[1])==1;
          this.deviceState['power'] = pwrOn
          this.logger.debug("Power: "+pwrOn);
          return Promise.resolve({group, data: {pwrOn}});
        }
      case "AMT":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let mute = parseInt(obj[1])==1;
          this.deviceState['mute'] = mute
          this.logger.debug("Mute: "+mute);
          return Promise.resolve({group, data: {mute}});
        }
      case "IFA":
        return Promise.reject('IFA ?');
      case "SLI":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let source = parseInt(obj[1])==1;
          this.logger.debug("Source Set: "+source);
          return Promise.resolve({group, data: {source}});
        }
      default: break;
    }
    return Promise.reject('Unknown data');
  }

  _parseClientData(data) {
    const msg = Onkyo.eiscpPacketExtract(data);
    this._parseMsg(msg)
      .then(({group, data}) => {
        this.logger.debug('RX: ', group, data);
        this.emit(group, data);
      })
      .catch(error => {
        const msg = `RX: unknown event: ${error}`;
        this.emit("warning", msg);
        if (this.collectUnrecognizedToFile) {
          fs.appendFile('unknown_msgs.txt', msg+"\n", (err) => {
            this.logger.error(err);
          });
        }
      });
  }


  _sendISCPpacket(packet) {
    if(!this._client)
      throw Error("Client is not connected");
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
    if(this._client) {
      return Promise.reject(new OnkyoError("Client is already connected"));
    }
    return new Promise(resolve => {
      this._client = net.connect(host, () => {
        this.emit("connected", host);
        resolve(host);
      });
      this._client.on('data', this._parseClientData.bind(this));
      this._client.on('end', () => {
        this.emit("disconnect");
        this._client = null;
      });
    });
  }

  disconnect() {
    if(this._client) {
      this._client.end();
      this._client = undefined;
    }
  }
  close() {
    this.disconnect();
  }
  _ensureConnection() {
    if(this._client) {
      return Promise.resolve();
    }
    return this.connect();
  }
  sendCommand(group, cmd) {
    const sendPromise = () => new Promise(resolve => {
      if (!_.has(OnkyoCmds, `${group}.${cmd}`)) {
        throw new OnkyoError("Command not supported");
      }
      let data = OnkyoCmds[group][cmd];

      this.once(data.substr(0, 3), resolve);
      if( !data.match(/^\!1/) ) {
        data = "!1"+data;
      }
      this.logger.debug("TX: "+data);
      let buffer = Onkyo.createEiscpBuffer(data);
      this._sendISCPpacket(buffer);
    })
    return this._ensureConnection()
        .then(() => sendPromise().timeout(4000));
  }
  pwrOn() {
    return this.sendCommand("POWER", "Power STATUS")
      .then(status => {
        if (!status.pwrOn) {
          return this.sendCommand('POWER', 'Power ON');
        }
        return status;
      });
  }
  pwrOff() {
    return this.sendCommand("POWER", "Power STATUS")
      .then(status => {
        if (status.pwrOn) {
          return this.sendCommand('POWER', 'Power OFF');
        }
        return status;
      });
  }
  pwrState() {
    return this.sendCommand('POWER', "Power STATUS");
  }
  mute() {
    return this.sendCommand('AUDIO', "Mute");
  }
  unMute() {
    return this.sendCommand('AUDIO', "UnMute");
  }
  volUp() {
    return this.sendCommand('AUDIO', "Volume Up")
  }
  volDown() {
    return this.sendCommand('AUDIO', "Volume Down")
  }
  setSource(source) {
    return this.sendCommand('SOURCE_SELECT', source)
  }
  setFM() {
    return this.sendCommand('SOURCE_SELECT', 'FM');
  }
}
Onkyo.DEFAULT_PORT = DEFAULT_PORT;

module.exports = Onkyo;
