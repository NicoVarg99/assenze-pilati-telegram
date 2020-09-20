const https = require('https');
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
const timediff = require('timediff');
var requestedSubstitute = "-";
const token = process.env.TOKEN;
var assenze; //Data or null
var errorMessage = "Errore nella richiesta al sito scolastico.\nProva a visitarlo manualmente: https://www.istitutopilati.it/gestione_sostituzioni/slideshow_fermo.php";
const savesFileName = "./users-data.json";

if (!token) {
  console.log("ERROR: token is not defined");
  process.exit(255);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});
bot.on("polling_error", console.log);

var connectionOptions = {
  hostname: 'www.istitutopilati.it',
  port: '443',
  path: '/gestione_sostituzioni/sostituzioni/listaPubblica.json',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  strictSSL: true
};

String.prototype.toTitleCase = function () {
  return this.replace(/\w\S*/g, txt => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function msgAssenze(msg, match) {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message
  var requestedClass = match[1].toUpperCase();
  var resultingTable = [];

  if (!assenze) { //If no data is there, send an error message
    bot.sendMessage(msg.chat.id, errorMessage);
    return;
  }

  for (var i in assenze.sostituzioni) //For each row
    if (assenze.sostituzioni[i].classe.toUpperCase() == requestedClass) //If curent class = requested class
      resultingTable.push(assenze.sostituzioni[i]);

  var numResults = 0;
  response = "Per " + assenze.data + " nella classe " + requestedClass + " sono previste le seguenti assenze:\n";

  for (var i = 0; i < resultingTable.length; i++) { //For each match
    response += "\nAssente: " + resultingTable[i].docenteAssente + "\n";
    response += "Sostituto: " + resultingTable[i].docenteSostituto + "\n";
    response += "Orario: " + resultingTable[i].orario + "\n";
    if (resultingTable[i].note != "")
      response += "Note: " + resultingTable[i].note + "\n";
    numResults++;
  }

  if (numResults == 0)
    response = "Nessuna assenza prevista per " + assenze.data + " nella classe " + requestedClass + ".";

  bot.sendMessage(msg.chat.id, response);
}

function msgSostituto(msg, match) {
  //Searchs by substitute
  var requestedSubstitute = match[1].toUpperCase();
  var resultingTable = [];

  if (!assenze) { //If no data is there, send an error message
    bot.sendMessage(msg.chat.id, errorMessage);
    return;
  }

  for (var i in assenze.sostituzioni) //For each row
    if (assenze.sostituzioni[i].docenteSostituto.toUpperCase().includes(requestedSubstitute)) //If curent class = requested class
      resultingTable.push(assenze.sostituzioni[i]);

  var numResults = 0;
  response = "Per " + assenze.data + " al docente " + resultingTable[0].docenteSostituto + " sono assegnate le seguenti sostituzioni:\n";

  for (var i = 0; i < resultingTable.length; i++) { //For each match
    response += "\nAssente: " + resultingTable[i].docenteAssente + "\n";
    response += "Orario: " + resultingTable[i].orario + "\n";
    response += "Classe: " + resultingTable[i].classe + "\n";
    if (resultingTable[i].note != "")
      response += "Note: " + resultingTable[i].note + "\n";
    numResults++;
  }

  if (numResults == 0)
     response = "Nessuna assenza assegnata per " + assenze.data + " al docente " + requestedSubstitute + ".";

  bot.sendMessage(msg.chat.id, response);
}

bot.onText(/^\/assenze$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica una classe!\nEsempio: /assenze CLASSE");
});

bot.onText(/\/assenze.* (.+)/, msgAssenze);

bot.onText(/\/sostituto.* (.+)/, msgSostituto);

bot.onText(/\/aggiornami.* (.+)/, setUpdatesForNewUser);

bot.onText(/^\/aggiornami$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica la classe!");
});

bot.onText(/^\/sostituto$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica il nome!");
});

bot.onText(/\/aggiornami.* (.+)/, setUpdatesForNewUser);

bot.onText(/\/start.*/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Bot avviato. Invia un messaggio come /assenze classe");
});
bot.onText(/^\/help$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Comandi disponibili:\n\n/assenze classe\n/sostituto nome");
});
bot.onText(/^ping$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "pong");
});

bot.onText(/.*/, (msg, match) => {
  var date = new Date().toISOString().
  replace(/T/, ' ').      // replace T with a space
  replace(/\..+/, '');

  var string = date + " - " + msg.from.id + " " + msg.from.first_name + " " + msg.from.last_name  + " " + msg.from.username + " on chat "  +  msg.chat.id + " - " + match;
  console.log(string);
  //bot.sendMessage(msg.chat.id, "Comandi disponibili:\n\n/assenze classe\n/sostituto nome");

  fs.appendFile('requests.log', string + '\n', function (err) {
  if (err) throw err;
  //console.log('Saved!');
  });

});

function fixDataFormat(data) { //Fixes conceptual errors in the remote JSON
  data.values = Array();

  for (var i in data.valori) {
    data.valori[i].id = i;
    data.values.push(data.valori[i]);
  }

  delete data.valori; //Remove valori
  return data;
}

function fetchData() {
  //Fetches new data - To be called at regular intervals or after requests
  var req = https.request(connectionOptions, function(res) {
    var totalData = "";

    res.on('data', function (data) {
      totalData += data;
    });

    res.on('end', function () {
      try {
        totalData = JSON.parse(totalData);
      } catch (e) {
        totalData = null;
        console.log(e instanceof SyntaxError); // true
        console.log(e.message);                // "missing ; before statement"
        console.log(e.name);                   // "SyntaxError"
        console.log(e.fileName);               // "Scratchpad/1"
        console.log(e.lineNumber);             // 1
        console.log(e.columnNumber);           // 4
        console.log(e.stack);                  // "@Scratchpad/1:2:3\n"
      }

      if (totalData)
        totalData = fixDataFormat(totalData);

      console.log(totalData);

      if (assenze) {
        //TODO: Fix comparison between timestamps
        // console.log("Current last update: " + assenze.timestamp);
        // console.log("Remote last update: " + totalData.timestamp);
        // console.log(timediff('2015-01-01', '2018-05-02 02:15:10.777', 's'));
        assenze = totalData;
      } else {
        //Do not compare
        assenze = totalData;
      }
    });
  });

  req.on('error', function(e) {
    console.log('Problem with request: ' + e.message);
    assenze = null;
  });

  req.write("");
  req.end();
}

function getUsersFromSavesFile() {
  if (!fs.existsSync(savesFileName))
  {
    console.log("Creazione del file di salvataggio");
    
    const time = new Date();

    try {
      fs.utimesSync(savesFileName, time, time);
    } catch (err) {
      fs.closeSync(fs.openSync(savesFileName, 'w'));
    }
    return {};
  }

  var rawData = fs.readFileSync(savesFileName);

  if (rawData == '')
    return [];
  else
    return JSON.parse(fs.readFileSync(savesFileName));
}

function sendInfoToUsers() {
  console.log("Trovati nuove sostituzioni. Invio agli utenti");
}

function setUpdatesForNewUser(msg, match) {
  var data = getUsersFromSavesFile();
  console.log(data);
  var user = {
    id: msg.chat.id,
    username: msg.chat.username,
    first_name: msg.chat.first_name
  };

  data.push(user);

  fs.writeFile(savesFileName, JSON.stringify(data), err => { 
    if (err) throw err;
  }); 
}


fetchData(); //Fetch data immediately
setInterval(fetchData, 5*60*1000); //Fetch data every 5 minutes
