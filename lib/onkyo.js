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
const dgram = require('dgram')
const fs = require('fs')
const {EventEmitter} = require('events');
// 3rd party modules
const _ = require('lodash');
const debug = require('debug')('onkyo.js');
const Promise = require('bluebird');

// application
const {OnkyoError} = require('./OnkyoError');
const OnkyoCmds = require('./onkyo.commands.js');

const CONNECTION_TIMEOUT = 10000;
const debugLogger = {
  debug: debug,
  info: debug,
  warn: debug,
  info: debug
};

class Onkyo extends EventEmitter
{
  constructor(options)
  {
    super();
    this.options = {}
    this.logger = options.logger || debugLogger;
    this.destinationPort = options.destinationPort || 60128;
    this.broadcastPort = options.broadcastPort || 60128;
    this.broadcastAddress = options.broadcastAddress || "192.168.1.255";
    this.detectedDevice = undefined;
    if(options.ip)
    {
      this.detectedDevice = {
        address: options.ip,
        port: options.port || 60128
       };
    }
    this._client = null;
    this.deviceState = {};
    this._reqCallback = ()=>{}; // @todo need better approach
    this._server = this._createListenServer();
  }

  static init(opts) {
    return new Onkyo(opts);
  }

  getDeviceState() {
    return this.deviceState;
  }

  _createListenServer()
  {
    let server = dgram.createSocket("udp4");
    server.on("error", (err) => {
      this.logger.error("server error:\n" + err.stack);
      server.close();
      this.emit("error", err);
    });
    server.on("message", (msg, rinfo) => {
      this.detectedDevice = this._parseDetectionResponse(msg);
      if( this.detectedDevice ){
        this.detectedDevice.address = rinfo.address;
        this.detectedDevice.port = rinfo.port;
        this.emit("detected", this.detectedDevice);
        this._reqCallback(null, this.detectedDevice);
        this.logger.info(`Detected: ${this.detectedDevice.address}:${this.detectedDevice.port}`)
      }
      else {
        //self.emit("error", {error: 'detection error'});
      }
    });
    server.on("listening", () => {
      server.setBroadcast(true);
      let address = server.address();
      this.logger.info("server listening " + address.address + ":" + address.port);
    });

    server.bind(this.broadcastPort);
    return server;
  }

  _doBuffer(msg) {
    //msg += "\x1A";
    let buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
    buffer.writeUInt8(msg.length, 11);
    return buffer;
  }

  _parseDetectionResponse(msg) {
    try{
      msg = msg.slice(16).toString().trim();
      msg = msg.split("/");
      let areas = {DX: "North American model", XX: "European or Asian model", JJ: "Japanese model"}
      return {
        category: msg[0][1],
        modelName: msg[0].slice(5),
        ISCPport: msg[1],
        area:  areas[msg[2]],
        identifier: msg[3].slice(0,12)
      };
    } catch( e ){
      return false;
    }
  }

