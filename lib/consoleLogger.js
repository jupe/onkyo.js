class consoleLogger
{
  constructor(){}
  warn(msg){console.log(msg);}
  debug(msg){console.log(msg);}
  info(msg){console.log(msg);}
  warn(msg){console.warn(msg);}
  error(msg){console.error(msg);}
}

module.exports = consoleLogger;
