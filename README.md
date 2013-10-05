onkyo.js
========

Onkyo Receiver controller module.

Basic features already works, but currently only very limited remote-functions are implemented. Implementation state is more like proof-of-concept.

Tested with TX-NR809

Example:
```
var onkyo = new Onkoy();
onkyo.on("error", function(error){});
onkyo.on("detected", function(device){});
onkyo.on("unregonizeMsg", function(msg){});
onkyo.on("msg", function(msg){
  // parsed msg, e.g.
  // {'MUTE': true}
});
onkyo.Discover( function(err, device){
	console.log(device);
	onkyo.Connect();
  onkyo.PwrOn();      //pwr on
  onkyo.UnMute();     //volume 4
  onkyo.SendCommand('AUDIO', 'Volume Up'); 
  onkyo.SendCommand("SOURCE_SELECT", "FM");
	setTimeout( onkyo.PwrOff, 10000);
})
```