  _parsePacket(packetstring) {
    let obj;
    let group = packetstring.slice(18, 21).toString();
    let command = packetstring.slice(21).toString();
    if( !command || !command.match ) return false;
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if( !command || !command[0] ) {
      return false;
    }
    command = command[0];
    this.logger.debug('RX: '+JSON.stringify({group: group, cmd: command}));
    switch (group) {
      case "MVL":
        if((obj=command.match(/([0-9A-F]{2})/)))
        {
          let volume = parseInt(obj[1], 16);
          this.deviceState['masterVolume'] = volume;
          this.logger.debug("masterVolume: "+this.deviceState['masterVolume'] );
          this.emit(group, {volume});
          return true;
        }
        return MasterVolume._parsePacket(command);
      case "PWR":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let pwrOn = parseInt(obj[1])==1;
          this.deviceState['power'] = pwrOn
          this.logger.debug("Power: "+pwrOn);
          this.emit(group, {pwrOn});
          return true;
        }
      case "AMT":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let mute = parseInt(obj[1])==1;
          this.deviceState['mute'] = mute
          this.logger.debug("Mute: "+mute);
          this.emit(group, {mute});
          return true;
        }
      case "IFA":
        return false;
        //return Audio._parsePacket(command);
      case "SLI":
        if((obj=command.match(/([0-1]{2})/)))
        {
          let source = parseInt(obj[1])==1;
          this.logger.debug("Source Set: "+source);
          this.emit(group, {source});
          return true;
        }
        //return Input._parsePacket(packetstring);
      default: return false;
    }
  }

  _parseEventMessage(data) {
    if(!this._parsePacket(data))
    {
      let msg = "RX: unknown event: "+data.slice(16).toString();
      this.emit("unregonizeMsg", msg);
      fs.appendFile('unknown_msgs.txt', msg+"\n", (err) => {
        this.logger.error(err);
      });
    }
    /*
    data = data.slice(16).toString();
    let obj;

    else if((obj=data.match(/NLSC-P/))){
      console.logger.debug("NLSC-P?");
    }*/
    // !1IFAHDMI 3,PCM,48 kHz,2.0 ch,All Ch Stereo,5.1 ch,
    // !1IFVHDMI 3,1280 x 720p   50 Hz,RGB,24 bit,HDMI Main,1280 x 720p   50 Hz,RGB,24 bit,Custom,
  }


  _SendISCPpacket(packet) {
    if(!this._client)
      throw Error("Client is not connected");
    this.logger.debug(`Packet: ${packet}`);
    this._client.write(packet);
  }

  Discover(callback) {
    if(!this._server) {
      return Promise.reject(new OnkyoError("Server is not alive!"));
    }
    this._reqCallback = callback;
    let buf = this._doBuffer(OnkyoCmds.DISCOVER);
    this._server.send(
      buf, 0, buf.length, this.broadcastPort,
      this.broadcastAddress,
      (err, bytes) => {
      if (err) {
        if(callback)callback(err)
        this.emit("error", err);
      } else {
        //callback(bytes);
      }
    });
  }

  Connect() {
    const host = {
      port: this.destinationPort,
      host: this.detectedDevice.address
    };
    if(this._client) {
      return Promise.reject(new OnkyoError("Client is already connected"));
    }
    return new Promise(resolve => {
      this._client = net.connect(host, () => {
        this.emit("connected", host);
        resolve(host);
      });
      this._client.on('data', (data) => {
        this._parseEventMessage(data);
      });
      this._client.on('end', () => {
        this.emit("disconnect");
        this._client = null;
      });
    });
  }

  Disconnect() {
    this._server.close();
    if(this._client)
      this._client.end();
  }
  Close() {
    this.Disconnect();
  }
  _ensureConnection() {
    if(this._client) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.once("connected", resolve);
    }).timeout(CONNECTION_TIMEOUT);
  }
  SendCommand(group, cmd) {
    const sendPromise = () => new Promise(resolve => {
      if (!_.has(OnkyoCmds, `${group}.${cmd}`)) {
        throw new OnkyoError("Command not supported");
      }
      this.once(group, resolve);
      let data = OnkyoCmds[group][cmd];
      if( !data.match(/^\!1/) ) {
        data = "!1"+cmd;
      }
      this.logger.debug("TX: "+data);
      let buffer = this._doBuffer(data);
      this._SendISCPpacket(buffer);
    })
    return this._ensureConnection()
        .then(() => sendPromise.timeout(4000));
  }
  PwrOn() {
    return this.SendCommand("PWR", "Power STATUS")
      .then(status => {
        if( !status.Power ) {
          return this.SendCommand('PWR', 'Power ON');
        }
        return status;
      });
  }
  PwrOff() {
    return this.SendCommand("PWR", "Power STATUS")
      .then(status => {
        if( status.PWR ) {
          return this.SendCommand('PWR', 'Power OFF');
        }
        return status;
      });
  }
  PwrState() {
    return this.SendCommand('PWR', "Power STATUS");
  }
  Mute() {
    return this.SendCommand('AUDIO', "Mute");
  }
  UnMute() {
    return this.SendCommand('AUDIO', "UnMute");
  }
  VolUp() {
    return this.SendCommand('AUDIO', "Volume Up")
  }
  VolDown() {
    return this.SendCommand('AUDIO', "Volume Down")
  }
  SetSource(source) {
    return this.SendCommand('SOURCE_SELECT', source)
  }
  SetFM() {
    return this.SendCommand('SOURCE_SELECT', 'FM');
  }
}

module.exports = Onkyo;
