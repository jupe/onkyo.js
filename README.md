onkyo.js
========

Onkyo Receiver controller module.

Library is heavily work in progress, but discovering already works and event receiving.

Tested with TX-NR809

Example:
```
var onkyo = new Onkoy();
onkyo.Discover( function(err, device){
	console.log(device);
	onkyo.Connect();
	setTimeout( onkyo.Off, 1000);
})
```
