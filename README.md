onkyo.js
========

Onkyo Receiver controller module.

Library is heavily work in progress, but discovering already works and event receiving.

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
	setTimeout( onkyo.Off, 1000);
})
```
