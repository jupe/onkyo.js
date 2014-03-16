/**
*
* Events:
*   -unregonizeMsg
*   -disconnect
*   -error
*   -detected
*   -msg
**/

var util = require('util')
  , net = require('net')
  , dgram = require('dgram')
  , fs = require('fs')
  , events = require('events');


var Onkyo = function(options)
{
  this.options = (!options) ? {log: false} : options;
  this.destinationPort = 60128;
  this.broadcastPort = 60128;
  this.broadcastAddress =
    (options.broadcastAddress) ? options.broadcastAddress : "192.168.0.255";
  this.reqCallback;
  this.detectedDevice;
  this.client;
  this.server = dgram.createSocket("udp4");
  this.cmds = require('./onkyo.commands.js');
  this.deviceState = {}
  self = this;

  this.server.on("error", function (err) {
    //console.log("server error:\n" + err.stack);
    this.server.close();
    this.emit("error", err.stack);
  });

  this.server.on("message", function (msg, rinfo) {
    this.detectedDevice = this.parseDetectionResponse(msg);
    if( this.detectedDevice ){
      this.detectedDevice.address = rinfo.address;
      this.detectedDevice.port = rinfo.port;
      reqCallback(null, this.detectedDevice);
      this.emit("detected", this.detectedDevice);
    }
    else {
      //this.emit("error", {error: 'detection error'});
    }
  });

  this.server.on("listening", function () {
    this.server.setBroadcast(true);
    var address = this.server.address();
    this.log("server listening " + address.address + ":" + address.port);
  });

  this.server.bind(this.broadcastPort);

};

Onkyo.prototype.log(str){
    if( this.options.log )
        console.log(str)
}

Onkyo.prototype.doBuffer = function(msg) {
    //msg += "\x1A";
    var buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
    buffer.writeUInt8(msg.length, 11);
    return buffer;
}

Onkyo.prototype.parseDetectionResponse(msg){
    try{
      msg = msg.slice(16).toString().trim();
      msg = msg.split("/");
      areas = {DX: "North American model", XX: "European or Asian model", JJ: "Japanese model"}
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

Onkyo.prototype.ParsePacket(packetstring) {
    var obj;
    var group = packetstring.slice(18, 21).toString();
    var command = packetstring.slice(21).toString();
    if( !command || !command.match ) return false;
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if( !command || !command[0] ) return false;
    command = command[0];
    log('RX: '+JSON.stringify({group: group, cmd: command}));
    switch (group) {
      case "MVL":
        if((obj=command.match(/([0-9A-F]{2})/)))
        {
          var volume = parseInt(obj[1], 16);
          this.deviceState['masterVolume'] = volume;
          this.log("masterVolume: "+this.deviceState['masterVolume'] );
          var js = {MVL: volume}
          if(reqCallback) reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }return MasterVolume.ParsePacket(command);
      case "PWR":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var pwrOn = parseInt(obj[1])==1;
          this.deviceState['power'] = pwrOn
          this.log("Power: "+pwrOn);
          var js = {PWR: pwrOn}
          if(reqCallback) reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }
      case "AMT":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var mute = parseInt(obj[1])==1;
          this.deviceState['mute'] = mute
          this.log("Mute: "+mute);
          var js = {MUTE: mute}
          if(reqCallback) reqCallback(null, js);
          this.emit("msg", js);
          return true;
        }
      case "IFA":
        return false;
        //return Audio.ParsePacket(command);
      case "SLI":
        return false;
        //return Input.ParsePacket(packetstring);
      default: return false;
    }
  }

Onkyo.prototype.parseEventMessage(data) {
    if(!this.ParsePacket(data))
    {
      var msg = "RX: unknown event: "+data.slice(16).toString();
      this.emit("unregonizeMsg", msg);
      fs.appendFile('unknown_msgs.txt', msg+"\n", function (err) {
      });
    }
    /*
    data = data.slice(16).toString();
    var obj;

    else if((obj=data.match(/NLSC-P/))){
      console.log("NLSC-P?");
    }*/
    // !1IFAHDMI 3,PCM,48 kHz,2.0 ch,All Ch Stereo,5.1 ch,
    // !1IFVHDMI 3,1280 x 720p   50 Hz,RGB,24 bit,HDMI Main,1280 x 720p   50 Hz,RGB,24 bit,Custom,

}


Onkyo.prototype.SendeISCPpacket(packet)
  {
    this.log(packet);
    this.client.write(packet);
  }

Onkyo.prototype.Discover = function(callback)
  {
    reqCallback = callback;
    var buf = this.doBuffer(cmds.DISCOVER);
    this.server.send(buf, 0, buf.length, this,broadcastPort,
      this.broadcastAddress, function(err, bytes) {
      if(err){
        if(callback)callback(err)
        this.emit("error", err);
      }
    });
  }

Onkyo.prototype.Connect = function(callback){
    var host = {port: this.destinationPort, host: this.detectedDevice.address};
    this.client = net.connect(host, function() { //'connect' listener
      this.emit("connected", host)
      if(callback){
        callback(null, "Connected")
      }
    });
    this.client.on('data', function(data) {
      this.parseEventMessage(data);
    });
    this.client.on('end', function() {
      this.emit("disconnect");
    });
  }

Onkyo.prototype.Disconnect = function()
  {
    this.server.close();
    this.client.end();
  }
Onkyo.prototype.Close = function()
  {
    this.Disconnect();
  }
Onkyo.prototype.SendCommand = function(group, cmd, callback)
  {
    reqCallback = callback;
    if( !this.cmds[group] || !this.cmds[group][cmd]) return false;
    var cmd = this.cmds[group][cmd];
    if( !cmd.match(/^\!1/) ) cmd = "!1"+cmd;
    log("TX: "+cmd);
    var buffer = this.doBuffer(cmd);
    this.SendeISCPpacket(buffer);
  }
Onkyo.prototype.PwrOn = function(callback)
  {
    this.SendCommand("POWER", "Power STATUS", function(err, status)
    {
      if( !status.Power ) this.SendCommand('POWER', 'Power ON', callback);
      else if(callback)callback(null, status);
    });
  }
Onkyo.prototype.PwrOff = function(callback)
  {
    this.SendCommand("POWER", "Power STATUS", function(err, status)
    {
      if( status.Power ) this.SendCommand('POWER', 'Power OFF', callback);
      else if(callback)callback(null, status);
    });
  }
Onkyo.prototype.PwrState = function(callback)
  {
    this.SendCommand('POWER', "Power STATUS", callback);
  }
Onkyo.prototype.Mute = function(callback)
  {
    this.SendCommand('AUDIO', "Mute", callback);
  }
Onkyo.prototype.UnMute = function(callback)
  {
    this.SendCommand('AUDIO', "UnMute", callback);
  }
Onkyo.prototype.VolUp = function(callback)
  {
    this.SendCommand('AUDIO', "Volume Up", callback)
  }
Onkyo.prototype.VolDown = function(callback)
  {
    this.SendCommand('AUDIO', "Volume Down", callback)
  }


util.inherits(Onkyo, events.EventEmitter);

exports.init = function(opts) {
  return new Onkyo(opts);
}
