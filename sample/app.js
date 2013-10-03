var Onkyo = require('../lib/Onkyo');

var onkyo = new Onkoy();
onkyo.Discover( function(err, device){
	console.log(device);
	onkyo.Connect();
	setTimeout( onkyo.Off, 1000);
});
