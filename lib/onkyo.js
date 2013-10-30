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


var Onkyo = function()
{
  var destinationPort = 60128;
  var broadcastPort = 60128;
  var broadcastAddress = "192.168.0.255";
  var reqCallback;
  var detectedDevice;
  var client;
  var server = dgram.createSocket("udp4");
  var cmds = require('./onkyo.commands.js');
  var self = this;
  
  var doBuffer = function(msg)
  {
    //msg += "\x1A";
    var buffer = new Buffer("ISCP\x00\x00\x00\x10\x00\x00\x00\x00\x01\x00\x00\x00"+msg+"\x0D\x0A");
    buffer.writeUInt8(msg.length, 11);
    return buffer;
  }
  function parseDetectionResponse(msg){
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
  }
  var deviceState = {}

  function ParsePacket(packetstring) {
    var obj;
    var group = packetstring.slice(18, 21).toString();
    var command = packetstring.slice(21).toString();
    if( !command || !command.match ) return false;
    command = command.match(/[^\x1a\x0d\x0a]{1,}/);
    if( !command || !command[0] ) return false;
    command = command[0];
    console.log('RX: '+JSON.stringify({group: group, cmd: command}));
    switch (group) {
      case "MVL":
        if((obj=command.match(/([0-9A-F]{2})/)))
        {
          var volume = parseInt(obj[1], 16);
          deviceState['masterVolume'] = volume;
          console.log("masterVolume: "+deviceState['masterVolume'] );
          var js = {MVL: volume}
          if(reqCallback) reqCallback(null, js);
          self.emit("msg", js); 
          return true;
        }return MasterVolume.ParsePacket(command);
      case "PWR":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var pwrOn = parseInt(obj[1])==1;
          deviceState['power'] = pwrOn
          console.log("Power: "+pwrOn);
          var js = {PWR: pwrOn}
          if(reqCallback) reqCallback(null, js);
          self.emit("msg", js); 
          return true;	 
        }
      case "AMT":
        if((obj=command.match(/([0-1]{2})/)))
        {
          var mute = parseInt(obj[1])==1;
          deviceState['mute'] = mute
          console.log("Mute: "+mute);
          var js = {MUTE: mute}
          if(reqCallback) reqCallback(null, js);
          self.emit("msg", js); 
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
  function parseEventMessage(data)
  {
    if(!ParsePacket(data))
    {
      var msg = "RX: unknown event: "+data.slice(16).toString();
      self.emit("unregonizeMsg", msg);
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
  server.on("error", function (err) {
    //console.log("server error:\n" + err.stack);
    server.close();
    self.emit("error", err.stack);
  });

  server.on("message", function (msg, rinfo) {
    detectedDevice = parseDetectionResponse(msg);
    detectedDevice.address = rinfo.address;
    detectedDevice.port = rinfo.port;
    reqCallback(null, detectedDevice);
    self.emit("detected", detectedDevice);
  });

  server.on("listening", function () {
    server.setBroadcast(true);
    var address = server.address();
    console.log("server listening " + address.address + ":" + address.port);
  });

  function SendeISCPpacket(packet)
  {
    console.log(packet);
    client.write(packet);
  }

  server.bind(broadcastPort);
  
  this.Discover = function(callback)
  {
    reqCallback = callback;
    var buf = doBuffer(cmds.DISCOVER);
    server.send(buf, 0, buf.length, broadcastPort, 
      broadcastAddress, function(err, bytes) {
      if(err){
        if(callback)callback(err)
        self.emit("error", err);
      }
    });
  }
  this.Connect = function(callback){
    var host = {port: destinationPort, host: detectedDevice.address};
    client = net.connect(host, function() { //'connect' listener
      self.emit("connected", host)
      if(callback){
        callback(null, "Connected")
      }
    });
    client.on('data', function(data) {
      parseEventMessage(data);
    });
    client.on('end', function() {
      self.emit("disconnect");
    });
  }
  this.Disconnect = function()
  {
    server.close();
    client.end();
  }
  this.Close = function()
  {
    self.Disconnect();
  }
  this.SendCommand = function(group, cmd, callback)
  {
    reqCallback = callback;
    if( !cmds[group] || !cmds[group][cmd]) return false;
    var cmd = cmds[group][cmd];
    if( !cmd.match(/^\!1/) ) cmd = "!1"+cmd;
    console.log("TX: "+cmd);
    var buffer = doBuffer(cmd);
    SendeISCPpacket(buffer);
  }
  this.PwrOn = function(callback)
  {
    self.SendCommand("POWER", "Power STATUS", function(err, status)
    {
      if( !status.Power ) self.SendCommand('POWER', 'Power ON', callback);
      else if(callback)callback(null, status);
    });
  }
  this.PwrOff = function(callback)
  {
    self.SendCommand("POWER", "Power STATUS", function(err, status)
    {
      if( status.Power ) self.SendCommand('POWER', 'Power OFF', callback);
      else if(callback)callback(null, status);
    });
  }
  this.PwrState = function(callback)
  {
    self.SendCommand('POWER', "Power STATUS", callback);
  }
  this.Mute = function(callback)
  {
    self.SendCommand('AUDIO', "Mute", callback);
  }
  this.UnMute = function(callback)
  {
    self.SendCommand('AUDIO', "UnMute", callback);
  }
  this.VolUp = function(callback)
  {
    self.SendCommand('AUDIO', "Volume Up", callback)
  }
  this.VolDown = function(callback)
  {
    self.SendCommand('AUDIO', "Volume Down", callback)
  }

  return this;
}
util.inherits(Onkyo, events.EventEmitter);
module.exports = Onkyo;
